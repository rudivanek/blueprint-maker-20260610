// src/components/Layout/UsageBadge.tsx
//
// Live token/cost counter rendered in the Header. Subscribes to the global
// usage store; ticks up automatically on every AI call — including live
// during streaming HTML generation. Hover for a breakdown; reset from there.

import { useSyncExternalStore, useState } from 'react';
import { Coins, RotateCcw } from 'lucide-react';
import { usageStore, formatTokens, formatCost } from '../../lib/usage';

export function UsageBadge() {
  const totals = useSyncExternalStore(
    usageStore.subscribe,
    () => JSON.stringify(usageStore.getDisplayTotals())
  );
  const t = JSON.parse(totals) as ReturnType<typeof usageStore.getDisplayTotals>;
  const streaming = usageStore.isStreaming();
  const [open, setOpen] = useState(false);

  const totalTokens = t.inputTokens + t.outputTokens;
  if (totalTokens === 0 && t.scrapes === 0 && !streaming) {
    return null; // nothing used yet — keep the header clean
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div
        className={`flex items-center gap-1.5 px-2.5 h-8 border text-xs font-medium cursor-default transition-colors ${
          streaming
            ? 'border-[#2575FC] text-[#2575FC] bg-[#2575FC]/5'
            : 'border-[#E5E7EB] text-[#9CA3AF] hover:text-[#111827]'
        }`}
      >
        <Coins className={`w-3.5 h-3.5 ${streaming ? 'animate-pulse' : ''}`} />
        <span className="tabular-nums">{formatTokens(totalTokens)} tok</span>
        <span className="text-[#E5E7EB]">|</span>
        <span className="tabular-nums">{formatCost(t.costUsd)}</span>
      </div>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-[#E5E7EB] shadow-lg z-50 p-3">
          <p className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-2">
            Session usage{streaming ? ' — streaming…' : ''}
          </p>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-[#9CA3AF]">Input tokens</span>
              <span className="text-[#111827] tabular-nums">{formatTokens(t.inputTokens)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9CA3AF]">Output tokens</span>
              <span className="text-[#111827] tabular-nums">{formatTokens(t.outputTokens)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9CA3AF]">AI calls</span>
              <span className="text-[#111827] tabular-nums">{t.calls}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9CA3AF]">Firecrawl scrapes</span>
              <span className="text-[#111827] tabular-nums">{t.scrapes}</span>
            </div>
            <div className="flex justify-between border-t border-[#E5E7EB] pt-1.5 mt-1.5">
              <span className="text-[#111827] font-medium">Est. AI cost</span>
              <span className="text-[#111827] font-medium tabular-nums">{formatCost(t.costUsd)}</span>
            </div>
          </div>
          <p className="text-[9px] text-[#9CA3AF] mt-2 leading-relaxed">
            Estimate from public per-token rates. Firecrawl credits not included.
          </p>
          <button
            onClick={() => usageStore.reset()}
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 border border-[#E5E7EB] hover:border-[#2575FC] text-[10px] text-[#9CA3AF] hover:text-[#2575FC] font-medium transition-all"
          >
            <RotateCcw className="w-3 h-3" /> Reset counter
          </button>
        </div>
      )}
    </div>
  );
}
