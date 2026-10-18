-- Review-Follow-up Bot-Leitstand. Idempotent. Nicht automatisch auf die Live-Datenbank anwenden.
-- Liegt nach 20261018010000. Ändert keine Spaltennamen.
-- Die Jarvis-Oberfläche liest bot_runs nur und ändert bot an bestehenden Läufen nicht.

create or replace function public.bot_runs_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  role text := coalesce(auth.role(), '');
begin
  if role = 'service_role' or role not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.status is distinct from 'queued'
       or new.result is not null
       or new.events is distinct from '[]'::jsonb then
      raise exception 'status, result und events setzt nur der Bot-Dienst';
    end if;
    return new;
  end if;
  if new.bot is distinct from old.bot then
    raise exception 'bot an einem bestehenden Lauf ändert nur der Bot-Dienst';
  end if;
  if new.status is distinct from old.status
     or new.result is distinct from old.result
     or new.events is distinct from old.events then
    raise exception 'status, result und events setzt nur der Bot-Dienst';
  end if;
  new.created_by := old.created_by;
  return new;
end $$;

do $$ begin
  if to_regclass('public.bot_runs') is null then
    raise notice 'bot_runs fehlt. Zuerst 20261017240000 anwenden.';
    return;
  end if;
  execute 'revoke update on table public.bot_runs from authenticated';
  execute 'revoke update (bot, aufgabe_id, title, instructions, links, updated_at) on table public.bot_runs from authenticated';
  execute 'grant update (aufgabe_id, title, instructions, links, updated_at) on table public.bot_runs to authenticated';
end $$;

-- GRANT liefert in pg_event_trigger_ddl_commands() keine object_identity.
-- Ein Filter auf bot_tokens trifft deshalb nie. Jedes Tabellen-GRANT zieht die
-- Client-Rechte an bot_tokens erneut ein. Die Funktion ändert nur diese Tabelle.
create or replace function public.bot_tokens_lock_grants()
returns event_trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cmd record;
begin
  if to_regclass('public.bot_tokens') is null then
    return;
  end if;
  for cmd in select * from pg_event_trigger_ddl_commands() loop
    if cmd.command_tag = 'GRANT' and cmd.object_type in ('table', 'TABLE') then
      perform public.bot_tokens_revoke_clients();
      exit;
    end if;
  end loop;
end $$;

do $$ begin
  if to_regprocedure('public.bot_tokens_revoke_clients()') is null then
    raise notice 'bot_tokens_revoke_clients fehlt. Zuerst 20261018010000 anwenden.';
    return;
  end if;
  execute 'revoke execute on function public.bot_tokens_revoke_clients() from public, anon, authenticated';
end $$;
