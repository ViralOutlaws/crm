-- "Jetzt senden": nimmt genau EINEN bestimmten freigegebenen Entwurf in Anspruch.
-- Versandfenster und Abstand gelten hier nicht. Pause, Tageslimit und die gemeinsame Sperre
-- mit dem Cron (kein Doppelversand) gelten weiter. Sperrliste, Opt-out und Bestandskunden prüft outreach-send.
create or replace function public.claim_outreach_draft_now(p_ws uuid, p_draft uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_local timestamp;
  v_paused boolean;
  v_limit int;
  v_sent int;
  v_token text;
  v_draft public.outreach_drafts%rowtype;
begin
  if coalesce(auth.role(), '') = 'authenticated' then
    v_ws := public.get_my_workspace_id();
  elsif coalesce(auth.role(), '') = 'service_role' then
    v_ws := p_ws;
  else
    return jsonb_build_object('ok', false, 'reason', 'Nicht erlaubt');
  end if;
  if v_ws is null then
    return jsonb_build_object('ok', false, 'reason', 'Kein Workspace');
  end if;

  perform pg_advisory_xact_lock(hashtext('outreach-send:' || v_ws::text));

  select paused, daily_limit into v_paused, v_limit
  from public.outreach_settings where workspace_id = v_ws;
  if coalesce(v_paused, false) then
    return jsonb_build_object('ok', false, 'reason', 'Versand pausiert.');
  end if;
  v_limit := coalesce(v_limit, 50);

  v_local := now() at time zone 'Europe/Berlin';
  select count(*)::int into v_sent
  from public.outreach_messages
  where workspace_id = v_ws
    and direction = 'out'
    and (created_at at time zone 'Europe/Berlin')::date = v_local::date;
  if v_sent >= v_limit then
    return jsonb_build_object('ok', false, 'reason', 'Tageslimit erreicht.');
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

  select * into v_draft
  from public.outreach_drafts d
  where d.id = p_draft and d.workspace_id = v_ws
  for update skip locked;

  if v_draft.id is null then
    return jsonb_build_object('ok', false, 'reason', 'Entwurf nicht gefunden.');
  end if;
  if v_draft.status <> 'freigegeben' then
    return jsonb_build_object('ok', false, 'reason', 'Nicht freigegeben (Status ' || v_draft.status || ').');
  end if;
  if v_draft.email_art = 'vermutet' and not coalesce(v_draft.guess_ok, false) then
    return jsonb_build_object('ok', false, 'reason', 'Vermutete Adresse ohne Häkchen.');
  end if;

  v_token := gen_random_uuid()::text;
  update public.outreach_drafts
  set sending_at = now(), sending_token = v_token, updated_at = now()
  where id = v_draft.id
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

revoke all on function public.claim_outreach_draft_now(uuid, uuid) from public, anon;
grant execute on function public.claim_outreach_draft_now(uuid, uuid) to authenticated, service_role;
