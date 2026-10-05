-- whitepaper_revoke_code was callable over the public REST API: a security definer function in the public
-- schema inherits EXECUTE for anon/authenticated by default. It leaks nothing and cannot reach the PDF, but a
-- caller who knew a code could withdraw someone's link. Owner only from here on, like the other two.
revoke execute on function public.whitepaper_revoke_code(text) from public, anon, authenticated;
revoke execute on function public.whitepaper_secret(text) from public, anon, authenticated;
revoke execute on function public.whitepaper_retention() from public, anon, authenticated;

-- As applied, this migration also carried a one-off data correction (un-revoking a single access code that a
-- test call had revoked). It is left out here on purpose: the repository is public and the code was live.
