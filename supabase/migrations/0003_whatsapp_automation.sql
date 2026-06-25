-- =============================================================
-- Costmatic — Migration 0003: WhatsApp automation (OPTIONAL)
--
-- DO NOT apply this until you have:
--   1. Completed Meta WhatsApp Cloud API onboarding (business number + token)
--   2. Deployed the edge functions: whatsapp-receipt, whatsapp-reminders
--   3. Set the edge-function secrets (WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, …)
--   4. Set the two database-level settings below (URL + hook secret)
-- See docs/WHATSAPP_SETUP.md for the full runbook.
--
-- It is safe by design: everything is gated behind the `whatsapp_enabled`
-- setting (default 'false'), so the trigger returns immediately until you opt in.
-- =============================================================

create extension if not exists pg_net;     -- outbound HTTP from Postgres
create extension if not exists pg_cron;     -- scheduled jobs

-- Feature flag (readable by the app; safe to expose)
insert into public.settings (key, value) values ('whatsapp_enabled', 'false')
on conflict (key) do nothing;

-- The edge-function base URL + shared secret are stored as DATABASE settings,
-- NOT in the public.settings table, so they are never exposed through the API.
-- Set them once (replace the placeholders), e.g.:
--   alter database postgres set app.whatsapp_function_url = 'https://uddriaaonqehoggrlpnp.functions.supabase.co';
--   alter database postgres set app.whatsapp_hook_secret  = '<the same value as the WHATSAPP_HOOK_SECRET edge secret>';

-- ── Auto-receipt: fire after each sale ─────────────────────
create or replace function public.notify_whatsapp_receipt()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_url    text := current_setting('app.whatsapp_function_url', true);
  v_secret text := current_setting('app.whatsapp_hook_secret', true);
begin
  -- Opt-in flag + only credit/cash sales that actually have a customer
  if coalesce((select value from settings where key = 'whatsapp_enabled'), 'false') <> 'true' then
    return new;
  end if;
  if v_url is null or new.customer_id is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url || '/whatsapp-receipt',
    body    := jsonb_build_object('sale_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', coalesce(v_secret, ''))
  );
  return new;
end;
$$;

drop trigger if exists whatsapp_receipt_after_sale on public.sales;
create trigger whatsapp_receipt_after_sale
  after insert on public.sales
  for each row execute function public.notify_whatsapp_receipt();

-- ── Weekly khata/udhaar reminder (Mondays 10:00) ───────────
-- Removes any previous copy of the job first so re-running is idempotent.
select cron.unschedule('whatsapp-weekly-dues')
where exists (select 1 from cron.job where jobname = 'whatsapp-weekly-dues');

select cron.schedule(
  'whatsapp-weekly-dues',
  '0 10 * * 1',
  $cron$
    select net.http_post(
      url     := current_setting('app.whatsapp_function_url', true) || '/whatsapp-reminders',
      body    := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-hook-secret', coalesce(current_setting('app.whatsapp_hook_secret', true), ''))
    )
    where coalesce((select value from settings where key = 'whatsapp_enabled'), 'false') = 'true';
  $cron$
);
