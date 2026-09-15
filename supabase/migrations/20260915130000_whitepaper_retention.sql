-- Retention on a schedule (pg_cron), a tighter secret lookup, integrity checks and the indexes the function needs.

create extension if not exists pg_cron with schema pg_catalog;

alter table public.whitepaper_leads add constraint whitepaper_leads_email_lower check (email = lower(email));
create index if not exists whitepaper_leads_status_requested on public.whitepaper_leads (status, last_requested_at);
create index if not exists whitepaper_events_created on public.whitepaper_events (created_at);
create index if not exists whitepaper_events_lead_kind_created on public.whitepaper_events (lead_id, kind, created_at);

-- What the privacy page promises: hashed client addresses live one hour; active leads and their events are
-- deleted 24 months after the last request; v1 rows that never consented go after 90 days; unsubscribed and
-- suppressed leads older than 24 months keep only the address, status and dates.
create or replace function public.whitepaper_retention()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.whitepaper_attempts where attempted_at < now() - interval '1 hour';
  delete from public.whitepaper_leads where status = 'active' and last_requested_at < now() - interval '24 months';
  delete from public.whitepaper_leads where consent_given = false and created_at < now() - interval '90 days';
  update public.whitepaper_leads
     set first_name = '', inferred_company = null, consent_text = null, consent_version = null, consent_at = null,
         utm_source = null, utm_medium = null, utm_campaign = null, utm_content = null, utm_term = null,
         referrer = null, landing_url = null, updated_at = now()
   where status <> 'active' and last_requested_at < now() - interval '24 months' and first_name <> '';
  delete from public.whitepaper_events where created_at < now() - interval '24 months';
$$;
revoke all on function public.whitepaper_retention() from public, anon, authenticated;

select cron.schedule('whitepaper_retention', '17 * * * *', $$select public.whitepaper_retention()$$);

-- The Edge Function only ever needs two secrets; do not let the service role read any other Vault entry through this.
create or replace function public.whitepaper_secret(name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select s.decrypted_secret from vault.decrypted_secrets s
   where s.name = whitepaper_secret.name and s.name in ('whitepaper_access_secret', 'RESEND_API_KEY')
   limit 1
$$;
