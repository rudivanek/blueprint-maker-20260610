// src/lib/usage.ts
//
// Global token/cost tracker. All AI hooks report into this store; the
// UsageBadge in the header subscribes and updates live — including DURING
// streaming HTML generation (output tokens tick up as they arrive).
//
// Totals persist in localStorage so they survive reloads. Reset via the badge.
//
// PRICING: edit the PRICES table below if rates change. Values are USD per
// 1 MILLION tokens.

export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
}

// USD per 1M tokens — adjust here if Anthropic/OpenAI change pricing.
export const PRICES: Record<string, ModelPrice> = {
  'claude-sonnet-4-6': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'gpt-4.1': { inputPerMTok: 2.0, outputPerMTok: 8.0 },
};

const FALLBACK_PRICE: ModelPrice = { inputPerMTok: 3.0, outputPerMTok: 15.0 };

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  scrapes: number;
  calls: number;
}

interface ActiveCall {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

const STORAGE_KEY = 'bm_usage_totals_v1';

function loadTotals(): UsageTotals {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        inputTokens: Number(parsed.inputTokens) || 0,
        outputTokens: Number(parsed.outputTokens) || 0,
        costUsd: Number(parsed.costUsd) || 0,
        scrapes: Number(parsed.scrapes) || 0,
        calls: Number(parsed.calls) || 0,
      };
    }
  } catch { /* ignore */ }
  return { inputTokens: 0, outputTokens: 0, costUsd: 0, scrapes: 0, calls: 0 };
}

function saveTotals(t: UsageTotals) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(t)); } catch { /* ignore */ }
}

export function costFor(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES[model] ?? FALLBACK_PRICE;
  return (inputTokens / 1_000_000) * price.inputPerMTok
       + (outputTokens / 1_000_000) * price.outputPerMTok;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type Listener = () => void;

let totals: UsageTotals = loadTotals();
const activeCalls = new Map<string, ActiveCall>();
const listeners = new Set<Listener>();
let nextCallId = 1;

function notify() {
  for (const l of listeners) l();
}

export const usageStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Totals INCLUDING any in-flight streaming calls — what the badge displays. */
  getDisplayTotals(): UsageTotals {
    let input = totals.inputTokens;
    let output = totals.outputTokens;
    let cost = totals.costUsd;
    for (const call of activeCalls.values()) {
      input += call.inputTokens;
      output += call.outputTokens;
      cost += costFor(call.model, call.inputTokens, call.outputTokens);
    }
    return { ...totals, inputTokens: input, outputTokens: output, costUsd: cost };
  },

  isStreaming(): boolean {
    return activeCalls.size > 0;
  },

  /** One-shot report for non-streaming calls. */
  report(model: string, inputTokens: number, outputTokens: number) {
    totals = {
      ...totals,
      inputTokens: totals.inputTokens + inputTokens,
      outputTokens: totals.outputTokens + outputTokens,
      costUsd: totals.costUsd + costFor(model, inputTokens, outputTokens),
      calls: totals.calls + 1,
    };
    saveTotals(totals);
    notify();
  },

  reportScrape() {
    totals = { ...totals, scrapes: totals.scrapes + 1 };
    saveTotals(totals);
    notify();
  },

  /** Streaming lifecycle: start → progress (cumulative) → end. */
  startCall(model: string, inputTokens = 0): string {
    const id = String(nextCallId++);
    activeCalls.set(id, { model, inputTokens, outputTokens: 0 });
    notify();
    return id;
  },

  /** Update an in-flight call with CUMULATIVE token counts (replaces, not adds). */
  progressCall(id: string, update: { inputTokens?: number; outputTokens?: number }) {
    const call = activeCalls.get(id);
    if (!call) return;
    if (update.inputTokens !== undefined) call.inputTokens = update.inputTokens;
    if (update.outputTokens !== undefined) call.outputTokens = update.outputTokens;
    notify();
  },

  /** Fold the finished call into the persisted totals. */
  endCall(id: string, finalInputTokens?: number, finalOutputTokens?: number) {
    const call = activeCalls.get(id);
    if (!call) return;
    activeCalls.delete(id);
    const input = finalInputTokens ?? call.inputTokens;
    const output = finalOutputTokens ?? call.outputTokens;
    totals = {
      ...totals,
      inputTokens: totals.inputTokens + input,
      outputTokens: totals.outputTokens + output,
      costUsd: totals.costUsd + costFor(call.model, input, output),
      calls: totals.calls + 1,
    };
    saveTotals(totals);
    notify();
  },

  /** Drop an in-flight call without counting it (e.g. request failed before usage known). */
  abortCall(id: string) {
    if (activeCalls.delete(id)) notify();
  },

  reset() {
    totals = { inputTokens: 0, outputTokens: 0, costUsd: 0, scrapes: 0, calls: 0 };
    activeCalls.clear();
    saveTotals(totals);
    notify();
  },
};

// ---------------------------------------------------------------------------
// Formatting helpers for the badge
// ---------------------------------------------------------------------------

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatCost(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(3)}`;
}
