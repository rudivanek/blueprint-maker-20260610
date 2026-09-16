// src/lib/models.ts
//
// AI models a project can use (Project → "AI model"). The choice decides the
// provider too: gpt-* models run on OpenAI, claude-* on Anthropic.
// Prices are USD per 1M tokens (Anthropic pricing page, 2026-09-16).
// The server (ai-proxy) must allow the same model ids — see rules.ts.

import type { AIProvider } from '../types';

export interface ModelOption {
  id: string;
  provider: AIProvider;
  label: string;
  note: string;
  input: number;
  output: number;
}

export const MODEL_OPTIONS: ModelOption[] = [
  { id: 'claude-sonnet-5', provider: 'anthropic', label: 'Claude Sonnet 5', note: 'Best balance of speed, quality and price (recommended)', input: 2, output: 10 },
  { id: 'claude-opus-5', provider: 'anthropic', label: 'Claude Opus 5', note: 'Stronger on complex pages', input: 5, output: 25 },
  { id: 'claude-fable-5-1', provider: 'anthropic', label: 'Claude Fable 5.1', note: 'Most capable, most expensive', input: 10, output: 50 },
  { id: 'claude-sonnet-4-6', provider: 'anthropic', label: 'Claude Sonnet 4.6', note: 'Previous default', input: 3, output: 15 },
  { id: 'gpt-4.1', provider: 'openai', label: 'GPT-4.1 (OpenAI)', note: 'Uses the OpenAI key', input: 2, output: 8 },
];

export const DEFAULT_MODEL = 'claude-sonnet-5';
/** What older projects used before models were selectable */
export const LEGACY_MODEL = 'claude-sonnet-4-6';

export function modelInfo(id: string | null | undefined): ModelOption {
  return MODEL_OPTIONS.find(m => m.id === id) ?? MODEL_OPTIONS.find(m => m.id === LEGACY_MODEL)!;
}

export const providerOf = (id: string | null | undefined): AIProvider => modelInfo(id).provider;

// ── The model of the project that is open right now (set by EditorPage) ──
let activeModel: string | null = null;

export function setActiveModel(id: string | null | undefined) {
  activeModel = id || null;
}

export function getActiveModel(provider: AIProvider): string {
  if (activeModel && providerOf(activeModel) === provider) return activeModel;
  return provider === 'openai' ? 'gpt-4.1' : LEGACY_MODEL;
}

/**
 * Cost hint scaled to the open project's model. `baseUsd` is the cost with
 * Claude Sonnet 4.6, which all the hints in the app were measured with.
 */
export function cost(baseUsd: number): string {
  const m = modelInfo(activeModel ?? LEGACY_MODEL);
  const legacy = modelInfo(LEGACY_MODEL);
  const factor = (m.input + m.output * 3) / (legacy.input + legacy.output * 3); // outputs dominate
  const v = baseUsd * factor;
  return `$${v < 0.1 ? v.toFixed(2).replace(/0$/, '') : v.toFixed(2)}`;
}
