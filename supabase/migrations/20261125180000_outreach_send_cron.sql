-- Hintergrundversand: pg_cron ruft alle 5 Minuten outreach-send auf.
-- Das Shared Secret liegt NICHT hier, sondern im Supabase Vault (Name 'outreach_cron_secret')
-- und als Function-Secret OUTREACH_CRON_SECRET. Einrichten (einmalig, ohne das Secret zu loggen):
--   select vault.create_secret('<secret>', 'outreach_cron_secret', 'Header x-outreach-cron für outreach-send');
-- Nicht von allein auf die Live-Datenbank anwenden.

alter table public.outreach_settings add column if not exists paused boolean not null default false;
alter table public.outreach_settings add column if not exists hour_from int not null default 8;
alter table public.outreach_settings add column if not exists hour_to int not null default 18;
alter table public.outreach_settings add column if not exists weekdays int[] not null default '{1,2,3,4,5}';

alter table public.outreach_settings drop constraint if exists outreach_settings_hours_chk;
alter table public.outreach_settings
  add constraint outreach_settings_hours_chk
  check (hour_from >= 0 and hour_to <= 24 and hour_from < hour_to);

alter table public.outreach_drafts add column if not exists sending_at timestamptz;
alter table public.outreach_drafts add column if not exists sending_token text;

-- Nimmt höchstens eine freigegebene Mail in Anspruch. Browser und Cron teilen sich die Sperre.
create or replace function public.claim_outreach_draft(p_ws uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_local timestamp;
  v_hour int;
  v_dow int;
  v_paused boolean;
  v_from int;
  v_to int;
  v_days int[];
  v_limit int;
  v_gap int;
  v_sent int;
  v_last timestamptz;
  v_id uuid;
  v_token text;
  v_draft public.outreach_drafts%rowtype;
begin
  if coalesce(auth.role(), '') = 'authenticated' then
    v_ws := public.get_my_workspace_id();
    if v_ws is null then
      return jsonb_build_object('ok', false, 'reason', 'Kein Workspace');
    end if;
  elsif coalesce(auth.role(), '') = 'service_role' then
    v_ws := p_ws;
    if v_ws is null then
      return jsonb_build_object('ok', false, 'reason', 'Kein Workspace');
    end if;
  else
    return jsonb_build_object('ok', false, 'reason', 'Nicht erlaubt');
  end if;

  perform pg_advisory_xact_lock(hashtext('outreach-send:' || v_ws::text));

  select paused, hour_from, hour_to, weekdays, daily_limit, gap_minutes
    into v_paused, v_from, v_to, v_days, v_limit, v_gap
  from public.outreach_settings
  where workspace_id = v_ws;

  v_paused := coalesce(v_paused, false);
  v_from := coalesce(v_from, 8);
  v_to := coalesce(v_to, 18);
  v_days := coalesce(v_days, array[1, 2, 3, 4, 5]);
  v_limit := coalesce(v_limit, 20);
  v_gap := coalesce(v_gap, 5);

  if v_paused then
    return jsonb_build_object('ok', false, 'reason', 'Versand pausiert.');
  end if;

  v_local := now() at time zone 'Europe/Berlin';
  v_hour := extract(hour from v_local)::int;
  v_dow := extract(isodow from v_local)::int;
  if not (v_dow = any (v_days)) then
    return jsonb_build_object('ok', false, 'reason', 'Außerhalb der Versandtage.');
  end if;
  if v_hour < v_from or v_hour >= v_to then
    return jsonb_build_object('ok', false, 'reason', 'Außerhalb der Versandzeit.');
  end if;

  if exists (
    select 1 from public.outreach_drafts
    where workspace_id = v_ws
      and status = 'freigegeben'
      and sending_at is not null
      and sending_at > now() - interval '15 minutes'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'Ein Versand läuft bereits.');
  end if;

  select count(*)::int into v_sent
  from public.outreach_messages
  where workspace_id = v_ws
    and direction = 'out'
    and (created_at at time zone 'Europe/Berlin')::date = v_local::date;
  if v_sent >= v_limit then
    return jsonb_build_object('ok', false, 'reason', 'Tageslimit erreicht.');
  end if;

  select max(created_at) into v_last
  from public.outreach_messages
  where workspace_id = v_ws and direction = 'out';
  if v_last is not null and v_last > now() - make_interval(mins => v_gap) then
    return jsonb_build_object('ok', false, 'reason', 'Abstand nicht erreicht.');
  end if;

  select d.id into v_id
  from public.outreach_drafts d
  where d.workspace_id = v_ws
    and d.status = 'freigegeben'
    and (d.email_art is distinct from 'vermutet' or d.guess_ok)
    and (d.sending_at is null or d.sending_at <= now() - interval '15 minutes')
  order by (d.last_error is not null), d.approved_at nulls last, d.created_at
  for update skip locked
  limit 1;

  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'Nichts Freigegebenes wartet.');
  end if;

  v_token := gen_random_uuid()::text;
  update public.outreach_drafts
  set sending_at = now(), sending_token = v_token, updated_at = now()
  where id = v_id
  returning * into v_draft;

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'draft', jsonb_build_object(
      'id', v_draft.id,
      'target_id', v_draft.target_id,
      'person_id', v_draft.person_id,
      'contact_id', v_draft.contact_id,
      'subject', v_draft.subject,
      'body', v_draft.body,
      'email', v_draft.email,
      'email_art', v_draft.email_art,
      'guess_ok', v_draft.guess_ok,
      'status', v_draft.status
    )
  );
end;
$$;

revoke all on function public.claim_outreach_draft(uuid) from public, anon;
grant execute on function public.claim_outreach_draft(uuid) to authenticated, service_role;

grant select (status, archiviert, kundennummer) on public.contacts to service_role;
grant insert (status_seit) on public.contacts to service_role;

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'outreach-send';

select cron.schedule(
  'outreach-send',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://jjfmxiqippkgqkwihgek.supabase.co/functions/v1/outreach-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-outreach-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'outreach_cron_secret' limit 1)
    ),
    body := '{"op":"send"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
