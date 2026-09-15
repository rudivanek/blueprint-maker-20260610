// src/components/ui/ProcessingOverlay.tsx
//
// Full-screen blocking overlay shown while a job from lib/jobStore runs.

import { useEffect, useState } from 'react';
import { useJob, jobStore } from '../../lib/jobStore';

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function ProcessingOverlay() {
  const job = useJob();
  const [now, setNow] = useState(Date.now());
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!job) { setConfirming(false); return; }
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [job]);

  if (!job) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/55 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
    >
      <div className="w-full max-w-md bg-white shadow-2xl px-7 pt-7 pb-5 text-center">
        <div className="mx-auto mb-4 h-11 w-11 rounded-full border-[3px] border-[#DCE8FF] border-t-[#2575FC] animate-spin" />
        <h2 className="text-[17px] font-semibold text-[#111827]">{job.title}</h2>
        <p className="text-xs text-[#6B7280] mt-1">{job.estimate}</p>

        <div className="mt-5 bg-[#F9FAFB] border border-[#E5E7EB] px-3 py-2.5 text-left">
          <p className="text-[10px] uppercase tracking-wider text-[#9CA3AF] mb-0.5">Now</p>
          <p className="text-sm text-[#111827] break-words min-h-[20px]">{job.status || 'Starting…'}</p>
        </div>

        <div className="mt-3 h-1 bg-[#EEF2F7] overflow-hidden">
          <div className="h-full w-1/3 bg-[#2575FC] animate-[overlay-slide_1.4s_ease-in-out_infinite]" />
        </div>
        <p className="mt-2 text-[11px] text-[#9CA3AF] text-right">{formatElapsed(now - job.startedAt)} elapsed</p>

        {confirming ? (
          <div className="mt-4 border border-red-200 bg-red-50 px-3 py-2.5 text-left">
            <p className="text-xs text-red-700">Stop waiting? Work the AI already did may still be charged, and the result will be discarded.</p>
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={() => setConfirming(false)} className="text-xs px-3 py-1.5 border border-[#E5E7EB] bg-white text-[#111827]">Keep waiting</button>
              <button onClick={() => jobStore.cancel()} className="text-xs px-3 py-1.5 bg-red-600 text-white">Stop</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="mt-4 text-xs px-4 py-2 border border-[#E5E7EB] text-[#6B7280] hover:border-red-400 hover:text-red-600 transition-colors"
          >
            Cancel
          </button>
        )}
        <p className="mt-3 text-[11px] text-[#9CA3AF]">Please keep this tab open. The editor is locked until this finishes.</p>
      </div>
    </div>
  );
}
