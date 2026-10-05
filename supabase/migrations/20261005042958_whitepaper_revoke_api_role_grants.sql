-- Row level security with no policies already blocks the API roles on these objects. The grants below were the
-- platform default and nothing uses them: only the Edge Function reads and writes, with the service role.
-- Removing them means one mistaken policy or a disabled RLS switch can no longer expose the leads.
revoke all on table
  public.whitepaper_leads, public.whitepaper_events, public.whitepaper_attempts,
  public.whitepaper_rejections, public.whitepaper_access_codes,
  public.whitepaper_leads_overview, public.whitepaper_rejections_overview, public.whitepaper_access_codes_overview
from anon, authenticated;
