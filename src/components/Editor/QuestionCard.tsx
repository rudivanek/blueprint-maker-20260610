// src/components/Editor/QuestionCard.tsx
//
// Up to 4 AI questions with clickable answers + "Let the AI decide" + "Other…".
// Used by "Describe changes" in the Preview (see lib/changeCheck).

import { useState } from 'react';
import { Check, SkipForward, Sparkles } from 'lucide-react';
import type { CopyAnswers, CopyQuestion } from '../../lib/copywriter';

const LET_AI = 'Let the AI decide';

interface QuestionCardProps {
  title: string;
  questions: CopyQuestion[];
  submitLabel: string;
  onSubmit: (answers: CopyAnswers) => void;
  onSkip: () => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function QuestionCard({ title, questions, submitLabel, onSubmit, onSkip, onCancel, disabled }: QuestionCardProps) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});

  const toggle = (q: CopyQuestion, option: string) => {
    setPicked(p => {
      const cur = p[q.id] ?? [];
      let next: string[];
      if (option === LET_AI) next = cur.includes(LET_AI) ? [] : [LET_AI];
      else if (q.multiple) next = cur.includes(option) ? cur.filter(x => x !== option) : [...cur.filter(x => x !== LET_AI), option];
      else next = cur.includes(option) ? [] : [option];
      return { ...p, [q.id]: next };
    });
  };

  const answers = (): CopyAnswers => {
    const out: CopyAnswers = {};
    for (const q of questions) {
      const chosen = (picked[q.id] ?? []).filter(x => x !== LET_AI);
      const extra = (other[q.id] ?? '').trim();
      out[q.id] = [...chosen, extra].filter(Boolean).join(', ');
    }
    return out;
  };

  return (
    <div className="border border-[#2575FC]/30 bg-[#EFF5FF] px-4 py-3 space-y-3">
      <p className="text-sm font-medium text-[#111827]">{title}</p>
      {questions.map(q => (
        <div key={q.id}>
          <p className="text-xs font-medium text-[#111827] mb-1.5">
            {q.question}
            {q.multiple && <span className="font-normal text-[#6B7280]"> (choose any)</span>}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[...q.options, LET_AI].map(opt => {
              const on = (picked[q.id] ?? []).includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(q, opt)}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs border transition-colors ${on ? 'bg-[#2575FC] border-[#2575FC] text-white' : 'bg-white border-[#E5E7EB] text-[#374151] hover:border-[#2575FC]'} ${opt === LET_AI ? 'italic' : ''}`}
                >
                  {on && <Check className="w-3 h-3" />}{opt}
                </button>
              );
            })}
          </div>
          <input
            value={other[q.id] ?? ''}
            onChange={e => setOther(o => ({ ...o, [q.id]: e.target.value }))}
            placeholder="Other… (optional)"
            className="mt-1.5 w-full bg-white border border-[#E5E7EB] px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#2575FC]"
          />
        </div>
      ))}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => onSubmit(answers())}
          disabled={disabled}
          className="flex items-center gap-2 px-4 py-2 bg-[#2575FC] hover:bg-[#1a5fe0] text-white text-sm font-medium disabled:opacity-40"
        >
          <Sparkles className="w-4 h-4" /> {submitLabel}
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={disabled}
          className="flex items-center gap-1.5 px-3 py-2 border border-[#E5E7EB] bg-white text-xs text-[#6B7280] hover:border-[#2575FC] disabled:opacity-40"
        >
          <SkipForward className="w-3.5 h-3.5" /> Skip questions — just apply
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-2 text-xs text-[#6B7280] hover:text-[#111827]">
          Change my request
        </button>
      </div>
    </div>
  );
}
