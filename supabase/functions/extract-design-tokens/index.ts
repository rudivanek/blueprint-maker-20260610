// supabase/functions/extract-design-tokens/index.ts
//
// POST { url: string, html?: string }  →  TokenResult (see core.ts)
//
// Downloads a site's real stylesheets (linked, preloaded, @imported) and
// measures its colours, fonts, type scale, spacing and design tokens.
// The response includes `digest`: a compact Markdown block that the
// design.md prompt uses as ground truth.
//
// Security: requires a signed-in Supabase user, blocks private/internal
// addresses (SSRF), caps size and time of every download.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { extractDesignTokens, hostIsBlockedLiteral, validateUrl } from "./core.ts";

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

function ipIsPrivate(ip: string): boolean {
  return hostIsBlockedLiteral(ip);
}

// true = blocked. Resolves DNS so public hostnames pointing at private IPs are refused.
const dnsCache = new Map<string, boolean>();
async function hostCheck(hostname: string): Promise<boolean> {
  if (hostIsBlockedLiteral(hostname)) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(":")) return false;
  const cached = dnsCache.get(hostname);
  if (cached !== undefined) return cached;
  let blocked = false;
  try {
    const [a, aaaa] = await Promise.all([
      Deno.resolveDns(hostname, "A").catch(() => [] as string[]),
      Deno.resolveDns(hostname, "AAAA").catch(() => [] as string[]),
    ]);
    blocked = [...a, ...aaaa].some(ipIsPrivate);
  } catch {
    // resolveDns unavailable in this runtime — literal checks above still apply
  }
  dnsCache.set(hostname, blocked);
  return blocked;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // ── Auth: only signed-in users of this app ──
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Not signed in" }, 401);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) return json({ error: "Not signed in" }, 401);

  // ── Input ──
  let body: { url?: unknown; html?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON: { url, html? }" }, 400);
  }
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const html = typeof body.html === "string" ? body.html : undefined;
  if (!url || !validateUrl(url)) {
    return json({ error: "Enter a public http(s) URL, for example https://example.com" }, 400);
  }
  if (await hostCheck(new URL(url).hostname)) {
    return json({ error: "This address points to a private network and can't be analysed." }, 400);
  }

  try {
    const result = await extractDesignTokens({ pageUrl: url, html, fetchImpl: fetch, hostCheck });
    return json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: `Design token extraction failed: ${message}` }, 500);
  }
});
