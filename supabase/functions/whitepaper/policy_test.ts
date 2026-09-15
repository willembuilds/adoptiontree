import { assert, assertEquals } from "jsr:@std/assert@1";
import { consentGiven, emailDomain, hasAttribution, inferredCompany, isBlockedDomain, normalizeName, normalizeEmail, readAttribution, validEmail, validFirstName } from "./policy.ts";

Deno.test("free and disposable providers are blocked, including subdomains", () => {
  for (const d of ["gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "live.com", "msn.com", "yahoo.com", "yahoo.co.uk", "yahoo.nl", "icloud.com", "me.com", "mac.com", "proton.me", "protonmail.com", "aol.com", "gmx.com", "gmx.de", "mail.com", "mailinator.com", "yopmail.com", "10minutemail.com"]) {
    assert(isBlockedDomain(d), d + " should be blocked");
    assert(isBlockedDomain(d.toUpperCase()), d + " should be blocked case-insensitively");
    assert(isBlockedDomain("mail." + d), "subdomain of " + d + " should be blocked");
  }
});

Deno.test("work domains pass", () => {
  for (const d of ["ing.com", "shell.com", "rijksoverheid.nl", "willemknaap.com", "adoptiontree.ai", "gmail.com.example.org"]) {
    assertEquals(isBlockedDomain(d), false, d + " should pass");
  }
});

Deno.test("email is normalized and validated", () => {
  assertEquals(normalizeEmail("  Jan.Jansen@ING.com "), "jan.jansen@ing.com");
  assertEquals(emailDomain("jan.jansen@ing.com"), "ing.com");
  assert(validEmail("jan.jansen@ing.com"));
  for (const bad of ["", "reader", "a@b", "a..b@example.com", "a@-example.com", "x y@example.com", "x@example..com"]) {
    assertEquals(validEmail(bad), false, JSON.stringify(bad));
  }
  assertEquals(normalizeEmail("a\u0000b@example.com"), "ab@example.com");
});

Deno.test("first name accepts real names and rejects markup and links", () => {
  for (const ok of ["Willem", "Jan-Willem", "Zoë", "María José", "O'Neill"]) assert(validFirstName(ok), ok);
  for (const bad of ["", "<script>", "http://x.y", "a@b", "{x}", "x".repeat(81)]) assertEquals(validFirstName(bad), false, bad);
});

Deno.test("consent must be an explicit truthy value", () => {
  for (const yes of [true, "true", "on", "1"]) assert(consentGiven(yes));
  for (const no of [false, "false", "off", "0", "", undefined, null, "yes"]) assertEquals(consentGiven(no), false, String(no));
});

Deno.test("attribution is read, capped and detected", () => {
  const a = readAttribution({ utm_source: "linkedin", utm_campaign: "x".repeat(300), referrer: "https://www.linkedin.com/", landing_url: "https://adoptiontree.ai/?utm_source=linkedin" });
  assertEquals(a.utm_source, "linkedin");
  assertEquals(a.utm_campaign?.length, 200);
  assertEquals(a.utm_medium, null);
  assert(hasAttribution(a));
  assertEquals(hasAttribution(readAttribution({})), false);
});

Deno.test("company is inferred from the domain only", () => {
  assertEquals(inferredCompany("ing.com"), "ing");
  assertEquals(inferredCompany("mail.philips.nl"), "philips");
  assertEquals(inferredCompany("bbc.co.uk"), "bbc");
  assertEquals(inferredCompany("ABN.AMRO.COM"), "amro");
  assertEquals(inferredCompany("localhost"), null);
});

Deno.test("first name must look like a name", () => {
  for (const ok of ["Willem", "Jean-Luc", "O'Neill", "José María", "Zoë", "Søren", "李", "Ana Maria da", "Nguyễn", "محمد", "प्रिया"]) assert(validFirstName(ok), ok);
  for (const bad of ["", "x".repeat(41), "Call 0800 123", "http://x", "<b>hi</b>", "Willem@", "Willem 2", "-Willem", "Bel mij: 06", "one two three four", "a".repeat(25)]) assertEquals(validFirstName(bad), false, bad);
});

Deno.test("names typed on phones are normalised before validation", () => {
  assertEquals(normalizeName("O\u2019Neill"), "O'Neill");
  assertEquals(normalizeName("Mar\u00EDa\u00A0Jos\u00E9"), "Mar\u00EDa Jos\u00E9");
  assertEquals(normalizeName("Jean\u2010Luc"), "Jean-Luc");
  assertEquals(normalizeName("Zo\u00EB\u200B"), "Zo\u00EB");
  for (const ok of ["O\u2019Neill", "D\u2019Souza", "Mar\u00EDa\u00A0Jos\u00E9", "Jean\u2011Luc"]) assert(validFirstName(normalizeName(ok)), ok);
});
