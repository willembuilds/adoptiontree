-- Short access codes, so the emailed link can live on adoptiontree.ai and stay readable.
-- The code replaces the self-contained signed token: same 7 day life, but now revocable, because the
-- authority sits in this table instead of inside the link.
create table if not exists public.whitepaper_access_codes (
  code text primary key,
  lead_id uuid not null references public.whitepaper_leads (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  used_count integer not null default 0,
  last_used_at timestamptz,
  constraint whitepaper_access_codes_shape check (code ~ '^[a-z2-9]{12}$')
);
alter table public.whitepaper_access_codes enable row level security;
create index if not exists whitepaper_access_codes_lead on public.whitepaper_access_codes (lead_id);
create index if not exists whitepaper_access_codes_expires on public.whitepaper_access_codes (expires_at);
comment on table public.whitepaper_access_codes is 'Short codes behind adoptiontree.ai/paper/?k=... Revoke by setting revoked_at; expired rows are pruned after 30 days.';

-- Withdraw a single link without touching the lead, for a code that ended up in the wrong hands.
create or replace function public.whitepaper_revoke_code(target_code text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.whitepaper_access_codes set revoked_at = now() where code = lower(target_code) and revoked_at is null;
$$;

-- Who holds a live link right now.
create or replace view public.whitepaper_access_codes_overview with (security_invoker = true) as
select c.code, l.first_name, l.email, c.created_at, c.expires_at, c.used_count, c.last_used_at, c.revoked_at,
       case when c.revoked_at is not null then 'revoked'
            when c.expires_at < now() then 'expired'
            else 'live' end as state
from public.whitepaper_access_codes c
join public.whitepaper_leads l on l.id = c.lead_id
order by c.created_at desc;

create or replace function public.whitepaper_retention()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.whitepaper_attempts where attempted_at < now() - interval '1 hour';
  delete from public.whitepaper_rejections where created_at < now() - interval '90 days';
  delete from public.whitepaper_access_codes where expires_at < now() - interval '30 days';
  delete from public.whitepaper_leads where status = 'active' and last_requested_at < now() - interval '24 months';
  delete from public.whitepaper_leads where consent_given = false and status = 'active' and source = 'website-v1' and created_at < now() - interval '90 days';
  update public.whitepaper_leads
     set first_name = '', inferred_company = null, organization = null, consent_text = null, consent_version = null, consent_at = null,
         utm_source = null, utm_medium = null, utm_campaign = null, utm_content = null, utm_term = null,
         referrer = null, landing_url = null, updated_at = now()
   where status <> 'active' and last_requested_at < now() - interval '24 months' and first_name <> '';
  delete from public.whitepaper_events where created_at < now() - interval '24 months';
$$;
