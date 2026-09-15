// src/lib/designTokens.ts
//
// Client for the `extract-design-tokens` edge function.
// It downloads the site's real stylesheets server-side (the browser can't,
// because of CORS) and returns measured colours, fonts, type scale, spacing
// and CSS custom properties, plus `digest`: a compact Markdown block that
// generateDesignSystem() passes to the AI as ground truth.

import { supabase } from './supabase';

export interface FreqEntry { value: string; count: number; samples: string[] }

export interface DesignTokenResult {
  pageUrl: string;
  colors: FreqEntry[];
  fonts: {
    googleFamilies: string[];
    googleFontsUrls: string[];
    bunnyFamilies: string[];
    adobeFontsKit: string | null;
    fontFaces: { family: string; weight: string; style: string; url: string; format: string }[];
    jsLoadedSuspected: boolean;
  };
  platform: { cms: string | null; builder: string | null; framework: string | null; cssApproach: string; signals: string[] };
  diagnostics: {
    linkedSheetsFound: number;
    sheetsFetchedOk: number;
    sheetsFailed: { url: string; reason: string }[];
    totalCssBytes: number;
    cssLooksInsufficient: boolean;
    insufficientReasons: string[];
  };
  digest: string;
}

const MAX_HTML_CHARS = 1_500_000;

/**
 * Shrinks rendered HTML before upload: SVG paths, base64 data and long inline
 * scripts carry no design information. Short script heads are kept because
 * platform detection looks for markers like __NEXT_DATA__ or WebFont.load.
 */
export function slimHtmlForTokens(html: string): string {
  let out = html
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, '<svg></svg>')
    .replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{200,}/gi, 'data:,')
    .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (_m, open: string, body: string, close: string) =>
      open + (body.length > 400 ? body.slice(0, 400) : body) + close);
  if (out.length > MAX_HTML_CHARS) out = out.slice(0, MAX_HTML_CHARS);
  return out;
}

/** Returns null (never throws) so design extraction can continue without CSS evidence. */
export async function fetchDesignTokens(
  url: string,
  renderedHtml?: string,
): Promise<{ data: DesignTokenResult | null; error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('extract-design-tokens', {
      body: { url, html: renderedHtml ? slimHtmlForTokens(renderedHtml) : undefined },
    });
    if (error) {
      let detail = error.message;
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json().catch(() => null) as { error?: string } | null;
        if (body?.error) detail = body.error;
      }
      return { data: null, error: detail };
    }
    if (!data || typeof data.digest !== 'string') return { data: null, error: 'Unexpected response from extract-design-tokens' };
    return { data: data as DesignTokenResult, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

/** One-line summary for the UI, e.g. "WordPress + Elementor · 7/8 stylesheets · fonts: Inter, Lora". */
export function summarizeTokens(t: DesignTokenResult): string {
  const p = t.platform;
  const platform = [p.cms, p.builder, p.framework].filter(Boolean).map(s => s!.charAt(0).toUpperCase() + s!.slice(1)).join(' + ') || 'Custom site';
  const families = [...new Set([
    ...t.fonts.googleFamilies,
    ...t.fonts.bunnyFamilies,
    ...t.fonts.fontFaces.map(f => f.family),
  ])];
  const fonts = families.length ? `fonts: ${families.slice(0, 4).join(', ')}` : 'no web fonts found';
  return `${platform} · ${t.diagnostics.sheetsFetchedOk}/${t.diagnostics.linkedSheetsFound} stylesheets · ${t.colors.length} colours · ${fonts}`;
}
