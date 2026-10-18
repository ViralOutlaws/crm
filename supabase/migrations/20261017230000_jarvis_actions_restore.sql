-- Erlaubt action 'delete' und 'restore' in jarvis_actions und nimmt pakete sowie ziele ins Tabellen-Check auf.
-- Idempotent. Bestehende Zeilen bleiben gültig: die neuen Listen sind Obermengen von insert/update und der bisherigen Tabellenliste.
-- Keine Spaltenumbenennung. Kein UPDATE- und kein DELETE-Recht auf dem Protokoll.
-- Nicht automatisch gegen die Live-Datenbank ausführen.
-- Anwenden über die Go-live-Checkliste in jarvis/README.md, zusammen mit dem Redeploy von jarvis-chat.
-- Ersetzt den Action-Check aus 20261017190000 und, falls schon angewendet, aus 20261017220000.

do $$
declare
  r record;
begin
  if to_regclass('public.jarvis_actions') is null then
    raise notice 'jarvis_actions fehlt. Zuerst 20261017190000 anwenden.';
    return;
  end if;

  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.jarvis_actions'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%action%'
      and pg_get_constraintdef(c.oid) not ilike '%table_name%'
  loop
    execute format('alter table public.jarvis_actions drop constraint %I', r.conname);
  end loop;

  alter table public.jarvis_actions
    add constraint jarvis_actions_action_check
    check (action in ('insert', 'update', 'delete', 'restore'));

  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.jarvis_actions'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%table_name%'
  loop
    execute format('alter table public.jarvis_actions drop constraint %I', r.conname);
  end loop;

  alter table public.jarvis_actions
    add constraint jarvis_actions_table_chk
    check (
      table_name in (
        'contacts', 'aufgaben', 'wiedervorlagen', 'kal_events',
        'angebote', 'rechnungen', 'social_media_posts',
        'retainer', 'ausgaben', 'roi_daten', 'pakete', 'ziele'
      )
    );

  drop policy if exists jarvis_actions_insert on public.jarvis_actions;
  create policy jarvis_actions_insert on public.jarvis_actions
    for insert to authenticated
    with check (user_id = auth.uid() and workspace_id = public.get_my_workspace_id());
end $$;
