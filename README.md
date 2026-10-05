# Adoption Tree Model website

A landing page based on Willem Knaap's whitepaper, version 1.1 of October 2026 (build 2026-10-04; first
published September 2026 as version 1.0).
The original ink, bone and orange design and the animated tree are retained.

## How it is built

- **Site:** plain static files in `docs/` (index.html, privacy.html, unsubscribe.html, paper/, css/, js/, assets/,
  favicon.svg, CNAME). Hosted on GitHub Pages from `docs/` on the main branch of a public repository at
  https://adoptiontree.ai; only that folder is served on adoptiontree.ai. The repository itself is public, so the function source and this file can be read on GitHub. Every push deploys.
  No build step, no dependencies.
- **Explainer video:** `docs/assets/video/` holds the 102 second explainer (H.264 and AAC, 1080p, 14 MB, moov
  atom first so it streams), its poster and WebVTT captions. It is self-hosted on purpose: no third-party player,
  so the privacy promise of no cookies and no tracking holds. `#explainer` in index.html shows one play target
  over the poster until first play, then hands over to the browser's own controls; without JavaScript the native
  controls are there from the start. To replace the film, overwrite the three files and keep the names.
  The line under the frame links the two sources of the figures spoken in the film; when the film's figures
  change, that line and the whitepaper change with it, since the paper is the reference for both.
- **Whitepaper requests:** supabase/functions/whitepaper, a Supabase Edge Function with four routes. The form
  posts first name, work email and consent; the function validates (syntax, a disposable and relay provider deny
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
3. Upload the PDF to bucket `whitepaper` as `The_Adoption_Tree_Model_Whitepaper_v1.1.pdf` (the object name is
   the `OBJECT` constant in the function; a new version means a new object, a new constant and a redeploy, and
   the previous object is renamed `ARCHIVED-<build date>-...`). With the CLI:
   `supabase storage cp <file> ss:///whitepaper/<name> --content-type application/pdf --experimental --project-ref <ref>`. The PDF itself is not part of this repository.
4. Deploy the function `whitepaper` (files: index.ts, policy.ts, email-policy.json) with JWT verification off:
   the browser form carries no token. Allowed site origins are listed in DEFAULT_ORIGINS; a comma-separated
   `ALLOWED_ORIGINS` secret overrides them without a redeploy.
5. Email delivery uses Resend. In the Supabase dashboard, Edge Functions, Secrets, add `RESEND_API_KEY`; in
   Resend, verify the sending domain adoptiontree.ai (it gives DNS records to add at the registrar). Optional
   secrets: `EMAIL_FROM` (default `The Adoption Tree™ <willem@adoptiontree.ai>`), `EMAIL_REPLY_TO`, `SITE_URL`.
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

A disposable or relay address returns 400 with "Please enter an email address we can send your access link to."; a valid request returns
`{"ok":true}` once the email provider is configured. Remove test rows from `whitepaper_leads` afterwards.

## Privacy

`privacy.html` describes in plain English what the form collects, why, who processes it (Supabase, Resend,
GitHub Pages), retention and how to unsubscribe. The typefaces are served from the site itself and nothing is stored in the visitor's browser. The consent text lives in the function
(CONSENT_TEXT, CONSENT_VERSION) and is stored with every lead. Both are written for review by privacy counsel
and make no compliance claims.

The form takes a first name, an email address and an optional organization. Consumer providers such as gmail
or icloud are accepted: the label still asks for a work address, it does not insist. Disposable and relay
domains stay blocked, and so does any domain that cannot receive mail. `email-policy.json` carries
`block_free: false`; flip it to `true` to close the gate again without touching any code. Requests that never
became a lead are counted in `whitepaper_rejections` by reason and domain only, never the address, and are
deleted after 90 days. Read them through `whitepaper_rejections_overview`.

Retention runs in the database on a schedule (`public.whitepaper_retention()`, pg_cron, hourly): hashed
client addresses older than an hour, active leads whose last request is older than 24 months (with their
events), and carried-over v1 rows that never consented after 90 days are deleted; unsubscribed and
suppressed leads older than 24 months keep only the address, status and dates, so the person is not
contacted again. The organization is inferred from the email domain alone (`inferred_company`); nothing is
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

Not legal advice. The site is live; these items are still open for counsel to confirm.

- Legal basis and wording of the consent text for B2B marketing contact (consent is recorded at submission;
  the address is only proven when the emailed link is opened, see `accessed_at`).
- Resend receives first name and email address for every access email (the sending domain is in its eu-west-1 region; the company is US-based); Resend's data processing agreement is part of its terms, and the EU-US Data Privacy Framework is the transfer basis. Confirm, or move the sending domain to Resend's EU region.
- Retention periods (24 months for leads, 90 days for v1 rows and for refused requests, up to 2 hours for hashed addresses, 30 days after expiry for access codes).

## Content decisions

The landing page highlights the premise, six foundation blocks, six gates, transfer test, measurement
and five working tools, with blurred thumbnails of the five tool sheets that show their shape but not their content. The only survey percentages on the page are in the explainer film, each shown with its source and linked under the frame.
The 24-week reference is explicitly working time, with 9 to 12 months elapsed as a planning assumption in
regulated enterprises. The model is identified as a design proposal awaiting field evaluation.

The Node server that previously handled requests is kept on the branch `node-server-2026-09-14` of the
private repository willembuilds/the-adoption-house-website.

## Access links

The emailed link is `https://adoptiontree.ai/paper/?k=<12 character code>`. The code lives in
`whitepaper_access_codes` (7 days, revocable via `whitepaper_revoke_code`), not inside the link, so the URL
stays short and carries the site's own domain instead of a raw `*.supabase.co` address with a signed blob.
`docs/paper/index.html` exchanges the code for a 10 minute signed Storage URL through `/access?k=...&format=json`
and sends the reader straight to the PDF; it holds no secret and no file of its own. Links already sitting in
someone's inbox keep working: `/access?token=...` still accepts the legacy signed token.
