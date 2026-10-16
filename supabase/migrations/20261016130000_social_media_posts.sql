-- Additiv: neuer Bereich "Social Media" (Redaktionsplan). Alte Tabelle social_posts (Content-Planer) bleibt unverändert.
create table if not exists public.social_media_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  external_id text not null,
  datum date,
  uhrzeit text,
  format text,              -- Beitrag | Karussell | Story | Reel
  format_detail text,
  saeule text,              -- Webdesign | KI | Performance-Marketing | Ratgeber | Referenz | Kim & Allgäu
  thema text,
  hook text,
  caption text,
  hashtags text[] not null default '{}',
  visual_hinweise text,
  cta text,
  quelle text,
  freigabe text,
  content_ordner text,
  reel_skript text,
  status text not null default 'Idee', -- Idee | Geplant | Content fertig | Erstellt | Veröffentlicht
  assets jsonb not null default '[]', -- [{order, filename, type, size, path}]
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, external_id)
);
create index if not exists social_media_posts_ws_datum on public.social_media_posts (workspace_id, datum);
alter table public.social_media_posts enable row level security;
drop policy if exists workspace_access on public.social_media_posts;
create policy workspace_access on public.social_media_posts for all
  using (workspace_id = get_my_workspace_id()) with check (workspace_id = get_my_workspace_id());
grant select, insert, update, delete on public.social_media_posts to authenticated;
grant all on public.social_media_posts to service_role;

-- Privater Storage-Bucket, Pfade: <workspace_id>/<external_id>/<datei>
insert into storage.buckets (id, name, public, file_size_limit)
values ('social-assets', 'social-assets', false, 52428800)
on conflict (id) do nothing;
drop policy if exists "social_assets_ws_read" on storage.objects;
create policy "social_assets_ws_read" on storage.objects for select to authenticated
  using (bucket_id = 'social-assets' and (storage.foldername(name))[1] = get_my_workspace_id()::text);
alter publication supabase_realtime add table public.social_media_posts;
