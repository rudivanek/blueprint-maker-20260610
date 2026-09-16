// src/components/Editor/VersionsMenu.tsx
//
// "Versions" button in the Preview toolbar: the last saved prototype versions
// of this page (lib/versions) with Restore.

import { useEffect, useRef, useState } from 'react';
import { History, Loader2, RotateCcw } from 'lucide-react';
import { listVersions, KEEP_VERSIONS, type VersionInfo } from '../../lib/versions';

interface VersionsMenuProps {
  pageId: string;
  disabled?: boolean;
  /** bump to refresh the list after a new snapshot */
  refreshKey: number;
  onRestore: (v: VersionInfo) => void;
}

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === today.toDateString() ? `Today ${time}` : `${d.toLocaleDateString()} ${time}`;
}

export function VersionsMenu({ pageId, disabled, refreshKey, onRestore }: VersionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<VersionInfo[] | null>(null);
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement | null>(null);
  const btn = useRef<HTMLButtonElement | null>(null);
  // fixed position: the toolbar scrolls, so an absolute menu would be cut off
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setError('');
    listVersions(pageId)
      .then(v => { if (alive) setList(v); })
      .catch(e => { if (alive) { setList([]); setError(e instanceof Error ? e.message : 'Could not load versions'); } });
    return () => { alive = false; };
  }, [open, pageId, refreshKey]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const hide = () => setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('resize', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, [open]);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 328)) });
    setOpen(true);
  };

  return (
    <div ref={box}>
      <button
        type="button"
        ref={btn}
        onClick={toggle}
        disabled={disabled}
        title={`Earlier versions of this prototype (the last ${KEEP_VERSIONS} are kept)`}
        className={`flex items-center gap-1.5 px-3 py-2 border text-xs transition-all disabled:opacity-40 ${open ? 'border-[#2575FC] text-[#111827]' : 'border-[#E5E7EB] text-[#6B7280] hover:border-[#2575FC] hover:text-[#111827]'}`}
      >
        <History className="w-3.5 h-3.5" /> Versions
      </button>
      {open && (
        <div style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0 }} className="z-50 w-80 bg-white border border-[#E5E7EB] shadow-lg">
          <p className="px-3 py-2 text-[11px] text-[#6B7280] border-b border-[#F3F4F6]">
            Saved automatically before the prototype changes. The last {KEEP_VERSIONS} are kept.
          </p>
          {list === null ? (
            <div className="px-3 py-3 flex items-center gap-2 text-xs text-[#6B7280]"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
          ) : error ? (
            <p className="px-3 py-3 text-xs text-red-600">{error}</p>
          ) : list.length === 0 ? (
            <p className="px-3 py-3 text-xs text-[#6B7280]">No earlier versions yet.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {list.map(v => (
                <li key={v.id} className="flex items-center gap-2 px-3 py-2 border-b border-[#F3F4F6] last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[#111827] truncate" title={v.label}>{v.label || 'Version'}</p>
                    <p className="text-[10px] text-[#9CA3AF]">{when(v.created_at)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); onRestore(v); }}
                    className="flex items-center gap-1 px-2 py-1 border border-[#E5E7EB] text-[11px] text-[#374151] hover:border-[#2575FC] shrink-0"
                  >
                    <RotateCcw className="w-3 h-3" /> Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
