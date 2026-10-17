-- Protokoll für Schreibaktionen von Jarvis. Nicht live ausführen – Kim wendet die Migration selbst an.
-- Keine Änderung an bestehenden Tabellen oder Spalten. Löschen und Ändern der Logzeilen ist nicht vorgesehen.

create table if not exists public.jarvis_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('insert', 'update')),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint jarvis_actions_table_chk check (
    table_name in (
      'contacts', 'aufgaben', 'wiedervorlagen', 'kal_events',
      'angebote', 'rechnungen', 'social_media_posts',
      'retainer', 'ausgaben', 'roi_daten'
    )
  )
);

create index if not exists jarvis_actions_ws_created_idx
  on public.jarvis_actions (workspace_id, created_at desc);

alter table public.jarvis_actions enable row level security;

drop policy if exists jarvis_actions_select on public.jarvis_actions;
create policy jarvis_actions_select on public.jarvis_actions
  for select to authenticated
  using (user_id = auth.uid() and workspace_id = public.get_my_workspace_id());

drop policy if exists jarvis_actions_insert on public.jarvis_actions;
create policy jarvis_actions_insert on public.jarvis_actions
  for insert to authenticated
  with check (user_id = auth.uid() and workspace_id = public.get_my_workspace_id());

revoke all on public.jarvis_actions from anon;
grant select, insert on public.jarvis_actions to authenticated;
grant all on public.jarvis_actions to service_role;
