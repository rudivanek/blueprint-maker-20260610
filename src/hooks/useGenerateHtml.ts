// src/hooks/useGenerateHtml.ts
//
// Closes the loop: design.md + blueprint.md (+ screenshot slices) → a complete
// standalone HTML prototype, generated inside the app instead of exporting a
// prompt package to another tool.
//
// - Anthropic path STREAMS the response (full pages can exceed non-streaming
//   limits, and streaming gives live progress feedback).
// - Supports regeneration: previous HTML + user feedback → targeted revision.
// - Reuses getMasterPrompt() and generateBlueprintMd() from lib/prompts — the
//   in-app generation uses the exact same instructions as the ZIP export.

import { useState, useRef } from 'react';
import { generateBlueprintMd, getMasterPrompt, getScratchPrompt } from '../lib/prompts';
import { dataUriParts } from '../lib/screenshot';
import { makeInteractive } from '../lib/interactivePrompt';
import { markInstructions } from '../lib/prototypeSync';
import { generateText, type Purpose } from '../lib/aiProxy';
import type { GlobalSettings, Page, Section, AIProvider } from '../types';

interface GenerateArgs {
  designMd: string;
  globals: GlobalSettings;
  page: Page;
  sections: Section[];
  /** JPEG data URIs from prepareScreenshotForAI() — optional visual reference */
  screenshots?: string[];
  /** For regeneration: the previously generated HTML */
  previousHtml?: string;
  /** For regeneration: what to change */
  feedback?: string;
}

/** Pull a clean HTML document out of the model output (strips fences/preamble). */
function extractHtmlDocument(raw: string): string {
  const lower = raw.toLowerCase();
  const startDoctype = lower.indexOf('<!doctype');
  const startHtml = lower.indexOf('<html');
  let start = -1;
  if (startDoctype !== -1) start = startDoctype;
  else if (startHtml !== -1) start = startHtml;

  const endIdx = lower.lastIndexOf('</html>');

  if (start !== -1 && endIdx !== -1 && endIdx > start) {
    return raw.slice(start, endIdx + '</html>'.length);
  }

  // Fallback: strip markdown fences if present
  return raw
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function buildUserText(args: GenerateArgs): string {
  const blueprintMd = generateBlueprintMd(args.globals, args.page, args.sections);

  const screenshotNote = (args.screenshots?.length ?? 0) > 0
    ? `\n${args.screenshots!.length} full-page screenshot slice(s) of the ORIGINAL page are attached above, top-to-bottom. They are the highest authority on layout intent — use them to verify column counts, image positions, and section proportions.\n`
    : '';

  if (args.previousHtml && args.feedback) {
    return `REGENERATION MODE — apply targeted changes to an existing prototype.
${screenshotNote}
You previously generated the HTML prototype included below. The reviewer requested the following changes:

=== REQUESTED CHANGES ===
${args.feedback}

Apply ONLY these changes. If a change asks for an interactive element (slider, gallery, tabs, accordion, menu, animation…), build it fully working with JavaScript as described in INTERACTIVE WIDGETS — never as a static picture. Keep every other section, layout decision, color, and piece of copy EXACTLY as it is in the previous version. Return the complete updated standalone HTML document — never a diff or fragment.

=== design.md ===
${args.designMd || '(no design.md provided — use the blueprint section colors and clean defaults)'}

=== blueprint.md ===
${blueprintMd}

${markInstructions(args.sections)}

=== PREVIOUS HTML (revise this) ===
${args.previousHtml}

Return ONLY the complete HTML document, starting with <!DOCTYPE html>. No explanations before or after.`;
  }

  return `Build the complete standalone HTML prototype now.
${screenshotNote}
=== design.md ===
${args.designMd || '(no design.md provided — use the blueprint section colors and clean defaults)'}

=== blueprint.md ===
${blueprintMd}

${markInstructions(args.sections)}

Return ONLY the complete HTML document, starting with <!DOCTYPE html>. No explanations before or after.`;
}

// ---------------------------------------------------------------------------
// Provider call — Step 5: through ai-proxy, streamed, auto-continues when cut off
// ---------------------------------------------------------------------------

const htmlComplete = (t: string) => /<\/html>\s*(```)?\s*$/i.test(t.trim()) || t.toLowerCase().includes('</html>');

async function runGeneration(
  provider: AIProvider,
  systemPrompt: string,
  userText: string,
  screenshots: string[],
  purpose: Purpose,
  onProgress: (chars: number) => void,
  signal: AbortSignal
): Promise<{ text: string; truncated: boolean; continues: number }> {
  let content: unknown;
  if (provider === 'openai') {
    content = screenshots.length > 0
      ? [...screenshots.map(uri => ({ type: 'image_url', image_url: { url: uri } })), { type: 'text', text: userText }]
      : userText;
  } else {
    content = [
      ...screenshots
        .map(uri => {
          const parsed = dataUriParts(uri);
          return parsed ? { type: 'image', source: { type: 'base64', media_type: parsed.mediaType, data: parsed.base64 } } : null;
        })
        .filter(Boolean),
      { type: 'text', text: userText },
    ];
  }
  return generateText({
    provider,
    system: systemPrompt,
    messages: [{ role: 'user', content }],
    maxTokens: provider === 'openai' ? 32000 : 64000,
    purpose,
    signal,
    onText: onProgress,
    isComplete: htmlComplete,
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGenerateHtml(provider: AIProvider) {
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = async (args: GenerateArgs): Promise<{ html: string; truncated: boolean } | null> => {
    setGenerating(true);
    setError(null);
    setStatus(args.previousHtml ? 'Regenerating with your feedback...' : 'Generating HTML prototype...');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const screenshots = args.screenshots ?? [];
      const systemPrompt = makeInteractive(getMasterPrompt(screenshots.length > 0));
      const userText = buildUserText(args);

      const onProgress = (chars: number) => {
        setStatus(`Generating... ${(chars / 1000).toFixed(1)}K characters`);
      };

      const result = await runGeneration(
        provider, systemPrompt, userText, screenshots,
        args.previousHtml ? 'regenerate-html' : 'generate-html',
        onProgress, controller.signal,
      );

      const html = extractHtmlDocument(result.text);
      if (!html || html.length < 200) {
        throw new Error('Model returned no usable HTML — try again.');
      }

      setStatus(result.truncated
        ? 'Generated, but the page may be cut off at the bottom (output limit reached even after continuing).'
        : result.continues > 0
          ? `Prototype generated (continued ${result.continues}× after a cut-off).`
          : 'Prototype generated.');
      return { html, truncated: result.truncated };
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setStatus('Generation cancelled.');
        return null;
      }
      setError(e instanceof Error ? e.message : 'Unknown error');
      return null;
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  };

  // -----------------------------------------------------------------------
  // Generate from scratch — design.md + creative brief, no blueprint
  // -----------------------------------------------------------------------
  const generateFromScratch = async (args: {
    designMd: string;
    brief: string;
  }): Promise<{ html: string; truncated: boolean } | null> => {
    setGenerating(true);
    setError(null);
    setStatus('Generating page from brief...');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const systemPrompt = makeInteractive(getScratchPrompt());
      const userText = `Build a complete standalone HTML page based on this creative brief and design system.

=== CREATIVE BRIEF ===
${args.brief}

=== design.md ===
${args.designMd}

Return ONLY the complete HTML document, starting with <!DOCTYPE html>. No explanations before or after.`;

      const onProgress = (chars: number) => {
        setStatus(`Generating... ${(chars / 1000).toFixed(1)}K characters`);
      };

      const result = await runGeneration(provider, systemPrompt, userText, [], 'brief-html', onProgress, controller.signal);

      const html = extractHtmlDocument(result.text);
      if (!html || html.length < 200) {
        throw new Error('Model returned no usable HTML — try again.');
      }

      setStatus(result.truncated
        ? 'Generated, but the page may be cut off (output limit reached even after continuing).'
        : 'Page generated successfully.');

      return { html, truncated: result.truncated };
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setStatus('Generation cancelled.');
        return null;
      }
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  };

  const cancel = () => abortRef.current?.abort();

  return { generate, generateFromScratch, cancel, generating, status, error };
}
