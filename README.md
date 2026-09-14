# Adoption Tree Model website

A landing page based on Willem Knaap's September 2026, version 1.0 white paper (build 2026-09-14.2).
The original ink, bone and orange design and the animated tree are retained.

## How it is built

- **Site:** plain static files (index.html, css/style.css, js/main.js, favicon.svg, assets/whitepaper-cover.jpg).
  Hosted on GitHub Pages from the main branch of willembuilds/adoption-tree-model at https://adoptiontree.ai.
  Every push deploys.
  No build step, no dependencies.
- **White paper requests:** supabase/functions/whitepaper, a Supabase Edge Function. The form posts there.
  The function validates the email, applies a rate limit, stores the request and returns a signed link to the
  PDF in the private "whitepaper" Storage bucket. The link is valid for 15 minutes. No email is sent and no
  newsletter subscription is created. Native form submission works without JavaScript.
- **Database:** supabase/migrations. Two tables: whitepaper_requests (email, requested_at, notice_version,
  purpose) and whitepaper_attempts (an HMAC of the client address and a timestamp, used only for rate
  limiting). Row level security is on with no policies, so only the service role used by the function can read
  or write; the anon key has no access. Records older than 90 days are removed on every request.

## Run locally

    python3 -m http.server 4173 --bind 127.0.0.1

Open http://127.0.0.1:4173. The form posts to the live Supabase function, which accepts this local origin.

## Supabase setup (done once)

1. Project `khvblzrzvqdkjxckedbm` in region eu-central-1 (Frankfurt), so request records stay in the EU.
2. Apply `supabase/migrations/20260914120000_whitepaper_requests.sql`: creates the two tables and the private
   bucket.
3. Upload the PDF to bucket `whitepaper` as `The_Adoption_Tree_Model_White_Paper_v1.0.pdf` (the object name is
   fixed in the function). The PDF itself is not part of this repository.
4. Deploy the function `whitepaper` with JWT verification off (the browser form carries no token). The allowed
   site origins are listed in the function source (DEFAULT_ORIGINS); a comma-separated `ALLOWED_ORIGINS`
   function secret overrides that list without a redeploy.
5. The form in index.html posts to `https://khvblzrzvqdkjxckedbm.supabase.co/functions/v1/whitepaper`.

## Domain

The site lives at https://adoptiontree.ai. The `CNAME` file in the repository tells GitHub Pages the custom domain.
DNS at the registrar (EuroDNS): four A records for the apex (185.199.108.153, 185.199.109.153, 185.199.110.153,
185.199.111.153) and a CNAME for www to willembuilds.github.io. Once the certificate is issued, enforce HTTPS in the
repository's Pages settings. Mail for willem@adoptiontree.ai is handled by Google Workspace: MX to smtp.google.com
plus the SPF, DKIM and DMARC records Workspace provides, with adoptiontree.ai added as a domain alias.

## Reading the requests

Supabase dashboard, Table editor, `whitepaper_requests`. Export CSV from there. There is no admin route on
the site.

## Checks

The function can be exercised with curl:

    curl -s -X POST https://khvblzrzvqdkjxckedbm.supabase.co/functions/v1/whitepaper \
      -H 'Content-Type: application/json' -H 'Accept: application/json' \
      -H 'Origin: https://adoptiontree.ai' \
      -d '{"email":"you@example.com"}'

Expected: `{"downloadUrl":"https://khvblzrzvqdkjxckedbm.supabase.co/storage/v1/object/sign/...","expiresIn":900}`.
Remove test rows from `whitepaper_requests` afterwards.

## Content decisions

The landing page highlights the premise, six foundation blocks, six gates, transfer test, measurement
and five working tools. It does not present survey percentages as independent claims.
The 24-week reference is explicitly working time, with 9 to 12 months elapsed as a planning assumption in
regulated enterprises. The model is identified as a design proposal awaiting field evaluation.

The Node server that previously handled requests is kept on the branch `node-server-2026-09-14` of the
private repository willembuilds/the-adoption-house-website.
