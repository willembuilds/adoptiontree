-- A daily email to the owner: what moved in the last 24 hours, then every requester. The database only
-- schedules and calls; the whitepaper function builds and sends the email, because it holds the Resend key.
-- The call carries a bearer token kept in Vault, so the cron table never stores a secret.
create extension if not exists pg_net;

select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'whitepaper_digest_secret', 'Bearer token the daily digest job presents to the whitepaper function');

create or replace function public.whitepaper_secret(name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select s.decrypted_secret from vault.decrypted_secrets s
   where s.name = whitepaper_secret.name and s.name in ('whitepaper_access_secret', 'whitepaper_unsub_secret', 'whitepaper_digest_secret', 'RESEND_API_KEY')
   limit 1
$$;
revoke execute on function public.whitepaper_secret(text) from public, anon, authenticated;

create or replace function public.whitepaper_digest_call(hours integer default 24, force boolean default false)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  tok text;
  rid bigint;
begin
  select s.decrypted_secret into tok from vault.decrypted_secrets s where s.name = 'whitepaper_digest_secret' limit 1;
  select net.http_post(
    url := 'https://khvblzrzvqdkjxckedbm.supabase.co/functions/v1/whitepaper/digest',
    body := jsonb_build_object('hours', hours, 'force', force),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || tok),
    timeout_milliseconds := 20000
  ) into rid;
  return rid;
end
$$;
revoke execute on function public.whitepaper_digest_call(integer, boolean) from public, anon, authenticated;

-- 06:00 UTC is 08:00 in Amsterdam in summer and 07:00 in winter.
select cron.schedule('whitepaper_daily_digest', '0 6 * * *', $$select public.whitepaper_digest_call(24, false)$$);
