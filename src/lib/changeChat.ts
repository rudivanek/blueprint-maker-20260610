// src/lib/changeChat.ts
//
// A short chat with the AI before a change is applied (Describe changes /
// Change with AI). Each turn (~$0.01) the AI says in plain words what it
// understood and what it will do, warns when something doesn't fit (e.g. only
// one slide is selected) and asks up to 4 multiple-choice questions when needed.
// Nothing changes until the user clicks "Yes, do it".

import { anthropicCall, openaiCall } from './aiProxy';
import { cleanQuestions, type CopyAnswers, type CopyQuestion } from './copywriter';
import type { AIProvider, Section } from '../types';

export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

export interface ChatTurn {
  /** What the AI understood and plans to do (plain words) */
  reply: string;
  /** Something that doesn't fit — shown in amber ('' = none) */
  warning: string;
  /** Questions with clickable answers (maybe none) */
  questions: CopyQuestion[];
  /** true = request is clear: no questions, no warning */
  clear: boolean;
}

export type ChatTarget =
  | { kind: 'page'; sections: Section[] }
  | { kind: 'element'; label: string; context: string };

const MAX_QUESTIONS = 4;

/** "Don't ask for clear requests" (per browser) */
export const AUTO_APPLY_KEY = 'bpm_autoapply_clear';
export function readAutoApply(): boolean {
  try { return localStorage.getItem(AUTO_APPLY_KEY) === '1'; } catch { return false; }
}

const SYSTEM = `You are a friendly senior web designer helping a reviewer change an HTML prototype. The reviewer writes what they want; you reply BEFORE anything is changed.

Your reply:
- "reply": 1–3 short sentences in plain, non-technical words: what you understood and exactly what you will do. If the reviewer asks you something ("do you understand?"), answer it naturally. Never claim you already made the change.
- "warning": one short sentence when something doesn't fit, otherwise "". Examples: only ONE item/slide/card is selected but the request is about all of them (tell them to click "Parent" to select the whole group); the request would affect other parts of the page; the request contradicts itself.
- "questions": at most ${MAX_QUESTIONS}, ONLY for choices that really change the result and can't be reasonably assumed. Each with 2–4 short options (max 6 words) in everyday language — no CSS or code terms (say "Crop to fill", not "object-fit: cover"). "multiple": true only when options can be combined. Don't repeat questions already answered in the conversation.
- "clear": true only when there are no questions and no warning.
- Write in the same language as the reviewer.`;

const TOOL = {
  name: 'emit_reply',
  description: 'Reply to the reviewer before the change is made.',
  input_schema: {
    type: 'object',
    properties: {
      reply: { type: 'string' },
      warning: { type: 'string' },
      clear: { type: 'boolean' },
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
    required: ['reply', 'warning', 'clear', 'questions'],
  },
};

function targetText(t: ChatTarget): string {
  if (t.kind === 'element') {
    return `WHAT IS SELECTED: one element — ${t.label}\n${t.context}\nThe change applies ONLY to this element (and what is inside it).`;
  }
  const list = [...t.sections]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s, i) => `${i + 1} · ${s.section_name || s.section_type}${s.images?.length ? ` — ${s.images.length} image(s)` : ''}`)
    .join('\n');
  return `WHAT IS CHANGED: the whole page (it will be rebuilt). Sections in order:\n${list || '(none)'}`;
}

function conversation(messages: ChatMessage[]): string {
  return messages.map(m => `${m.role === 'user' ? 'REVIEWER' : 'YOU'}: ${m.text}`).join('\n\n');
}

export async function chatTurn(provider: AIProvider, target: ChatTarget, messages: ChatMessage[], signal?: AbortSignal): Promise<ChatTurn> {
  const user = `${targetText(target)}\n\n=== CONVERSATION ===\n${conversation(messages)}\n\nReply to the reviewer's last message.`;
  let out: Record<string, unknown> | null = null;
  if (provider === 'openai') {
    const r = await openaiCall({
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${SYSTEM}\n\nReply with JSON only: {"reply": string, "warning": string, "clear": boolean, "questions": [{"id": string, "question": string, "options": string[], "multiple": boolean}]}` },
        { role: 'user', content: user },
      ],
    }, { purpose: 'change-questions', signal });
    try { out = JSON.parse(r.text); } catch { out = null; }
  } else {
    const r = await anthropicCall({
      max_tokens: 1500,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content: user }],
    }, { purpose: 'change-questions', signal });
    out = r.toolInput;
  }
  const reply = typeof out?.reply === 'string' ? out.reply.trim() : '';
  if (!reply) throw new Error('No answer from the AI');
  const warning = typeof out?.warning === 'string' ? out.warning.trim() : '';
  const questions = cleanQuestions(out?.questions).slice(0, MAX_QUESTIONS);
  return { reply, warning, questions, clear: out?.clear === true && !warning && questions.length === 0 };
}

/** The final instruction sent to the rebuild / element change. */
export function buildRequest(messages: ChatMessage[], questions: CopyQuestion[], answers: CopyAnswers): string {
  const userMsgs = messages.filter(m => m.role === 'user').map(m => m.text.trim()).filter(Boolean);
  const lastAi = [...messages].reverse().find(m => m.role === 'ai')?.text.trim() ?? '';
  const parts = [userMsgs[0] ?? ''];
  if (userMsgs.length > 1) parts.push(`Clarifications from the reviewer:\n${userMsgs.slice(1).map(t => `- ${t}`).join('\n')}`);
  const picked = questions
    .map(q => `- ${q.question} → ${answers[q.id]?.trim() || 'your choice'}`);
  if (picked.length) parts.push(`Details:\n${picked.join('\n')}`);
  if (lastAi) parts.push(`Agreed plan: ${lastAi}`);
  return parts.filter(Boolean).join('\n\n');
}
