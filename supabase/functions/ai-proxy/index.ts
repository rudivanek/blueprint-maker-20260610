// supabase/functions/ai-proxy/index.ts
//
// Step 5 — every Anthropic / OpenAI / Firecrawl call goes through here, so
// API keys never reach the browser and every call is logged.
//
// POST (signed-in user) with one of:
//   { action: "status" }                        → which keys are set + today's usage
//   { action: "save-keys", keys: { anthropic?, openai?, firecrawl? } }
//                                               → "" removes a key; omitted = unchanged
//   { action: "usage", days?: number }          → usage rows for the last N days
//   { action: "call", provider, body, purpose?, projectId? }
//        provider "anthropic" | "openai"  → streamed SSE, passed through as-is
//        provider "firecrawl"             → JSON (scrape endpoint only)
//
// Keys: the user's own key (table user_api_keys) wins; otherwise the studio
// key from the function secrets ANTHROPIC_API_KEY / OPENAI_API_KEY /
// FIRECRAWL_API_KEY is used, if set.
//
// Limits: model allow-list (env ALLOWED_MODELS), max_tokens caps, only known
// request fields forwarded, body ≤ 25 MB, DAILY_CALL_LIMIT calls per user/day.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  allowedModels, cleanPurpose, DEFAULT_DAILY_CALL_LIMIT, isUuid, last4, MAX_BODY_BYTES,
  type Provider, sanitizeAnthropic, sanitizeFirecrawl, sanitizeOpenAI, UsageMeter, validKey,
} from "./rules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const PROVIDERS: Provider[] = ["anthropic", "openai", "firecrawl"];
const ENV_KEY: Record<Provider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  firecrawl: "FIRECRAWL_API_KEY",
};
const COLUMN: Record<Provider, "anthropic_key" | "openai_key" | "firecrawl_key"> = {
  anthropic: "anthropic_key",
  openai: "openai_key",
  firecrawl: "firecrawl_key",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function startOfTodayUtc(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function loadKeys(userId: string) {
  const { data } = await admin.from("user_api_keys").select("*").eq("user_id", userId).maybeSingle();
  const out = {} as Record<Provider, { key: string; source: "user" | "server" | "" }>;
  for (const p of PROVIDERS) {
    const own = (data?.[COLUMN[p]] as string | null) ?? "";
    const env = Deno.env.get(ENV_KEY[p]) ?? "";
    out[p] = own ? { key: own, source: "user" } : env ? { key: env, source: "server" } : { key: "", source: "" };
  }
  return out;
}

async function updateUsage(id: number | null, fields: Record<string, unknown>) {
  if (!id) return;
  const { error } = await admin.from("api_usage").update(fields).eq("id", id);
  if (error) console.error("usage update failed:", error.message);
}

function upstreamError(text: string): string {
  try {
    const j = JSON.parse(text);
    return j?.error?.message ?? j?.error ?? j?.message ?? text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // ── Auth ──
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Not signed in" }, 401);
  const { data: userData, error: userError } = await admin.auth.getUser(authHeader.slice(7));
  if (userError || !userData?.user) return json({ error: "Not signed in" }, 401);
  const userId = userData.user.id;

  // ── Body ──
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY_BYTES) return json({ error: "Request too large" }, 413);
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const action = String(payload?.action ?? "");

  // ── status ──
  if (action === "status") {
    const keys = await loadKeys(userId);
    const { data: rows } = await admin
      .from("api_usage")
      .select("provider, input_tokens, output_tokens, credits")
      .eq("user_id", userId)
      .gte("created_at", startOfTodayUtc());
    const limit = Number(Deno.env.get("DAILY_CALL_LIMIT") ?? DEFAULT_DAILY_CALL_LIMIT);
    return json({
      keys: Object.fromEntries(PROVIDERS.map(p => [p, { set: !!keys[p].key, source: keys[p].source, last4: keys[p].source === "user" ? last4(keys[p].key) : "" }])),
      today: {
        calls: rows?.length ?? 0,
        inputTokens: (rows ?? []).reduce((s, r) => s + (r.input_tokens ?? 0), 0),
        outputTokens: (rows ?? []).reduce((s, r) => s + (r.output_tokens ?? 0), 0),
        scrapes: (rows ?? []).filter(r => r.provider === "firecrawl").length,
        limit,
      },
      models: { anthropic: allowedModels("anthropic", Deno.env.get("ALLOWED_MODELS")), openai: allowedModels("openai", Deno.env.get("ALLOWED_MODELS")) },
    });
  }

  // ── save-keys ──
  if (action === "save-keys") {
    const input = payload?.keys ?? {};
    const update: Record<string, string | null> = {};
    for (const p of PROVIDERS) {
      if (input[p] === undefined) continue;
      const v = String(input[p] ?? "").trim();
      if (v) {
        const problem = validKey(p, v);
        if (problem) return json({ error: `The ${p} key ${problem}.` }, 400);
      }
      update[COLUMN[p]] = v || null;
    }
    if (!Object.keys(update).length) return json({ error: "No keys given" }, 400);
    const { error } = await admin
      .from("user_api_keys")
      .upsert({ user_id: userId, ...update, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) return json({ error: `Could not save keys: ${error.message}` }, 500);
    return json({ ok: true });
  }

  // ── usage ──
  if (action === "usage") {
    const days = Math.min(Math.max(Number(payload?.days) || 30, 1), 90);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data, error } = await admin
      .from("api_usage")
      .select("created_at, provider, model, purpose, project_id, input_tokens, output_tokens, credits, status, duration_ms, key_source, error")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) return json({ error: error.message }, 500);
    return json({ rows: data ?? [] });
  }

  if (action !== "call") return json({ error: `Unknown action: ${action}` }, 400);

  // ── call ──
  const provider = String(payload?.provider ?? "") as Provider;
  if (!PROVIDERS.includes(provider)) return json({ error: "provider must be anthropic, openai or firecrawl" }, 400);

  const envModels = Deno.env.get("ALLOWED_MODELS");
  const clean = provider === "anthropic"
    ? sanitizeAnthropic(payload.body, allowedModels("anthropic", envModels))
    : provider === "openai"
      ? sanitizeOpenAI(payload.body, allowedModels("openai", envModels))
      : sanitizeFirecrawl(payload.body);
  if (!clean.ok) return json({ error: clean.error }, 400);

  // Daily limit
  const limit = Number(Deno.env.get("DAILY_CALL_LIMIT") ?? DEFAULT_DAILY_CALL_LIMIT);
  const { count } = await admin
    .from("api_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfTodayUtc());
  if ((count ?? 0) >= limit) {
    return json({ error: `Daily limit reached (${limit} calls). Try again tomorrow or raise DAILY_CALL_LIMIT.` }, 429);
  }

  const keys = await loadKeys(userId);
  const { key, source } = keys[provider];
  if (!key) {
    const name = provider === "anthropic" ? "Anthropic" : provider === "openai" ? "OpenAI" : "Firecrawl";
    return json({ error: `No ${name} API key set. Add it in Settings.` }, 400);
  }

  // Project must belong to the caller, otherwise it is not recorded.
  let projectId: string | null = null;
  if (isUuid(payload.projectId)) {
    const { data: proj } = await admin.from("projects").select("id").eq("id", payload.projectId).eq("user_id", userId).maybeSingle();
    projectId = proj?.id ?? null;
  }

  const started = Date.now();
  const { data: usageRow } = await admin
    .from("api_usage")
    .insert({ user_id: userId, project_id: projectId, provider, model: clean.model, purpose: cleanPurpose(payload.purpose), key_source: source })
    .select("id")
    .single();
  const usageId: number | null = usageRow?.id ?? null;

  // ── Firecrawl: plain JSON ──
  if (provider === "firecrawl") {
    try {
      const up = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(clean.body),
        signal: req.signal,
      });
      const text = await up.text();
      await updateUsage(usageId, {
        status: up.ok ? "ok" : "error",
        http_status: up.status,
        credits: up.ok ? 1 : 0,
        duration_ms: Date.now() - started,
        error: up.ok ? "" : upstreamError(text),
      });
      if (!up.ok) return json({ error: `Firecrawl error ${up.status}: ${upstreamError(text)}` }, up.status);
      return new Response(text, { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateUsage(usageId, { status: "error", duration_ms: Date.now() - started, error: message });
      return json({ error: `Firecrawl request failed: ${message}` }, 502);
    }
  }

  // ── Anthropic / OpenAI: streamed ──
  const url = provider === "anthropic" ? "https://api.anthropic.com/v1/messages" : "https://api.openai.com/v1/chat/completions";
  const headers: Record<string, string> = provider === "anthropic"
    ? { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }
    : { "Content-Type": "application/json", Authorization: `Bearer ${key}` };

  let upstream: Response;
  try {
    upstream = await fetch(url, { method: "POST", headers, body: JSON.stringify(clean.body), signal: req.signal });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateUsage(usageId, { status: "error", duration_ms: Date.now() - started, error: message });
    return json({ error: `${provider} request failed: ${message}` }, 502);
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    const message = upstreamError(text);
    await updateUsage(usageId, { status: "error", http_status: upstream.status, duration_ms: Date.now() - started, error: message });
    return json({ error: `${provider === "anthropic" ? "Anthropic" : "OpenAI"} API error ${upstream.status}: ${message}` }, upstream.status);
  }

  const [toClient, toMeter] = upstream.body.tee();
  const meter = new UsageMeter(provider);

  const metering = (async () => {
    const reader = toMeter.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        meter.feed(decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      if (!meter.errorMessage) meter.errorMessage = err instanceof Error ? err.message : String(err);
    } finally {
      meter.end();
      await updateUsage(usageId, {
        status: meter.status(),
        http_status: upstream.status,
        input_tokens: meter.inputTokens,
        output_tokens: meter.outputTokens,
        duration_ms: Date.now() - started,
        error: meter.errorMessage || (meter.stopReason === "max_tokens" || meter.stopReason === "length" ? "hit max_tokens" : ""),
      });
    }
  })();
  EdgeRuntime.waitUntil(metering);

  return new Response(toClient, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
});
