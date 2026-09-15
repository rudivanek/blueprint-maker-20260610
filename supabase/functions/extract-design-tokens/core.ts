// supabase/functions/extract-design-tokens/core.ts
//
// Pure logic for the extract-design-tokens edge function (no Deno-only APIs,
// so it can be unit-tested outside Supabase).
//
// Ported from web-scrapper's extract-css + extract-font-urls, with fixes:
// - follows <link rel="preload" as="style"> and @import (2 levels), skips print sheets
// - context-aware CSS walk: base rules vs @media / :hover / dark-mode are kept apart
// - modern colour syntax (rgb(0 0 0 / .5), oklch, oklab, lab, lch, hwb, color())
// - resolves var(--x) against the site's own custom properties
// - groups evidence by role (body, headings, links, buttons, header, footer)
// - real class-token matching for the "CSS looks insufficient" check
// - SSRF guard + size/time caps on every fetch
// - returns a compact Markdown "evidence digest" ready to paste into a prompt

// ─── Types ───────────────────────────────────────────────────────────────────

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface FreqEntry { value: string; count: number; samples: string[] }

export interface RoleEvidence {
  role: string;
  colors: FreqEntry[];       // `color` values
  backgrounds: FreqEntry[];  // background / background-color values
  fontFamilies: FreqEntry[];
  fontSizes: FreqEntry[];
  fontWeights: FreqEntry[];
  radii: FreqEntry[];
}

export interface FontFace { family: string; weight: string; style: string; url: string; format: string }

export interface SheetInfo { url: string; bytes: number; inline: boolean }
export interface SheetFailure { url: string; reason: string }

export interface Platform {
  cms: string | null;
  builder: string | null;
  framework: string | null;
  cssApproach: string;
  signals: string[];
}

export interface TokenResult {
  pageUrl: string;
  customProperties: { name: string; value: string; resolved: string; selector: string }[];
  colors: FreqEntry[];          // base-context colours, resolved + normalised
  stateColors: FreqEntry[];     // :hover / :focus / :active colours
  darkModeColors: FreqEntry[];  // inside prefers-color-scheme: dark
  roles: RoleEvidence[];
  frequency: {
    fontFamilies: FreqEntry[];
    fontSizes: FreqEntry[];
    fontWeights: FreqEntry[];
    lineHeights: FreqEntry[];
    letterSpacings: FreqEntry[];
    radii: FreqEntry[];
    shadows: FreqEntry[];
    spacings: FreqEntry[];
  };
  breakpoints: FreqEntry[];
  fonts: {
    googleFamilies: string[];   // from fonts.googleapis.com links / @import
    googleFontsUrls: string[];
    bunnyFamilies: string[];
    adobeFontsKit: string | null;
    fontFaces: FontFace[];      // self-hosted @font-face with real file URLs
    jsLoadedSuspected: boolean; // WebFont loader etc. — fonts may be injected at runtime
  };
  platform: Platform;
  diagnostics: {
    htmlSource: 'provided' | 'fetched';
    linkedSheetsFound: number;
    sheetsFetchedOk: number;
    sheetsFailed: SheetFailure[];
    sheets: SheetInfo[];
    vendorSheets: number;       // plugin/library sheets excluded from colour & type evidence
    unusedRulesSkipped: number; // rules whose selectors match nothing on the page
    totalCssBytes: number;
    cssLooksInsufficient: boolean;
    insufficientReasons: string[];
  };
  digest: string;
}

// ─── Limits ──────────────────────────────────────────────────────────────────

export const LIMITS = {
  htmlBytes: 3_000_000,
  sheetBytes: 1_500_000,
  totalCssBytes: 6_000_000,
  maxSheets: 40,
  pageTimeoutMs: 12_000,
  sheetTimeoutMs: 10_000,
  maxRedirects: 3,
  digestChars: 24_000,
};

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// ─── SSRF guard ──────────────────────────────────────────────────────────────

function ipv4IsPrivate(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function ipv6IsPrivate(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (v === '::' || v === '::1') return true;
  if (v.startsWith('fc') || v.startsWith('fd')) return true;       // unique local
  if (/^fe[89ab]/.test(v)) return true;                            // link local
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4IsPrivate(mapped[1]);
  return false;
}

export function hostIsBlockedLiteral(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === 'metadata.google.internal') return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return ipv4IsPrivate(h);
  if (h.includes(':')) return ipv6IsPrivate(h);
  if (/^\d+$/.test(h) || /^0x/i.test(h)) return true; // decimal / hex IP tricks
  return false;
}

export type HostCheck = (hostname: string) => Promise<boolean>; // true = blocked

export function validateUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) return null;
  if (hostIsBlockedLiteral(u.hostname)) return null;
  return u;
}

async function readCapped(res: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) return { text: '', truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total + value.byteLength > maxBytes) {
      chunks.push(value.slice(0, maxBytes - total));
      total = maxBytes;
      truncated = true;
      try { await reader.cancel(); } catch { /* ignore */ }
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  return { text: new TextDecoder('utf-8', { fatal: false }).decode(buf), truncated };
}

/** fetch with manual redirects, SSRF checks on every hop, timeout and size cap. */
export async function safeFetchText(
  url: string,
  opts: { fetchImpl: FetchLike; hostCheck: HostCheck; accept: string; referer?: string; timeoutMs: number; maxBytes: number },
): Promise<{ ok: true; text: string; contentType: string; finalUrl: string; truncated: boolean } | { ok: false; reason: string }> {
  let current = url;
  for (let hop = 0; hop <= LIMITS.maxRedirects; hop++) {
    const u = validateUrl(current);
    if (!u) return { ok: false, reason: 'blocked-url' };
    if (await opts.hostCheck(u.hostname)) return { ok: false, reason: 'blocked-host' };
    let res: Response;
    try {
      res = await opts.fetchImpl(u.toString(), {
        redirect: 'manual',
        headers: { 'User-Agent': BROWSER_UA, Accept: opts.accept, ...(opts.referer ? { Referer: opts.referer } : {}) },
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
    } catch (e) {
      const name = (e as { name?: string })?.name;
      return { ok: false, reason: name === 'TimeoutError' ? 'timeout' : 'fetch-error' };
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      try { await res.body?.cancel(); } catch { /* ignore */ }
      if (!loc) return { ok: false, reason: `redirect-without-location-${res.status}` };
      current = new URL(loc, u).toString();
      continue;
    }
    if (!res.ok) {
      try { await res.body?.cancel(); } catch { /* ignore */ }
      return { ok: false, reason: `http-${res.status}` };
    }
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    const { text, truncated } = await readCapped(res, opts.maxBytes);
    return { ok: true, text, contentType, finalUrl: u.toString(), truncated };
  }
  return { ok: false, reason: 'too-many-redirects' };
}

// ─── HTML helpers ────────────────────────────────────────────────────────────

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = tag.match(re);
  if (!m) return null;
  return (m[1] ?? m[2] ?? m[3] ?? '').trim();
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&#0?38;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
}

export function findStylesheetLinks(html: string, base: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (attr(tag, 'rel') ?? '').toLowerCase();
    const as = (attr(tag, 'as') ?? '').toLowerCase();
    const media = (attr(tag, 'media') ?? '').toLowerCase();
    const href = attr(tag, 'href');
    if (!href) continue;
    const isSheet = rel.split(/\s+/).includes('stylesheet') || (rel.includes('preload') && as === 'style');
    if (!isSheet) continue;
    if (media === 'print') continue;
    try {
      const abs = new URL(decodeEntities(href), base).toString();
      if (abs.startsWith('http')) out.push(abs);
    } catch { /* ignore */ }
  }
  return [...new Set(out)];
}

export function findInlineStyles(html: string): { id: string; css: string }[] {
  return [...html.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)].map(m => ({ id: attr(`<style ${m[1]}>`, 'id') ?? '', css: m[2] }));
}

export function parseGoogleFontsUrl(url: string): string[] {
  const families: string[] = [];
  try {
    const u = new URL(decodeEntities(url));
    for (const fam of u.searchParams.getAll('family')) {
      // css2: "Playfair Display:wght@500;700"   css v1: "Open+Sans:400,700|Roboto"
      for (const part of fam.split('|')) {
        const name = part.split(':')[0].replace(/\+/g, ' ').trim();
        if (name) families.push(name);
      }
    }
  } catch { /* ignore */ }
  return families;
}

// ─── CSS walker (context aware) ──────────────────────────────────────────────

export interface CssRule { selector: string; decls: [string, string][]; context: string[] }

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Splits declarations while respecting parentheses and quotes (data URIs, url(...)). */
function splitDecls(body: string): [string, string][] {
  const out: [string, string][] = [];
  let depth = 0; let quote: string | null = null; let start = 0;
  const push = (end: number) => {
    const chunk = body.slice(start, end).trim();
    start = end + 1;
    if (!chunk) return;
    const i = chunk.indexOf(':');
    if (i <= 0) return;
    const prop = chunk.slice(0, i).trim().toLowerCase();
    const val = chunk.slice(i + 1).replace(/!important\s*$/i, '').trim();
    if (prop && val) out.push([prop, val]);
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) { if (c === quote && body[i - 1] !== '\\') quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ';' && depth === 0) push(i);
  }
  push(body.length);
  return out;
}

/** Walks CSS text and returns flat style rules with their at-rule context stack. */
export function walkCss(cssText: string): { rules: CssRule[]; fontFaces: [string, string][][]; imports: string[] } {
  const css = stripComments(cssText);
  const rules: CssRule[] = [];
  const fontFaces: [string, string][][] = [];
  const imports: string[] = [];
  const stack: string[] = [];
  let i = 0; let buf = '';
  let quote: string | null = null;

  const skipBlock = (from: number): number => {
    let d = 0;
    for (let j = from; j < css.length; j++) {
      if (css[j] === '{') d++;
      else if (css[j] === '}') { d--; if (d === 0) return j + 1; }
    }
    return css.length;
  };

  while (i < css.length) {
    const c = css[i];
    if (quote) { buf += c; if (c === quote && css[i - 1] !== '\\') quote = null; i++; continue; }
    if (c === '"' || c === "'") { quote = c; buf += c; i++; continue; }
    if (c === ';') {
      const stmt = buf.trim();
      if (/^@import/i.test(stmt)) {
        const m = stmt.match(/@import\s+(?:url\(\s*)?["']?([^"')\s]+)["']?\s*\)?\s*([^;]*)/i);
        if (m && !/\bprint\b/i.test(m[2] ?? '')) imports.push(m[1]);
      }
      buf = ''; i++; continue;
    }
    if (c === '{') {
      const prelude = buf.trim();
      buf = '';
      const lower = prelude.toLowerCase();
      if (lower.startsWith('@font-face')) {
        const end = skipBlock(i);
        fontFaces.push(splitDecls(css.slice(i + 1, end - 1)));
        i = end; continue;
      }
      if (/^@(-\w+-)?keyframes|^@page|^@counter-style|^@property|^@font-feature-values/.test(lower)) {
        i = skipBlock(i); continue;
      }
      if (lower.startsWith('@')) { stack.push(prelude); i++; continue; }
      // style rule: read until matching '}' (supports simple CSS nesting by flattening)
      let j = i + 1; let d = 1; let q: string | null = null;
      while (j < css.length && d > 0) {
        const ch = css[j];
        if (q) { if (ch === q && css[j - 1] !== '\\') q = null; }
        else if (ch === '"' || ch === "'") q = ch;
        else if (ch === '{') d++;
        else if (ch === '}') d--;
        j++;
      }
      const inner = css.slice(i + 1, j - 1);
      if (inner.includes('{')) {
        // nested CSS: keep top-level declarations only, recurse into children with parent selector
        const topLevel = inner.replace(/[^;{}]*\{[^{}]*\}/g, '');
        rules.push({ selector: prelude, decls: splitDecls(topLevel), context: [...stack] });
        const child = walkCss(inner);
        for (const r of child.rules) {
          const sel = r.selector.includes('&') ? r.selector.replace(/&/g, prelude) : `${prelude} ${r.selector}`;
          rules.push({ selector: sel, decls: r.decls, context: [...stack, ...r.context] });
        }
      } else {
        rules.push({ selector: prelude, decls: splitDecls(inner), context: [...stack] });
      }
      i = j; continue;
    }
    if (c === '}') { stack.pop(); buf = ''; i++; continue; }
    buf += c; i++;
  }
  return { rules, fontFaces, imports };
}

// ─── Values ──────────────────────────────────────────────────────────────────

export const COLOR_RE =
  /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)/g;

const NAMED_IGNORE = new Set(['transparent', 'inherit', 'initial', 'unset', 'currentcolor', 'none']);

export function normalizeColor(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (NAMED_IGNORE.has(v)) return null;
  if (/^#[0-9a-f]{3,8}$/.test(v)) {
    if (v.length === 4) return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
    if (v.length === 5) { // #rgba
      const hex = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
      return v[4] === 'f' ? hex : hex + v[4] + v[4];
    }
    if (v.length === 9 && v.endsWith('ff')) return v.slice(0, 7);
    return v;
  }
  const m = v.match(/^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    const ch = (s: string) => Math.round(s.endsWith('%') ? parseFloat(s) * 2.55 : parseFloat(s));
    const [r, g, b] = [ch(m[1]), ch(m[2]), ch(m[3])];
    if ([r, g, b].some(n => Number.isNaN(n) || n > 255)) return v.replace(/\s+/g, ' ');
    let a = 1;
    if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    const hex = '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('');
    if (a >= 1) return hex;
    if (a <= 0) return null;
    return `${hex} @ ${Math.round(a * 100)}%`;
  }
  return v.replace(/\s+/g, ' ');
}

/** Resolve var(--x, fallback) using the site's own custom properties (max depth 6). */
export function resolveVars(value: string, vars: Map<string, string>, depth = 0): string {
  if (depth > 6 || !value.includes('var(')) return value;
  let out = '';
  let i = 0;
  while (i < value.length) {
    const idx = value.indexOf('var(', i);
    if (idx === -1) { out += value.slice(i); break; }
    out += value.slice(i, idx);
    let j = idx + 4; let d = 1;
    while (j < value.length && d > 0) { if (value[j] === '(') d++; else if (value[j] === ')') d--; j++; }
    const inner = value.slice(idx + 4, j - 1);
    const comma = inner.indexOf(',');
    const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
    const fallback = comma === -1 ? '' : inner.slice(comma + 1).trim();
    const found = vars.get(name);
    if (found !== undefined) out += resolveVars(found, vars, depth + 1);
    else if (fallback) out += resolveVars(fallback, vars, depth + 1);
    else out += value.slice(idx, j); // unknown variable: keep it visible
    i = j;
  }
  return out;
}

// ─── Frequency helpers ───────────────────────────────────────────────────────

class Freq {
  private map = new Map<string, FreqEntry>();
  add(value: string, sample: string) {
    const v = value.trim();
    if (!v || v.length > 200) return;
    const e = this.map.get(v);
    const s = sample.length > 70 ? sample.slice(0, 70) + '…' : sample;
    if (e) { e.count++; if (e.samples.length < 3 && !e.samples.includes(s)) e.samples.push(s); }
    else this.map.set(v, { value: v, count: 1, samples: [s] });
  }
  top(n: number): FreqEntry[] { return [...this.map.values()].sort((a, b) => b.count - a.count).slice(0, n); }
  get size() { return this.map.size; }
}

const ROLE_TESTS: [string, RegExp][] = [
  ['buttons', /(^|[\s,>+~])(button|input\[type=["']?(submit|button)["']?\])|\.(btn|button|wp-block-button__link|elementor-button|et_pb_button|brxe-button|w-button|cta)\b/i],
  ['headings', /(^|[\s,>+~])h[1-6]\b|\.(elementor-heading-title|entry-title|wp-block-heading|site-title|heading|title)\b/i],
  ['links', /(^|[\s,>+~])a(\b|:|\[)/i],
  ['header/nav', /(^|[\s,>+~])(header|nav)\b|\.(site-header|header|navbar|nav|menu|main-navigation|elementor-nav-menu)\b|#(header|masthead|site-header)\b/i],
  ['footer', /(^|[\s,>+~])footer\b|\.(site-footer|footer)\b|#(footer|colophon)\b/i],
  ['body', /^(html|body|:root)$|^(html|body)\s*,|,\s*(html|body)\s*$|^\.(elementor-kit-\d+)$/i],
];

const STATE_RE = /:(hover|focus|focus-visible|focus-within|active|visited)\b/i;
// Library / plugin CSS: parsed for @font-face and custom properties only, never counted as brand
// evidence (e.g. UIkit, Select2 or WordPress core defaults would otherwise pollute the palette).
// Elementor's generated brand CSS lives in /wp-content/uploads/elementor/, so it is NOT vendor.
const VENDOR_SHEET_RE = /\/wp-content\/plugins\/|\/wp-includes\/|bootstrap(\.min)?\.css|normalize\.css|reset\.css|font-?awesome|swiper|slick|animate(\.min)?\.css|dashicons|wp-block-library|woocommerce-(layout|smallscreen)|jquery-ui|uikit|select2|owl\.carousel|magnific|lightbox|fancybox|aos(\.min)?\.css|glightbox|splide|flickity/i;
// WordPress prints plugin CSS inline as <style id="{handle}-inline-css">; these handles are defaults.
const VENDOR_INLINE_ID_RE = /fluent|wp-block|global-styles|classic-theme|core-block|woocommerce|contact-form|wpcf7|wpforms|gform|uikit|select2|font-?awesome|dashicons|admin-bar|jetpack|cookie|cky-|cmplz|wpml|trp-|popup|joinchat/i;
// Rules whose every selector starts with a plugin/library prefix (catches plugin CSS merged into
// one optimised blob). Elementor-generated brand rules start with .elementor-…, so they are kept.
const VENDOR_SELECTOR_RE = /^\s*(\.|#)(ff-|ff_|fluentform|frm-fluent|el-|uk-|select2|wpcf7|wpforms|gform|gfield|woocommerce|wc-block|swiper|slick-|mfp-|fancybox|lg-|pswp|fa-|dashicons|elementor-lightbox|dialog-|cky-|cmplz|cookie|moove|wpml|trp-|pum-|joinchat|qlwapp|grecaptcha|iti)/i;
export function isVendorSelector(selector: string): boolean {
  const parts = selector.split(',').map(s => s.trim()).filter(Boolean);
  return parts.length > 0 && parts.every(s => VENDOR_SELECTOR_RE.test(s));
}
/** Class names / ids a selector needs, ignoring pseudo-class arguments and attribute selectors. */
function selectorNeeds(part: string): { classes: string[]; ids: string[] } {
  let p = part;
  for (let k = 0; k < 3; k++) p = p.replace(/\([^()]*\)/g, '');
  p = p.replace(/\[[^\]]*\]/g, '');
  const unesc = (x: string) => x.replace(/\\/g, '');
  return {
    classes: [...p.matchAll(/\.((?:\\.|[\w-])+)/g)].map(m => unesc(m[1])),
    ids: [...p.matchAll(/#((?:\\.|[\w-])+)/g)].map(m => unesc(m[1])),
  };
}
/** True when at least one comma-part of the selector can match the page's rendered HTML. */
export function selectorUsedOnPage(selector: string, classes: Set<string>, ids: Set<string>): boolean {
  return selector.split(',').some(part => {
    const need = selectorNeeds(part);
    return need.classes.every(c => classes.has(c)) && need.ids.every(i => ids.has(i));
  });
}
// Platform utility selectors that carry default palettes, not brand choices.
const PLATFORM_CHROME_RE = /^\.w-(form|input|webflow-badge|file-upload)|^\.wp-block-(?!button)|^\.elementor-widget-container|^#wpadminbar|\.screen-reader-text|\.has-[\w-]+-(color|background-color|gradient-background|border-color)\b|^:root\s+:where\(/;
const DARK_RE = /prefers-color-scheme\s*:\s*dark/i;

function familyClean(v: string): string {
  return v.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean).join(', ');
}

// ─── Platform detection (ported, trimmed) ────────────────────────────────────

export function detectPlatform(html: string, css: string, sheetUrls: string[]): Platform {
  const signals: string[] = [];
  let cms: string | null = null; let builder: string | null = null; let framework: string | null = null;
  const urls = sheetUrls.join(' ');
  if (/wp-content\/|wp-includes\//.test(html) || /name=["']generator["'][^>]*WordPress/i.test(html)) { cms = 'wordpress'; signals.push('wp-content paths'); }
  if (/website-files\.com|uploads-ssl\.webflow\.com|w-webflow-badge|name=["']generator["'][^>]*Webflow/i.test(html + urls)) { cms = 'webflow'; signals.push('Webflow assets'); }
  if (/static\.wixstatic\.com/.test(html + urls)) { cms = 'wix'; signals.push('wixstatic'); }
  if (/static1\.squarespace\.com|squarespace\.com\/universal/.test(html + urls)) { cms = 'squarespace'; signals.push('squarespace assets'); }
  if (/cdn\.shopify\.com|Shopify\.theme/.test(html + urls)) { cms = 'shopify'; signals.push('shopify cdn'); }
  if (/elementor-kit-\d+|elementor\/css\/post-|class=["'][^"']*\belementor-/.test(html)) { builder = 'elementor'; signals.push('elementor classes'); }
  else if (/id=["']et-boc["']|\bet_pb_/.test(html)) { builder = 'divi'; signals.push('divi classes'); }
  else if (/\bbrxe-/.test(html)) { builder = 'bricks'; signals.push('bricks classes'); }
  else if (/\bfl-builder\b|\bfl-module\b/.test(html)) { builder = 'beaver'; signals.push('beaver classes'); }
  else if (cms === 'wordpress' && /\bwp-block-/.test(html)) { builder = 'gutenberg'; signals.push('wp-block classes'); }
  if (/__NEXT_DATA__|\/_next\/static\//.test(html)) { framework = 'next'; signals.push('next.js'); }
  else if (/__NUXT__/.test(html)) { framework = 'nuxt'; signals.push('nuxt'); }
  else if (/astro-island|data-astro-/.test(html)) { framework = 'astro'; signals.push('astro'); }
  const cpCount = (css.match(/--[\w-]+\s*:/g) ?? []).length;
  let cssApproach = 'plain';
  const hosted = cms === 'webflow' || cms === 'wix' || cms === 'squarespace';
  if (!hosted && /--tw-/.test(css)) cssApproach = 'tailwind';
  else if (/\.row\b/.test(css) && /\.col-(sm|md|lg)-/.test(css)) cssApproach = 'bootstrap';
  else if (cpCount >= 15) cssApproach = 'custom-properties';
  return { cms, builder, framework, cssApproach, signals };
}

// ─── Main extraction ─────────────────────────────────────────────────────────

export interface ExtractOptions {
  pageUrl: string;
  html?: string;
  fetchImpl: FetchLike;
  hostCheck: HostCheck;
}

export async function extractDesignTokens(opts: ExtractOptions): Promise<TokenResult> {
  const pageUrl = opts.pageUrl;
  const sheetsFailed: SheetFailure[] = [];
  const sheets: SheetInfo[] = [];
  let totalCssBytes = 0;

  // 1. HTML
  let html = opts.html ?? '';
  let htmlSource: 'provided' | 'fetched' = 'provided';
  if (!html.trim()) {
    htmlSource = 'fetched';
    const r = await safeFetchText(pageUrl, {
      fetchImpl: opts.fetchImpl, hostCheck: opts.hostCheck,
      accept: 'text/html,application/xhtml+xml', timeoutMs: LIMITS.pageTimeoutMs, maxBytes: LIMITS.htmlBytes,
    });
    if (!r.ok) throw new Error(`Could not fetch page (${r.reason})`);
    html = r.text;
  } else if (html.length > LIMITS.htmlBytes) {
    html = html.slice(0, LIMITS.htmlBytes);
  }

  // 2. Collect CSS sources
  type Source = { label: string; css: string; vendor: boolean };
  const sources: Source[] = [];
  findInlineStyles(html).forEach(({ id, css }, idx) => {
    sources.push({ label: `inline-${idx + 1}`, css, vendor: VENDOR_INLINE_ID_RE.test(id) });
    sheets.push({ url: `inline-${idx + 1}`, bytes: css.length, inline: true });
    totalCssBytes += css.length;
  });

  // Font-service CSS (Google/Bunny/Adobe) is reported under Fonts, not parsed as site CSS.
  const FONT_SERVICE_RE = /fonts\.googleapis\.com|fonts\.bunny\.net|use\.typekit\.net/i;
  const linked = findStylesheetLinks(html, pageUrl).filter(u => !FONT_SERVICE_RE.test(u));
  // Theme / builder sheets first, so the sheet cap never drops brand CSS in favour of plugin CSS.
  const ordered = [...linked].sort((a, b) => Number(VENDOR_SHEET_RE.test(a)) - Number(VENDOR_SHEET_RE.test(b)));
  const queue: { url: string; depth: number }[] = ordered.map(url => ({ url, depth: 0 }));
  let skippedByCap = 0;
  const seen = new Set<string>();
  let fetchedOk = 0;

  const fetchSheet = async (url: string, depth: number) => {
    if (seen.has(url)) return;
    if (seen.size >= LIMITS.maxSheets) { skippedByCap++; return; }
    seen.add(url);
    if (totalCssBytes >= LIMITS.totalCssBytes) { sheetsFailed.push({ url, reason: 'total-css-cap-reached' }); return; }
    const r = await safeFetchText(url, {
      fetchImpl: opts.fetchImpl, hostCheck: opts.hostCheck, accept: 'text/css,*/*;q=0.1',
      referer: pageUrl, timeoutMs: LIMITS.sheetTimeoutMs, maxBytes: LIMITS.sheetBytes,
    });
    if (!r.ok) { sheetsFailed.push({ url, reason: r.reason }); return; }
    if (r.contentType.includes('html') || /^\s*(<!doctype|<html|<head|<body)/i.test(r.text)) {
      sheetsFailed.push({ url, reason: 'html-response (likely firewall/WAF block)' }); return; }
    if (!r.text.trim()) { sheetsFailed.push({ url, reason: 'empty-response' }); return; }
    fetchedOk++;
    totalCssBytes += r.text.length;
    sheets.push({ url, bytes: r.text.length, inline: false });
    sources.push({ label: url, css: r.text, vendor: VENDOR_SHEET_RE.test(url) });
    if (depth < 2) {
      const { imports } = walkCss(r.text);
      for (const imp of imports) {
        if (FONT_SERVICE_RE.test(imp)) continue;
        try { queue.push({ url: new URL(imp, r.finalUrl).toString(), depth: depth + 1 }); } catch { /* ignore */ }
      }
    }
  };

  // inline @imports too
  for (const s of [...sources]) {
    for (const imp of walkCss(s.css).imports) {
      if (FONT_SERVICE_RE.test(imp)) continue;
      try { queue.push({ url: new URL(imp, pageUrl).toString(), depth: 1 }); } catch { /* ignore */ }
    }
  }

  // process queue in waves of 6
  while (queue.length) {
    const wave = queue.splice(0, 6);
    await Promise.allSettled(wave.map(q => fetchSheet(q.url, q.depth)));
  }

  // 3. Parse
  const parsed = sources.map(s => ({ ...s, ...walkCss(s.css) }));

  // custom properties — prefer base-context :root / html / body / elementor-kit
  const vars = new Map<string, string>();
  const cpList: { name: string; value: string; selector: string }[] = [];
  const cpSeen = new Set<string>();
  const cpPriority = (sel: string) =>
    /\.elementor-kit-\d+/.test(sel) ? 0 : /^(:root|html|body)$/i.test(sel.trim()) ? 1 : /:root|html|body/i.test(sel) ? 2 : 3;
  const allCp: { name: string; value: string; selector: string; prio: number }[] = [];
  for (const p of parsed) {
    for (const rule of p.rules) {
      if (rule.context.some(c => /^@media/i.test(c))) continue;
      // plugin/library variables still resolve var(), but are not listed as brand tokens
      const vendorRule = p.vendor || isVendorSelector(rule.selector);
      for (const [prop, val] of rule.decls) {
        if (!prop.startsWith('--')) continue;
        allCp.push({ name: prop, value: val, selector: rule.selector, prio: vendorRule ? 9 : cpPriority(rule.selector) });
      }
    }
  }
  allCp.sort((a, b) => a.prio - b.prio);
  for (const cp of allCp) {
    if (!vars.has(cp.name)) vars.set(cp.name, cp.value);
    const key = `${cp.selector}::${cp.name}`;
    if (cpSeen.has(key)) continue;
    cpSeen.add(key);
    if (cp.prio === 9 || /^--(fluentform|ff-|el-|swiper|uk-|bdt-|select2|wc-|woocommerce|cky|cmplz|e-a-|wp-admin)/i.test(cp.name) || cp.name.startsWith('--wp--preset--') || cp.name.startsWith('--tw-')) continue;
    cpList.push({ name: cp.name, value: cp.value, selector: cp.selector });
  }

  const colors = new Freq(); const stateColors = new Freq(); const darkColors = new Freq();
  const fam = new Freq(); const sizes = new Freq(); const weights = new Freq(); const lhs = new Freq();
  const ls = new Freq(); const radii = new Freq(); const shadows = new Freq(); const spacings = new Freq();
  const bps = new Freq();
  const roles = new Map<string, Record<string, Freq>>();
  const roleBucket = (role: string) => {
    let r = roles.get(role);
    if (!r) {
      r = { colors: new Freq(), backgrounds: new Freq(), fontFamilies: new Freq(), fontSizes: new Freq(), fontWeights: new Freq(), radii: new Freq() };
      roles.set(role, r);
    }
    return r;
  };

  const fontFaces: FontFace[] = [];
  const ffSeen = new Set<string>();
  const selectorTokens = new Set<string>();

  // Classes / ids present in the rendered page. CSS rules that can't match anything on the
  // page (unused plugin or theme CSS) are left out of the colour and type evidence.
  const bodyHtml = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  const bodyTokens = new Set<string>();
  for (const m of html.matchAll(/\sclass\s*=\s*["']([^"']+)["']/gi)) for (const t of m[1].split(/\s+/)) if (t) bodyTokens.add(decodeEntities(t));
  const bodyIds = new Set<string>();
  for (const m of html.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)) bodyIds.add(decodeEntities(m[1].trim()));
  const usedFilter = bodyTokens.size > 20;
  let unusedRulesSkipped = 0;
  const referencedVars = new Set<string>();

  for (const p of parsed) {
    // @font-face (vendor sheets included — icon fonts filtered below)
    for (const decls of p.fontFaces) {
      const get = (k: string) => decls.find(([pp]) => pp === k)?.[1] ?? '';
      const family = familyClean(get('font-family'));
      if (!family || /awesome|dashicons|icomoon|eicons|swiper|slick|genericons|material icons/i.test(family)) continue;
      const src = get('src');
      for (const m of src.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)\s*(?:format\(\s*["']?([^"')]+)["']?\s*\))?/gi)) {
        if (m[1].startsWith('data:')) continue;
        let abs = m[1];
        try { abs = new URL(m[1], p.label.startsWith('http') ? p.label : pageUrl).toString(); } catch { /* keep */ }
        if (!/\.(woff2?|ttf|otf)(\?|#|$)/i.test(abs)) continue;
        const key = `${family}|${get('font-weight')}|${get('font-style')}`;
        if (ffSeen.has(key)) break;
        ffSeen.add(key);
        fontFaces.push({ family, weight: get('font-weight') || '400', style: get('font-style') || 'normal', url: abs, format: m[2] ?? abs.split('.').pop()!.split(/[?#]/)[0] });
        break; // first (best) src per face
      }
    }

    for (const rule of p.rules) {
      const sel = rule.selector;
      for (const t of sel.matchAll(/[.#]([\w-]+)/g)) selectorTokens.add(t[1]);
      if (p.vendor || PLATFORM_CHROME_RE.test(sel) || isVendorSelector(sel)) continue;
      if (usedFilter && !selectorUsedOnPage(sel, bodyTokens, bodyIds)) { unusedRulesSkipped++; continue; }
      for (const [, v] of rule.decls) for (const m of v.matchAll(/var\(\s*(--[\w-]+)/g)) referencedVars.add(m[1]);

      const mediaCtx = rule.context.find(c => /^@media/i.test(c));
      for (const bp of (mediaCtx ?? '').matchAll(/(min|max)-width\s*:\s*([\d.]+(px|em|rem))/gi)) bps.add(`${bp[1]}-width: ${bp[2]}`, sel);

      const isDark = rule.context.some(c => DARK_RE.test(c));
      const isState = STATE_RE.test(sel);
      const isBase = !mediaCtx && !isState;
      const matchedRoles = ROLE_TESTS.filter(([, re]) => re.test(sel)).map(([r]) => r);

      for (const [prop, rawVal] of rule.decls) {
        if (prop.startsWith('--')) continue;
        const val = resolveVars(rawVal, vars);

        // colours
        if (/color|background|border|fill|stroke|outline|shadow/.test(prop)) {
          for (const c of val.match(COLOR_RE) ?? []) {
            const n = normalizeColor(c);
            if (!n) continue;
            if (isDark) darkColors.add(n, sel);
            else if (isState) stateColors.add(n, `${sel} {${prop}}`);
            else if (!mediaCtx) colors.add(n, `${sel} {${prop}}`);
            if (isBase && !isDark) {
              for (const role of matchedRoles) {
                if (prop === 'color') roleBucket(role).colors.add(n, sel);
                else if (prop === 'background' || prop === 'background-color') roleBucket(role).backgrounds.add(n, sel);
              }
            }
          }
        }
        if (!isBase || isDark) {
          continue;
        }
        switch (prop) {
          case 'font-family': {
            const f = familyClean(val);
            if (!f || /inherit|initial|unset/.test(f)) break;
            fam.add(f, sel);
            for (const role of matchedRoles) roleBucket(role).fontFamilies.add(f, sel);
            break;
          }
          case 'font': {
            const m = val.match(/([\d.]+(px|rem|em|%))(?:\s*\/\s*[\d.]+\w*)?\s+(.+)$/);
            if (m) { sizes.add(m[1], sel); fam.add(familyClean(m[3]), sel); }
            break;
          }
          case 'font-size':
            sizes.add(val, sel);
            for (const role of matchedRoles) roleBucket(role).fontSizes.add(val, sel);
            break;
          case 'font-weight':
            weights.add(val, sel);
            for (const role of matchedRoles) roleBucket(role).fontWeights.add(val, sel);
            break;
          case 'line-height': lhs.add(val, sel); break;
          case 'letter-spacing': if (val !== 'normal') ls.add(val, sel); break;
          case 'border-radius':
            radii.add(val, sel);
            for (const role of matchedRoles) roleBucket(role).radii.add(val, sel);
            break;
          case 'box-shadow': if (val !== 'none') shadows.add(val, sel); break;
          case 'padding': case 'margin': case 'gap': case 'row-gap': case 'column-gap':
          case 'padding-top': case 'padding-bottom': case 'padding-left': case 'padding-right':
          case 'margin-top': case 'margin-bottom':
            for (const part of val.split(/\s+/)) if (/^[\d.]+(px|rem|em)$/.test(part) && parseFloat(part) !== 0) spacings.add(part, sel);
            break;
        }
      }
    }
  }

  // 4. Fonts from HTML + CSS imports
  const googleUrls = new Set<string>();
  for (const m of html.matchAll(/https?:\/\/fonts\.googleapis\.com\/css2?\?[^"'\s)<>]+/gi)) googleUrls.add(decodeEntities(m[0]));
  for (const p of parsed) for (const imp of p.imports) if (/fonts\.googleapis\.com/.test(imp)) googleUrls.add(imp);
  const googleFamilies = [...new Set([...googleUrls].flatMap(parseGoogleFontsUrl))];
  const bunnyFamilies = [...new Set([...html.matchAll(/https?:\/\/fonts\.bunny\.net\/css2?\?[^"'\s)<>]+/gi)].flatMap(m => parseGoogleFontsUrl(m[0])))];
  const adobe = html.match(/https?:\/\/use\.typekit\.net\/[\w]+\.(css|js)/i)?.[0] ?? null;
  const jsLoadedSuspected = /WebFont\.load|webfontloader|fonts\.googleapis\.com\/css[^"']*["']\s*\+|elementor-gf-local|data-elementor-fonts/i.test(html)
    || (googleFamilies.length === 0 && fontFaces.length === 0 && !adobe);

  // 5. Diagnostics
  const insufficientReasons: string[] = [];
  if (totalCssBytes < 20_000 && bodyHtml.length > 100_000) insufficientReasons.push(`only ${Math.round(totalCssBytes / 1024)} KB of CSS for a ${Math.round(bodyHtml.length / 1024)} KB page`);
  if (cpList.length === 0 && colors.size < 6) insufficientReasons.push(`no custom properties and only ${colors.size} colours found`);
  if (bodyTokens.size > 20) {
    let hit = 0;
    for (const t of bodyTokens) if (selectorTokens.has(t)) hit++;
    const ratio = hit / bodyTokens.size;
    if (ratio < 0.05) insufficientReasons.push(`only ${Math.round(ratio * 100)}% of the page's classes appear in the fetched CSS`);
  }
  if (linked.length > 0 && fetchedOk === 0) insufficientReasons.push('none of the linked stylesheets could be downloaded');
  if (skippedByCap > 0) sheetsFailed.push({ url: `(${skippedByCap} more stylesheets)`, reason: `skipped: limit of ${LIMITS.maxSheets} sheets` });
  const vendorSheets = sources.filter(s => s.vendor).length;

  const platform = detectPlatform(html, parsed.map(p => p.css).join('\n').slice(0, 2_000_000), linked);

  // Tokens actually used by the page: referenced from used rules, directly or through other variables.
  const queueVars = [...referencedVars];
  while (queueVars.length) {
    const v = vars.get(queueVars.pop()!);
    if (!v) continue;
    for (const m of v.matchAll(/var\(\s*(--[\w-]+)/g)) if (!referencedVars.has(m[1])) { referencedVars.add(m[1]); queueVars.push(m[1]); }
  }
  const tokenList = usedFilter
    ? cpList.filter(cp => referencedVars.has(cp.name) || /\.elementor-kit-\d+/.test(cp.selector))
    : cpList;

  const roleOrder = ['body', 'headings', 'links', 'buttons', 'header/nav', 'footer'];
  const roleList: RoleEvidence[] = roleOrder.filter(r => roles.has(r)).map(r => {
    const b = roles.get(r)!;
    return {
      role: r,
      colors: b.colors.top(5), backgrounds: b.backgrounds.top(5), fontFamilies: b.fontFamilies.top(3),
      fontSizes: b.fontSizes.top(6), fontWeights: b.fontWeights.top(4), radii: b.radii.top(3),
    };
  });

  const result: TokenResult = {
    pageUrl,
    customProperties: tokenList.slice(0, 400).map(cp => ({ ...cp, resolved: resolveVars(cp.value, vars) })),
    colors: colors.top(40),
    stateColors: stateColors.top(15),
    darkModeColors: darkColors.top(15),
    roles: roleList,
    frequency: {
      fontFamilies: fam.top(12), fontSizes: sizes.top(20), fontWeights: weights.top(8),
      lineHeights: lhs.top(10), letterSpacings: ls.top(8), radii: radii.top(10),
      shadows: shadows.top(8), spacings: spacings.top(20),
    },
    breakpoints: bps.top(10),
    fonts: { googleFamilies, googleFontsUrls: [...googleUrls].slice(0, 10), bunnyFamilies, adobeFontsKit: adobe, fontFaces: fontFaces.slice(0, 40), jsLoadedSuspected },
    platform,
    diagnostics: {
      htmlSource,
      linkedSheetsFound: linked.length,
      sheetsFetchedOk: fetchedOk,
      sheetsFailed,
      sheets,
      vendorSheets,
      unusedRulesSkipped,
      totalCssBytes,
      cssLooksInsufficient: insufficientReasons.length > 0,
      insufficientReasons,
    },
    digest: '',
  };
  result.digest = buildDigest(result);
  return result;
}

// ─── Digest (Markdown for the prompt) ────────────────────────────────────────

function fmt(list: FreqEntry[], withSamples = false): string {
  if (!list.length) return '—';
  return list.map(e => withSamples ? `\`${e.value}\` ×${e.count} (${e.samples.join('; ')})` : `\`${e.value}\` ×${e.count}`).join(', ');
}

export function buildDigest(r: TokenResult): string {
  const L: string[] = [];
  const d = r.diagnostics;
  L.push('# CSS EVIDENCE (measured from the live site\'s stylesheets)');
  L.push('');
  L.push(`Source: ${r.pageUrl}`);
  L.push(`Platform: cms=${r.platform.cms ?? 'unknown'}, builder=${r.platform.builder ?? 'none'}, framework=${r.platform.framework ?? 'none'}, css=${r.platform.cssApproach}`);
  L.push(`Stylesheets: ${d.sheetsFetchedOk}/${d.linkedSheetsFound} linked sheets downloaded, ${d.sheets.filter(s => s.inline).length} inline blocks, ${Math.round(d.totalCssBytes / 1024)} KB total.`);
  if (d.unusedRulesSkipped) L.push(`${d.unusedRulesSkipped} CSS rules were ignored because they match nothing on this page.`);
  if (d.vendorSheets) L.push(`${d.vendorSheets} plugin/library stylesheets were ignored for colours and type (their defaults are not the brand).`);
  if (d.cssLooksInsufficient) L.push(`⚠ CSS LOOKS INCOMPLETE: ${d.insufficientReasons.join('; ')}. Rely more on the screenshot and mark guessed values as (inferred).`);
  L.push('Counts (×N) = number of CSS rules using the value. Higher count = more likely a real brand token.');
  L.push('');

  L.push('## Fonts');
  const f = r.fonts;
  if (f.googleFamilies.length) L.push(`- Google Fonts loaded: ${f.googleFamilies.join(', ')}`);
  if (f.googleFontsUrls.length) L.push(`- Google Fonts URL: ${f.googleFontsUrls[0]}`);
  if (f.bunnyFamilies.length) L.push(`- Bunny Fonts loaded: ${f.bunnyFamilies.join(', ')}`);
  if (f.adobeFontsKit) L.push(`- Adobe Fonts kit: ${f.adobeFontsKit}`);
  if (f.fontFaces.length) {
    const byFam = new Map<string, FontFace[]>();
    for (const ff of f.fontFaces) byFam.set(ff.family, [...(byFam.get(ff.family) ?? []), ff]);
    for (const [family, faces] of byFam) {
      L.push(`- Self-hosted @font-face "${family}": weights ${[...new Set(faces.map(x => x.weight))].join(', ')} — e.g. ${faces[0].url}`);
    }
  }
  if (f.jsLoadedSuspected) L.push('- ⚠ Fonts may be injected by JavaScript; if the families below look generic, check the screenshot.');
  L.push(`- font-family usage: ${fmt(r.frequency.fontFamilies)}`);
  L.push('');

  if (r.roles.length) {
    L.push('## Evidence by element role (base styles only)');
    for (const role of r.roles) {
      const parts: string[] = [];
      if (role.fontFamilies.length) parts.push(`font ${fmt(role.fontFamilies)}`);
      if (role.colors.length) parts.push(`text ${fmt(role.colors)}`);
      if (role.backgrounds.length) parts.push(`background ${fmt(role.backgrounds)}`);
      if (role.fontSizes.length) parts.push(`sizes ${fmt(role.fontSizes)}`);
      if (role.fontWeights.length) parts.push(`weights ${fmt(role.fontWeights)}`);
      if (role.radii.length) parts.push(`radius ${fmt(role.radii)}`);
      L.push(`- **${role.role}**: ${parts.join(' · ')}`);
    }
    L.push('');
  }

  L.push('## Colours (base styles, most used first)');
  L.push(fmt(r.colors.slice(0, 30), false));
  if (r.stateColors.length) L.push(`\nHover/focus states: ${fmt(r.stateColors.slice(0, 10))}`);
  if (r.darkModeColors.length) L.push(`\nDark-mode only: ${fmt(r.darkModeColors.slice(0, 10))}`);
  L.push('');

  L.push('## Type scale & spacing (base styles)');
  L.push(`- font-size: ${fmt(r.frequency.fontSizes)}`);
  L.push(`- font-weight: ${fmt(r.frequency.fontWeights)}`);
  L.push(`- line-height: ${fmt(r.frequency.lineHeights)}`);
  if (r.frequency.letterSpacings.length) L.push(`- letter-spacing: ${fmt(r.frequency.letterSpacings)}`);
  L.push(`- spacing (padding/margin/gap): ${fmt(r.frequency.spacings)}`);
  L.push(`- border-radius: ${fmt(r.frequency.radii)}`);
  if (r.frequency.shadows.length) L.push(`- box-shadow: ${fmt(r.frequency.shadows)}`);
  if (r.breakpoints.length) L.push(`- breakpoints: ${fmt(r.breakpoints)}`);
  L.push('');

  if (r.customProperties.length) {
    L.push('## Design tokens (CSS custom properties, resolved)');
    const tokenLike = r.customProperties.filter(cp =>
      /color|colour|primary|secondary|accent|brand|font|text|heading|bg|background|radius|spacing|space|gap|shadow|e-global|container/i.test(cp.name));
    const list = (tokenLike.length >= 10 ? tokenLike : r.customProperties).slice(0, 80);
    for (const cp of list) {
      const shown = cp.resolved !== cp.value ? `${cp.value} → ${cp.resolved}` : cp.value;
      L.push(`- \`${cp.name}\`: ${shown.length > 110 ? shown.slice(0, 110) + '…' : shown}  _(${cp.selector.length > 40 ? cp.selector.slice(0, 40) + '…' : cp.selector})_`);
    }
    L.push('');
  }

  if (d.sheetsFailed.length) {
    L.push(`## Stylesheets that could not be read (${d.sheetsFailed.length})`);
    for (const s of d.sheetsFailed.slice(0, 8)) L.push(`- ${s.url} — ${s.reason}`);
  }

  let out = L.join('\n');
  if (out.length > LIMITS.digestChars) out = out.slice(0, LIMITS.digestChars) + '\n…(digest truncated)';
  return out;
}
