-- Sicherheit: Profile sperren (role/workspace_id/email/id nur serverseitig änderbar), RLS-Lücken schließen.
create or replace function public.protect_profile_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(),'') in ('authenticated','anon') then
    if tg_op = 'INSERT' then
      if new.workspace_id is not null or coalesce(new.role,'standard') <> 'standard' then
        raise exception 'profiles: workspace_id/role dürfen nicht selbst gesetzt werden';
      end if;
    else
      if new.id is distinct from old.id or new.role is distinct from old.role
         or new.workspace_id is distinct from old.workspace_id or new.email is distinct from old.email then
        raise exception 'profiles: nur name und avatar_url sind änderbar';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_profile_columns on public.profiles;
create trigger trg_protect_profile_columns before insert or update on public.profiles
  for each row execute function public.protect_profile_columns();

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles for insert to authenticated with check (id = auth.uid());

drop policy if exists "update own workspace" on public.workspaces;
create policy "update own workspace" on public.workspaces for update to authenticated
  using (id = public.get_my_workspace_id()) with check (id = public.get_my_workspace_id());
drop policy if exists "read own workspace" on public.workspaces;
create policy "read own workspace" on public.workspaces for select to authenticated using (id = public.get_my_workspace_id());

drop policy if exists "Users can update own settings" on public.settings;
create policy "Users can update own settings" on public.settings for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Legacy-Tabelle social_posts (wird vom ausgeblendeten Content-Planer noch referenziert): RLS an.
alter table public.social_posts enable row level security;
drop policy if exists workspace_access on public.social_posts;
create policy workspace_access on public.social_posts for all to authenticated
  using (workspace_id = public.get_my_workspace_id()) with check (workspace_id = public.get_my_workspace_id());

-- Workspace-Tabellen: nur für eingeloggte Nutzer, anon komplett raus
do $$ declare t text; begin
  foreach t in array array['contacts','angebote','rechnungen','aufgaben','kal_events','wiedervorlagen','retainer','ausgaben','roi_daten','ziele','social_media_posts'] loop
    execute format('drop policy if exists workspace_access on public.%I', t);
    execute format('create policy workspace_access on public.%I for all to authenticated using (workspace_id = public.get_my_workspace_id()) with check (workspace_id = public.get_my_workspace_id())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
revoke all on public.profiles, public.workspaces, public.settings, public.social_posts, public.integration_secrets, public.pakete from anon;
