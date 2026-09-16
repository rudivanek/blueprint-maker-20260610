// src/components/Editor/VisualEditBar.tsx
//
// Toolbar for "Edit on page" (see lib/visualEdit): shows the selected element
// and the direct edits for it — text, image, link, delete — plus Undo / Done.

import { useEffect, useState } from 'react';
import { ArrowUp, Check, Image as ImageIcon, Link2, MousePointerClick, Sparkles, Trash2, Type, Undo2, X } from 'lucide-react';
import type { Selection } from '../../lib/visualEdit';

interface VisualEditBarProps {
  selection: Selection | null;
  editingText: boolean;
  canUndo: boolean;
  onEditText: () => void;
  onImage: (src: string) => void;
  onLink: (href: string, text: string) => void;
  onDelete: () => void;
  onParent: () => void;
  onDeselect: () => void;
  onUndo: () => void;
  onDone: () => void;
  /** "Change with AI" for the selected element; undefined = no AI key */
  onAI?: (request: string) => void;
  /** Extra content below the selection (e.g. the AI's questions) */
  children?: React.ReactNode;
}

const input = 'min-w-0 flex-1 bg-white border border-[#E5E7EB] px-2.5 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2575FC]';
const btn = 'flex items-center gap-1.5 px-2.5 py-1.5 border border-[#E5E7EB] bg-white text-xs text-[#374151] hover:border-[#2575FC] hover:text-[#111827] disabled:opacity-40 shrink-0';

export function VisualEditBar(p: VisualEditBarProps) {
  const s = p.selection;
  const [src, setSrc] = useState('');
  const [href, setHref] = useState('');
  const [label, setLabel] = useState('');
  const [ask, setAsk] = useState('');

  useEffect(() => {
    setSrc(s?.image?.src ?? '');
    setHref(s?.link?.href ?? '');
    setLabel(s?.link?.text ?? '');
  }, [s?.key, s?.image?.src, s?.link?.href, s?.link?.text]);
  useEffect(() => { setAsk(''); }, [s?.key]);

  return (
    <div className="border border-[#2575FC]/30 bg-[#EFF5FF] px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <MousePointerClick className="w-4 h-4 text-[#2575FC] shrink-0" />
        <p className="text-xs text-[#111827] flex-1 min-w-[200px]">
          {p.editingText
            ? <><b>Typing…</b> Enter saves · Shift + Enter new line · Esc cancels</>
            : <><b>Edit on page:</b> click any element to select it · double-click a text to edit it</>}
        </p>
        <button onClick={p.onUndo} disabled={!p.canUndo || p.editingText} className={btn} title="Undo the last change">
          <Undo2 className="w-3.5 h-3.5" /> Undo
        </button>
        <button onClick={p.onDone} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2575FC] hover:bg-[#1a5fe0] text-white text-xs font-medium shrink-0">
          <Check className="w-3.5 h-3.5" /> Done
        </button>
      </div>

      {s && !p.editingText && (
        <div className="bg-white border border-[#E5E7EB] px-2.5 py-2 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#F3F4F6] text-[#374151] shrink-0">&lt;{s.tag}&gt;</span>
            <span className="text-xs text-[#6B7280] truncate flex-1 min-w-[120px]" title={s.text}>{s.text || '(no text)'}</span>
            {s.hasParent && (
              <button onClick={p.onParent} className={btn} title="Select the element around this one">
                <ArrowUp className="w-3.5 h-3.5" /> Parent
              </button>
            )}
            {s.canText && (
              <button onClick={p.onEditText} className={btn}>
                <Type className="w-3.5 h-3.5" /> Edit text
              </button>
            )}
            <button onClick={p.onDelete} className={`${btn} hover:!border-red-400 hover:!text-red-600`}>
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
            <button onClick={p.onDeselect} className="p-1.5 text-[#9CA3AF] hover:text-[#111827] shrink-0" title="Deselect (Esc)">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {s.image && (
            <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); p.onImage(src); }}>
              <ImageIcon className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
              <input value={src} onChange={e => setSrc(e.target.value)} placeholder="Image URL (https://…)" className={input} aria-label="Image URL" />
              <button type="submit" disabled={!src.trim() || src === s.image.src} className={btn}>Replace image</button>
            </form>
          )}

          {s.link && (
            <form className="flex items-center gap-2 flex-wrap" onSubmit={e => { e.preventDefault(); p.onLink(href, label); }}>
              <Link2 className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
              {s.link.text !== '' && (
                <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label" className={`${input} max-w-[220px]`} aria-label="Link label" />
              )}
              {s.link.tag === 'a' && (
                <input value={href} onChange={e => setHref(e.target.value)} placeholder="Link (https://… or #section)" className={input} aria-label="Link URL" />
              )}
              <button type="submit" disabled={href === s.link.href && label === s.link.text} className={btn}>Save link</button>
            </form>
          )}

          {p.onAI ? (
            <form className="flex items-start gap-2 pt-1 border-t border-[#F3F4F6]" onSubmit={e => { e.preventDefault(); if (ask.trim()) p.onAI?.(ask.trim()); }}>
              <Sparkles className="w-3.5 h-3.5 text-[#2575FC] shrink-0 mt-2" />
              <textarea
                value={ask}
                onChange={e => setAsk(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && ask.trim()) { e.preventDefault(); p.onAI?.(ask.trim()); } }}
                rows={1}
                placeholder='Change this element with AI, e.g. "make this a slider with autoplay", "put these cards in 3 columns"'
                aria-label="Change this element with AI"
                className={`${input} resize-y leading-snug`}
              />
              <button type="submit" disabled={!ask.trim()} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2575FC] hover:bg-[#1a5fe0] text-white text-xs font-medium disabled:opacity-40 shrink-0" title="Ctrl/⌘ + Enter · ≈ $0.02–0.08">
                Change with AI
              </button>
            </form>
          ) : (!s.canText && !s.image && !s.link) && (
            <p className="text-[11px] text-[#6B7280]">For layout, colors or new widgets: click <b>Done</b>, then use <b>Describe changes</b>.</p>
          )}
          {p.children}
        </div>
      )}
    </div>
  );
}
