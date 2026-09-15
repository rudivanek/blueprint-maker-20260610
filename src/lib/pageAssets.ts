// src/lib/pageAssets.ts
//
// Deterministic page assets — no AI involved, so nothing can be invented:
//   buildCopyMd()     → copy.md   : every visible text of the page, in order, grouped by section
//   buildImagesMd()   → images.md : every real image URL (img, srcset, lazy-load, CSS backgrounds,
//                                    logo, og:image, video posters), grouped by section
//   checkFabrication()→ fact-check: blueprint copy that does NOT appear on the real page
//
// Ported from web-scrapper (copyExporter / imageExporter / fabricationCheck) and adapted to
// Blueprint Maker's Section model.

import type { Section } from '../types';

// ─── Shared helpers ────────────────────────────────────────────────────────────

const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'svg', 'canvas', 'iframe', 'template', 'link', 'meta', 'head', 'select', 'option']);
const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const SECTION_TAGS = new Set(['section', 'header', 'main', 'article', 'aside']);
// Page-builder section classes, matched as whole class tokens (not substrings like "elementor-section-wrap")
const SECTION_CLASSES = new Set(['elementor-section', 'e-con', 'e-parent', 'et_pb_section', 'wp-block-group', 'wp-block-cover', 'brxe-section', 'section', 'fl-row', 'vc_row']);
const NOISE_RE = /cookie|gdpr|consent|cmplz|cky-|popup|modal|offcanvas|screen-reader|sr-only|visually-hidden|skip-link|whatsapp|joinchat/i;

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function isHidden(el: Element): boolean {
  if (el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('hidden')) return true;
  const style = (el.getAttribute('style') || '').replace(/\s+/g, '').toLowerCase();
  if (style.includes('display:none') || style.includes('visibility:hidden')) return true;
  const idc = `${el.id} ${el.getAttribute('class') || ''}`;
  return NOISE_RE.test(idc);
}

function textOf(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('br').forEach(br => br.replaceWith(' '));
  clone.querySelectorAll('script,style,noscript,svg').forEach(n => n.remove());
  return (clone.textContent || '').replace(/\s+/g, ' ').trim();
}

function isSectionContainer(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (SECTION_TAGS.has(tag)) return true;
  // Page-builder top-level containers (only the outermost one counts, see sectionOf)
  return (el.getAttribute('class') || '').split(/\s+/).some(c => SECTION_CLASSES.has(c));
}

function containerSiblings(el: Element): number {
  const parent = el.parentElement;
  if (!parent) return 0;
  return Array.from(parent.children).filter(c => isSectionContainer(c)).length;
}

/**
 * The page-level section an element belongs to: the outermost section-like ancestor that
 * sits next to other sections. A lone wrapper around the whole page (common in page
 * builders) is skipped, and nested containers don't split a section.
 */
function sectionOf(el: Element, body: Element): Element | null {
  const chain: Element[] = [];
  let node: Element | null = el.parentElement;
  while (node && node !== body) {
    const tag = node.tagName.toLowerCase();
    if (['header', 'footer', 'nav'].includes(tag)) break;
    if (tag !== 'main' && isSectionContainer(node)) chain.push(node);
    node = node.parentElement;
  }
  if (!chain.length) return null;
  for (let i = chain.length - 1; i >= 0; i--) {
    if (containerSiblings(chain[i]) >= 2) return chain[i];
  }
  return chain[0];
}

function sectionLabel(section: Element | null, fallbackIndex: number): string {
  if (!section) return 'Other';
  for (const h of HEADINGS) {
    const el = section.querySelector(h);
    if (el) { const t = textOf(el); if (t) return t.length > 70 ? t.slice(0, 70) + '…' : t; }
  }
  return section.getAttribute('aria-label') || section.getAttribute('data-section') || `Section ${fallbackIndex}`;
}

function inside(el: Element, tag: string): boolean {
  let node: Element | null = el;
  while (node) {
    if (node.tagName.toLowerCase() === tag) return true;
    node = node.parentElement;
  }
  return false;
}

function absUrl(href: string | null | undefined, base: string): string {
  if (!href) return '';
  const h = href.trim();
  if (!h || h.startsWith('data:') || h.startsWith('javascript:') || h.startsWith('#')) return '';
  try { return new URL(h, base).toString(); } catch { return ''; }
}

// ─── copy.md ───────────────────────────────────────────────────────────────────

function lineFor(el: Element): string | null {
  const tag = el.tagName.toLowerCase();
  const t = textOf(el);
  if (!t) return null;
  if (HEADINGS.includes(tag)) return `${'#'.repeat(Math.min(6, Number(tag[1]) + 1))} ${t}`;
  if (tag === 'li') return `- ${t}`;
  if (tag === 'blockquote') return `> ${t}`;
  if (tag === 'button' || (tag === 'a' && /\b(btn|button|elementor-button|wp-block-button__link|cta)\b/i.test(el.getAttribute('class') || ''))) return `[Botón: ${t}]`;
  if (tag === 'label') return `[Campo: ${t}]`;
  return t;
}

const BLOCK_TAGS = new Set([...HEADINGS, 'p', 'li', 'blockquote', 'button', 'label', 'figcaption', 'dt', 'dd', 'td', 'th']);

function collectLines(root: Element, body: Element, skipZones: boolean): { line: string; section: Element | null }[] {
  const out: { line: string; section: Element | null }[] = [];
  const walk = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag) || isHidden(el)) return;
    if (skipZones && (tag === 'nav' || tag === 'footer' || (tag === 'header' && !inside(el, 'main') && el.parentElement === body))) return;
    const isButtonLink = tag === 'a' && /\b(btn|button|elementor-button|wp-block-button__link|cta)\b/i.test(el.getAttribute('class') || '');
    if (BLOCK_TAGS.has(tag) || isButtonLink) {
      const line = lineFor(el);
      if (line) out.push({ line, section: sectionOf(el, body) });
      return;
    }
    // loose text directly inside a div/span (common in page builders)
    let direct = '';
    for (const n of Array.from(el.childNodes)) if (n.nodeType === 3) direct += n.textContent || '';
    direct = direct.replace(/\s+/g, ' ').trim();
    if (direct.length > 1) out.push({ line: direct, section: sectionOf(el, body) });
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(root);
  return out;
}

function dedupeConsecutive(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lines) {
    const key = l.toLowerCase();
    // responsive builders render the same block twice (desktop + mobile) — keep the first
    if (seen.has(key) && !l.startsWith('- ')) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

/**
 * copy.md from the page HTML. Falls back to Firecrawl's markdown when the HTML
 * contains almost no text (JS-rendered pages).
 */
export function buildCopyMd(rawHtml: string, pageUrl: string, fallbackMarkdown = ''): string {
  const header = `# Copy — ${pageUrl}\nTodo el texto visible de la página, en orden. Úsalo tal cual; no lo reescribas ni inventes datos.\n`;
  const doc = parse(rawHtml || '<html><body></body></html>');
  const body = doc.body;
  const items = body ? collectLines(body, body, true) : [];

  if (items.length < 8 && fallbackMarkdown.trim()) {
    const md = fallbackMarkdown
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')          // images live in images.md
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')       // keep link text only
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return `${header}\n_(Texto tomado de la versión renderizada de la página.)_\n\n${md}\n\n<!-- END OF COPY -->\n`;
  }
  if (!body || items.length === 0) return `${header}\n(No se pudo extraer texto de la página.)\n`;

  // group by section, preserving first-seen order
  const order: (Element | null)[] = [];
  const groups = new Map<Element | null, string[]>();
  for (const it of items) {
    if (!groups.has(it.section)) { groups.set(it.section, []); order.push(it.section); }
    groups.get(it.section)!.push(it.line);
  }

  const parts: string[] = [header];
  let idx = 0;
  const usedLabels = new Set<string>();
  for (const sec of order) {
    const lines = dedupeConsecutive(groups.get(sec)!);
    if (!lines.length) continue;
    idx++;
    let label = sectionLabel(sec, idx);
    if (usedLabels.has(label)) label = `${label} (${idx})`;
    usedLabels.add(label);
    parts.push(`## ${idx}. ${label}`, '', ...lines, '');
  }

  // Navigation (first nav with content only — sites often repeat it for mobile)
  const navs = Array.from(body.querySelectorAll('nav')).filter(n => !isHidden(n));
  const navLinks: string[] = [];
  for (const nav of navs) {
    for (const a of Array.from(nav.querySelectorAll('a'))) {
      const t = textOf(a);
      if (t && t.length < 40 && !navLinks.includes(t)) navLinks.push(t);
    }
    if (navLinks.length) break;
  }
  if (navLinks.length) parts.push('## Navegación', '', ...navLinks.map(t => `- ${t}`), '');

  // Footer (deduplicated across multiple <footer> elements)
  const footerLines: string[] = [];
  const footers = Array.from(body.querySelectorAll('footer')).filter(f => !isHidden(f) && !f.parentElement?.closest('footer'));
  for (const f of footers) {
    for (const it of collectLines(f, body, false)) {
      if (!footerLines.includes(it.line)) footerLines.push(it.line);
    }
  }
  if (footerLines.length) parts.push('## Footer', '', ...footerLines, '');

  parts.push('<!-- END OF COPY -->');
  return parts.join('\n');
}

// ─── images.md ─────────────────────────────────────────────────────────────────

interface ImageEntry { url: string; alt: string; size: string; section: string }

const TRACKING_RE = /facebook\.com\/tr|google-analytics|googletagmanager|doubleclick|pixel|\/1x1\.|spacer\.gif|blank\.gif|lazy[-_]?placeholder|data:image/i;

function bestFromSrcset(srcset: string | null, base: string): string {
  if (!srcset) return '';
  let best = '';
  let bestW = -1;
  for (const part of srcset.split(',')) {
    const [u, d] = part.trim().split(/\s+/);
    const w = d ? parseFloat(d) * (d.endsWith('x') ? 1000 : 1) : 0;
    if (u && w >= bestW) { bestW = w; best = u; }
  }
  return absUrl(best, base);
}

export function buildImagesMd(rawHtml: string, pageUrl: string): string {
  const header = `# Imágenes — ${pageUrl}\nImágenes reales de la página, agrupadas por sección. Úsalas en esas secciones. Para imágenes que falten usa https://placehold.co/[W]x[H].\n`;
  const doc = parse(rawHtml || '<html><body></body></html>');
  const body = doc.body;
  if (!body) return `${header}\n(Sin imágenes.)\n`;

  const entries: ImageEntry[] = [];
  const seen = new Set<string>();
  const sectionIndex = new Map<Element, number>();
  const labelFor = (el: Element): string => {
    if (inside(el, 'footer')) return 'Footer';
    if (inside(el, 'nav') || (inside(el, 'header') && !inside(el, 'main'))) return 'Header / Navegación';
    const sec = isSectionContainer(el) && !['header', 'footer', 'nav', 'main'].includes(el.tagName.toLowerCase()) ? el : sectionOf(el, body);
    if (!sec) return 'Otras';
    if (!sectionIndex.has(sec)) sectionIndex.set(sec, sectionIndex.size + 1);
    return sectionLabel(sec, sectionIndex.get(sec)!);
  };
  const push = (url: string, alt: string, size: string, section: string) => {
    if (!url || TRACKING_RE.test(url)) return;
    const key = url.replace(/[?#].*$/, '').replace(/-\d{2,4}x\d{2,4}(?=\.\w+$)/, ''); // WP resized variants
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ url, alt, size, section });
  };

  // Logo first
  const logo = body.querySelector('.custom-logo, .site-logo img, .elementor-widget-theme-site-logo img, header img, [class*="logo"] img, img[class*="logo"], img[alt*="logo" i]');
  if (logo) {
    const u = bestFromSrcset(logo.getAttribute('srcset'), pageUrl) || absUrl(logo.getAttribute('src') || logo.getAttribute('data-src'), pageUrl);
    push(u, logo.getAttribute('alt') || 'logo', '', 'Logo');
  }

  for (const img of Array.from(body.querySelectorAll('img'))) {
    if (isHidden(img)) continue;
    const src = bestFromSrcset(img.getAttribute('srcset') || img.getAttribute('data-srcset'), pageUrl)
      || absUrl(img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('src'), pageUrl);
    if (!src || /\.svg(\?|$)/i.test(src) && !img.getAttribute('alt')) continue;
    const w = img.getAttribute('width'); const h = img.getAttribute('height');
    push(src, img.getAttribute('alt') || '', w && h ? `${w}×${h}` : '', labelFor(img));
  }
  for (const s of Array.from(body.querySelectorAll('picture source'))) {
    const u = bestFromSrcset(s.getAttribute('srcset'), pageUrl);
    if (u) push(u, '', '', labelFor(s));
  }
  // CSS background images in style attributes / data-bg
  for (const el of Array.from(body.querySelectorAll('[style*="url("], [data-bg], [data-background-image]'))) {
    const style = el.getAttribute('style') || '';
    const m = style.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
    const u = absUrl(m?.[1] || el.getAttribute('data-bg') || el.getAttribute('data-background-image'), pageUrl);
    if (u && !/\.(woff2?|ttf|svg)(\?|$)/i.test(u)) push(u, '(imagen de fondo)', '', labelFor(el));
  }
  // Elementor stores background slideshows / backgrounds in data-settings JSON
  for (const el of Array.from(body.querySelectorAll('[data-settings*="background"]'))) {
    const raw = el.getAttribute('data-settings') || '';
    for (const m of raw.matchAll(/"url"\s*:\s*"([^"]+\.(?:jpe?g|png|webp|avif|gif)[^"]*)"/gi)) {
      push(absUrl(m[1].replace(/\\\//g, '/'), pageUrl), '(imagen de fondo)', '', labelFor(el));
    }
  }
  for (const v of Array.from(body.querySelectorAll('video[poster]'))) {
    push(absUrl(v.getAttribute('poster'), pageUrl), '(póster de video)', '', labelFor(v));
  }
  const og = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
  if (og) push(absUrl(og, pageUrl), 'og:image (imagen para redes sociales)', '', 'Meta');

  if (!entries.length) return `${header}\n(No se encontraron imágenes en el HTML.)\n`;

  const groups = new Map<string, ImageEntry[]>();
  for (const e of entries) {
    if (!groups.has(e.section)) groups.set(e.section, []);
    groups.get(e.section)!.push(e);
  }
  const parts = [header];
  for (const [section, list] of groups) {
    parts.push(`## ${section}`, '');
    for (const e of list) {
      parts.push(`- ${e.url}${e.alt ? ` — alt: "${e.alt}"` : ''}${e.size ? ` — ${e.size}` : ''}`);
    }
    parts.push('');
  }
  parts.push(`<!-- ${entries.length} imágenes -->`);
  return parts.join('\n');
}

// ─── Fact check ────────────────────────────────────────────────────────────────

export interface FabricationFinding {
  sectionName: string;
  field: string;
  text: string;
  reason: 'text-not-on-page' | 'number-not-on-page';
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // accents: "diseño" vs "diseno"
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[*_`#>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const MIN_LEN = 14;

function isPlaceholder(text: string): boolean {
  return /^\[.*\]$/.test(text.trim()) || /lorem ipsum/i.test(text) || /^(tbd|todo|n\/a|-)$/i.test(text.trim());
}

/** Numbers that carry a claim: 500+, +500, 98%, 15 años, $2,500, 24/7, 4.9 … */
function claimNumbers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/[+$]?\d[\d.,]*\s?(?:%|\+|k\b|mil\b|años|years|clientes|proyectos|projects|clients)?/gi)) {
    const v = m[0].trim();
    const digits = v.replace(/[^\d]/g, '');
    if (!digits || (digits.length < 2 && !/[%+]/.test(v))) continue; // ignore "1", "2" in lists
    if (/^(19|20)\d{2}$/.test(digits)) continue; // years like 2024
    out.push(v);
  }
  return out;
}

/**
 * Returns blueprint copy that cannot be found on the scraped page.
 * Conservative on purpose: whitespace/punctuation/accents are ignored, and a long
 * paragraph passes if every sentence is present on its own.
 */
export function checkFabrication(sections: Section[], copyMd: string): FabricationFinding[] {
  if (!copyMd.trim() || !sections.length) return [];
  const hay = norm(copyMd);
  const hayTight = hay.replace(/[^a-z0-9]/g, '');
  const findings: FabricationFinding[] = [];

  const present = (text: string) => {
    const n = norm(text);
    if (hay.includes(n)) return true;
    const tight = n.replace(/[^a-z0-9]/g, '');
    if (tight.length && hayTight.includes(tight)) return true;
    const sentences = n.split(/(?<=[.!?])\s+/).filter(s => s.length >= MIN_LEN);
    return sentences.length > 1 && sentences.every(s => hay.includes(s) || hayTight.includes(s.replace(/[^a-z0-9]/g, '')));
  };

  for (const s of sections) {
    const fields: [string, string][] = [];
    const c = s.copy || ({} as Section['copy']);
    fields.push(['headline', c.headline], ['subheadline', c.subheadline], ['body', c.body], ['cta_text', c.cta_text]);
    (s.items || []).forEach((it, i) => { fields.push([`items[${i + 1}].title`, it.title], [`items[${i + 1}].description`, it.description]); });

    for (const [field, value] of fields) {
      if (typeof value !== 'string' || !value.trim() || isPlaceholder(value)) continue;
      const text = value.trim();
      if (text.length >= MIN_LEN && !present(text)) {
        findings.push({ sectionName: s.section_name, field, text: text.length > 140 ? text.slice(0, 140) + '…' : text, reason: 'text-not-on-page' });
        continue;
      }
      // short texts: still check numeric claims ("+500 proyectos", "98%")
      for (const num of claimNumbers(text)) {
        const digits = num.replace(/[^\d]/g, '');
        if (!hayTight.includes(digits)) {
          findings.push({ sectionName: s.section_name, field, text: `${text} — número "${num}" no aparece en la página`, reason: 'number-not-on-page' });
          break;
        }
      }
    }
  }
  return findings;
}

export function factCheckMd(pageName: string, findings: FabricationFinding[]): string {
  const lines = [`# Verificación de textos — ${pageName}`, ''];
  if (!findings.length) {
    lines.push('✅ Todos los textos del blueprint aparecen en la página original.');
    return lines.join('\n');
  }
  lines.push(
    `⚠ ${findings.length} texto(s) del blueprint no aparecen en la página original.`,
    'Pueden ser reescrituras intencionales o datos inventados por la IA. Revísalos con el cliente antes de publicar.',
    '',
    '| Sección | Campo | Texto |',
    '|---|---|---|',
    ...findings.map(f => `| ${f.sectionName.replace(/\|/g, '/')} | ${f.field} | ${f.text.replace(/\|/g, '/').replace(/\n/g, ' ')} |`),
  );
  return lines.join('\n');
}
