// src/components/Editor/CopyWriter.tsx
//
// "Write it for me" tab of the Import panel:
//   description (+ language, page type) → AI checks it → up to 4 questions with
//   clickable answers → AI writes the copy → handed back to "Paste my content"
//   so the user can edit it and click Build Sections.
// The description and answers are remembered per page in this browser.

import { cost } from '../../lib/models';
import { useEffect, useState } from 'react';
import { Sparkles, AlertCircle, Check, SkipForward } from 'lucide-react';
import { checkBrief, writeCopy, type CopyAnswers, type CopyBrief, type CopyQuestion } from '../../lib/copywriter';
import type { AIProvider } from '../../types';

interface CopyWriterProps {
  pageId: string;
  provider: AIProvider;
  hasAIKey: boolean;
  initialDescription?: string;
  /** Runs fn inside the blocking processing overlay (ImportPanel's withJob). */
  runJob: (title: string, estimate: string, fn: () => Promise<void>) => Promise<void>;
  /** true when the user pressed Cancel in the overlay */
  isCancelled: () => boolean;
  /** Called with the finished Markdown copy. */
  onWritten: (markdown: string) => void;
}

interface Saved {
  brief: CopyBrief;
  questions: CopyQuestion[];
  answers: CopyAnswers;
  asked: boolean;
}

const storeKey = (pageId: string) => `bpm_copybrief_${pageId}`;
const LET_AI = 'Let the AI decide';

function load(pageId: string, initialDescription: string): Saved {
  try {
    const raw = localStorage.getItem(storeKey(pageId));
    if (raw) return JSON.parse(raw) as Saved;
  } catch { /* ignore */ }
  return { brief: { description: initialDescription, language: 'auto', pageType: 'Homepage' }, questions: [], answers: {}, asked: false };
}

const fieldClass = 'w-full bg-white border border-[#E5E7EB] rounded-none px-3 py-2 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2575FC]';

export function CopyWriter({ pageId, provider, hasAIKey, initialDescription = '', runJob, isCancelled, onWritten }: CopyWriterProps) {
  const [state, setState] = useState<Saved>(() => load(pageId, initialDescription));
  const [other, setOther] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    try { localStorage.setItem(storeKey(pageId), JSON.stringify(state)); } catch { /* ignore */ }
  }, [pageId, state]);

  const { brief, questions, answers, asked } = state;
  const setBrief = (patch: Partial<CopyBrief>) =>
    setState(s => ({ ...s, brief: { ...s.brief, ...patch }, asked: false, questions: [], answers: {} }));

  const canStart = brief.description.trim().length >= 15 && hasAIKey;

  // ── answers ──
  const selected = (q: CopyQuestion) => (answers[q.id] ?? '').split(' | ').filter(Boolean);
  const toggle = (q: CopyQuestion, option: string) => {
    setState(s => {
      const cur = (s.answers[q.id] ?? '').split(' | ').filter(Boolean);
      let next: string[];
      if (option === LET_AI) next = cur.includes(LET_AI) ? [] : [LET_AI];
      else if (q.multiple) next = cur.includes(option) ? cur.filter(x => x !== option) : [...cur.filter(x => x !== LET_AI), option];
      else next = cur.includes(option) ? [] : [option];
      return { ...s, answers: { ...s.answers, [q.id]: next.join(' | ') } };
    });
  };
  const finalAnswers = (): CopyAnswers => {
    const out: CopyAnswers = {};
    for (const q of questions) {
      const picked = selected(q).filter(x => x !== LET_AI);
      const extra = (other[q.id] ?? '').trim();
      out[q.id] = [...picked, extra].filter(Boolean).join(', ');
    }
    return out;
  };

  // ── actions ──
  const write = (qs: CopyQuestion[], ans: CopyAnswers) =>
    runJob('Writing the page text…', 'Usually 20–40 seconds', async () => {
      setError('');
      try {
        const md = await writeCopy(provider, brief, qs, ans);
        if (isCancelled()) return;
        onWritten(md);
      } catch (e) {
        if (!isCancelled()) setError(e instanceof Error ? e.message : 'Could not write the copy');
      }
    });

  const start = () =>
    runJob('Checking your description…', 'A few seconds', async () => {
      setError('');
      try {
        const qs = await checkBrief(provider, brief);
        if (isCancelled()) return;
        setState(s => ({ ...s, questions: qs, answers: {}, asked: true }));
        setOther({});
        if (qs.length === 0) {
          // Description is clear enough → write right away (after this job closes).
          setTimeout(() => { void write([], {}); }, 0);
        }
      } catch (e) {
        if (!isCancelled()) setError(e instanceof Error ? e.message : 'Could not check the description');
      }
    });

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-[#111827] mb-1.5 block">Describe the page</label>
        <textarea
          value={brief.description}
          onChange={e => setBrief({ description: e.target.value })}
          rows={5}
          placeholder="e.g. Homepage for a high-end coffee shop in New York — the best coffee on earth, calm and luxurious, for coffee lovers and business people."
          className={`${fieldClass} resize-y leading-relaxed`}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-[#6B7280] mb-1 block">Language</label>
          <select value={brief.language} onChange={e => setBrief({ language: e.target.value })} className={fieldClass}>
            <option value="auto">Same as my description</option>
            <option value="Spanish">Spanish</option>
            <option value="English">English</option>
            <option value="Spanish and English">Spanish and English</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] text-[#6B7280] mb-1 block">Page type</label>
          <select value={brief.pageType} onChange={e => setBrief({ pageType: e.target.value })} className={fieldClass}>
            {['Homepage', 'Landing page', 'Service page', 'About page', 'Contact page'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {!hasAIKey && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          <AlertCircle className="w-4 h-4 shrink-0" /> No {provider === 'openai' ? 'OpenAI' : 'Anthropic'} key on the server yet. Add it in Settings.
        </div>
      )}

      {!asked && (
        <button
          onClick={start}
          disabled={!canStart}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2575FC] hover:bg-[#1a5fe0] text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Sparkles className="w-4 h-4" /> Write it for me
        </button>
      )}
      {!asked && (
        <p className="text-[10px] text-[#9CA3AF]">
          The AI first checks your description and may ask up to 4 quick questions. Missing facts (phone, address, prices) become [placeholders] — nothing is made up. About {cost(0.01)} + {cost(0.05)}.
        </p>
      )}

      {asked && questions.length > 0 && (
        <div className="border border-[#2575FC]/30 bg-[#EFF5FF] px-4 py-3 space-y-4">
          <p className="text-sm font-medium text-[#111827]">A few quick questions to make the copy better</p>
          {questions.map(q => (
            <div key={q.id}>
              <p className="text-xs font-medium text-[#111827] mb-1.5">
                {q.question}
                {q.multiple && <span className="font-normal text-[#6B7280]"> (choose any)</span>}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[...q.options, LET_AI].map(opt => {
                  const on = selected(q).includes(opt);
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
              onClick={() => write(questions, finalAnswers())}
              className="flex items-center gap-2 px-4 py-2 bg-[#2575FC] hover:bg-[#1a5fe0] text-white text-sm font-medium"
            >
              <Sparkles className="w-4 h-4" /> Write the copy
            </button>
            <button
              onClick={() => write(questions, {})}
              className="flex items-center gap-1.5 px-3 py-2 border border-[#E5E7EB] bg-white text-xs text-[#6B7280] hover:border-[#2575FC]"
            >
              <SkipForward className="w-3.5 h-3.5" /> Skip questions — just write it
            </button>
            <button
              onClick={() => setState(s => ({ ...s, asked: false, questions: [], answers: {} }))}
              className="px-3 py-2 text-xs text-[#6B7280] hover:text-[#111827]"
            >
              Change description
            </button>
          </div>
        </div>
      )}

      {asked && questions.length === 0 && (
        <div className="flex items-center justify-between gap-2 border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-xs text-[#6B7280]">
          <span>Your description was clear enough — no questions needed.</span>
          <button onClick={() => write([], {})} className="text-[#2575FC] hover:underline shrink-0">Write it again</button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
    </div>
  );
}
