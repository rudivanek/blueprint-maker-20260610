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
import { generateBlueprintMd, getMasterPrompt } from '../lib/prompts';
import { dataUriParts } from '../lib/screenshot';
import { usageStore } from '../lib/usage';
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

Apply ONLY these changes. Keep every other section, layout decision, color, and piece of copy EXACTLY as it is in the previous version. Return the complete updated standalone HTML document — never a diff or fragment.

=== design.md ===
${args.designMd || '(no design.md provided — use the blueprint section colors and clean defaults)'}

=== blueprint.md ===
${blueprintMd}

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

Return ONLY the complete HTML document, starting with <!DOCTYPE html>. No explanations before or after.`;
}

// ---------------------------------------------------------------------------
// Anthropic — streaming SSE
// ---------------------------------------------------------------------------

async function streamAnthropic(
  apiKey: string,
  systemPrompt: string,
  userText: string,
  screenshots: string[],
  onProgress: (chars: number) => void,
  signal: AbortSignal
): Promise<{ text: string; truncated: boolean }> {
  const content: unknown[] = [
    ...screenshots
      .map(uri => {
        const parsed = dataUriParts(uri);
        if (!parsed) return null;
        return {
          type: 'image',
          source: { type: 'base64', media_type: parsed.mediaType, data: parsed.base64 },
        };
      })
      .filter(Boolean),
    { type: 'text', text: userText },
  ];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 64000,
      stream: true,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    const errorBody = await response.json().catch(() => response.text());
    const message = typeof errorBody === 'object' && errorBody !== null
      ? (errorBody as { error?: { message?: string } }).error?.message ?? JSON.stringify(errorBody)
      : String(errorBody);
    throw new Error(`Anthropic API error: ${response.status} — ${message}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let stopReason = '';

  // Live usage tracking: message_start carries input tokens; message_delta
  // events carry CUMULATIVE output token counts as the stream progresses.
  const callId = usageStore.startCall('claude-sonnet-4-6');
  let sawUsage = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const evt = JSON.parse(payload);
          if (evt.type === 'message_start' && evt.message?.usage) {
            sawUsage = true;
            usageStore.progressCall(callId, {
              inputTokens: evt.message.usage.input_tokens ?? 0,
              outputTokens: evt.message.usage.output_tokens ?? 0,
            });
          } else if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            text += evt.delta.text;
            onProgress(text.length);
          } else if (evt.type === 'message_delta') {
            if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
            if (evt.usage?.output_tokens !== undefined) {
              sawUsage = true;
              usageStore.progressCall(callId, { outputTokens: evt.usage.output_tokens });
            }
          } else if (evt.type === 'error') {
            throw new Error(evt.error?.message || 'Streaming error');
          }
        } catch (e) {
          if (e instanceof SyntaxError) continue; // partial JSON line — skip
          throw e;
        }
      }
    }
    if (sawUsage) usageStore.endCall(callId);
    else usageStore.abortCall(callId);
  } catch (e) {
    // Keep whatever usage we observed before the failure
    if (sawUsage) usageStore.endCall(callId);
    else usageStore.abortCall(callId);
    throw e;
  }

  return { text, truncated: stopReason === 'max_tokens' };
}

// ---------------------------------------------------------------------------
// OpenAI — non-streaming
// ---------------------------------------------------------------------------

async function callOpenAIGenerate(
  apiKey: string,
  systemPrompt: string,
  userText: string,
  screenshots: string[],
  signal: AbortSignal
): Promise<{ text: string; truncated: boolean }> {
  const userContent: unknown = screenshots.length > 0
    ? [
        ...screenshots.map(uri => ({ type: 'image_url', image_url: { url: uri } })),
        { type: 'text', text: userText },
      ]
    : userText;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1',
      max_tokens: 32000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => response.text());
    const message = typeof errorBody === 'object' && errorBody !== null
      ? (errorBody as { error?: { message?: string } }).error?.message ?? JSON.stringify(errorBody)
      : String(errorBody);
    throw new Error(`OpenAI API error: ${response.status} — ${message}`);
  }

  const data = await response.json();
  usageStore.report('gpt-4.1', data.usage?.prompt_tokens ?? 0, data.usage?.completion_tokens ?? 0);
  const choice = data.choices?.[0];
  return {
    text: choice?.message?.content ?? '',
    truncated: choice?.finish_reason === 'length',
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGenerateHtml(provider: AIProvider, anthropicKey: string, openaiKey: string) {
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeKey = provider === 'openai' ? openaiKey : anthropicKey;

  const generate = async (args: GenerateArgs): Promise<{ html: string; truncated: boolean } | null> => {
    setGenerating(true);
    setError(null);
    setStatus(args.previousHtml ? 'Regenerating with your feedback...' : 'Generating HTML prototype...');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const screenshots = args.screenshots ?? [];
      const systemPrompt = getMasterPrompt(screenshots.length > 0);
      const userText = buildUserText(args);

      const onProgress = (chars: number) => {
        setStatus(`Generating... ${(chars / 1000).toFixed(1)}K characters`);
      };

      const result = provider === 'openai'
        ? await callOpenAIGenerate(activeKey, systemPrompt, userText, screenshots, controller.signal)
        : await streamAnthropic(activeKey, systemPrompt, userText, screenshots, onProgress, controller.signal);

      const html = extractHtmlDocument(result.text);
      if (!html || html.length < 200) {
        throw new Error('Model returned no usable HTML — try again.');
      }

      setStatus(result.truncated
        ? 'Generated, but output hit the token limit — the page may be cut off at the bottom.'
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

  const cancel = () => abortRef.current?.abort();

  return { generate, cancel, generating, status, error };
}
