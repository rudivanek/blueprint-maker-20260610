// src/lib/elementChange.ts
//
// "Change with AI" for ONE selected element in Edit on page (lib/visualEdit).
// Only the element's HTML (plus the page's CSS for context) goes to the AI,
// so a change takes seconds and cents instead of a full rebuild.
// The AI returns: the replacement HTML, optional extra CSS, optional JS.

import { anthropicCall, openaiCall } from './aiProxy';
import type { AIProvider } from '../types';

export interface ElementChange {
  html: string;
  css: string;
  js: string;
}

export const MAX_ELEMENT_CHARS = 60000;
const MAX_CONTEXT_CSS = 30000;
const MAX_DESIGN = 12000;

const SYSTEM = `You are a senior front-end developer editing ONE element of a static HTML prototype.

You get: the reviewer's change request, the element's current HTML, the page's existing CSS (for context) and the design system.
Return the replacement for THIS element only.

RULES
- "html": the complete new HTML that replaces the element (one element, or a few sibling elements if the change needs it). Never return <html>, <head> or <body>. Never include <script> or <style> tags in "html" and no inline event handlers (onclick=…).
- Keep everything the request doesn't mention: text, images, links, classes, ids and structure — including all data-bpm-s and data-bpm-f attributes (the app uses them to keep the page in sync). Copies of marked elements keep the same marks. Do not invent new facts, prices, names or reviews.
- Reuse the page's existing CSS classes and variables (var(--…)) where possible so the element matches the design.
- "css": only NEW CSS rules needed for this change (or ""). Scope them with a new, specific class you add to the element (e.g. .ai-slider-3f…) so nothing else on the page changes. Include responsive rules (≤768px) when relevant.
- "js": only when the element must be interactive (slider, gallery lightbox, tabs, accordion, counter, marquee control…), otherwise "". Plain JavaScript, no libraries, no localStorage, no alert(). It runs once after the page loaded: find the element through its new class (document.querySelectorAll('.your-class').forEach(…)), so it also works when the element appears more than once.
- Interactive widgets must really work (arrows, dots, swipe, autoplay, keyboard, Esc to close…). Without JS the content must still be visible.
- Write any new visible text in the same language as the element.`;

const TOOL = {
  name: 'emit_element_change',
  description: 'Return the replacement HTML for the selected element, plus optional CSS and JS.',
  input_schema: {
    type: 'object',
    properties: {
      html: { type: 'string', description: 'Replacement HTML for the element' },
      css: { type: 'string', description: 'New scoped CSS rules, or empty string' },
      js: { type: 'string', description: 'Plain JavaScript for interactivity, or empty string' },
    },
    required: ['html', 'css', 'js'],
  },
};

function userText(request: string, elementHtml: string, pageCss: string, designMd: string): string {
  return `CHANGE REQUEST:
${request.trim()}

=== ELEMENT (current HTML) ===
${elementHtml}

=== PAGE CSS (context, do not repeat it) ===
${pageCss.slice(0, MAX_CONTEXT_CSS) || '(none)'}

=== design.md (excerpt) ===
${(designMd || '').slice(0, MAX_DESIGN) || '(none)'}`;
}

/** CSS of the page's own <style> tags (context for the AI). */
export function pageCss(doc: Document): string {
  return [...doc.querySelectorAll('style:not([data-bpm-editor])')].map(s => s.textContent ?? '').join('\n').trim();
}

export async function changeElement(
  provider: AIProvider,
  args: { request: string; elementHtml: string; pageCss: string; designMd: string },
  signal?: AbortSignal,
  onText?: (chars: number) => void,
): Promise<ElementChange> {
  const user = userText(args.request, args.elementHtml, args.pageCss, args.designMd);
  const maxTokens = Math.min(32000, Math.max(4000, Math.round(args.elementHtml.length / 2) + 6000));
  let out: Record<string, unknown> | null = null;
  let truncated = false;
  if (provider === 'openai') {
    const r = await openaiCall({
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${SYSTEM}\n\nReply with JSON only: {"html": string, "css": string, "js": string}` },
        { role: 'user', content: user },
      ],
    }, { purpose: 'element-change', signal, onText });
    truncated = r.truncated;
    try { out = JSON.parse(r.text); } catch { out = null; }
  } else {
    const r = await anthropicCall({
      max_tokens: maxTokens,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content: user }],
    }, { purpose: 'element-change', signal, onText });
    truncated = r.truncated;
    out = r.toolInput;
  }
  if (truncated) throw new Error('The answer was cut off — select a smaller element or use Describe changes.');
  const html = typeof out?.html === 'string' ? out.html.trim() : '';
  if (!html) throw new Error('The AI returned no usable HTML — please try again.');
  return {
    html,
    css: typeof out?.css === 'string' ? out.css.trim() : '',
    js: typeof out?.js === 'string' ? out.js.trim() : '',
  };
}
