// src/components/Editor/ChangeChat.tsx
//
// The AI's reply before a change (lib/changeChat): conversation bubbles, an
// amber warning, clickable answer chips, a reply box, and
// "Yes, do it" / "Skip questions — just apply" / "Cancel".

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Send, SkipForward, Sparkles } from 'lucide-react';
import type { CopyAnswers, CopyQuestion } from '../../lib/copywriter';
import { AUTO_APPLY_KEY, readAutoApply, type ChatMessage, type ChatTurn } from '../../lib/changeChat';

const LET_AI = 'Let the AI decide';
const MAX_REPLIES = 6;

interface ChangeChatProps {
  title: string;
  messages: ChatMessage[];
  turn: ChatTurn | null;
  busy: boolean;
  onReply: (text: string) => void;
  onConfirm: (questions: CopyQuestion[], answers: CopyAnswers) => void;
  onCancel: () => void;
}

export function ChangeChat({ title, messages, turn, busy, onReply, onConfirm, onCancel }: ChangeChatProps) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const [reply, setReply] = useState('');
  const [auto, setAuto] = useState(readAutoApply);
  const endRef = useRef<HTMLDivElement | null>(null);
  const questions = turn?.questions ?? [];
  const userCount = messages.filter(m => m.role === 'user').length;

  // keep answers for questions that are asked again (same id); scroll to the newest message
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);

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

  const send = () => {
    const t = reply.trim();
    if (!t || busy) return;
    // include chip answers picked so far, so they aren't lost
    const a = answers();
    const chosen = questions.filter(q => a[q.id]).map(q => `${q.question} → ${a[q.id]}`);
    onReply(chosen.length ? `${t}\n(My choices so far: ${chosen.join('; ')})` : t);
    setReply('');
  };

  const confirm = () => { if (!busy && turn) onConfirm(questions, answers()); };

  const setAutoApply = (v: boolean) => {
    setAuto(v);
    try { if (v) localStorage.setItem(AUTO_APPLY_KEY, '1'); else localStorage.removeItem(AUTO_APPLY_KEY); } catch { /* ignore */ }
  };

  return (
    <div className="border border-[#2575FC]/30 bg-[#EFF5FF] px-4 py-3 space-y-3">
      <p className="text-sm font-medium text-[#111827] flex items-center gap-1.5">
        <Sparkles className="w-4 h-4 text-[#2575FC]" /> {title}
      </p>

      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-white border border-[#E5E7EB] text-[#374151]' : 'bg-[#2575FC] text-white'}`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="px-3 py-2 text-xs bg-[#2575FC]/70 text-white">…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {turn?.warning && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {turn.warning}
        </div>
      )}

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

      {userCount < MAX_REPLIES && (
        <div className="flex items-start gap-2">
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (reply.trim()) send(); else confirm();
              }
            }}
            rows={1}
            disabled={busy}
            placeholder="Reply to the AI, e.g. “No, I mean all photos of the gallery”…"
            aria-label="Reply to the AI"
            className="flex-1 bg-white border border-[#E5E7EB] px-2.5 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2575FC] resize-y leading-snug disabled:opacity-50"
          />
          <button
            type="button"
            onClick={send}
            disabled={!reply.trim() || busy}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E5E7EB] bg-white text-xs text-[#374151] hover:border-[#2575FC] disabled:opacity-40 shrink-0"
          >
            <Send className="w-3.5 h-3.5" /> Send
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={confirm}
          disabled={busy || !turn}
          title="Ctrl/⌘ + Enter (with an empty reply box)"
          className="flex items-center gap-2 px-4 py-2 bg-[#2575FC] hover:bg-[#1a5fe0] text-white text-sm font-medium disabled:opacity-40"
        >
          <Check className="w-4 h-4" /> Yes, do it
        </button>
        {questions.length > 0 && (
          <button
            type="button"
            onClick={() => { if (!busy && turn) onConfirm([], {}); }}
            disabled={busy || !turn}
            className="flex items-center gap-1.5 px-3 py-2 border border-[#E5E7EB] bg-white text-xs text-[#6B7280] hover:border-[#2575FC] disabled:opacity-40"
          >
            <SkipForward className="w-3.5 h-3.5" /> Skip questions — just apply
          </button>
        )}
        <button type="button" onClick={onCancel} className="px-3 py-2 text-xs text-[#6B7280] hover:text-[#111827]">
          Cancel
        </button>
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-[#6B7280] cursor-pointer select-none">
          <input type="checkbox" checked={auto} onChange={e => setAutoApply(e.target.checked)} className="accent-[#2575FC]" />
          Don't ask for clear requests
        </label>
      </div>
    </div>
  );
}
