# Adoption Tree Model website

A landing page based on Willem Knaap's September 2026, version 1.0 white paper (build 2026-09-14.2).
The original ink, bone and orange design and the animated tree are retained.

## How it is built

- **Site:** plain static files in `docs/` (index.html, privacy.html, unsubscribe.html, css/, js/, assets/,
  favicon.svg, CNAME). Hosted on GitHub Pages from `docs/` on the main branch of a public repository at
  https://adoptiontree.ai; only that folder is published, never the function source or this file. Every push deploys.
  No build step, no dependencies.
- **White paper requests:** supabase/functions/whitepaper, a Supabase Edge Function with four routes. The form
  posts first name, work email and consent; the function validates (syntax, a free and disposable provider deny
  list, a DNS check that the domain can receive mail, explicit consent), stores the lead, and emails a personal
  access link valid for 7 days. Opening that link redeems a 10-minute signed Storage URL and redirects to the PDF.
  Every email carries an unsubscribe link that opens a confirmation page (mail clients can also use one-click). `GET /policy` serves the deny list so the browser
  validates against the same file as the server. The PDF has no public URL. No email is sent for marketing by
  the site itself.
- **Database:** supabase/migrations. `whitepaper_leads` holds one row per work email (lowercase) with status
  (active, unsubscribed, suppressed), the consent text and version agreed to, first-touch attribution
  (utm fields, referrer, landing page), request and send counters, and access timestamps. `whitepaper_events`
  logs every request, email, access and unsubscribe with the attribution of that moment. `whitepaper_attempts`
  holds hashed client addresses for rate limiting, pruned after an hour. Row level security is on with no
  policies: only the service role used by the function can read or write. `whitepaper_leads_overview` is the
  view to read in the dashboard.

## Run locally

    python3 -m http.server 4173 --bind 127.0.0.1 --directory docs

Open http://127.0.0.1:4173. The form posts to the live Supabase function, which accepts this local origin.

## Supabase setup (done once)

1. Project `khvblzrzvqdkjxckedbm` in region eu-central-1 (Frankfurt), so request records stay in the EU.
2. Apply the migrations in `supabase/migrations/` in order. The funnel migration also creates the signing key for
   access links inside Vault (`whitepaper_access_secret`) and the `whitepaper_secret()` function the Edge
   Function reads it with (service role only). Rotate the key with
   `select vault.update_secret(id, encode(gen_random_bytes(32), 'hex')) from vault.secrets where name = 'whitepaper_access_secret';`
   which invalidates every outstanding access link within a minute (the function caches the key for 60
   seconds). Unsubscribe links are signed with `whitepaper_unsub_secret`; do not rotate that one, or the
   unsubscribe links in every delivered email stop working.
3. Upload the PDF to bucket `whitepaper` as `The_Adoption_Tree_Model_White_Paper_v1.0.pdf` (the object name is
   fixed in the function). The PDF itself is not part of this repository.
4. Deploy the function `whitepaper` (files: index.ts, policy.ts, email-policy.json) with JWT verification off:
   the browser form carries no token. Allowed site origins are listed in DEFAULT_ORIGINS; a comma-separated
   `ALLOWED_ORIGINS` secret overrides them without a redeploy.
5. Email delivery uses Resend. In the Supabase dashboard, Edge Functions, Secrets, add `RESEND_API_KEY`; in
   Resend, verify the sending domain adoptiontree.ai (it gives DNS records to add at the registrar). Optional
   secrets: `EMAIL_FROM` (default `The Adoption Tree <willem@adoptiontree.ai>`), `EMAIL_REPLY_TO`, `SITE_URL`.
   Until the key is set, requests are stored but the form reports that the email could not be sent.

## Reading the requests

Supabase dashboard, Table editor, view `whitepaper_leads_overview`: first name, email, domain, status, consent
version and time, source and campaign, request and send counts, whether and when the paper was opened. Export CSV
from there. `whitepaper_events` answers which post or campaign produced a given request.

## Checks

    cd supabase/functions/whitepaper && deno test policy_test.ts && deno check index.ts && deno lint

Live checks with curl (the response never reveals whether an address is already stored):

    curl -s -X POST https://khvblzrzvqdkjxckedbm.supabase.co/functions/v1/whitepaper \
      -H 'Content-Type: application/json' -H 'Accept: application/json' -H 'Origin: https://adoptiontree.ai' \
      -d '{"first_name":"Jan","email":"jan@YOUR-OWN-DOMAIN","consent":true}'

A free-mail or disposable address returns 400 with the work-email message; a valid request returns
`{"ok":true}` once the email provider is configured. Remove test rows from `whitepaper_leads` afterwards.

## Privacy

`privacy.html` describes in plain English what the form collects, why, who processes it (Supabase, Resend,
GitHub Pages, Google Fonts), retention and how to unsubscribe. The consent text lives in the function
(CONSENT_TEXT, CONSENT_VERSION) and is stored with every lead. Both are written for review by privacy counsel
and make no compliance claims.

Retention runs in the database on a schedule (`public.whitepaper_retention()`, pg_cron, hourly): hashed
client addresses older than an hour, active leads whose last request is older than 24 months (with their
events), and carried-over v1 rows that never consented after 90 days are deleted; unsubscribed and
suppressed leads older than 24 months keep only the address, status and dates, so the person is not
contacted again. The organisation is inferred from the email domain alone (`inferred_company`); nothing is
looked up elsewhere. The stored name and consent evidence belong to the first submission; a repeat request
only counts.

Abuse limits: 30 requests per client address per 15 minutes, one email per address per minute, 5 emails per
address per day, 50 distinct addresses per email domain per day, 200 emails per day in total (`MAX_ATTEMPTS`,
`RESEND_COOLDOWN_MS`, `ADDRESS_DAILY_CAP`, `DOMAIN_DAILY_CAP`, `DAILY_SEND_CAP`). Every accepted request takes at
least `FLOOR_MS`, so response time does not reveal whether an address is stored. A provider failure is reported
to the visitor as 503 on purpose, and for five minutes after one, skipped sends report the same 503.

`accessed_at` and `download_count` record link opens. Corporate mail security (Safe Links, Proofpoint,
Mimecast) opens links on delivery, so treat them as "link opened", not as proof that a person read the paper.
The unsubscribe page also offers to block access emails altogether (status `suppressed`), for people whose
address was entered by someone else.

Note for the owner: access and unsubscribe links carry their token in the URL, so Supabase's request logs
(kept for a short period) contain live links. Limit dashboard access accordingly.

### Points for legal review

Not legal advice; these are the open items counsel should confirm before launch.

- Legal basis and wording of the consent text for B2B marketing contact (consent is recorded at submission;
  the address is only proven when the emailed link is opened, see `accessed_at`).
- Resend (US) receives first name and email address for every access email: transfer mechanism and processor terms.
- Google Fonts serves the typefaces from Google servers, which receive each visitor's IP address. Self-hosting
  the two families removes this; it is a small change.
- Session storage of campaign parameters, referrer and landing page is written on page load
  (Telecommunicatiewet 11.7a: strictly-necessary exception or not).
- Retention periods (24 months for leads, 90 days for v1 rows, 1 hour for hashed addresses) and the
  controller identity and address on the privacy page.

## Content decisions

The landing page highlights the premise, six foundation blocks, six gates, transfer test, measurement
and five working tools, with blurred thumbnails of the five tool sheets that show their shape but not their content. It does not present survey percentages as independent claims.
The 24-week reference is explicitly working time, with 9 to 12 months elapsed as a planning assumption in
regulated enterprises. The model is identified as a design proposal awaiting field evaluation.

The Node server that previously handled requests is kept on the branch `node-server-2026-09-14` of the
private repository willembuilds/the-adoption-house-website.
