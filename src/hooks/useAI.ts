// src/hooks/useAI.ts
//
// CHANGES IN THIS VERSION:
// 1. MULTIMODAL — generateDesignSystem / importPageStructure / extractWordPressContent
//    now accept screenshot slices (JPEG data URIs from lib/screenshot.ts) and send
//    them to the model as image blocks. The AI finally SEES the page.
// 2. TOOL USE — structure extraction now forces a tool call (`emit_page_structure`)
//    on Anthropic, which guarantees valid JSON. No more regex-extracting `{...}`
//    from markdown fences. OpenAI path uses response_format: json_object.
// 3. REAL TRUNCATION DETECTION — we check stop_reason / finish_reason from the API
//    instead of guessing from a trailing `}`.
// 4. BIGGER BUDGETS — max_tokens raised to 32000; HTML budget raised to 200K chars
//    (~50K tokens) after a much more aggressive cleaning pass (SVG paths, srcset,
//    base64 data URIs, noscript, meta tags stripped) so middle sections stop
//    getting cut.

import { useState } from 'react';
import { DESIGN_SYSTEM_EXTRACTION_PROMPT, STRUCTURE_IMPORT_PROMPT } from '../lib/prompts';
import { dataUriParts } from '../lib/screenshot';
import { usageStore } from '../lib/usage';
import type { Section, GlobalSettings, AIProvider } from '../types';

// ---------------------------------------------------------------------------
// Message / content types
// ---------------------------------------------------------------------------

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; dataUri: string };

interface AIMessage {
  role: 'user' | 'assistant';
  content: ContentPart[];
}

/** Convenience: build a user message from optional images + a text prompt. */
function userMessage(text: string, imageDataUris: string[] = []): AIMessage {
  return {
    role: 'user',
    content: [
      ...imageDataUris.map(dataUri => ({ type: 'image' as const, dataUri })),
      { type: 'text' as const, text },
    ],
  };
}

interface AIResult {
  text: string;
  toolInput: Record<string, unknown> | null;
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

interface AnthropicContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

function toAnthropicContent(parts: ContentPart[]): unknown[] {
  return parts
    .map(p => {
      if (p.type === 'text') return { type: 'text', text: p.text };
      const parsed = dataUriParts(p.dataUri);
      if (!parsed) return null;
      return {
        type: 'image',
        source: { type: 'base64', media_type: parsed.mediaType, data: parsed.base64 },
      };
    })
    .filter(Boolean) as unknown[];
}

async function callAnthropic(
  apiKey: string,
  messages: AIMessage[],
  systemPrompt: string,
  options?: { tool?: AnthropicTool; maxTokens?: number }
): Promise<AIResult> {
  const maxTokens = options?.maxTokens ?? 32000;

  const body: Record<string, unknown> = {
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: messages.map(m => ({ role: m.role, content: toAnthropicContent(m.content) })),
  };

  if (options?.tool) {
    body.tools = [options.tool];
    body.tool_choice = { type: 'tool', name: options.tool.name };
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => response.text());
    console.error('Anthropic API error:', JSON.stringify(errorBody, null, 2));
    const message = typeof errorBody === 'object' && errorBody !== null
      ? (errorBody as { error?: { message?: string } }).error?.message ?? JSON.stringify(errorBody)
      : String(errorBody);
    throw new Error(`Anthropic API error: ${response.status} — ${message}`);
  }

  const data: AnthropicResponse = await response.json();

  // Report token usage to the global counter
  usageStore.report('claude-sonnet-4-6', data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0);

  // Join ALL text blocks (previous version only read content[0])
  const text = (data.content || [])
    .filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text as string)
    .join('\n');

  // Find a tool_use block if one exists
  const toolBlock = (data.content || []).find(b => b.type === 'tool_use');
  const toolInput =
    toolBlock?.input && typeof toolBlock.input === 'object'
      ? (toolBlock.input as Record<string, unknown>)
      : null;

  const truncated = data.stop_reason === 'max_tokens';
  if (truncated) console.warn('Anthropic response hit max_tokens — output is truncated');

  return { text, toolInput, truncated };
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

interface OpenAIResponse {
  choices: Array<{ message: { content: string }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function toOpenAIContent(parts: ContentPart[]): unknown {
  // Plain string when text-only (cheaper, simpler)
  if (parts.every(p => p.type === 'text')) {
    return parts.map(p => (p as { type: 'text'; text: string }).text).join('\n');
  }
  return parts.map(p =>
    p.type === 'text'
      ? { type: 'text', text: p.text }
      : { type: 'image_url', image_url: { url: p.dataUri } }
  );
}

async function callOpenAI(
  apiKey: string,
  messages: AIMessage[],
  systemPrompt: string,
  options?: { jsonMode?: boolean; maxTokens?: number }
): Promise<AIResult> {
  const maxTokens = options?.maxTokens ?? 32000;

  const body: Record<string, unknown> = {
    model: 'gpt-4.1',
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: toOpenAIContent(m.content) })),
    ],
  };
  if (options?.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => response.text());
    console.error('OpenAI API error:', JSON.stringify(errorBody, null, 2));
    const message = typeof errorBody === 'object' && errorBody !== null
      ? (errorBody as { error?: { message?: string } }).error?.message ?? JSON.stringify(errorBody)
      : String(errorBody);
    throw new Error(`OpenAI API error: ${response.status} — ${message}`);
  }

  const data: OpenAIResponse = await response.json();

  // Report token usage to the global counter
  usageStore.report('gpt-4.1', data.usage?.prompt_tokens ?? 0, data.usage?.completion_tokens ?? 0);

  const choice = data.choices?.[0];
  return {
    text: choice?.message?.content ?? '',
    toolInput: null,
    truncated: choice?.finish_reason === 'length',
  };
}

// ---------------------------------------------------------------------------
// Tool schema for structure extraction (Anthropic) — mirrors STRUCTURE_IMPORT_PROMPT
// ---------------------------------------------------------------------------

const STRUCTURE_TOOL: AnthropicTool = {
  name: 'emit_page_structure',
  description:
    'Emit the complete extracted page structure: every content section in page order, plus global nav/footer/site settings. Follow all extraction rules from the system prompt.',
  input_schema: {
    type: 'object',
    properties: {
      sections: {
        type: 'array',
        description: 'Every content section in page order (nav and footer excluded — those go in globals).',
        items: {
          type: 'object',
          properties: {
            section_name: { type: 'string' },
            section_type: { type: 'string' },
            background_hex: { type: 'string' },
            headline_size: { type: 'string' },
            layout_variant: { type: 'string' },
            layout_description: { type: 'string' },
            layout_contract: {
              type: 'object',
              properties: {
                section_role: { type: 'string' },
                desktop_layout: { type: 'string' },
                mobile_layout: { type: 'string' },
                column_structure: { type: 'string' },
                content_position: { type: 'string' },
                image_position: { type: 'string' },
                card_or_grid_structure: { type: 'string' },
                alignment_rules: { type: 'string' },
                spacing_density: { type: 'string' },
                must_preserve: { type: 'string' },
                allowed_simplifications: { type: 'string' },
                do_not_do: { type: 'string' },
              },
            },
            copy: {
              type: 'object',
              properties: {
                headline: { type: 'string' },
                subheadline: { type: 'string' },
                body: { type: 'string' },
                cta_text: { type: 'string' },
                cta_url: { type: 'string' },
              },
            },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  icon: { type: 'string' },
                  image: { type: 'string' },
                  link: { type: 'string' },
                },
              },
            },
            images: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  src: { type: 'string' },
                  alt: { type: 'string' },
                  width: { type: 'string' },
                  height: { type: 'string' },
                  position: { type: 'string' },
                },
              },
            },
            notes: { type: 'string' },
          },
          required: ['section_name', 'section_type', 'layout_description', 'copy'],
        },
      },
      globals: {
        type: 'object',
        properties: {
          siteName: { type: 'string' },
          logoUrl: { type: 'string' },
          nav: {
            type: 'object',
            properties: {
              style: { type: 'string' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { label: { type: 'string' }, url: { type: 'string' } },
                },
              },
            },
          },
          footer: {
            type: 'object',
            properties: {
              style: { type: 'string' },
              copyright: { type: 'string' },
              columns: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    heading: { type: 'string' },
                    links: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: { label: { type: 'string' }, url: { type: 'string' } },
                      },
                    },
                  },
                },
              },
              address: { type: 'string' },
              phone: { type: 'string' },
              email: { type: 'string' },
              socials: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { platform: { type: 'string' }, url: { type: 'string' } },
                },
              },
              legal_links: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { label: { type: 'string' }, url: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
    required: ['sections', 'globals'],
  },
};

// ---------------------------------------------------------------------------
// HTML cleaning — much more aggressive than before so more of the page fits
// ---------------------------------------------------------------------------

function cleanHtml(html: string): string {
  // Collect font CDN URLs before any tags are removed
  const fontUrlPatterns = [
    /fonts\.googleapis\.com\/css2?[^"'\s]*/g,
    /fonts\.bunny\.net\/css[^"'\s]*/g,
    /use\.typekit\.net\/[^"'\s]*/g,
  ];
  const detectedFontUrls: string[] = [];
  for (const pattern of fontUrlPatterns) {
    const matches = html.match(pattern);
    if (matches) detectedFontUrls.push(...matches);
  }
  const uniqueFontUrls = [...new Set(detectedFontUrls)];
  console.log('Detected font URLs:', uniqueFontUrls);

  const fontComment = uniqueFontUrls.length > 0
    ? `<!-- DETECTED FONT URLS: ${uniqueFontUrls.join(', ')} -->\n`
    : '';

  // Preserve font CDN <link> tags by replacing them with placeholders before stripping
  const fontLinkPlaceholders: string[] = [];
  const htmlWithPlaceholders = html.replace(
    /<link\b[^>]*(?:fonts\.googleapis\.com|fonts\.bunny\.net|typekit\.net)[^>]*>/gi,
    (match) => {
      const idx = fontLinkPlaceholders.length;
      fontLinkPlaceholders.push(match);
      return `__FONT_LINK_${idx}__`;
    }
  );

  const cleaned = htmlWithPlaceholders
    // RESCUE LAZY-LOADED IMAGES (must run BEFORE data-* attributes are stripped):
    // WordPress/Elementor lazy-loaders hide real URLs in data-src / data-lazy-src /
    // data-bg etc. Promote them to real src / style attributes so the AI sees them.
    .replace(/\bdata-(?:src|lazy-src|lazy_src|lazysrc|original)=(["'])/gi, 'src=$1')
    .replace(/\bdata-(?:bg|background|bg-src|background-image)=(["'])([^"']+)\1/gi, 'style=$1background-image:url($2)$1')
    // Unwrap <noscript> instead of deleting it — lazy-loaders put the REAL
    // <img src="..."> fallback inside noscript.
    .replace(/<noscript\b[^>]*>([\s\S]*?)<\/noscript>/gi, '$1')
    // Big structural noise
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // SVG innards are huge and carry no layout info (the screenshot shows icons)
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '<svg data-omitted="true"></svg>')
    // Inline base64 images can be hundreds of KB each
    .replace(/(src|href)="data:[^"]{200,}"/gi, '$1="data-uri-omitted"')
    .replace(/(src|href)='data:[^']{200,}'/gi, "$1='data-uri-omitted'")
    // Responsive image variants — keep only src, drop srcset/sizes
    .replace(/\s+srcset="[^"]*"/gi, '')
    .replace(/\s+srcset='[^']*'/gi, '')
    .replace(/\s+sizes="[^"]*"/gi, '')
    .replace(/\s+sizes='[^']*'/gi, '')
    // Head metadata noise (font links already protected by placeholders)
    .replace(/<meta\b[^>]*>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    // Attribute noise
    .replace(/\s+class="[^"]*"/gi, '')
    .replace(/\s+class='[^']*'/gi, '')
    .replace(/\s+data-[a-z0-9-]+(?:="[^"]*"|='[^']*')?/gi, '')
    .replace(/\s+aria-[a-z-]+(?:="[^"]*"|='[^']*')?/gi, '')
    .replace(/\s+id="(?![\w-]*anchor[\w-]*)([^"]*)"/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Restore font link tags
  const restored = fontLinkPlaceholders.reduce(
    (acc, tag, idx) => acc.replace(`__FONT_LINK_${idx}__`, tag),
    cleaned
  );

  return fontComment + restored;
}

function truncateHtml(html: string, firstChars: number, lastChars: number): string {
  const total = firstChars + lastChars;
  if (html.length <= total) return html;
  const head = html.slice(0, firstChars);
  const tail = html.slice(-lastChars);
  return `${head}\n\n<!-- ... middle content truncated for length ... -->\n\n${tail}`;
}

/**
 * Harvest font families from Google Fonts <link> tags and @font-face rules.
 * These links sit in the HTML head and were previously stripped before the
 * design AI ever saw them — causing it to wrongly report "no fonts detected"
 * and substitute lookalikes (e.g. Playfair Display instead of DM Serif Display).
 */
function harvestFonts(rawHtml: string): string[] {
  const fonts = new Set<string>();
  // Google Fonts links: css?family=DM+Serif+Display:100,...|Other and css2?family=A&family=B
  const linkPattern = /fonts\.googleapis\.com\/css2?\?([^"'>\s]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = linkPattern.exec(rawHtml)) !== null) {
    const qs = m[1].replace(/&amp;/g, '&');
    for (const param of qs.split('&')) {
      if (!param.toLowerCase().startsWith('family=')) continue;
      // css v1 packs several families separated by |
      for (const fam of param.slice(7).split('|')) {
        const name = decodeURIComponent(fam.split(':')[0]).replace(/\+/g, ' ').trim();
        if (name) fonts.add(name);
      }
    }
  }
  // @font-face declarations in inline style blocks
  const ffPattern = /@font-face\s*\{[^}]*font-family\s*:\s*["']?([^"';}]+)/gi;
  while ((m = ffPattern.exec(rawHtml)) !== null) {
    fonts.add(m[1].trim());
  }
  return [...fonts];
}

/**
 * Frequency-ranked hex colors found anywhere in the markup (SVG fills,
 * inline styles, style blocks). Inline SVG fill colors are usually the
 * true brand palette — previously stripped with the SVG innards.
 */
function harvestDominantColors(rawHtml: string, top = 14): { hex: string; count: number }[] {
  const counts = new Map<string, number>();
  const hexPattern = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
  const matches = rawHtml.match(hexPattern) || [];
  for (const raw of matches) {
    const hex = raw.toUpperCase();
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, top);
}

/**
 * Harvest EVERY image URL from the raw, uncleaned HTML — including ones that
 * only exist inside <style> blocks (CSS background-image), Elementor
 * data-settings JSON, preload links, srcset, and og:image meta tags.
 * These never survive cleaning as <img> tags, which is why parallax/CSS
 * background photos used to come through with empty src.
 */
function harvestImageUrls(rawHtml: string): string[] {
  const pattern = /https?:\/\/[^\s"'()<>\\]+?\.(?:jpg|jpeg|png|webp|gif|avif)(?:\?[^\s"'()<>\\]*)?/gi;
  const found = rawHtml.match(pattern) || [];
  // Also catch escaped URLs inside JSON blobs like Elementor data-settings: https:\/\/...
  const jsonEscaped = rawHtml.match(/https?:\\\/\\\/[^\s"']+?\.(?:jpg|jpeg|png|webp|gif|avif)(?:\?[^\s"']*)?/gi) || [];
  const unescaped = jsonEscaped.map(u => u.replace(/\\\//g, '/'));
  const all = [...found, ...unescaped]
    .map(u => u.replace(/&amp;/g, '&'))
    // Drop tiny theme assets that are never section backgrounds
    .filter(u => !/(?:emoji|favicon|spinner|loader|blank|pixel|1x1)/i.test(u));
  return [...new Set(all)].slice(0, 80);
}

// ---------------------------------------------------------------------------
// JSON fallback parser (OpenAI path / Anthropic fallback if tool_use missing)
// ---------------------------------------------------------------------------

function parseStructureJson(raw: string): { sections: Partial<Section>[]; globals: Partial<GlobalSettings> } | null {
  try {
    const stripped = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return { sections: parsed.sections || [], globals: parsed.globals || {} };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAI(provider: AIProvider, anthropicKey: string, openaiKey: string) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const activeKey = provider === 'openai' ? openaiKey : anthropicKey;

  /**
   * Generate design.md from extract data + raw HTML CSS + (NEW) screenshot slices.
   * @param screenshots JPEG data URIs from prepareScreenshotForAI() — optional but
   *                    strongly recommended: lets the AI verify actual rendered
   *                    colors/fonts instead of guessing from CSS text.
   */
  const generateDesignSystem = async (
    extractData: Record<string, unknown>,
    rawHtml: string,
    screenshots: string[] = []
  ): Promise<string | null> => {
    setLoading(true);
    setError(null);
    setStatus('Analyzing design system with AI...');

    try {
      const cssBlocks: string[] = [];
      const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
      let match;
      while ((match = styleRegex.exec(rawHtml)) !== null) {
        cssBlocks.push(match[1]);
      }
      const inlineStyles: string[] = [];
      const inlineRegex = /style="([^"]+)"/gi;
      while ((match = inlineRegex.exec(rawHtml)) !== null) {
        inlineStyles.push(match[1]);
      }

      const screenshotNote = screenshots.length > 0
        ? `\n\nIMPORTANT: ${screenshots.length} full-page screenshot slice(s) of the rendered page are attached above (top-to-bottom). Use them as the AUTHORITATIVE source for actual rendered colors (nav background, button colors, section backgrounds, text colors) and visual font characteristics (serif vs sans-serif, weight). The CSS text below may contain unused rules — the screenshot shows what is actually rendered. If the CSS and the screenshot disagree, trust the screenshot.`
        : '';

      // Fonts from Google Fonts <link> tags / @font-face — authoritative.
      const detectedFonts = harvestFonts(rawHtml);
      const fontsBlock = detectedFonts.length > 0
        ? `\n\nFONTS DETECTED IN HTML (Google Fonts links / @font-face) — these are the site's REAL fonts. Use them as the heading/body families. Do NOT substitute lookalikes and do NOT claim no fonts were found:\n${detectedFonts.join('\n')}`
        : '\n\nNo font links or @font-face rules were found in the HTML. Infer serif/sans-serif character from the screenshot and clearly mark the chosen families as PLACEHOLDERS to verify manually.';

      // Frequency-ranked hex colors from markup (SVG fills = brand palette).
      const dominantColors = harvestDominantColors(rawHtml);
      const colorsBlock = dominantColors.length > 0
        ? `\n\nHEX COLORS FOUND IN MARKUP, ranked by frequency (inline SVG icon/button fills are usually the true brand palette — incorporate the most frequent non-neutral ones as primary/accent colors rather than inventing values):\n${dominantColors.map(c => `${c.hex} (×${c.count})`).join('\n')}`
        : '';

      const userText = `Here is the branding extract data from the website:
\`\`\`json
${JSON.stringify(extractData, null, 2)}
\`\`\`

Here are the CSS blocks extracted from the page:
\`\`\`css
${cssBlocks.slice(0, 8).join('\n\n').substring(0, 80000)}
\`\`\`

Sample inline styles found:
\`\`\`
${inlineStyles.slice(0, 80).join('\n')}
\`\`\`${screenshotNote}${fontsBlock}${colorsBlock}

Please generate the complete design.md file following the exact format specified in the system prompt. Resolve ALL CSS variables to their actual hex values. Every hex value you output must be valid ASCII (characters 0-9, A-F only).`;

      setStatus(`AI is generating design system${screenshots.length > 0 ? ' (with visual reference)' : ''}...`);

      const messages = [userMessage(userText, screenshots)];
      const result = provider === 'openai'
        ? await callOpenAI(activeKey, messages, DESIGN_SYSTEM_EXTRACTION_PROMPT)
        : await callAnthropic(activeKey, messages, DESIGN_SYSTEM_EXTRACTION_PROMPT, { maxTokens: 16000 });

      setStatus('Design system generated.');
      return result.text || null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * WordPress/Elementor content extraction — markdown + URL supplements + (NEW)
   * screenshot slices so section assignment of images is no longer guesswork.
   */
  const extractWordPressContent = async (
    rawHtml: string,
    markdown: string,
    screenshots: string[] = []
  ): Promise<string | null> => {
    setLoading(true);
    setError(null);
    setStatus('Extracting WordPress/Elementor content...');

    const systemPrompt = `You are a WordPress/Elementor page content extractor. You receive rendered markdown content, raw HTML supplements, and possibly full-page screenshot slices from the same page. Your job is to combine them into a clean, structured content summary that preserves all meaningful page information for blueprint generation. When screenshots are attached, use them to determine the true visual section order and to assign images to their correct sections.`;

    // Broad harvest: catches src=, CSS url(...), data-settings JSON, preloads
    const uniqueImgUrls = harvestImageUrls(rawHtml);

    const videoSrcPattern = /src=["'](https?:\/\/[^"']+\.mp4[^"']*)["']/gi;
    const videoUrls: string[] = [];
    let videoMatch;
    while ((videoMatch = videoSrcPattern.exec(rawHtml)) !== null) {
      videoUrls.push(videoMatch[1]);
    }
    const uniqueVideoUrls = [...new Set(videoUrls)];

    const navPattern = /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>([^<]+)<\/a>/gi;
    const navLinks: string[] = [];
    let navMatch;
    while ((navMatch = navPattern.exec(rawHtml)) !== null) {
      navLinks.push(`${navMatch[2].trim()} → ${navMatch[1]}`);
    }
    const uniqueNavLinks = [...new Set(navLinks)].slice(0, 30);

    const userText = `I have a WordPress/Elementor page. The rendered markdown content is below, supplemented with image URLs, video URLs, and links extracted directly from the raw HTML.${screenshots.length > 0 ? ` ${screenshots.length} full-page screenshot slice(s) are attached above for visual reference.` : ''}

Please produce a clean structured content summary that:
1. Uses the markdown as the primary source for all text content, headings, section order, and copy
2. Supplements with the image URLs — assign each image to the most logical section based on context${screenshots.length > 0 ? ' and the attached screenshots' : ''}
3. Notes any video URLs and which section they belong to
4. Preserves all navigation links and footer links
5. Identifies each page section with a name, type, and content summary

This summary will be used to generate a page blueprint — be thorough and preserve ALL sections, ALL copy, ALL images.

---
RENDERED PAGE MARKDOWN:
${markdown.substring(0, 60000)}

---
IMAGE URLS FOUND IN HTML (${uniqueImgUrls.length} total):
${uniqueImgUrls.join('\n')}

---
VIDEO URLS FOUND IN HTML:
${uniqueVideoUrls.join('\n') || 'None'}

---
ALL LINKS FOUND IN HTML:
${uniqueNavLinks.join('\n')}
`;

    try {
      const messages = [userMessage(userText, screenshots)];
      const result = provider === 'openai'
        ? await callOpenAI(activeKey, messages, systemPrompt)
        : await callAnthropic(activeKey, messages, systemPrompt, { maxTokens: 16000 });
      setStatus('WordPress content extracted.');
      return result.text || null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Extract page structure into sections + globals.
   * Anthropic: forced tool call → guaranteed-valid JSON.
   * OpenAI: json_object response format → parsed from text.
   * @param screenshots JPEG data URIs — the model uses them to resolve column
   *                    counts, background images, and section boundaries.
   */
  const importPageStructure = async (
    rawHtml: string,
    compactMode = false,
    screenshots: string[] = []
  ): Promise<{
    sections: Partial<Section>[];
    globals: Partial<GlobalSettings>;
    wasTruncated: boolean;
  } | null> => {
    setLoading(true);
    setError(null);
    setStatus('Analyzing page structure with AI...');

    try {
      // Harvest image URLs from the FULL raw HTML before any cleaning —
      // this catches CSS background-image URLs the cleaned HTML no longer contains.
      const imageManifest = harvestImageUrls(rawHtml);
      console.log('Image manifest:', imageManifest.length, 'URLs');

      const cleaned = cleanHtml(rawHtml);
      console.log('HTML before clean:', rawHtml.length, 'chars — after clean:', cleaned.length, 'chars');
      const truncatedHtml = truncateHtml(cleaned, 150000, 50000);
      console.log('HTML sent to AI:', truncatedHtml.length, 'chars');

      const compactInstruction = compactMode
        ? '\n\nCOMPACT MODE: Use maximum 2 sentences per layout_description. Minimize all text fields. Prioritize completeness over detail — it is better to capture ALL sections briefly than to describe half the page in detail.'
        : '';

      const screenshotNote = screenshots.length > 0
        ? `\n\nVISUAL REFERENCE: ${screenshots.length} full-page screenshot slice(s) of the rendered page are attached above, in top-to-bottom order. The screenshots are the HIGHEST AUTHORITY for: section boundaries and order, column counts, image positions, background images vs solid colors, overlay treatments, and which content is actually visible. Cross-check every section you extract against the screenshots. If the HTML suggests one layout but the screenshot clearly shows another, trust the screenshot.`
        : '';

      const manifestBlock = imageManifest.length > 0
        ? `\n\nIMAGE URL MANIFEST — every image URL found ANYWHERE in the page source (including CSS background-image rules, Elementor data-settings, preloads). Many of these are section backgrounds that do NOT appear as <img> tags in the HTML below. RULE: when the screenshot clearly shows a photograph in a section but you find no <img> for it in the HTML, select the best-matching URL from this manifest (use filename hints like names, 'hero', 'doctor', subject keywords) and put it in that section's images array with the correct position (e.g. 'background', 'right-column', 'card-background'). Do not leave a section's images empty when the screenshot shows a real photo and a plausible manifest URL exists. Never assign the same manifest URL to multiple unrelated sections.\n${imageManifest.join('\n')}\n`
        : '';

      const userText = `Here is the raw HTML from the webpage. Extract all sections and globals:${compactInstruction}${screenshotNote}${manifestBlock}

\`\`\`html
${truncatedHtml}
\`\`\`

${provider === 'openai'
  ? 'Return a valid JSON object following the exact format in the system prompt. Include ALL sections in page order.'
  : 'Call the emit_page_structure tool with ALL sections in page order, following all extraction rules in the system prompt.'}`;

      console.log('Sending to AI, prompt length:', userText.length, compactMode ? '(compact mode)' : '', screenshots.length, 'screenshot slice(s)');
      setStatus(compactMode ? 'AI is extracting page structure (compact mode)...' : 'AI is extracting page structure...');

      const messages = [userMessage(userText, screenshots)];

      let sections: Partial<Section>[] = [];
      let globals: Partial<GlobalSettings> = {};
      let wasTruncated = false;

      if (provider === 'openai') {
        const result = await callOpenAI(activeKey, messages, STRUCTURE_IMPORT_PROMPT, { jsonMode: true });
        wasTruncated = result.truncated;
        setStatus('Parsing AI response...');
        const parsed = parseStructureJson(result.text);
        if (!parsed) throw new Error('Could not parse JSON from AI response');
        sections = parsed.sections;
        globals = parsed.globals;
      } else {
        const result = await callAnthropic(activeKey, messages, STRUCTURE_IMPORT_PROMPT, {
          tool: STRUCTURE_TOOL,
          maxTokens: 32000,
        });
        wasTruncated = result.truncated;
        setStatus('Parsing AI response...');

        if (result.toolInput && Array.isArray(result.toolInput.sections)) {
          sections = result.toolInput.sections as Partial<Section>[];
          globals = (result.toolInput.globals as Partial<GlobalSettings>) || {};
        } else {
          // Fallback: tool block missing/incomplete (e.g. hard truncation) —
          // try the old text-JSON path before giving up.
          const parsed = parseStructureJson(result.text);
          if (parsed) {
            sections = parsed.sections;
            globals = parsed.globals;
          } else if (wasTruncated) {
            // Signal the UI to offer compact-mode re-import
            return { sections: [], globals: {}, wasTruncated: true };
          } else {
            throw new Error('Could not parse structure from AI response');
          }
        }
      }

      console.log('Parsed sections:', sections.length, sections);
      console.log('Extracted globals:', JSON.stringify(globals, null, 2));
      setStatus('Page structure imported.');
      return { sections, globals, wasTruncated };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { generateDesignSystem, extractWordPressContent, importPageStructure, loading, status, error, provider };
}
