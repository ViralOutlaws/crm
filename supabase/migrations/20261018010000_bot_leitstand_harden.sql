-- Härtung Bot-Leitstand. Idempotent. Nicht automatisch auf die Live-Datenbank anwenden.
-- Liegt nach 20261017240000. Ändert keine Spaltennamen.
-- Die Jarvis-Oberfläche liest bot_runs nur. status, result und events schreiben
-- jarvis-dispatch (Service-Role, nach geprüftem Nutzer-JWT) und bot-api.
-- Abbrechen in der Oberfläche ändert die Tabelle nicht.

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

  execute 'revoke insert, update on table public.bot_runs from authenticated';
  execute 'grant insert (workspace_id, bot, aufgabe_id, title, instructions, links) on table public.bot_runs to authenticated';
  execute 'grant update (bot, aufgabe_id, title, instructions, links, updated_at) on table public.bot_runs to authenticated';
  execute 'drop trigger if exists bot_runs_guard on public.bot_runs';
  execute 'create trigger bot_runs_guard before insert or update on public.bot_runs for each row execute function public.bot_runs_guard()';
end $$;

-- bot_tokens: Default Privileges hängen am CREATE TABLE und lassen sich nicht an diese
-- eine bestehende Tabelle binden, ohne künftige CRM-Tabellen mitzuschließen.
-- Deshalb ein expliziter Revoke und ein Event-Trigger, der ein späteres GRANT an
-- anon oder authenticated wieder entzieht. service_role bleibt.
-- Tabellen- und Spaltenrechte. Spaltennamen bleiben; die Liste kommt aus dem Katalog,
-- damit ein später hinzugefügtes Feld nicht über ein Spalten-GRANT offen bleibt.
create or replace function public.bot_tokens_revoke_clients()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cols text;
begin
  if to_regclass('public.bot_tokens') is null then
    return;
  end if;
  revoke all on table public.bot_tokens from public, anon, authenticated;
  select string_agg(quote_ident(attname), ', ' order by attnum)
    into cols
    from pg_attribute
   where attrelid = 'public.bot_tokens'::regclass
     and attnum > 0
     and not attisdropped;
  if cols is not null then
    execute format(
      'revoke all (%s) on table public.bot_tokens from public, anon, authenticated',
      cols
    );
  end if;
end $$;

do $$ begin
  if to_regclass('public.bot_tokens') is null then
    raise notice 'bot_tokens fehlt. Zuerst 20261017240000 anwenden.';
    return;
  end if;
  execute 'grant all on table public.bot_tokens to service_role';
  perform public.bot_tokens_revoke_clients();
end $$;

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
    if cmd.command_tag = 'GRANT'
       and coalesce(cmd.schema_name, 'public') = 'public'
       and cmd.object_identity like '%bot_tokens%' then
      perform public.bot_tokens_revoke_clients();
    end if;
  end loop;
end $$;

drop event trigger if exists bot_tokens_lock_grants;
create event trigger bot_tokens_lock_grants
  on ddl_command_end
  when tag in ('GRANT')
  execute function public.bot_tokens_lock_grants();
