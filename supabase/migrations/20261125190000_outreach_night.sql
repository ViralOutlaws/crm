-- Nachtlauf: Branchenprofile, kleine Gebiete, schon besuchte Zellen, Website-Warteschlange.
-- pg_cron ruft outreach-night alle 15 Minuten im Nachtfenster auf (UTC so, dass 01:00–07:00 Berlin im Winter und im Sommer getroffen wird).
-- Das Shared Secret ist dasselbe wie beim Versand: Vault-Name 'outreach_cron_secret', Function-Secret OUTREACH_CRON_SECRET.
-- Nicht von allein auf die Live-Datenbank anwenden.

alter table public.outreach_settings add column if not exists prep_from int not null default 1;
alter table public.outreach_settings add column if not exists prep_until int not null default 7;
alter table public.outreach_settings add column if not exists prep_target int not null default 50;
alter table public.outreach_settings add column if not exists prep_batch int not null default 3;
alter table public.outreach_settings add column if not exists prep_on boolean not null default true;
alter table public.outreach_settings add column if not exists prep_running_at timestamptz;

alter table public.outreach_settings drop constraint if exists outreach_settings_prep_chk;
alter table public.outreach_settings
  add constraint outreach_settings_prep_chk
  check (
    prep_from >= 0 and prep_until <= 24 and prep_from < prep_until
    and prep_target between 1 and 200
    and prep_batch between 1 and 4
  );

alter table public.outreach_targets drop constraint if exists outreach_targets_source_chk;
alter table public.outreach_targets
  add constraint outreach_targets_source_chk
  check (source in ('url', 'search', 'overpass'));

create table if not exists public.outreach_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  tags text[] not null default '{}',
  enabled boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outreach_areas (
  id text primary key,
  name text not null,
  state text not null,
  south double precision not null,
  west double precision not null,
  north double precision not null,
  east double precision not null,
  sort int not null default 0
);

create table if not exists public.outreach_coverage (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid not null references public.outreach_profiles(id) on delete cascade,
  area_id text not null,
  searched_at timestamptz not null default now(),
  hits int not null default 0,
  primary key (workspace_id, profile_id, area_id)
);

create table if not exists public.outreach_pool (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  url text not null,
  name text,
  profile_id uuid references public.outreach_profiles(id) on delete set null,
  area_id text,
  created_at timestamptz not null default now(),
  unique (workspace_id, url)
);

create index if not exists outreach_profiles_ws_idx on public.outreach_profiles (workspace_id, sort);
create index if not exists outreach_coverage_ws_idx on public.outreach_coverage (workspace_id, searched_at);
create index if not exists outreach_pool_ws_idx on public.outreach_pool (workspace_id, created_at);

alter table public.outreach_profiles enable row level security;
alter table public.outreach_coverage enable row level security;
alter table public.outreach_pool enable row level security;
alter table public.outreach_areas enable row level security;

do $$
declare t text;
begin
  foreach t in array array['outreach_profiles','outreach_coverage','outreach_pool']
  loop
    execute format('drop policy if exists %I_all on public.%I', t, t);
    execute format(
      'create policy %I_all on public.%I for all to authenticated using (workspace_id = public.get_my_workspace_id()) with check (workspace_id = public.get_my_workspace_id())',
      t, t
    );
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

drop policy if exists outreach_areas_read on public.outreach_areas;
drop policy if exists outreach_areas_insert on public.outreach_areas;
drop policy if exists outreach_areas_update on public.outreach_areas;
create policy outreach_areas_read on public.outreach_areas for select to authenticated using (true);
create policy outreach_areas_insert on public.outreach_areas for insert to authenticated with check (true);
create policy outreach_areas_update on public.outreach_areas for update to authenticated using (true) with check (true);
revoke all on public.outreach_areas from anon, public;
grant select, insert, update on public.outreach_areas to authenticated;
grant all on public.outreach_areas to service_role;

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'outreach-night';

select cron.schedule(
  'outreach-night',
  '*/15 23,0-6 * * *',
  $$
  select net.http_post(
    url := 'https://jjfmxiqippkgqkwihgek.supabase.co/functions/v1/outreach-night',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-outreach-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'outreach_cron_secret' limit 1)
    ),
    body := '{"op":"run"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
