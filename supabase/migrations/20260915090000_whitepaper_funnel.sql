-- White paper funnel: leads with consent evidence and attribution, an event log, an overview view,
-- and the signing secret for emailed access links. Replaces the first-version whitepaper_requests table.
-- Row level security stays on with no policies: only the service role used by the Edge Function reads or writes.

create table if not exists public.whitepaper_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  email_domain text not null,
  first_name text not null default '',
  inferred_company text,
  status text not null default 'active' check (status in ('active', 'unsubscribed', 'suppressed')),
  consent_given boolean not null default false,
  consent_version text,
  consent_text text,
  consent_at timestamptz,
  source text not null default 'website',
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  referrer text,
  landing_url text,
  request_count integer not null default 1,
  last_requested_at timestamptz not null default now(),
  send_count integer not null default 0,
  last_sent_at timestamptz,
  accessed_at timestamptz,
  last_accessed_at timestamptz,
  download_count integer not null default 0,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.whitepaper_leads is 'One row per work email that requested the white paper. Email is lowercase. Status is never reset by a new request; suppression records are kept so an unsubscribed person is not contacted again.';
create index if not exists whitepaper_leads_domain on public.whitepaper_leads (email_domain);
create index if not exists whitepaper_leads_created on public.whitepaper_leads (created_at desc);

create table if not exists public.whitepaper_events (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.whitepaper_leads (id) on delete cascade,
  kind text not null check (kind in ('requested', 'email_sent', 'email_failed', 'accessed', 'unsubscribed')),
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  referrer text,
  landing_url text,
  created_at timestamptz not null default now()
);
comment on table public.whitepaper_events is 'One row per request, email, access or unsubscribe, with the attribution of that moment. Answers which post or campaign produced a download.';
create index if not exists whitepaper_events_lead on public.whitepaper_events (lead_id, created_at);
create index if not exists whitepaper_events_kind on public.whitepaper_events (kind, created_at desc);

alter table public.whitepaper_leads enable row level security;
alter table public.whitepaper_events enable row level security;

-- Carry over the first-version rows (email and timestamp only; no consent was recorded then).
insert into public.whitepaper_leads (email, email_domain, first_name, consent_given, consent_version, source, created_at, last_requested_at, updated_at)
select lower(email), split_part(lower(email), '@', 2), '', false, notice_version, 'website-v1', requested_at, requested_at, requested_at
from public.whitepaper_requests
on conflict (email) do nothing;
drop table if exists public.whitepaper_requests;

-- Overview for the dashboard: security_invoker so it inherits the tables' row level security.
create or replace view public.whitepaper_leads_overview with (security_invoker = true) as
select l.id, l.first_name, l.email, l.email_domain, l.inferred_company, l.status,
       l.consent_given, l.consent_version, l.consent_at,
       l.source, l.utm_source, l.utm_medium, l.utm_campaign, l.utm_content, l.utm_term, l.referrer,
       l.created_at as first_requested_at, l.last_requested_at, l.request_count,
       l.send_count, l.last_sent_at,
       (l.accessed_at is not null) as accessed, l.accessed_at, l.last_accessed_at, l.download_count,
       l.unsubscribed_at
from public.whitepaper_leads l
order by l.created_at desc;

-- Signing key for access and unsubscribe links, generated inside the database and read only by the
-- service role through this function. Rotate with: select vault.update_secret(id, encode(gen_random_bytes(32), 'hex')) from vault.secrets where name = 'whitepaper_access_secret';
select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'whitepaper_access_secret', 'HMAC key for white paper access and unsubscribe links');

create or replace function public.whitepaper_secret(name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select s.decrypted_secret from vault.decrypted_secrets s where s.name = whitepaper_secret.name limit 1
$$;
revoke all on function public.whitepaper_secret(text) from public, anon, authenticated;
grant execute on function public.whitepaper_secret(text) to service_role;
