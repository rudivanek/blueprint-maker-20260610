// src/lib/changeCheck.ts
//
// "Describe changes" in the Preview: before the expensive rebuild (~$0.30,
// 2–4 min) a cheap call (~$0.01) checks whether the request is clear.
// If not, it returns up to 4 questions with clickable answers — same format
// as "Write it for me" (lib/copywriter).

import { anthropicCall, openaiCall } from './aiProxy';
import { cleanQuestions, type CopyAnswers, type CopyQuestion } from './copywriter';
import type { AIProvider, Section } from '../types';

const MAX_QUESTIONS = 4;

const SYSTEM = `You help a web designer revise an HTML prototype. The reviewer typed a change request. Before the page is rebuilt (slow and costly), decide whether the request is clear enough to implement well.

Ask questions ONLY when the answer would materially change the result and cannot be reasonably assumed:
- WHICH section / element is meant, when several could match (use the section list; name sections in the options, e.g. "4 · Our space")
- the style or variant of a new widget (e.g. slider: one large image / 3 visible / full width)
- behavior (autoplay and speed, arrows, dots, swipe, click to enlarge, open by default…)
- placement (where a new element goes) and what content it uses, if unclear

Rules:
- At most ${MAX_QUESTIONS} questions. Fewer is better. Clear, specific requests ("make the hero background dark blue", "remove the newsletter section") need NO questions.
- Each question gets 2 to 4 short answer options (max 6 words each). Use "multiple": true only when answers can be combined (e.g. slider extras).
- Never ask about things the request already states.
- Write the questions and options in the same language as the request.`;

const TOOL = {
  name: 'emit_change_check',
  description: 'Say whether the change request is clear, and list the questions to ask if not.',
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

function requestText(request: string, sections: Section[]): string {
  const list = [...sections]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s, i) => `${i + 1} · ${s.section_name || s.section_type}${s.section_type && s.section_name ? ` (${s.section_type})` : ''}${s.images?.length ? ` — ${s.images.length} image(s)` : ''}`)
    .join('\n');
  return `CHANGE REQUEST:\n${request.trim()}\n\nSECTIONS OF THE PAGE (in order):\n${list || '(none)'}`;
}

/** Returns the questions to ask about a change request (maybe none). */
export async function checkChanges(provider: AIProvider, request: string, sections: Section[]): Promise<CopyQuestion[]> {
  const user = requestText(request, sections);
  if (provider === 'openai') {
    const r = await openaiCall({
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${SYSTEM}\n\nReply with JSON only: {"enough": boolean, "questions": [{"id": string, "question": string, "options": string[], "multiple": boolean}]}` },
        { role: 'user', content: user },
      ],
    }, { purpose: 'change-questions' });
    try {
      const j = JSON.parse(r.text);
      return j.enough ? [] : cleanQuestions(j.questions).slice(0, MAX_QUESTIONS);
    } catch {
      return [];
    }
  }
  const r = await anthropicCall({
    max_tokens: 1200,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{ role: 'user', content: user }],
  }, { purpose: 'change-questions' });
  const input = r.toolInput as { enough?: boolean; questions?: unknown } | null;
  if (!input || input.enough) return [];
  return cleanQuestions(input.questions).slice(0, MAX_QUESTIONS);
}

/** The request plus the chosen answers, as sent to the rebuild. */
export function withAnswers(request: string, questions: CopyQuestion[], answers: CopyAnswers): string {
  const lines = questions
    .map(q => `- ${q.question} → ${answers[q.id]?.trim() || 'your choice'}`);
  return lines.length ? `${request.trim()}\n\nDetails:\n${lines.join('\n')}` : request.trim();
}
