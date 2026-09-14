-- White paper requests for the Adoption Tree Model site.
-- Only the service role (used by the whitepaper Edge Function) can read or write these tables:
-- row level security is on and no policies are defined, so the anon key has no access at all.

create table if not exists public.whitepaper_requests (
  email text primary key,
  requested_at timestamptz not null default now(),
  notice_version text not null,
  purpose text not null default 'whitepaper-request'
);
comment on table public.whitepaper_requests is 'One row per email that requested the white paper. Pruned after 90 days by the Edge Function.';

create table if not exists public.whitepaper_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  attempted_at timestamptz not null default now()
);
comment on table public.whitepaper_attempts is 'Rate limiting: HMAC of the client address, never the address itself. Pruned after one hour.';
create index if not exists whitepaper_attempts_ip_time on public.whitepaper_attempts (ip_hash, attempted_at);

alter table public.whitepaper_requests enable row level security;
alter table public.whitepaper_attempts enable row level security;

-- Private bucket for the PDF. Signed 15-minute links are the only way to it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('whitepaper', 'whitepaper', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;
