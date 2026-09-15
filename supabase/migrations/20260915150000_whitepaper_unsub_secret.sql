-- A separate signing key for unsubscribe links, so rotating the access key never breaks the unsubscribe links in
-- emails that have already been delivered; and the 90-day rule scoped to the rows it was written for.

select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'whitepaper_unsub_secret', 'HMAC key for white paper unsubscribe links');

create or replace function public.whitepaper_secret(name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select s.decrypted_secret from vault.decrypted_secrets s
   where s.name = whitepaper_secret.name and s.name in ('whitepaper_access_secret', 'whitepaper_unsub_secret', 'RESEND_API_KEY')
   limit 1
$$;

create or replace function public.whitepaper_retention()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.whitepaper_attempts where attempted_at < now() - interval '1 hour';
  delete from public.whitepaper_leads where status = 'active' and last_requested_at < now() - interval '24 months';
  delete from public.whitepaper_leads where consent_given = false and status = 'active' and source = 'website-v1' and created_at < now() - interval '90 days';
  update public.whitepaper_leads
     set first_name = '', inferred_company = null, consent_text = null, consent_version = null, consent_at = null,
         utm_source = null, utm_medium = null, utm_campaign = null, utm_content = null, utm_term = null,
         referrer = null, landing_url = null, updated_at = now()
   where status <> 'active' and last_requested_at < now() - interval '24 months' and first_name <> '';
  delete from public.whitepaper_events where created_at < now() - interval '24 months';
$$;
