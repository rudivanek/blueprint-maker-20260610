// supabase/functions/ai-proxy/rules.ts
//
// Pure helpers for ai-proxy (no Deno APIs, unit-testable):
// request sanitising, model allow-list, token caps, SSE usage metering.

export type Provider = "anthropic" | "openai" | "firecrawl";

export const DEFAULT_MODELS: Record<"anthropic" | "openai", string[]> = {
  anthropic: ["claude-sonnet-4-6"],
  openai: ["gpt-4.1"],
};

export const MAX_TOKENS = { anthropic: 64000, openai: 32768 };
export const MAX_BODY_BYTES = 25 * 1024 * 1024;
export const DEFAULT_DAILY_CALL_LIMIT = 300;

const FIRECRAWL_FORMATS = new Set([
  "markdown", "rawHtml", "html", "links", "extract", "json", "screenshot", "screenshot@fullPage",
]);

type Obj = Record<string, unknown>;
export type Sanitized =
  | { ok: true; body: Obj; model: string }
  | { ok: false; error: string };

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

function pick(src: Obj, keys: string[]): Obj {
  const out: Obj = {};
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
  return out;
}

/** Allowed models: env ALLOWED_MODELS ("a,b,c") replaces the defaults when set. */
export function allowedModels(provider: "anthropic" | "openai", envValue?: string | null): string[] {
  if (envValue && envValue.trim()) {
    const all = envValue.split(",").map(s => s.trim()).filter(Boolean);
    const mine = all.filter(m => (provider === "anthropic" ? m.startsWith("claude") : !m.startsWith("claude")));
    if (mine.length) return mine;
  }
  return DEFAULT_MODELS[provider];
}

function capTokens(v: unknown, cap: number): number | null {
  const n = typeof v === "number" ? Math.floor(v) : NaN;
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(n, cap);
}

export function sanitizeAnthropic(input: unknown, allowed: string[]): Sanitized {
  if (!isObj(input)) return { ok: false, error: "Missing request body" };
  const model = String(input.model ?? "");
  if (!allowed.includes(model)) return { ok: false, error: `Model not allowed: ${model || "(none)"}. Allowed: ${allowed.join(", ")}` };
  if (!Array.isArray(input.messages) || input.messages.length === 0) return { ok: false, error: "messages must be a non-empty array" };
  const maxTokens = capTokens(input.max_tokens, MAX_TOKENS.anthropic);
  if (!maxTokens) return { ok: false, error: "max_tokens is required" };
  const body = pick(input, ["model", "system", "messages", "tools", "tool_choice", "temperature", "stop_sequences"]);
  body.max_tokens = maxTokens;
  body.stream = true; // always stream: keeps the connection alive for long outputs
  return { ok: true, body, model };
}

export function sanitizeOpenAI(input: unknown, allowed: string[]): Sanitized {
  if (!isObj(input)) return { ok: false, error: "Missing request body" };
  const model = String(input.model ?? "");
  if (!allowed.includes(model)) return { ok: false, error: `Model not allowed: ${model || "(none)"}. Allowed: ${allowed.join(", ")}` };
  if (!Array.isArray(input.messages) || input.messages.length === 0) return { ok: false, error: "messages must be a non-empty array" };
  const maxTokens = capTokens(input.max_tokens, MAX_TOKENS.openai);
  if (!maxTokens) return { ok: false, error: "max_tokens is required" };
  const body = pick(input, ["model", "messages", "response_format", "temperature"]);
  body.max_tokens = maxTokens;
  body.stream = true;
  body.stream_options = { include_usage: true };
  return { ok: true, body, model };
}

export function sanitizeFirecrawl(input: unknown): Sanitized {
  if (!isObj(input)) return { ok: false, error: "Missing request body" };
  const url = String(input.url ?? "");
  let parsed: URL;
  try { parsed = new URL(url); } catch { return { ok: false, error: "url must be a valid http(s) URL" }; }
  if (!/^https?:$/.test(parsed.protocol)) return { ok: false, error: "url must be http(s)" };
  const formats = Array.isArray(input.formats) ? input.formats.map(String) : ["markdown"];
  const bad = formats.filter(f => !FIRECRAWL_FORMATS.has(f));
  if (bad.length) return { ok: false, error: `Format not allowed: ${bad.join(", ")}` };
  const body = pick(input, ["extract", "onlyMainContent", "waitFor", "timeout", "mobile"]);
  body.url = parsed.toString();
  body.formats = formats;
  if (typeof body.waitFor === "number") body.waitFor = Math.min(Math.max(0, body.waitFor), 15000);
  if (typeof body.timeout === "number") body.timeout = Math.min(Math.max(1000, body.timeout), 120000);
  return { ok: true, body, model: "scrape" };
}

export function cleanPurpose(v: unknown): string {
  const s = String(v ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
  return s || "other";
}

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** Loose key sanity check — catches pasted whitespace / wrong field. */
export function validKey(provider: Provider, key: string): string | null {
  if (/\s/.test(key)) return "contains spaces or line breaks";
  if (key.length < 20 || key.length > 400) return "has an unexpected length";
  const prefix = provider === "anthropic" ? "sk-ant-" : provider === "openai" ? "sk-" : "fc-";
  if (!key.startsWith(prefix)) return `should start with "${prefix}"`;
  return null;
}

export function last4(key: string | null | undefined): string {
  return key ? key.slice(-4) : "";
}

/** Reads an SSE stream (as text chunks) and keeps token usage + completion state. */
export class UsageMeter {
  inputTokens = 0;
  outputTokens = 0;
  stopReason = "";
  completed = false;
  errorMessage = "";
  private buf = "";
  constructor(private provider: "anthropic" | "openai") {}

  feed(chunk: string) {
    this.buf += chunk;
    const lines = this.buf.split("\n");
    this.buf = lines.pop() ?? "";
    for (const line of lines) this.line(line);
  }

  end() {
    if (this.buf) this.line(this.buf);
    this.buf = "";
  }

  private line(raw: string) {
    const line = raw.trim();
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload) return;
    if (payload === "[DONE]") { this.completed = true; return; }
    // Cheap pre-filter: text deltas carry no usage — skip JSON parsing for them.
    if (this.provider === "anthropic" && payload.includes('"content_block_delta"')) return;
    let evt: any;
    try { evt = JSON.parse(payload); } catch { return; }
    if (this.provider === "anthropic") {
      if (evt.type === "message_start" && evt.message?.usage) {
        const u = evt.message.usage;
        this.inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
        this.outputTokens = u.output_tokens ?? 0;
      } else if (evt.type === "message_delta") {
        if (evt.usage?.output_tokens !== undefined) this.outputTokens = evt.usage.output_tokens;
        if (evt.delta?.stop_reason) this.stopReason = evt.delta.stop_reason;
      } else if (evt.type === "message_stop") {
        this.completed = true;
      } else if (evt.type === "error") {
        this.errorMessage = evt.error?.message ?? "stream error";
      }
    } else {
      if (evt.usage) {
        this.inputTokens = evt.usage.prompt_tokens ?? this.inputTokens;
        this.outputTokens = evt.usage.completion_tokens ?? this.outputTokens;
      }
      const fr = evt.choices?.[0]?.finish_reason;
      if (fr) this.stopReason = fr;
    }
  }

  status(): "ok" | "cut_off" | "error" {
    if (this.errorMessage) return "error";
    return this.completed ? "ok" : "cut_off";
  }
}


