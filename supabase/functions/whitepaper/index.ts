// Whitepaper funnel for the Adoption Tree™ Model site.
//   POST /            request access: first name, work email, consent. Stores the lead, emails a personal link.
//   GET  /access      redeems a short access code (?k=, 7 days) or a legacy signed token for a short-lived signed
//                     Storage URL. Answers JSON to the reader page on adoptiontree.ai, and redirects otherwise.
//   GET  /unsubscribe sends the reader to the confirmation page on the site; POST (from that page, or RFC 8058
//                     one-click from a mail client) marks the address unsubscribed.
//   GET  /policy      the email deny list, so the browser validates against the same file as the server.
//   POST /digest      emails the owner what happened in the last N hours plus the full requester list. Called by
//                     the database's daily cron job (pg_net) with the whitepaper_digest_secret as bearer token.
// Deployed with JWT verification off: the browser form carries no token. Secrets come from function
// secrets (Deno.env) or, as a fallback, from Vault through the whitepaper_secret() function.
import { createClient } from "npm:@supabase/supabase-js@2";
import policy from "./email-policy.json" with { type: "json" };
import { clean, consentGiven, emailDomain, hasAttribution, inferredCompany, isBlockedDomain, normalizeEmail, normalizeName, POLICY_VERSION, readAttribution, validEmail, validFirstName } from "./policy.ts";

const BUCKET = "whitepaper";
const OBJECT = "The_Adoption_Tree_Model_Whitepaper_v1.1.pdf";
const STORAGE_LINK_SECONDS = 600;
const ACCESS_LINK_MS = 7 * 86_400_000;
// 32 unambiguous characters, no l/o/0/1, so a code survives being read aloud or copied by hand.
// 12 characters is 2^60 combinations, and the per-client rate limit below makes guessing pointless.
const CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const CODE_LENGTH = 12;
const CODE_PATTERN = /^[a-z2-9]{12}$/;
const UNSUB_LINK_MS = 730 * 86_400_000; // as long as the record itself is kept
const RESEND_COOLDOWN_MS = 60_000;
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 30; // per client address; shared corporate egress is common
const ADDRESS_DAILY_CAP = 5; // emails per address per day
const DOMAIN_DAILY_CAP = 50; // distinct addresses mailed per email domain per day
const DAILY_SEND_CAP = 200; // emails per day in total, protects the sending domain and the provider quota
const FLOOR_MS = 900; // every accepted request takes at least this long, whether or not an email went out
const PROVIDER_BACKOFF_MS = 5 * 60_000; // after a failed send, every request reports the failure for this long
const SECRET_TTL_MS = 60_000;
const BODY_LIMIT = 8192;
const CONSENT_VERSION = "2026-09-23";
const CONSENT_TEXT = "I agree that The Adoption Tree™ may contact me by email regarding the whitepaper, its application within my organization, related research and AI adoption services. I can unsubscribe at any time.";
const DEFAULT_ORIGINS = [
  "https://adoptiontree.ai",
  "https://www.adoptiontree.ai",
  "https://willembuilds.github.io",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
];
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://adoptiontree.ai").replace(/\/$/, "");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "The Adoption Tree™ <willem@adoptiontree.ai>";
const EMAIL_REPLY_TO = Deno.env.get("EMAIL_REPLY_TO") ?? "willem@adoptiontree.ai";
const DIGEST_TO = Deno.env.get("DIGEST_TO") ?? "willem@adoptiontree.ai";
const DIGEST_ZONE = "Europe/Amsterdam";

function serviceKey(): string {
  const bundle = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (bundle) {
    try { const key = JSON.parse(bundle)?.default; if (typeof key === "string" && key) return key; } catch { /* fall through */ }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey(), { auth: { persistSession: false } });
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? DEFAULT_ORIGINS.join(",")).split(",").map((s) => s.trim()).filter(Boolean);

// ---------- secrets ----------
const secretCache = new Map<string, { value: string; at: number }>();
async function secret(name: string): Promise<string> {
  const fromEnv = Deno.env.get(name);
  if (fromEnv) return fromEnv;
  const cached = secretCache.get(name);
  if (cached && Date.now() - cached.at < SECRET_TTL_MS) return cached.value;
  const { data, error } = await supabase.rpc("whitepaper_secret", { name });
  if (error || typeof data !== "string" || !data) return cached?.value ?? "";
  secretCache.set(name, { value: data, at: Date.now() });
  return data;
}

// ---------- signed links ----------
const enc = new TextEncoder();
const b64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4)), (c) => c.charCodeAt(0));
// Access and unsubscribe links are signed with different keys, so rotating the access key never breaks the
// unsubscribe links in emails that have already been delivered.
async function hmacKey(kind: "access" | "unsub"): Promise<CryptoKey | null> {
  const value = await secret(kind === "access" ? "whitepaper_access_secret" : "whitepaper_unsub_secret");
  if (!value) return null;
  return crypto.subtle.importKey("raw", enc.encode(value), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function makeToken(kind: "access" | "unsub", leadId: string, ttlMs: number): Promise<string | null> {
  const key = await hmacKey(kind);
  if (!key) return null;
  const payload = b64u(enc.encode(JSON.stringify({ t: kind, l: leadId, e: Date.now() + ttlMs, n: b64u(crypto.getRandomValues(new Uint8Array(9))) })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
  return payload + "." + b64u(sig);
}
/** 256 divides evenly by the 32 character alphabet, so masking the byte introduces no bias. */
function makeAccessCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b & 31];
  return out;
}
/** Stores a fresh code for this lead, retrying only on the (vanishingly unlikely) collision. */
async function issueAccessCode(leadId: string): Promise<string | null> {
  const expiresAt = new Date(Date.now() + ACCESS_LINK_MS).toISOString();
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = makeAccessCode();
    const { error } = await supabase.from("whitepaper_access_codes").insert({ code, lead_id: leadId, expires_at: expiresAt });
    if (!error) return code;
    if (error.code !== "23505") { console.error("access code insert failed"); return null; }
  }
  console.error("access code collided three times");
  return null;
}
async function readToken(token: string | null, kind: "access" | "unsub"): Promise<string | null> {
  if (!token || token.length > 600 || !/^[\w-]+\.[\w-]+$/.test(token)) return null;
  const [payload, sig] = token.split(".");
  const key = await hmacKey(kind);
  if (!key) return null;
  let ok = false;
  try { ok = await crypto.subtle.verify("HMAC", key, unb64u(sig), enc.encode(payload)); } catch { ok = false; }
  if (!ok) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(unb64u(payload)));
    if (p?.t !== kind || typeof p.l !== "string" || !/^[0-9a-f-]{36}$/.test(p.l) || !(typeof p.e === "number" && p.e > Date.now())) return null;
    return p.l;
  } catch { return null; }
}

// ---------- helpers ----------
async function clientHash(req: Request): Promise<string> {
  // Cloudflare fronts the function and sets cf-connecting-ip itself; x-forwarded-for can be supplied by the caller.
  const ip = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? (req.headers.get("x-forwarded-for") ?? "").split(",").pop() ?? "").trim() || "unknown";
  const key = await crypto.subtle.importKey("raw", enc.encode(serviceKey()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(ip)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function lookup(domain: string, type: "MX" | "A"): Promise<"yes" | "no" | "nullmx" | "unknown"> {
  try {
    const r = await Deno.resolveDns(domain, type, { signal: AbortSignal.timeout(1500) });
    // RFC 7505: a single MX of "." says the domain accepts no mail at all.
    if (type === "MX" && r.length === 1 && ["", "."].includes((r as Deno.MxRecord[])[0].exchange)) return "nullmx";
    return r.length > 0 ? "yes" : "no";
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return "no";
    console.error("dns " + type + " lookup unavailable: " + (e instanceof Error ? e.name : "error"));
    return "unknown";
  }
}
/** Rejects domains that provably cannot receive mail; passes when DNS itself is unavailable. */
async function domainAcceptsMail(domain: string): Promise<boolean> {
  const mx = await lookup(domain, "MX");
  if (mx === "nullmx") return false;
  if (mx !== "no") return true;
  return (await lookup(domain, "A")) !== "no";
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function baseHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { "Vary": "Origin", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
  if (origin && allowedOrigins.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "content-type, accept";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const redirect = (to: string, headers: Record<string, string>) => new Response(null, { status: 302, headers: { ...headers, Location: to } });
/** Content-Length is required, so a body can never be streamed past the limit before it is counted. */
const bodyLength = (req: Request): number | null => { const v = req.headers.get("content-length"); return v !== null && /^\d{1,7}$/.test(v) ? Number(v) : null; };
/** A request that never became a lead. Domain part only, never the address: it shows typos and abuse, nothing personal. */
async function logRejection(reason: string, domain: string | null = null) {
  await supabase.from("whitepaper_rejections").insert({ reason, email_domain: domain });
}
async function logEvent(leadId: string, kind: string, attribution: Record<string, string | null> | null = null) {
  await supabase.from("whitepaper_events").insert({ lead_id: leadId, kind, ...(attribution ?? {}) });
}

// ---------- email ----------
let providerDownUntil = 0;
async function postToProvider(apiKey: string, payload: unknown): Promise<Response> {
  const call = () => fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  let res = await call();
  if (res.status === 429) { await sleep(1200); res = await call(); } // the provider's own burst limit is not an outage
  return res;
}
async function sendAccessEmail(lead: { email: string; first_name: string }, accessUrl: string, unsubUrl: string, oneClickUrl: string): Promise<boolean> {
  const apiKey = await secret("RESEND_API_KEY");
  if (!apiKey) { console.error("email provider is not configured"); return false; }
  const name = lead.first_name || "there";
  const subject = "Your access to The Adoption Tree™ whitepaper";
  const text = `Hi ${name},\n\nHere is your personal access to The Adoption Tree™ whitepaper, version 1.1 (43 pages):\n\n${accessUrl}\n\nThe link is valid for 7 days and opens the PDF directly.\n\nWillem Knaap\nThe Adoption Tree™ · ${SITE_URL}\n\nYou receive this email because you requested the whitepaper on ${SITE_URL.replace(/^https?:\/\//, "")} and agreed to be contacted about it. Unsubscribe from further contact: ${unsubUrl}\n`;
  const html = `<!DOCTYPE html><html lang="en"><body style="margin:0;background:#F4F2ED;font-family:Archivo,Helvetica,Arial,sans-serif;color:#0C0D12"><div style="max-width:560px;margin:0 auto;padding:40px 24px"><p style="font-family:'IBM Plex Mono',Menlo,monospace;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#FF5C1F;margin:0 0 20px">The Adoption Tree™ · whitepaper</p><p style="font-size:17px;line-height:1.6;margin:0 0 16px">Hi ${escapeHtml(name)},</p><p style="font-size:17px;line-height:1.6;margin:0 0 24px">Here is your personal access to <strong>The Adoption Tree™ whitepaper</strong>, version 1.1, 43 pages including the five working tools.</p><p style="margin:0 0 28px"><a href="${accessUrl}" style="display:inline-block;background:#FF5C1F;color:#0C0D12;font-family:'IBM Plex Mono',Menlo,monospace;font-size:12px;letter-spacing:.16em;text-transform:uppercase;text-decoration:none;padding:14px 22px;border-radius:999px">Open the whitepaper</a></p><p style="font-size:14px;line-height:1.6;color:#4A4A52;margin:0 0 24px">The link is valid for 7 days and opens the PDF directly. If the button does not work, copy this address into your browser:<br><span style="word-break:break-all">${accessUrl}</span></p><p style="font-size:15px;line-height:1.6;margin:0 0 32px">Willem Knaap<br><a href="${SITE_URL}" style="color:#0C0D12">${SITE_URL.replace(/^https?:\/\//, "")}</a></p><p style="font-size:12px;line-height:1.6;color:#66666E;border-top:1px solid #D8D2C4;padding-top:16px;margin:0">You receive this email because you requested the whitepaper on ${SITE_URL.replace(/^https?:\/\//, "")} and agreed to be contacted about it. <a href="${unsubUrl}" style="color:#66666E">Unsubscribe from further contact</a>.</p></div></body></html>`;
  try {
    const res = await postToProvider(apiKey, { from: EMAIL_FROM, to: [lead.email], reply_to: EMAIL_REPLY_TO, subject, text, html, headers: { "List-Unsubscribe": `<${oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
    if (!res.ok) { console.error("email send failed with status " + res.status); providerDownUntil = Date.now() + PROVIDER_BACKOFF_MS; return false; }
    providerDownUntil = 0;
    return true;
  } catch { console.error("email send failed"); providerDownUntil = Date.now() + PROVIDER_BACKOFF_MS; return false; }
}

// ---------- owner digest ----------
const stamp = (iso: string | null) => iso ? new Date(iso).toLocaleString("en-GB", { timeZone: DIGEST_ZONE, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).replace(",", " ·") : "";
const sameSecret = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
type Lead = { id: string; first_name: string; email: string; organization: string | null; inferred_company: string | null; status: string; created_at: string; download_count: number; last_accessed_at: string | null; last_requested_at: string | null };
/** One email: what moved in the window, then every requester. Returns null when nothing moved and force is off. */
async function buildDigest(hours: number, force: boolean): Promise<{ subject: string; text: string; html: string; requests: number; downloads: number } | null> {
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const { data: events } = await supabase.from("whitepaper_events").select("lead_id,kind,created_at").gte("created_at", since).in("kind", ["requested", "accessed", "unsubscribed"]).order("created_at", { ascending: false }).limit(2000);
  const { data: leads } = await supabase.from("whitepaper_leads").select("id,first_name,email,organization,inferred_company,status,created_at,download_count,last_accessed_at,last_requested_at").order("last_requested_at", { ascending: false }).limit(500);
  const all = (leads ?? []) as Lead[];
  const byId = new Map(all.map((l) => [l.id, l]));
  const moved = new Map<string, { requests: number; downloads: number; unsubscribed: boolean; last: string }>();
  for (const e of events ?? []) {
    const m = moved.get(e.lead_id) ?? { requests: 0, downloads: 0, unsubscribed: false, last: e.created_at };
    if (e.kind === "requested") m.requests++; else if (e.kind === "accessed") m.downloads++; else m.unsubscribed = true;
    moved.set(e.lead_id, m);
  }
  const requests = [...moved.values()].reduce((n, m) => n + m.requests, 0);
  const downloads = [...moved.values()].reduce((n, m) => n + m.downloads, 0);
  if (!moved.size && !force) return null;
  const org = (l: Lead) => l.organization ?? l.inferred_company ?? "";
  const who = (l: Lead) => `${l.first_name || "(no name)"} · ${l.email}${org(l) ? " · " + org(l) : ""}`;
  const windowLabel = hours === 24 ? "the last 24 hours" : `the last ${hours} hours`;
  const today = new Date().toLocaleDateString("en-GB", { timeZone: DIGEST_ZONE, weekday: "short", day: "2-digit", month: "short" });
  const subject = `Whitepaper · ${requests} request${requests === 1 ? "" : "s"}, ${downloads} download${downloads === 1 ? "" : "s"} · ${today}`;
  const movedLines: string[] = [];
  for (const [id, m] of moved) {
    const l = byId.get(id); if (!l) continue;
    const bits = [m.requests ? `${m.requests} request${m.requests === 1 ? "" : "s"}` : "", m.downloads ? `${m.downloads} download${m.downloads === 1 ? "" : "s"}` : "", m.unsubscribed ? "unsubscribed" : ""].filter(Boolean).join(", ");
    movedLines.push(`${who(l)} · ${bits} · ${stamp(m.last)}`);
  }
  const text = [
    `What moved in ${windowLabel}`, ...(movedLines.length ? movedLines : ["Nothing."]), "",
    `All requesters (${all.length})`,
    ...all.map((l) => `${who(l)} · requested ${stamp(l.created_at)} · ${l.download_count} download${l.download_count === 1 ? "" : "s"}${l.last_accessed_at ? ", last " + stamp(l.last_accessed_at) : ""}${l.status !== "active" ? " · " + l.status : ""}`),
    "", `Full detail: Supabase dashboard, view whitepaper_leads_overview.`,
  ].join("\n");
  const cell = (v: string, extra = "") => `<td style="padding:6px 10px;border-bottom:1px solid #D8D2C4;font-size:13px;vertical-align:top;${extra}">${escapeHtml(v)}</td>`;
  const row = (l: Lead, bits: string) => `<tr>${cell(l.first_name || "(no name)")}${cell(l.email)}${cell(org(l))}${cell(bits, "white-space:nowrap")}</tr>`;
  const head = `<tr><th style="text-align:left;padding:6px 10px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7A7A82">Name</th><th style="text-align:left;padding:6px 10px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7A7A82">Email</th><th style="text-align:left;padding:6px 10px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7A7A82">Organization</th><th style="text-align:left;padding:6px 10px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7A7A82">Activity</th></tr>`;
  const movedRows = [...moved].map(([id, m]) => { const l = byId.get(id); if (!l) return ""; const bits = [m.requests ? `${m.requests} request${m.requests === 1 ? "" : "s"}` : "", m.downloads ? `${m.downloads} download${m.downloads === 1 ? "" : "s"}` : "", m.unsubscribed ? "unsubscribed" : ""].filter(Boolean).join(", "); return row(l, `${bits} · ${stamp(m.last)}`); }).join("");
  const allRows = all.map((l) => row(l, `requested ${stamp(l.created_at)} · ${l.download_count} download${l.download_count === 1 ? "" : "s"}${l.last_accessed_at ? ", last " + stamp(l.last_accessed_at) : ""}${l.status !== "active" ? " · " + l.status : ""}`)).join("");
  const html = `<!DOCTYPE html><html lang="en"><body style="margin:0;background:#F4F2ED;font-family:Archivo,Helvetica,Arial,sans-serif;color:#0C0D12"><div style="max-width:760px;margin:0 auto;padding:32px 20px"><p style="font-family:'IBM Plex Mono',Menlo,monospace;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#FF5C1F;margin:0 0 18px">The Adoption Tree™ · whitepaper digest</p><h2 style="font-size:17px;margin:0 0 10px">What moved in ${escapeHtml(windowLabel)}</h2>${movedRows ? `<table style="border-collapse:collapse;width:100%">${head}${movedRows}</table>` : `<p style="font-size:14px;margin:0 0 10px">Nothing.</p>`}<h2 style="font-size:17px;margin:28px 0 10px">All requesters (${all.length})</h2><table style="border-collapse:collapse;width:100%">${head}${allRows}</table><p style="font-size:12px;line-height:1.6;color:#66666E;border-top:1px solid #D8D2C4;padding-top:14px;margin:28px 0 0">Sent every morning when something moved. Full detail: Supabase dashboard, view whitepaper_leads_overview.</p></div></body></html>`;
  return { subject, text, html, requests, downloads };
}

// ---------- handler ----------
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = baseHeaders(origin);
  const url = new URL(req.url);
  const route = url.pathname.replace(/^.*?\/whitepaper/, "") || "/";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  if (route === "/policy" && req.method === "GET") {
    return new Response(JSON.stringify(policy), { status: 200, headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" } });
  }

  if (route === "/access" && req.method === "GET") {
    // Two ways in. A short code (?k=) from the reader page on the site, which is what emails carry now, and a
    // legacy signed token from links already in someone's inbox. The reader page asks for JSON; anything else
    // (a pasted address, a mail client that follows the plain link) is answered with a redirect, as before.
    const asJson = url.searchParams.get("format") === "json";
    const code = (url.searchParams.get("k") ?? "").trim().toLowerCase();
    const deny = (state: "expired" | "unavailable") =>
      asJson
        ? new Response(JSON.stringify({ error: state }), { status: state === "expired" ? 410 : 503, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } })
        : redirect(`${SITE_URL}/?access=${state}#whitepaper`, headers);

    let leadId: string | null = null;
    if (code) {
      // Guessing is bounded here, not just by the size of the code space. Only failed lookups cost budget, so
      // someone rereading their own paper is never locked out while someone trying codes is.
      const hash = await clientHash(req);
      const { count: tried } = await supabase.from("whitepaper_attempts").select("*", { count: "exact", head: true }).eq("ip_hash", hash).gte("attempted_at", new Date(Date.now() - WINDOW_MS).toISOString());
      if ((tried ?? 0) > MAX_ATTEMPTS) return deny("expired");
      if (CODE_PATTERN.test(code)) {
        const { data: row } = await supabase.from("whitepaper_access_codes").select("code,lead_id,expires_at,revoked_at,used_count").eq("code", code).maybeSingle();
        if (row && !row.revoked_at && new Date(row.expires_at) > new Date()) {
          leadId = row.lead_id;
          await supabase.from("whitepaper_access_codes").update({ used_count: (row.used_count ?? 0) + 1, last_used_at: new Date().toISOString() }).eq("code", code);
        }
      }
      if (!leadId) { await supabase.from("whitepaper_attempts").insert({ ip_hash: hash }); return deny("expired"); }
    } else {
      if (!(await hmacKey("access"))) { console.error("signing secret is not available"); return deny("unavailable"); }
      leadId = await readToken(url.searchParams.get("token"), "access");
      if (!leadId) return deny("expired");
    }

    const { data: lead } = await supabase.from("whitepaper_leads").select("id,status,accessed_at,download_count").eq("id", leadId).maybeSingle();
    if (!lead || lead.status === "suppressed") return deny("expired");
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(OBJECT, STORAGE_LINK_SECONDS);
    if (error || !data?.signedUrl) { console.error("signed link could not be created"); return deny("unavailable"); }
    const now = new Date().toISOString();
    await supabase.from("whitepaper_leads").update({ accessed_at: lead.accessed_at ?? now, last_accessed_at: now, download_count: (lead.download_count ?? 0) + 1, updated_at: now }).eq("id", leadId);
    await logEvent(leadId, "accessed");
    if (asJson) return new Response(JSON.stringify({ url: data.signedUrl }), { status: 200, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
    return redirect(data.signedUrl, headers);
  }

  if (route === "/unsubscribe" && (req.method === "GET" || req.method === "POST")) {
    // A GET never changes anything: it sends the reader to the confirmation page on the site, so mail security
    // scanners that open every link in an email cannot unsubscribe anyone. That page posts the token back here;
    // RFC 8058 one-click unsubscribe from mail clients posts too. (Functions cannot serve HTML themselves.)
    const len = bodyLength(req);
    const form = req.method === "POST" && len !== null && len <= 1024 ? new URLSearchParams(await req.text()) : new URLSearchParams();
    const fromPage = form.has("confirm");
    const plain = (status: number, text: string) => new Response(text + "\n", { status, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
    if (!(await hmacKey("unsub"))) {
      console.error("signing secret is not available");
      return req.method === "GET" || fromPage ? redirect(`${SITE_URL}/?unsubscribed=unavailable#whitepaper`, headers) : plain(503, "Temporarily unavailable, please try again later.");
    }
    const token = url.searchParams.get("token") ?? form.get("token");
    const leadId = await readToken(token, "unsub");
    if (req.method === "GET") return redirect(leadId ? `${SITE_URL}/unsubscribe.html?token=${token}` : `${SITE_URL}/?unsubscribed=0#whitepaper`, headers);
    if (!leadId) return fromPage ? redirect(`${SITE_URL}/?unsubscribed=0#whitepaper`, headers) : plain(400, "This unsubscribe link is not valid.");
    const now = new Date().toISOString();
    // The page can also block access emails altogether, for someone whose address was entered by another person.
    const status = form.has("block") ? "suppressed" : "unsubscribed";
    await supabase.from("whitepaper_leads").update({ status, unsubscribed_at: now, updated_at: now }).eq("id", leadId).neq("status", "suppressed");
    await logEvent(leadId, "unsubscribed");
    if (fromPage) return redirect(`${SITE_URL}/?unsubscribed=1#whitepaper`, headers);
    return plain(200, "Unsubscribed");
  }

  if (route === "/digest" && req.method === "POST") {
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
    const expected = await secret("whitepaper_digest_secret");
    const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!expected || !sameSecret(given, expected)) return json(401, { error: "unauthorized" });
    const len = bodyLength(req);
    let opts: Record<string, unknown> = {};
    try { opts = len !== null && len > 0 && len <= 512 ? await req.json() : {}; } catch { opts = {}; }
    const hours = Math.min(720, Math.max(1, Number(opts.hours) || 24));
    const force = opts.force === true;
    const digest = await buildDigest(hours, force);
    if (!digest) return json(200, { sent: false, reason: "nothing moved", hours });
    const apiKey = await secret("RESEND_API_KEY");
    if (!apiKey) return json(503, { error: "email provider is not configured" });
    const res = await postToProvider(apiKey, { from: EMAIL_FROM, to: [DIGEST_TO], reply_to: EMAIL_REPLY_TO, subject: digest.subject, text: digest.text, html: digest.html });
    if (!res.ok) { console.error("digest send failed with status " + res.status); return json(502, { error: "send failed", status: res.status }); }
    return json(200, { sent: true, to: DIGEST_TO, hours, requests: digest.requests, downloads: digest.downloads });
  }

  const wantsJson = (req.headers.get("accept") ?? "").includes("application/json");
  const fail = (status: number, message: string, extra: Record<string, string> = {}) => {
    const h = { ...headers, ...extra };
    return wantsJson
      ? new Response(JSON.stringify({ error: message }), { status, headers: { ...h, "Content-Type": "application/json; charset=utf-8" } })
      : new Response(message + "\n", { status, headers: { ...h, "Content-Type": "text/plain; charset=utf-8" } });
  };
  if (route !== "/" || req.method !== "POST") return fail(405, "Use the form on the website to request access.", { Allow: "POST, OPTIONS" });
  if (origin && !allowedOrigins.includes(origin)) return fail(403, "Please submit this form from the website.");
  const length = bodyLength(req);
  if (length === null) return fail(411, "Please use the form on the website to request access.");
  if (length > BODY_LIMIT) return fail(413, "This request is too large.");

  const started = Date.now();
  let body: Record<string, unknown>;
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim();
  try {
    if (type === "application/json") body = await req.json();
    else if (type === "application/x-www-form-urlencoded") body = Object.fromEntries(new URLSearchParams(await req.text()));
    else return fail(415, "Please use the form on the website to request access.");
  } catch { return fail(400, "Please check your details and try again."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "Please check your details and try again.");

  // Rate limit per client on an HMAC of the address. The attempt is recorded before it is counted, so a burst
  // cannot slip past the count; the scheduled retention job (whitepaper_retention) prunes the hashes after an hour.
  const hash = await clientHash(req);
  const { error: attemptError } = await supabase.from("whitepaper_attempts").insert({ ip_hash: hash });
  if (attemptError) { console.error("rate limit record failed"); return fail(503, "Access is temporarily unavailable. Please try again shortly."); }
  const { data: recent, error: countError } = await supabase.from("whitepaper_attempts").select("attempted_at").eq("ip_hash", hash).gte("attempted_at", new Date(Date.now() - WINDOW_MS).toISOString()).limit(MAX_ATTEMPTS + 1);
  if (countError) { console.error("rate limit lookup failed"); return fail(503, "Access is temporarily unavailable. Please try again shortly."); }
  if ((recent?.length ?? 0) > MAX_ATTEMPTS) return fail(429, "Too many requests. Please try again in 15 minutes.", { "Retry-After": "900" });

  if (body.company_website) return fail(400, "We could not process this request. Please try again.");
  const firstName = normalizeName(clean(body.first_name, 40));
  const email = normalizeEmail(body.email);
  const domain = emailDomain(email);
  if (!validFirstName(firstName)) { await logRejection("invalid_name", validEmail(email) ? domain : null); return fail(400, "Please enter your first name (letters only, up to 40 characters)."); }
  if (!validEmail(email)) { await logRejection("invalid_email"); return fail(400, "Please enter a valid email address."); }
  // Consumer addresses are welcome. Disposable and relay domains are not, and neither is a domain that cannot receive mail.
  if (isBlockedDomain(domain)) { await logRejection("blocked_domain", domain); return fail(400, "Please enter an email address we can send your access link to."); }
  if (!(await domainAcceptsMail(domain))) { await logRejection("undeliverable_domain", domain); return fail(400, "Please enter an email address we can send your access link to."); }
  if (!consentGiven(body.consent)) { await logRejection("no_consent", domain); return fail(400, "Please confirm the consent box to receive the whitepaper."); }
  const organization = clean(body.organization, 80) || null;
  const attribution = readAttribution(body);
  const now = new Date().toISOString();
  const unavailable = "Access is temporarily unavailable. Please try again shortly.";

  // Caps are checked before anything is stored and identically for every valid request, so a full cap never says
  // anything about one address. The per-domain cap bounds bounces from invented mailboxes at a real company.
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { count: total, error: totalError } = await supabase.from("whitepaper_events").select("*", { count: "exact", head: true }).eq("kind", "email_sent").gte("created_at", dayAgo);
  if (totalError) { console.error("send cap lookup failed"); return fail(503, unavailable); }
  if ((total ?? 0) >= DAILY_SEND_CAP) { console.error("daily send cap reached"); return fail(503, unavailable); }
  const { count: forDomain, error: domainError } = await supabase.from("whitepaper_leads").select("*", { count: "exact", head: true }).eq("email_domain", domain).gte("last_sent_at", dayAgo);
  if (domainError) { console.error("domain cap lookup failed"); return fail(503, unavailable); }
  if ((forDomain ?? 0) >= DOMAIN_DAILY_CAP) { console.error("domain send cap reached for " + domain); return fail(503, unavailable); }

  // One row per email. The stored name and consent evidence belong to the first submission; a later request from
  // anyone who knows the address only counts as a request, keeps first-touch attribution, and never changes an
  // unsubscribed or suppressed status. Rows that never consented (carried over from v1) are completed.
  const LEAD_COLUMNS = "id,status,first_name,inferred_company,organization,consent_given,request_count,last_sent_at,send_count,utm_source,referrer";
  const lookupLead = () => supabase.from("whitepaper_leads").select(LEAD_COLUMNS).eq("email", email).maybeSingle();
  let { data: existing, error: lookupError } = await lookupLead();
  if (lookupError) { console.error("lead lookup failed"); return fail(503, unavailable); }
  let leadId = "";
  let isNew = false;
  if (!existing) {
    const { data: inserted, error } = await supabase.from("whitepaper_leads").insert({ email, email_domain: domain, inferred_company: inferredCompany(domain), organization, first_name: firstName, consent_given: true, consent_version: CONSENT_VERSION, consent_text: CONSENT_TEXT, consent_at: now, source: "website", last_requested_at: now, ...attribution }).select("id").single();
    if (error?.code === "23505") {
      // A parallel request stored the address a moment ago: carry on as a repeat request, like any other.
      const again = await lookupLead();
      if (again.error || !again.data) { console.error("lead lookup failed"); return fail(503, unavailable); }
      existing = again.data;
    } else if (error || !inserted) { console.error("lead insert failed"); return fail(503, unavailable); }
    else { leadId = inserted.id; isNew = true; }
  }
  let status = "active";
  let lastSentAt: string | null = null;
  let sendCount = 0;
  if (existing) {
    leadId = existing.id; status = existing.status; lastSentAt = existing.last_sent_at; sendCount = existing.send_count ?? 0;
    const patch: Record<string, unknown> = { request_count: (existing.request_count ?? 0) + 1, last_requested_at: now, updated_at: now };
    if (!existing.first_name) patch.first_name = firstName;
    if (!existing.consent_given) Object.assign(patch, { consent_given: true, consent_version: CONSENT_VERSION, consent_text: CONSENT_TEXT, consent_at: now });
    if (!hasAttribution({ utm_source: existing.utm_source, referrer: existing.referrer })) Object.assign(patch, attribution);
    if (!existing.inferred_company) patch.inferred_company = inferredCompany(domain);
    if (!existing.organization && organization) patch.organization = organization;
    const { error } = await supabase.from("whitepaper_leads").update(patch).eq("id", leadId);
    if (error) { console.error("lead update failed"); return fail(503, unavailable); }
  }

  // Deliver by email unless the address is suppressed, was mailed in the last minute, or has had its daily share.
  // Body and status are the same in all of those cases, and every accepted request takes at least FLOOR_MS, so the
  // form does not tell an outsider whether an address is stored. A provider failure is reported as 503 on purpose
  // (a visitor should not be told to check an inbox that will stay empty), and while the provider is known to be
  // failing, skipped sends report the same 503, so the failure does not describe the address either.
  let send = status !== "suppressed";
  if (send) {
    const { count: toAddress, error } = await supabase.from("whitepaper_events").select("*", { count: "exact", head: true }).eq("lead_id", leadId).eq("kind", "email_sent").gte("created_at", dayAgo);
    if (error) { console.error("address cap lookup failed"); return fail(503, unavailable); }
    if ((toAddress ?? 0) >= ADDRESS_DAILY_CAP) send = false;
  }
  if (send) {
    // Claim the send slot before calling the provider, so parallel requests cannot each send an email.
    const cutoff = new Date(Date.now() - RESEND_COOLDOWN_MS).toISOString().replace(/\.\d{3}Z$/, "Z");
    const { data: claimed, error } = await supabase.from("whitepaper_leads").update({ last_sent_at: now, updated_at: now }).eq("id", leadId).or(`last_sent_at.is.null,last_sent_at.lt.${cutoff}`).select("id");
    if (error) { console.error("send claim failed"); return fail(503, unavailable); }
    if (!claimed?.length) send = false;
  }
  if (isNew || send) await logEvent(leadId, "requested", attribution);
  if (send) {
    const release = () => supabase.from("whitepaper_leads").update({ last_sent_at: lastSentAt }).eq("id", leadId).eq("last_sent_at", now);
    const accessCode = await issueAccessCode(leadId);
    const unsubToken = await makeToken("unsub", leadId, UNSUB_LINK_MS);
    if (!accessCode || !unsubToken) { await release(); console.error("access link could not be prepared"); return fail(503, unavailable); }
    const base = `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/whitepaper`;
    const sent = await sendAccessEmail({ email, first_name: firstName }, `${SITE_URL}/paper/?k=${accessCode}`, `${SITE_URL}/unsubscribe.html?token=${unsubToken}`, `${base}/unsubscribe?token=${unsubToken}`);
    await logEvent(leadId, sent ? "email_sent" : "email_failed");
    if (!sent) { await release(); return fail(503, "We could not send your access email right now. Please try again in a few minutes."); }
    await supabase.from("whitepaper_leads").update({ send_count: sendCount + 1, updated_at: now }).eq("id", leadId);
  } else if (Date.now() < providerDownUntil) {
    return fail(503, "We could not send your access email right now. Please try again in a few minutes.");
  }
  await sleep(Math.max(0, FLOOR_MS - (Date.now() - started)));

  if (wantsJson) return new Response(JSON.stringify({ ok: true, policyVersion: POLICY_VERSION }), { status: 200, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
  return new Response(null, { status: 303, headers: { ...headers, Location: `${SITE_URL}/?sent=1#whitepaper` } });
});
