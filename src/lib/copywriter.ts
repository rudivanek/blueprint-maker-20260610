// src/lib/copywriter.ts
//
// "Write it for me": the AI writes page copy from a short description.
//   1. checkBrief()  — is the description enough? If not: up to 4 questions
//                      with clickable answers (cheap call, ~ $0.01).
//   2. writeCopy()   — writes the page text as Markdown in the same format as
//                      "Paste my content" (# / ## headings, - lists), with
//                      [placeholders] instead of invented facts.
// Both calls go through ai-proxy (lib/aiProxy) and are logged in Usage.

import { anthropicCall, openaiCall } from './aiProxy';
import type { AIProvider } from '../types';

export interface CopyQuestion {
  id: string;
  question: string;
  options: string[];
  multiple: boolean;
}

export interface CopyBrief {
  description: string;
  /** 'auto' | 'Spanish' | 'English' | 'Spanish and English' */
  language: string;
  /** e.g. 'Homepage', 'Landing page', 'Service page', 'About page' */
  pageType: string;
}

/** question id → chosen answer text(s); '' = let the AI decide */
export type CopyAnswers = Record<string, string>;

const MAX_QUESTIONS = 4;

const QUESTIONS_SYSTEM = `You are a senior website copywriter at a web agency. Before writing a web page, you check whether the client's short description gives you enough to write good, specific copy.

Ask questions ONLY about things that would materially change the copy and that the description does not already answer:
- the main goal of the page / the main call to action
- the target audience
- the language (only if the page language is "auto" and the description does not make it obvious)
- which sections the page should have
- the tone of voice
- key facts you would otherwise have to invent (business name, city, offer)

Rules:
- At most ${MAX_QUESTIONS} questions. Fewer is better. If the description is already clear enough, ask none.
- Each question gets 2 to 4 short answer options (max 6 words each) that fit THIS business.
- Use "multiple": true only when several answers can be combined (e.g. sections).
- Never ask for phone numbers, addresses, prices or opening hours — those become placeholders in the copy.
- Write the questions and options in the same language as the description.`;

const QUESTIONS_TOOL = {
  name: 'emit_brief_check',
  description: 'Say whether the description is enough, and list the questions to ask if not.',
  input_schema: {
    type: 'object',
    properties: {
      enough: { type: 'boolean', description: 'true when no questions are needed' },
      questions: {
        type: 'array',
        maxItems: MAX_QUESTIONS,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'short snake_case id' },
            question: { type: 'string' },
            options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
            multiple: { type: 'boolean' },
          },
          required: ['id', 'question', 'options', 'multiple'],
        },
      },
    },
    required: ['enough', 'questions'],
  },
};

function briefText(brief: CopyBrief): string {
  return `DESCRIPTION:\n${brief.description.trim()}\n\nPAGE TYPE: ${brief.pageType}\nPAGE LANGUAGE: ${brief.language}`;
}

function cleanQuestions(raw: unknown): CopyQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((q, i): CopyQuestion | null => {
      if (!q || typeof q !== 'object') return null;
      const o = q as Record<string, unknown>;
      const question = String(o.question ?? '').trim();
      const options = Array.isArray(o.options) ? o.options.map(x => String(x).trim()).filter(Boolean).slice(0, 4) : [];
      if (!question || options.length < 2) return null;
      return {
        id: String(o.id ?? `q${i + 1}`).replace(/[^a-z0-9_]/gi, '_') || `q${i + 1}`,
        question,
        options,
        multiple: o.multiple === true,
      };
    })
    .filter((q): q is CopyQuestion => q !== null)
    .slice(0, MAX_QUESTIONS);
}

/** Step 1 — is the description enough? Returns the questions to ask (maybe none). */
export async function checkBrief(provider: AIProvider, brief: CopyBrief): Promise<CopyQuestion[]> {
  if (provider === 'openai') {
    const r = await openaiCall({
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${QUESTIONS_SYSTEM}\n\nReply with JSON only: {"enough": boolean, "questions": [{"id": string, "question": string, "options": string[], "multiple": boolean}]}` },
        { role: 'user', content: briefText(brief) },
      ],
    }, { purpose: 'copy-questions' });
    try {
      const j = JSON.parse(r.text);
      return j.enough ? [] : cleanQuestions(j.questions);
    } catch {
      return [];
    }
  }
  const r = await anthropicCall({
    max_tokens: 1200,
    system: QUESTIONS_SYSTEM,
    tools: [QUESTIONS_TOOL],
    tool_choice: { type: 'tool', name: QUESTIONS_TOOL.name },
    messages: [{ role: 'user', content: briefText(brief) }],
  }, { purpose: 'copy-questions' });
  const input = r.toolInput as { enough?: boolean; questions?: unknown } | null;
  if (!input || input.enough) return [];
  return cleanQuestions(input.questions);
}

const WRITE_SYSTEM = `You are a senior website copywriter at a web agency. Write the complete text for ONE web page from the client's description and answers.

OUTPUT FORMAT (strict — it is parsed by a program):
- Markdown only. No preamble, no explanations, no code fences.
- Start with "# " + the hero headline, then one short paragraph (the subheadline), then the main call to action as a Markdown link, e.g. [Reserve a table](#contact).
- Every further section starts with "## " + the section title, followed by short paragraphs.
- Features, services, menu items or benefits: "- Name: one or two sentences."
- Testimonials: "> quote — [Customer name]".
- Finish with a contact / closing section.

CONTENT RULES:
- Write in the page language given. If it is "auto", use the language of the description.
- Specific, vivid, concrete copy for THIS business — no generic filler, no lorem ipsum.
- Never invent facts. Use square-bracket placeholders instead, e.g. [phone], [address], [opening hours], [price], [year founded], [customer name]. No made-up numbers, awards, years, prices or reviews.
- Keep paragraphs short (1–3 sentences). Headlines max 10 words.
- Follow the requested sections and tone. When an answer is "let the AI decide", choose what fits best.`;

function answersText(questions: CopyQuestion[], answers: CopyAnswers): string {
  if (!questions.length) return '';
  const lines = questions.map(q => `- ${q.question} → ${answers[q.id]?.trim() || 'let the AI decide'}`);
  return `\n\nANSWERS TO FOLLOW-UP QUESTIONS:\n${lines.join('\n')}`;
}

/** Step 2 — write the page copy (Markdown). */
export async function writeCopy(
  provider: AIProvider,
  brief: CopyBrief,
  questions: CopyQuestion[],
  answers: CopyAnswers,
  onText?: (chars: number) => void,
): Promise<string> {
  const user = `${briefText(brief)}${answersText(questions, answers)}\n\nWrite the page now.`;
  const r = provider === 'openai'
    ? await openaiCall({ max_tokens: 4000, messages: [{ role: 'system', content: WRITE_SYSTEM }, { role: 'user', content: user }] }, { purpose: 'copy-write', onText })
    : await anthropicCall({ max_tokens: 4000, system: WRITE_SYSTEM, messages: [{ role: 'user', content: user }] }, { purpose: 'copy-write', onText });
  const md = r.text.replace(/^\s*```(?:markdown|md)?\s*\n/i, '').replace(/\n```\s*$/i, '').trim();
  if (md.length < 40) throw new Error('The AI returned no usable text — please try again.');
  return md;
}

/** Placeholders like [phone] left in the copy (Markdown links are ignored). */
export function findPlaceholders(md: string): string[] {
  const found = [...md.matchAll(/\[([^\]\n]{2,40})\](?!\()/g)].map(m => m[1].trim());
  return [...new Set(found)];
}
