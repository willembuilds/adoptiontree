// Input policy for white paper requests: pure functions, no I/O, shared by the request handler
// and covered by policy_test.ts. The deny list lives in email-policy.json, which the function also
// serves to the browser so client and server validate against one source.
import policy from "./email-policy.json" with { type: "json" };

export const POLICY_VERSION: string = policy.version;
const BLOCKED: Set<string> = new Set([...policy.free, ...policy.disposable].map((d) => d.toLowerCase()));

/** Trim, strip control characters and cap the length of a user-supplied string. */
export function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  let out = "";
  for (const ch of value) { const c = ch.codePointAt(0) ?? 0; if (c > 31 && c !== 127) out += ch; }
  return out.trim().slice(0, max);
}

export function normalizeEmail(value: unknown): string {
  return clean(value, 254).toLowerCase();
}

export function validEmail(email: string): boolean {
  if (typeof email !== "string" || email.length > 254 || /\s/.test(email)) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return local.length > 0 && local.length <= 64 && !local.startsWith(".") && !local.endsWith(".") && !local.includes("..") &&
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) &&
    domain.includes(".") && domain.length <= 253 &&
    domain.split(".").every((label) => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label));
}

export function emailDomain(email: string): string {
  return (email.split("@")[1] ?? "").toLowerCase();
}

/** Free, consumer and disposable providers are blocked, including their subdomains. */
export function isBlockedDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  if (!d) return true;
  if (BLOCKED.has(d)) return true;
  for (const blocked of BLOCKED) if (d.endsWith("." + blocked)) return true;
  return false;
}

/** The organization name is inferred from the domain only: the label before the public suffix, e.g. ing.com -> ing, bbc.co.uk -> bbc. */
const TWO_LEVEL_SUFFIXES = new Set(["co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk", "com.au", "net.au", "org.au", "edu.au", "gov.au", "co.nz", "org.nz", "govt.nz", "co.jp", "or.jp", "ne.jp", "ac.jp", "co.za", "org.za", "com.br", "org.br", "com.mx", "com.sg", "com.hk", "co.in", "co.kr", "com.tr", "com.ar", "com.cn", "com.tw", "co.il", "co.id", "com.my", "com.ph", "com.pk", "com.ng", "com.eg", "com.sa", "co.th", "com.vn", "com.ua", "com.pl", "co.at", "com.pe", "com.co", "com.ve", "com.uy", "com.ec", "com.bo", "com.py", "com.do", "com.gt", "com.sv", "com.hn", "com.ni", "com.pa", "com.pr"]);
export function inferredCompany(domain: string): string | null {
  const labels = domain.toLowerCase().split(".").filter(Boolean);
  if (labels.length < 2) return null;
  const drop = TWO_LEVEL_SUFFIXES.has(labels.slice(-2).join(".")) ? 2 : 1;
  const name = labels[labels.length - drop - 1] ?? null;
  return name && name !== "www" ? name : null;
}

/** Typographic apostrophes, non-breaking spaces and Unicode hyphens, which phones insert on their own, become their plain forms; invisible characters go. */
export function normalizeName(name: string): string {
  return name.replace(/[\u2018\u2019\u02BC\u05F3]/g, "'").replace(/[\u00A0\u2000-\u200A\u202F\u3000]/g, " ").replace(/[\u2010-\u2014\u2212]/g, "-").replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, "").replace(/\s+/g, " ").trim();
}

/** A name: one to three words of letters in any script (with apostrophes, dots and hyphens), each up to 24 characters. Digits, symbols and links are refused, since the name is echoed in the email greeting. */
export function validFirstName(name: string): boolean {
  return /^\p{L}[\p{L}\p{M}'.-]{0,23}( \p{L}[\p{L}\p{M}'.-]{0,23}){0,2}$/u.test(name);
}

/** The consent box arrives as true (JSON), "on" (native form) or "true"/"1" (either). */
export function consentGiven(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === "1";
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export type Attribution = Record<(typeof UTM_KEYS)[number] | "referrer" | "landing_url", string | null>;

export function readAttribution(body: Record<string, unknown>): Attribution {
  const out = {} as Attribution;
  for (const key of UTM_KEYS) out[key] = clean(body[key], 200) || null;
  out.referrer = clean(body.referrer, 500) || null;
  out.landing_url = clean(body.landing_url, 500) || null;
  return out;
}

export function hasAttribution(a: Partial<Attribution> | null | undefined): boolean {
  if (!a) return false;
  return Boolean(a.utm_source || a.utm_medium || a.utm_campaign || a.utm_content || a.utm_term || a.referrer);
}
