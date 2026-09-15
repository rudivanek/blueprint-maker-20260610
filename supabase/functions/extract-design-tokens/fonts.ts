// supabase/functions/extract-design-tokens/fonts.ts
//
// Font plan: decides, for every font the site really uses, what the prototype
// should load. Every family is checked live against Google Fonts:
//   - on Google Fonts            → load it from Google (even if the site self-hosts it)
//   - not on Google (licensed,   → closest Google Fonts equivalent from a known list,
//     Adobe, custom upload)        or a neutral fallback that is clearly labelled
//   - generic / system stacks    → ignored
// The result is one combined Google Fonts URL the prototype can use as-is.

export type FontSource = 'google-link' | 'bunny-link' | 'self-hosted' | 'adobe-kit' | 'css-only';
export type FontRole = 'headings' | 'body' | 'headings & body' | 'other';

export interface FontPlanEntry {
  family: string;          // as the site names it
  role: FontRole;
  source: FontSource;
  onGoogleFonts: boolean;
  use: string;             // family the prototype should load
  substituted: boolean;
  weights: string[];       // numeric weights, e.g. ["300","400","700"]
  note: string;            // short human explanation
  originalFiles: string[]; // self-hosted font files (for reference; may be licensed)
}

export interface FontPlan {
  entries: FontPlanEntry[];
  googleFontsUrl: string | null; // one css2 URL loading every `use` family with its weights
  checkedOnline: boolean;        // false if Google Fonts could not be reached
}

// Minimal view of the token result this module needs (avoids a circular import).
export interface FontPlanInput {
  fonts: {
    googleFamilies: string[];
    googleFontsUrls: string[];
    bunnyFamilies: string[];
    adobeFontsKit: string | null;
    fontFaces: { family: string; weight: string; style: string; url: string }[];
  };
  roles: { role: string; fontFamilies: { value: string; count: number }[] }[];
  frequency: { fontFamilies: { value: string; count: number }[]; fontWeights: { value: string; count: number }[] };
  customProperties: { name: string; resolved: string }[];
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const GENERIC = new Set([
  'arial', 'helvetica', 'helvetica neue', 'verdana', 'tahoma', 'trebuchet ms', 'georgia', 'times', 'times new roman',
  'courier', 'courier new', 'courier 10 pitch', 'system-ui', '-apple-system', 'blinkmacsystemfont', 'segoe ui',
  'roboto, oxygen-sans', 'oxygen-sans', 'ubuntu', 'cantarell', 'sans-serif', 'serif', 'monospace', 'cursive',
  'fantasy', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'inherit', 'initial', 'unset', 'monaco', 'consolas',
  'andale mono', 'dejavu sans mono', 'lucida grande', 'lucida console', 'menlo', 'sf mono', 'apple color emoji',
  'segoe ui emoji', 'segoe ui symbol', 'noto color emoji', 'emoji', 'math', 'fangsong',
]);

const ICON_FONT_RE = /awesome|dashicons|icomoon|eicons|swiper|slick|genericons|material ?icons|material symbols|elementskit|ekiticons|themify|linearicons|feather|bootstrap-icons|ionicons|fontello|star|revicons|woocommerce/i;

/** Known non-Google faces → closest Google Fonts equivalent. */
const SUBSTITUTIONS: Record<string, { to: string; why: string }> = {
  'gilroy': { to: 'Poppins', why: 'geometric sans' },
  'circular': { to: 'Inter', why: 'geometric sans' },
  'circular std': { to: 'Inter', why: 'geometric sans' },
  'brandon grotesque': { to: 'Montserrat', why: 'geometric sans' },
  'brandon text': { to: 'Montserrat', why: 'geometric sans' },
  'proxima nova': { to: 'Montserrat', why: 'humanist-geometric sans' },
  'avenir': { to: 'Nunito Sans', why: 'geometric sans' },
  'avenir next': { to: 'Nunito Sans', why: 'geometric sans' },
  'futura': { to: 'Jost', why: 'geometric sans' },
  'futura pt': { to: 'Jost', why: 'geometric sans' },
  'neue haas grotesk': { to: 'Inter', why: 'neutral grotesque' },
  'neue haas unica': { to: 'Inter', why: 'neutral grotesque' },
  'akzidenz grotesk': { to: 'Archivo', why: 'grotesque' },
  'graphik': { to: 'Public Sans', why: 'neutral grotesque' },
  'gt walsheim': { to: 'Poppins', why: 'geometric sans' },
  'gt america': { to: 'Inter', why: 'neutral grotesque' },
  'sofia pro': { to: 'Poppins', why: 'geometric sans' },
  'cera pro': { to: 'Poppins', why: 'geometric sans' },
  'maison neue': { to: 'Inter', why: 'neutral grotesque' },
  'apercu': { to: 'Work Sans', why: 'grotesque' },
  'aktiv grotesk': { to: 'Archivo', why: 'grotesque' },
  'tt norms': { to: 'Manrope', why: 'geometric sans' },
  'tt commons': { to: 'Manrope', why: 'geometric sans' },
  'gotham': { to: 'Montserrat', why: 'geometric sans' },
  'museo sans': { to: 'Rubik', why: 'rounded sans' },
  'calibri': { to: 'Carlito', why: 'metric-compatible' },
  'myriad pro': { to: 'Source Sans 3', why: 'humanist sans' },
  'frutiger': { to: 'Open Sans', why: 'humanist sans' },
  'din': { to: 'Barlow', why: 'DIN-style grotesque' },
  'din pro': { to: 'Barlow', why: 'DIN-style grotesque' },
  'din next': { to: 'Barlow', why: 'DIN-style grotesque' },
  'ff din': { to: 'Barlow', why: 'DIN-style grotesque' },
  'trade gothic': { to: 'Oswald', why: 'condensed grotesque' },
  'univers': { to: 'Roboto', why: 'neo-grotesque' },
  'sf pro display': { to: 'Inter', why: 'system neo-grotesque' },
  'sf pro text': { to: 'Inter', why: 'system neo-grotesque' },
  'garamond': { to: 'EB Garamond', why: 'old-style serif' },
  'adobe garamond': { to: 'EB Garamond', why: 'old-style serif' },
  'adobe garamond pro': { to: 'EB Garamond', why: 'old-style serif' },
  'caslon': { to: 'Libre Caslon Text', why: 'old-style serif' },
  'baskerville': { to: 'Libre Baskerville', why: 'transitional serif' },
  'minion pro': { to: 'Crimson Pro', why: 'old-style serif' },
  'freight text': { to: 'Lora', why: 'text serif' },
  'freight display': { to: 'Playfair Display', why: 'display serif' },
  'tiempos': { to: 'Spectral', why: 'text serif' },
  'tiempos headline': { to: 'Playfair Display', why: 'display serif' },
  'canela': { to: 'Cormorant Garamond', why: 'display serif' },
  'gt sectra': { to: 'Fraunces', why: 'display serif' },
  'sabon': { to: 'EB Garamond', why: 'old-style serif' },
  'didot': { to: 'Playfair Display', why: 'didone serif' },
  'bodoni': { to: 'Bodoni Moda', why: 'didone serif' },
  'recoleta': { to: 'Fraunces', why: 'soft display serif' },
  'aeonik': { to: 'Inter', why: 'neo-grotesque' },
  'satoshi': { to: 'Manrope', why: 'geometric sans' },
  'general sans': { to: 'Manrope', why: 'geometric sans' },
  'clash display': { to: 'Syne', why: 'display grotesque' },
  'cabinet grotesk': { to: 'Bricolage Grotesque', why: 'display grotesque' },
};

export function firstFamily(stack: string): string {
  return stack.split(',')[0].trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ');
}

function isUsable(name: string): boolean {
  const n = name.toLowerCase();
  return !!n && !GENERIC.has(n) && !ICON_FONT_RE.test(n) && !/^var\(/.test(n) && n.length < 60;
}

/** Strips weight/style suffixes some sites bake into family names ("Gilroy-Bold", "Manrope Light"). */
export function baseFamily(name: string): string {
  return name
    .replace(/[-_ ](thin|hairline|extralight|ultralight|light|book|regular|normal|medium|semibold|demibold|bold|extrabold|ultrabold|black|heavy)(italic)?$/i, '')
    .replace(/[-_ ]italic$/i, '')
    .trim();
}

const WEIGHT_WORDS: Record<string, string> = {
  thin: '100', hairline: '100', extralight: '200', ultralight: '200', light: '300', normal: '400', regular: '400',
  book: '400', medium: '500', semibold: '600', demibold: '600', bold: '700', extrabold: '800', ultrabold: '800',
  black: '900', heavy: '900',
};

function normWeight(w: string): string[] {
  const v = w.trim().toLowerCase();
  if (WEIGHT_WORDS[v]) return [WEIGHT_WORDS[v]];
  const range = v.match(/^(\d{3})\s+(\d{3})$/); // variable font range "100 900"
  if (range) {
    const out: string[] = [];
    for (let x = Number(range[1]); x <= Number(range[2]); x += 100) out.push(String(x));
    return out;
  }
  return /^[1-9]00$/.test(v) ? [v] : [];
}

function weightsFromGoogleUrl(url: string, family: string): string[] {
  try {
    const u = new URL(url);
    for (const fam of u.searchParams.getAll('family')) {
      for (const part of fam.split('|')) {
        const [name, spec = ''] = part.split(':');
        if (name.replace(/\+/g, ' ').trim().toLowerCase() !== family.toLowerCase()) continue;
        const nums = spec.match(/\b[1-9]00\b/g) ?? [];
        return [...new Set(nums)];
      }
    }
  } catch { /* ignore */ }
  return [];
}

export function googleCssUrl(families: { family: string; weights: string[] }[]): string | null {
  if (!families.length) return null;
  const parts = families.map(f => {
    const w = [...new Set(f.weights)].map(Number).filter(n => n >= 100 && n <= 900).sort((a, b) => a - b);
    const name = f.family.trim().replace(/\s+/g, '+');
    return w.length ? `family=${name}:wght@${w.join(';')}` : `family=${name}`;
  });
  return `https://fonts.googleapis.com/css2?${parts.join('&')}&display=swap`;
}

const googleCache = new Map<string, boolean>();

/** true / false = checked; null = Google Fonts unreachable. */
async function isOnGoogleFonts(family: string, fetchImpl: FetchLike): Promise<boolean | null> {
  const key = family.toLowerCase();
  if (googleCache.has(key)) return googleCache.get(key)!;
  try {
    const res = await fetchImpl(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&display=swap`, {
      signal: AbortSignal.timeout(6000),
    });
    try { await res.body?.cancel(); } catch { /* ignore */ }
    if (res.status === 200) { googleCache.set(key, true); return true; }
    if (res.status === 400 || res.status === 404) { googleCache.set(key, false); return false; }
    return null;
  } catch {
    return null;
  }
}

/** Google returns HTTP 400 for the whole URL if one weight doesn't exist, so keep only valid ones. */
async function validWeights(family: string, weights: string[], fetchImpl: FetchLike): Promise<string[]> {
  const sorted = [...new Set(weights)].filter(w => /^[1-9]00$/.test(w)).sort();
  if (!sorted.length) return [];
  const ok = async (ws: string[]) => {
    try {
      const url = googleCssUrl([{ family, weights: ws }])!;
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(6000) });
      try { await res.body?.cancel(); } catch { /* ignore */ }
      return res.status === 200 ? true : res.status === 400 ? false : null;
    } catch { return null; }
  };
  const all = await ok(sorted);
  if (all !== false) return sorted; // valid, or unverifiable (keep as is)
  const each = await Promise.all(sorted.map(w => ok([w])));
  return sorted.filter((_, i) => each[i] === true);
}

function fallbackFor(family: string, stackHint: string): { to: string; why: string } {
  const s = `${family} ${stackHint}`.toLowerCase();
  if (/mono|code/.test(s)) return { to: 'JetBrains Mono', why: 'neutral monospace fallback' };
  if (/serif/.test(s) && !/sans/.test(s)) return { to: 'Lora', why: 'neutral serif fallback' };
  if (/script|hand|brush|signature/.test(s)) return { to: 'Caveat', why: 'neutral script fallback' };
  if (/condensed|narrow|compressed/.test(s)) return { to: 'Barlow Condensed', why: 'neutral condensed fallback' };
  return { to: 'Inter', why: 'neutral sans fallback' };
}

export async function buildFontPlan(t: FontPlanInput, fetchImpl: FetchLike): Promise<FontPlan> {
  type Cand = { family: string; source: FontSource; score: number; roles: Set<'headings' | 'body'>; stack: string; weights: Set<string>; files: string[] };
  const cands = new Map<string, Cand>();
  const add = (rawName: string, source: FontSource, score: number, role: 'headings' | 'body' | 'other' = 'other', stack = '') => {
    const family = baseFamily(firstFamily(rawName));
    if (!isUsable(family)) return;
    const key = family.toLowerCase();
    const c = cands.get(key) ?? { family, source, score: 0, roles: new Set<'headings' | 'body'>(), stack, weights: new Set<string>(), files: [] };
    c.score += score;
    // stronger source wins: google-link > bunny-link > self-hosted > adobe-kit > css-only
    const rank: Record<FontSource, number> = { 'google-link': 5, 'bunny-link': 4, 'self-hosted': 3, 'adobe-kit': 2, 'css-only': 1 };
    if (rank[source] > rank[c.source]) c.source = source;
    if (role !== 'other') c.roles.add(role);
    if (!c.stack && stack) c.stack = stack;
    cands.set(key, c);
    return c;
  };

  for (const f of t.fonts.googleFamilies) {
    const c = add(f, 'google-link', 5);
    for (const url of t.fonts.googleFontsUrls) for (const w of weightsFromGoogleUrl(url, f)) c?.weights.add(w);
  }
  for (const f of t.fonts.bunnyFamilies) add(f, 'bunny-link', 4);
  for (const face of t.fonts.fontFaces) {
    const c = add(face.family, 'self-hosted', 2);
    if (!c) continue;
    for (const w of normWeight(face.weight)) c.weights.add(w);
    const suffix = face.family.match(/[-_ ](\w+)$/)?.[1]?.toLowerCase();
    if (suffix && WEIGHT_WORDS[suffix]) c.weights.add(WEIGHT_WORDS[suffix]);
    if (c.files.length < 3) c.files.push(face.url);
  }
  // Elementor global typography: primary/secondary → headings, text/accent → body
  const kitWeights: Record<string, string[]> = {};
  for (const cp of t.customProperties) {
    const m = cp.name.match(/^--e-global-typography-([\w-]+?)-font-(family|weight)$/);
    if (!m) continue;
    if (m[2] === 'weight') { (kitWeights[m[1]] ??= []).push(...normWeight(cp.resolved.replace(/["']/g, ''))); continue; }
    const role = /primary|secondary/.test(m[1]) ? 'headings' as const : 'body' as const;
    add(cp.resolved, t.fonts.adobeFontsKit ? 'adobe-kit' : 'css-only', 6, role, cp.resolved);
  }
  for (const cp of t.customProperties) {
    const m = cp.name.match(/^--e-global-typography-([\w-]+?)-font-family$/);
    if (!m) continue;
    const c = cands.get(baseFamily(firstFamily(cp.resolved)).toLowerCase());
    for (const w of kitWeights[m[1]] ?? []) c?.weights.add(w);
  }
  for (const r of t.roles) {
    const role = r.role === 'headings' ? 'headings' as const : r.role === 'body' ? 'body' as const : 'other' as const;
    for (const f of r.fontFamilies) add(f.value, t.fonts.adobeFontsKit ? 'adobe-kit' : 'css-only', Math.min(f.count, 10), role, f.value);
  }
  for (const f of t.frequency.fontFamilies) add(f.value, t.fonts.adobeFontsKit ? 'adobe-kit' : 'css-only', Math.min(f.count, 10) / 2, 'other', f.value);

  const globalWeights = t.frequency.fontWeights.flatMap(w => normWeight(w.value));
  const picked = [...cands.values()].sort((a, b) => b.score - a.score).slice(0, 6);
  if (picked.length && !picked.some(p => p.roles.has('headings'))) picked[0].roles.add('headings');
  if (picked.length && !picked.some(p => p.roles.has('body'))) (picked.find(p => p.roles.size === 0) ?? picked[0]).roles.add('body');
  const roleOf = (c: Cand): FontRole =>
    c.roles.has('headings') && c.roles.has('body') ? 'headings & body' : c.roles.has('headings') ? 'headings' : c.roles.has('body') ? 'body' : 'other';

  let checkedOnline = true;
  const entries: FontPlanEntry[] = [];
  const checks = await Promise.all(picked.map(p => isOnGoogleFonts(p.family, fetchImpl)));
  picked.forEach((p, i) => {
    const on = checks[i];
    if (on === null) checkedOnline = false;
    const weights = p.weights.size ? [...p.weights] : [...new Set(['400', '700', ...globalWeights])].slice(0, 5);
    const onGoogle = on === true || (on === null && p.source === 'google-link');
    let use = p.family;
    let substituted = false;
    let note: string;
    if (onGoogle) {
      note = p.source === 'google-link' ? 'loaded from Google Fonts on the site'
        : p.source === 'self-hosted' ? 'self-hosted on the site; the same family is on Google Fonts'
        : 'available on Google Fonts';
    } else if (on === null) {
      note = 'could not verify on Google Fonts — check manually';
    } else {
      const key = p.family.toLowerCase().replace(/[-_]+/g, ' ').trim();
      const known = SUBSTITUTIONS[key] ?? SUBSTITUTIONS[key.replace(/\s+(std|pro|web|display|text)$/, '')];
      const sub = known ?? fallbackFor(p.family, p.stack);
      use = sub.to;
      substituted = true;
      const why = p.source === 'adobe-kit' ? 'Adobe Fonts / licensed' : p.source === 'self-hosted' ? 'self-hosted, not on Google Fonts (likely licensed)' : 'not on Google Fonts';
      note = `${why} → ${sub.to} (${sub.why}${known ? '' : ', no known equivalent — check visually'})`;
    }
    entries.push({ family: p.family, role: roleOf(p), source: p.source, onGoogleFonts: on === true, use, substituted, weights: weights.sort(), note, originalFiles: p.files });
  });

  // One URL for everything the prototype must load (merge weights per `use` family)
  const merged = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!e.onGoogleFonts && !e.substituted && e.source !== 'google-link') continue;
    const s = merged.get(e.use) ?? new Set<string>();
    e.weights.forEach(w => s.add(w));
    merged.set(e.use, s);
  }
  const validated = await Promise.all([...merged].map(async ([family, w]) => ({ family, weights: await validWeights(family, [...w], fetchImpl) })));
  for (const v of validated) {
    for (const e of entries) if (e.use === v.family && v.weights.length) e.weights = e.weights.filter(w => v.weights.includes(w));
  }
  const googleFontsUrl = googleCssUrl(validated);
  return { entries, googleFontsUrl, checkedOnline };
}

export function fontPlanMarkdown(plan: FontPlan): string {
  if (!plan.entries.length) return '';
  const L: string[] = ['## Font plan (authoritative — use exactly this)'];
  for (const e of plan.entries) {
    const target = e.substituted ? `use **${e.use}** instead` : `use **${e.use}**`;
    L.push(`- ${e.role}: "${e.family}" → ${target}; weights ${e.weights.join(', ')} — ${e.note}`);
  }
  if (plan.googleFontsUrl) L.push(`- Load in the prototype: ${plan.googleFontsUrl}`);
  if (!plan.checkedOnline) L.push('- ⚠ Google Fonts could not be reached for every family; unverified entries need a manual check.');
  return L.join('\n');
}
