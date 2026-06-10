// src/lib/cssEnrich.ts
//
// Elementor (and many WP builders) put section/column background images and
// colors in EXTERNAL per-post CSS files (wp-content/uploads/elementor/css/
// post-XXX.css). Those URLs never appear in the page HTML, so extraction
// could not see them — this is why the doctor photo, audience-card photos,
// CTA background, and several section background colors were lost.
//
// This module:
//   1. finds the relevant external stylesheet URLs in the raw HTML
//   2. fetches them (direct fetch first; Firecrawl scrape as CORS fallback)
//   3. parses `.elementor-element-XXXX { background-image / background-color }`
//   4. injects those as inline style="" attributes onto the matching
//      data-id="XXXX" elements in the raw HTML
//
// After enrichment, the existing pipeline (image manifest harvest + cleanHtml
// + AI extraction) sees the backgrounds as if they had been inline all along.

export type CssFetcher = (cssUrl: string) => Promise<string | null>;

const STYLESHEET_LINK_RE = /<link[^>]+rel=["']stylesheet["'][^>]*>/gi;
const HREF_RE = /href=["']([^"']+)["']/i;

/** Pick the external CSS files most likely to contain element backgrounds. */
export function findRelevantStylesheets(rawHtml: string, limit = 4): string[] {
  const links = rawHtml.match(STYLESHEET_LINK_RE) || [];
  const urls: string[] = [];
  for (const tag of links) {
    const m = tag.match(HREF_RE);
    if (!m) continue;
    const href = m[1].replace(/&amp;/g, '&');
    // Elementor per-post CSS + global frontend CSS carry the backgrounds.
    if (/\/uploads\/elementor\/css\/(post-\d+|custom-frontend|global)[^"']*\.css/i.test(href)) {
      urls.push(href.startsWith('http') ? href : '');
    }
  }
  // post-*.css files are the most specific — sort them first.
  return [...new Set(urls.filter(Boolean))]
    .sort((a, b) => Number(/post-\d+/.test(b)) - Number(/post-\d+/.test(a)))
    .slice(0, limit);
}

interface BgProps {
  image?: string;
  color?: string;
}

/**
 * Parse CSS text into a map of elementor element id -> background props.
 * First match wins (desktop rules precede mobile media-query overrides in
 * Elementor output, and we strip @media wrappers so fragments still parse).
 */
export function parseElementBackgrounds(cssText: string): Map<string, BgProps> {
  const map = new Map<string, BgProps>();
  // Remove @media openings so inner rules parse as normal rules.
  const flat = cssText.replace(/@media[^{]*\{/gi, '');
  const rules = flat.split('}');
  for (const rule of rules) {
    const brace = rule.indexOf('{');
    if (brace === -1) continue;
    const selector = rule.slice(0, brace);
    const body = rule.slice(brace + 1);

    const ids = [...selector.matchAll(/\.elementor-element-([0-9a-f]+)/gi)].map(m => m[1]);
    if (ids.length === 0) continue;

    const imgMatch = body.match(/background-image\s*:\s*url\(\s*["']?([^"')]+)["']?\s*\)/i);
    const colorMatch = body.match(/background-color\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/i);
    if (!imgMatch && !colorMatch) continue;

    for (const id of ids) {
      const existing = map.get(id) || {};
      if (imgMatch && !existing.image && !/^data:/i.test(imgMatch[1])) {
        existing.image = imgMatch[1].replace(/&amp;/g, '&');
      }
      if (colorMatch && !existing.color) existing.color = colorMatch[1];
      map.set(id, existing);
    }
  }
  return map;
}

/** Inject background props as inline styles onto data-id elements. */
export function injectBackgrounds(rawHtml: string, bgMap: Map<string, BgProps>): { html: string; injected: number } {
  let html = rawHtml;
  let injected = 0;
  for (const [id, props] of bgMap) {
    const parts: string[] = [];
    if (props.image) parts.push(`background-image:url('${props.image}')`);
    if (props.color) parts.push(`background-color:${props.color}`);
    if (parts.length === 0) continue;
    const needle = `data-id="${id}"`;
    if (!html.includes(needle)) continue;
    html = html.split(needle).join(`${needle} style="${parts.join(';')};"`);
    injected++;
  }
  return { html, injected };
}

/**
 * Full enrichment pass. Best effort — any failure returns the original HTML.
 * `fetchCss` should try a direct fetch and fall back to Firecrawl.
 */
export async function enrichHtmlWithExternalCss(
  rawHtml: string,
  fetchCss: CssFetcher,
  onStatus?: (s: string) => void
): Promise<string> {
  try {
    const sheets = findRelevantStylesheets(rawHtml);
    if (sheets.length === 0) return rawHtml;

    let combined = '';
    for (const url of sheets) {
      onStatus?.(`Fetching stylesheet ${url.split('/').pop()}...`);
      const css = await fetchCss(url);
      if (css) combined += '\n' + css;
    }
    if (!combined.trim()) return rawHtml;

    const bgMap = parseElementBackgrounds(combined);
    if (bgMap.size === 0) return rawHtml;

    const { html, injected } = injectBackgrounds(rawHtml, bgMap);
    console.log(`CSS enrichment: ${bgMap.size} elements with backgrounds in CSS, ${injected} injected into HTML`);
    return html;
  } catch (e) {
    console.warn('CSS enrichment failed (continuing without it):', e);
    return rawHtml;
  }
}
