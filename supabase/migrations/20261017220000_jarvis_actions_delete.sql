-- Erlaubt action 'delete' in jarvis_actions, damit gelöschte Aufgaben mit Zeilendaten im Protokoll stehen.
-- Idempotent. Keine Spaltenumbenennung. Nicht automatisch gegen die Live-Datenbank ausführen.
-- Anwenden über die Checkliste in jarvis/README.md, zusammen mit dem Redeploy von jarvis-chat.

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
    check (action in ('insert', 'update', 'delete'));
end $$;
