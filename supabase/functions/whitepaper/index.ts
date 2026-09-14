// White paper request handler for the Adoption Tree Model site.
// Takes an email from the site's form, records it, and returns a 15-minute signed link to the PDF
// in the private "whitepaper" Storage bucket. Deployed with JWT verification off: the browser form
// carries no token. Allowed origins are listed below; ALLOWED_ORIGINS (comma separated) overrides them.
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "whitepaper";
const OBJECT = "The_Adoption_Tree_Model_White_Paper_v1.0.pdf";
const LINK_SECONDS = 900;
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 10;
const RETENTION_DAYS = 90;
const NOTICE_VERSION = "2026-09-14";
const BODY_LIMIT = 8192;
const DEFAULT_ORIGINS = [
  "https://adoptiontree.ai",
  "https://www.adoptiontree.ai",
  "https://willembuilds.github.io",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
];

function secretKey(): string {
  const bundle = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (bundle) {
    try { const key = JSON.parse(bundle)?.default; if (typeof key === "string" && key) return key; } catch { /* fall through */ }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = secretKey();
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? DEFAULT_ORIGINS.join(","))
  .split(",").map((s) => s.trim()).filter(Boolean);
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

export function validEmail(email: unknown): email is string {
  if (typeof email !== "string" || email.length > 254 || /\s/.test(email)) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return local.length > 0 && local.length <= 64 && !local.startsWith(".") && !local.endsWith(".") && !local.includes("..") &&
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) &&
    domain.includes(".") && domain.length <= 253 &&
    domain.split(".").every((label) => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label));
}

async function clientHash(req: Request): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(serviceKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

function baseHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { "Vary": "Origin", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (origin && allowedOrigins.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "content-type, accept";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = baseHeaders(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const wantsJson = (req.headers.get("accept") ?? "").includes("application/json");
  const fail = (status: number, message: string, extra: Record<string, string> = {}) => {
    const h = { ...headers, ...extra };
    return wantsJson
      ? new Response(JSON.stringify({ error: message }), { status, headers: { ...h, "Content-Type": "application/json; charset=utf-8" } })
      : new Response(message + "\n", { status, headers: { ...h, "Content-Type": "text/plain; charset=utf-8" } });
  };

  if (req.method !== "POST") return fail(405, "Use the email form to request access.", { Allow: "POST, OPTIONS" });
  if (origin && !allowedOrigins.includes(origin)) return fail(403, "Please submit this form from the website.");
  if (Number(req.headers.get("content-length") ?? 0) > BODY_LIMIT) return fail(413, "This request is too large.");

  let body: Record<string, unknown>;
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim();
  try {
    if (type === "application/json") body = await req.json();
    else if (type === "application/x-www-form-urlencoded") body = Object.fromEntries(new URLSearchParams(await req.text()));
    else return fail(415, "Please use the email form to request a download.");
  } catch {
    return fail(400, "Please check your email address and try again.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "Please check your email address and try again.");

  // Rate limit per client, keyed on an HMAC of the address so no raw addresses are stored.
  const hash = await clientHash(req);
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error: countError } = await supabase.from("whitepaper_attempts")
    .select("*", { count: "exact", head: true }).eq("ip_hash", hash).gte("attempted_at", since);
  if (countError) { console.error("rate limit lookup failed"); return fail(503, "Download access is temporarily unavailable. Please try again shortly."); }
  if ((count ?? 0) >= MAX_ATTEMPTS) return fail(429, "Too many requests. Please try again in 15 minutes.", { "Retry-After": "900" });
  await supabase.from("whitepaper_attempts").insert({ ip_hash: hash });

  if (body.company_website) return fail(400, "We could not process this request. Please try again.");
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!validEmail(email)) return fail(400, "Please enter a valid email address.");

  // One row per email; a repeat request refreshes the timestamp. Retention is enforced on every write.
  const { error: storeError } = await supabase.from("whitepaper_requests")
    .upsert({ email, requested_at: new Date().toISOString(), notice_version: NOTICE_VERSION, purpose: "whitepaper-request" }, { onConflict: "email" });
  if (storeError) { console.error("request could not be stored"); return fail(503, "Download access is temporarily unavailable. Please try again shortly."); }
  await supabase.from("whitepaper_requests").delete().lt("requested_at", new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString());
  await supabase.from("whitepaper_attempts").delete().lt("attempted_at", new Date(Date.now() - 4 * WINDOW_MS).toISOString());

  const { data, error: signError } = await supabase.storage.from(BUCKET).createSignedUrl(OBJECT, LINK_SECONDS, { download: OBJECT });
  if (signError || !data?.signedUrl) { console.error("signed link could not be created"); return fail(503, "Download access is temporarily unavailable. Please try again shortly."); }

  if (wantsJson) {
    return new Response(JSON.stringify({ downloadUrl: data.signedUrl, expiresIn: LINK_SECONDS }), { status: 200, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
  }
  // Native form submission without JavaScript: send the browser straight to the download.
  return new Response(null, { status: 303, headers: { ...headers, Location: data.signedUrl } });
});
