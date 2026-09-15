// src/lib/aiProxy.ts
//
// Step 5 — the ONLY place the app talks to Anthropic, OpenAI or Firecrawl.
// Every call goes through the `ai-proxy` edge function: keys stay on the
// server, models are allow-listed, and each call is logged in `api_usage`.
//
// AI calls are always streamed (the edge function has a 400 s wall-clock
// limit and streaming keeps long generations alive). If a long HTML page is
// still cut off (time limit or max_tokens), generateText() asks the model to
// continue and stitches the parts together.

import { supabase } from './supabase';
import { usageStore } from './usage';
import { loadSettings, saveSettings } from './settings';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-proxy`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const ANTHROPIC_MODEL = 'claude-sonnet-4-6';
export const OPENAI_MODEL = 'gpt-4.1';

export type Purpose =
  | 'design-system' | 'design-from-html' | 'wp-extract' | 'structure-import' | 'content-import'
  | 'generate-html' | 'regenerate-html' | 'brief-html'
  | 'scrape-design' | 'scrape-structure' | 'other';

// ── Project context (which project a call belongs to, for the usage log) ──
let currentProjectId: string | null = null;
export function setUsageProject(projectId: string | null | undefined) {
  currentProjectId = projectId ?? null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');
  return { Authorization: `Bearer ${token}`, apikey: ANON_KEY, 'Content-Type': 'application/json' };
}

async function post(payload: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  return fetch(FUNCTION_URL, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(payload),
    signal,
  });
}

async function errorFrom(resp: Response): Promise<Error> {
  const text = await resp.text().catch(() => '');
  let message = text;
  try { message = JSON.parse(text).error ?? text; } catch { /* keep text */ }
  return new Error(message || `Request failed (${resp.status})`);
}

async function postJson<T>(payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const resp = await post(payload, signal);
  if (!resp.ok) throw await errorFrom(resp);
  return resp.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Keys + usage
// ---------------------------------------------------------------------------

export type KeyProvider = 'anthropic' | 'openai' | 'firecrawl';

export interface KeyStatus {
  keys: Record<KeyProvider, { set: boolean; source: 'user' | 'server' | ''; last4: string }>;
  today: { calls: number; inputTokens: number; outputTokens: number; scrapes: number; limit: number };
  models: { anthropic: string[]; openai: string[] };
  /** Set when keys were moved from this browser to the server during this load */
  migrated?: KeyProvider[];
}

let statusPromise: Promise<KeyStatus> | null = null;
const statusListeners = new Set<(s: KeyStatus) => void>();

export function onKeyStatus(fn: (s: KeyStatus) => void): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

/**
 * Key status from the server (cached). On first load, keys still stored in
 * this browser (pre-Step 5) are moved to the server and removed locally.
 */
export function getKeyStatus(force = false): Promise<KeyStatus> {
  if (!statusPromise || force) {
    statusPromise = (async () => {
      let status = await postJson<KeyStatus>({ action: 'status' });
      const local = loadSettings();
      const localKeys: Partial<Record<KeyProvider, string>> = {
        anthropic: local.anthropicApiKey?.trim(),
        openai: local.openaiApiKey?.trim(),
        firecrawl: local.firecrawlApiKey?.trim(),
      };
      const toMove = (Object.keys(localKeys) as KeyProvider[])
        .filter(p => localKeys[p] && status.keys[p].source !== 'user');
      if (toMove.length) {
        try {
          await postJson({ action: 'save-keys', keys: Object.fromEntries(toMove.map(p => [p, localKeys[p]])) });
          status = await postJson<KeyStatus>({ action: 'status' });
          status.migrated = toMove;
        } catch (e) {
          console.warn('Could not move browser keys to the server:', e);
        }
      }
      // Keys never stay in the browser once the server has them.
      if (Object.values(localKeys).some(Boolean)) {
        const cleaned = { ...local };
        if (status.keys.anthropic.source === 'user') cleaned.anthropicApiKey = '';
        if (status.keys.openai.source === 'user') cleaned.openaiApiKey = '';
        if (status.keys.firecrawl.source === 'user') cleaned.firecrawlApiKey = '';
        saveSettings(cleaned);
      }
      statusListeners.forEach(fn => fn(status));
      return status;
    })();
    statusPromise.catch(() => { statusPromise = null; });
  }
  return statusPromise;
}

/** "" removes a key; omitted providers are left unchanged. */
export async function saveKeys(keys: Partial<Record<KeyProvider, string>>): Promise<KeyStatus> {
  await postJson({ action: 'save-keys', keys });
  return getKeyStatus(true);
}

export interface UsageRow {
  created_at: string;
  provider: string;
  model: string;
  purpose: string;
  project_id: string | null;
  input_tokens: number;
  output_tokens: number;
  credits: number;
  status: string;
  duration_ms: number;
  key_source: string;
  error: string;
}

export async function getUsage(days = 30): Promise<UsageRow[]> {
  const { rows } = await postJson<{ rows: UsageRow[] }>({ action: 'usage', days });
  return rows;
}

// ---------------------------------------------------------------------------
// SSE reading
// ---------------------------------------------------------------------------

async function readSse(
  resp: Response,
  onEvent: (evt: any) => void,
  signal?: AbortSignal,
): Promise<{ cutOff: boolean }> {
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        if (data === '[DONE]') { onEvent({ type: '__done' }); continue; }
        let evt: any;
        try { evt = JSON.parse(data); } catch { continue; }
        onEvent(evt);
      }
    }
    return { cutOff: false };
  } catch (e) {
    if (signal?.aborted) throw e;
    // Connection dropped mid-stream (e.g. the function's time limit).
    console.warn('AI stream ended early:', e);
    return { cutOff: true };
  }
}

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

export interface AIResult {
  text: string;
  toolInput: Record<string, unknown> | null;
  /** Output is incomplete: hit max_tokens or the stream was cut off */
  truncated: boolean;
  /** Stream ended without the provider's end marker */
  cutOff: boolean;
}

interface CallOpts {
  purpose: Purpose;
  signal?: AbortSignal;
  onText?: (totalChars: number) => void;
}

export async function anthropicCall(body: Record<string, unknown>, opts: CallOpts): Promise<AIResult> {
  const resp = await post({ action: 'call', provider: 'anthropic', body: { model: ANTHROPIC_MODEL, ...body }, purpose: opts.purpose, projectId: currentProjectId }, opts.signal);
  if (!resp.ok || !resp.body) throw await errorFrom(resp);

  let text = '';
  let stopReason = '';
  let sawStop = false;
  let streamError = '';
  const toolJson: Record<number, string> = {};
  const toolIdx: number[] = [];
  const callId = usageStore.startCall(ANTHROPIC_MODEL);
  let input = 0;
  let output = 0;

  const { cutOff: dropped } = await readSse(resp, evt => {
    switch (evt.type) {
      case 'message_start': {
        const u = evt.message?.usage ?? {};
        input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
        output = u.output_tokens ?? 0;
        usageStore.progressCall(callId, { inputTokens: input, outputTokens: output });
        break;
      }
      case 'content_block_start':
        if (evt.content_block?.type === 'tool_use') { toolIdx.push(evt.index); toolJson[evt.index] = ''; }
        break;
      case 'content_block_delta':
        if (evt.delta?.type === 'text_delta') { text += evt.delta.text; opts.onText?.(text.length); }
        else if (evt.delta?.type === 'input_json_delta') {
          toolJson[evt.index] = (toolJson[evt.index] ?? '') + (evt.delta.partial_json ?? '');
          opts.onText?.(toolJson[evt.index].length);
        }
        break;
      case 'message_delta':
        if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
        if (evt.usage?.output_tokens !== undefined) { output = evt.usage.output_tokens; usageStore.progressCall(callId, { outputTokens: output }); }
        break;
      case 'message_stop':
        sawStop = true;
        break;
      case 'error':
        streamError = evt.error?.message ?? 'Streaming error';
        break;
    }
  }, opts.signal).catch(e => { usageStore.endCall(callId, input, output); throw e; });

  usageStore.endCall(callId, input, output);
  if (streamError) throw new Error(`Anthropic: ${streamError}`);

  let toolInput: Record<string, unknown> | null = null;
  if (toolIdx.length) {
    try { toolInput = JSON.parse(toolJson[toolIdx[0]] || 'null'); } catch { toolInput = null; }
  }
  const cutOff = dropped || !sawStop;
  if (cutOff) console.warn('Anthropic stream was cut off before the end.');
  return { text, toolInput, truncated: cutOff || stopReason === 'max_tokens', cutOff };
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

export async function openaiCall(body: Record<string, unknown>, opts: CallOpts): Promise<AIResult> {
  const resp = await post({ action: 'call', provider: 'openai', body: { model: OPENAI_MODEL, ...body }, purpose: opts.purpose, projectId: currentProjectId }, opts.signal);
  if (!resp.ok || !resp.body) throw await errorFrom(resp);

  let text = '';
  let finish = '';
  let done = false;
  let streamError = '';
  const callId = usageStore.startCall(OPENAI_MODEL);
  let input = 0;
  let output = 0;

  const { cutOff: dropped } = await readSse(resp, evt => {
    if (evt.type === '__done') { done = true; return; }
    if (evt.error) { streamError = evt.error.message ?? 'stream error'; return; }
    const choice = evt.choices?.[0];
    const delta = choice?.delta?.content;
    if (delta) { text += delta; opts.onText?.(text.length); }
    if (choice?.finish_reason) finish = choice.finish_reason;
    if (evt.usage) {
      input = evt.usage.prompt_tokens ?? input;
      output = evt.usage.completion_tokens ?? output;
      usageStore.progressCall(callId, { inputTokens: input, outputTokens: output });
    }
  }, opts.signal).catch(e => { usageStore.endCall(callId, input, output); throw e; });

  usageStore.endCall(callId, input, output);
  if (streamError) throw new Error(`OpenAI: ${streamError}`);
  const cutOff = dropped || !done;
  return { text, toolInput: null, truncated: cutOff || finish === 'length', cutOff };
}

// ---------------------------------------------------------------------------
// Long text generation with automatic continuation
// ---------------------------------------------------------------------------

const CONTINUE_PROMPT =
  'Your previous answer was cut off. Continue EXACTLY where it stopped — output only the remaining text, ' +
  'starting with the very next character. Do not repeat anything, do not restart the document, no preamble, no code fences.';

/** Joins a continuation onto the partial text, removing repeated overlap. */
export function stitch(partial: string, cont: string): string {
  let c = cont.replace(/^\s*```[a-z]*\s*\n/i, '');
  const maxK = Math.min(2000, partial.length, c.length);
  for (let k = maxK; k >= 20; k--) {
    if (partial.endsWith(c.slice(0, k))) { c = c.slice(k); break; }
  }
  return partial + c;
}

type Msg = { role: 'user' | 'assistant'; content: unknown };

export async function generateText(args: {
  provider: 'anthropic' | 'openai';
  system: string;
  /** Messages in the provider's own format (OpenAI: without the system message) */
  messages: Msg[];
  maxTokens: number;
  purpose: Purpose;
  signal?: AbortSignal;
  onText?: (totalChars: number) => void;
  /** Stop continuing once this is true (e.g. text contains </html>) */
  isComplete?: (text: string) => boolean;
  maxContinues?: number;
}): Promise<{ text: string; truncated: boolean; continues: number }> {
  const maxContinues = args.maxContinues ?? 2;
  let text = '';
  let continues = 0;
  let messages = args.messages;

  for (;;) {
    const base = text;
    const onText = (n: number) => args.onText?.(base.length + n);
    const result = args.provider === 'openai'
      ? await openaiCall({ max_tokens: args.maxTokens, messages: [{ role: 'system', content: args.system }, ...messages] }, { purpose: args.purpose, signal: args.signal, onText })
      : await anthropicCall({ max_tokens: args.maxTokens, system: args.system, messages }, { purpose: args.purpose, signal: args.signal, onText });

    text = continues === 0 ? result.text : stitch(text, result.text);
    const complete = args.isComplete ? args.isComplete(text) : !result.truncated;
    if (!result.truncated || complete) return { text, truncated: !complete && result.truncated, continues };
    if (continues >= maxContinues || !result.text.trim()) return { text, truncated: true, continues };

    continues++;
    console.info(`Output was cut off at ${text.length} chars — asking the model to continue (${continues}/${maxContinues}).`);
    messages = [
      ...args.messages,
      { role: 'assistant', content: text.trimEnd() },
      { role: 'user', content: CONTINUE_PROMPT },
    ];
  }
}

// ---------------------------------------------------------------------------
// Firecrawl
// ---------------------------------------------------------------------------

export async function firecrawlScrape<T = any>(body: Record<string, unknown>, purpose: Purpose, signal?: AbortSignal): Promise<T> {
  const data = await postJson<T>({ action: 'call', provider: 'firecrawl', body, purpose, projectId: currentProjectId }, signal);
  usageStore.reportScrape();
  return data;
}

