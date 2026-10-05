-- Self-reported organization (the domain no longer tells us, now that consumer addresses are allowed),
-- and a count of requests that never became a lead, by reason and domain only, never the address itself.

alter table public.whitepaper_leads add column if not exists organization text;

create table if not exists public.whitepaper_rejections (
  id uuid primary key default gen_random_uuid(),
  reason text not null check (reason in ('invalid_email', 'blocked_domain', 'undeliverable_domain', 'invalid_name', 'no_consent')),
  email_domain text,
  created_at timestamptz not null default now()
);
alter table public.whitepaper_rejections enable row level security;
create index if not exists whitepaper_rejections_created on public.whitepaper_rejections (created_at);
comment on table public.whitepaper_rejections is 'Requests that could not be completed. Domain part only, never the address: used to spot typos and abuse.';

-- Reading the funnel: what came in, what was refused and why.
create or replace view public.whitepaper_rejections_overview with (security_invoker = true) as
select date_trunc('day', created_at)::date as day, reason, email_domain, count(*) as attempts
from public.whitepaper_rejections
group by 1, 2, 3
order by 1 desc, 4 desc;

drop view if exists public.whitepaper_leads_overview;
create view public.whitepaper_leads_overview with (security_invoker = true) as
select l.id, l.first_name, l.email, l.email_domain, coalesce(l.organization, l.inferred_company) as organization,
       l.organization as organization_given, l.inferred_company, l.status,
       l.consent_given, l.consent_version, l.consent_at,
       l.source, l.utm_source, l.utm_medium, l.utm_campaign, l.referrer,
       l.request_count, l.send_count, l.download_count,
       l.created_at, l.last_requested_at, l.last_sent_at, l.accessed_at, l.last_accessed_at, l.unsubscribed_at
from public.whitepaper_leads l
order by l.created_at desc;

-- Rejections are noise after 90 days; leads and events keep their existing windows.
create or replace function public.whitepaper_retention()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.whitepaper_attempts where attempted_at < now() - interval '1 hour';
  delete from public.whitepaper_rejections where created_at < now() - interval '90 days';
  delete from public.whitepaper_leads where status = 'active' and last_requested_at < now() - interval '24 months';
  delete from public.whitepaper_leads where consent_given = false and status = 'active' and source = 'website-v1' and created_at < now() - interval '90 days';
  update public.whitepaper_leads
     set first_name = '', inferred_company = null, organization = null, consent_text = null, consent_version = null, consent_at = null,
         utm_source = null, utm_medium = null, utm_campaign = null, utm_content = null, utm_term = null,
         referrer = null, landing_url = null, updated_at = now()
   where status <> 'active' and last_requested_at < now() - interval '24 months' and first_name <> '';
  delete from public.whitepaper_events where created_at < now() - interval '24 months';
$$;
