-- Outreach: Ziele, Entscheider, Freigabe, Versandprotokoll, Sperrliste.
-- Neue Tabellen. Keine Umbenennung vorhandener Spalten, keine Änderung an Belegnummern.
-- Diese Datei liegt im Repo. Sie wird nicht von allein auf die Live-Datenbank angewendet.

create table if not exists public.outreach_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  daily_limit int not null default 20,
  gap_minutes int not null default 5,
  guess_emails boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint outreach_settings_limit_chk check (daily_limit between 1 and 100),
  constraint outreach_settings_gap_chk check (gap_minutes between 1 and 120)
);

create table if not exists public.outreach_targets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source text not null default 'url',
  input_url text,
  query text,
  firma text,
  web text,
  domain text,
  str text,
  plz text,
  ort text,
  impressum_url text,
  excerpt text,
  status text not null default 'neu',
  skip_reason text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_targets_source_chk check (source in ('url', 'search')),
  constraint outreach_targets_status_chk check (status in ('neu', 'recherchiert', 'uebersprungen', 'fehler'))
);

create table if not exists public.outreach_people (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  target_id uuid not null references public.outreach_targets(id) on delete cascade,
  person text,
  rolle text,
  email text,
  email_art text not null default 'generisch',
  hinweis text,
  adresse text,
  created_at timestamptz not null default now(),
  constraint outreach_people_art_chk check (email_art in ('veroeffentlicht', 'generisch', 'vermutet'))
);

create table if not exists public.outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  target_id uuid references public.outreach_targets(id) on delete set null,
  person_id uuid references public.outreach_people(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  subject text,
  body text,
  reply_body text,
  status text not null default 'entwurf',
  email text,
  email_art text not null default 'generisch',
  guess_ok boolean not null default false,
  approved_at timestamptz,
  sent_at timestamptz,
  message_id text,
  unread boolean not null default false,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_drafts_status_chk check (status in ('entwurf', 'freigegeben', 'gesendet', 'antwort', 'abgemeldet', 'abgelehnt')),
  constraint outreach_drafts_art_chk check (email_art in ('veroeffentlicht', 'generisch', 'vermutet'))
);

create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  draft_id uuid not null references public.outreach_drafts(id) on delete cascade,
  direction text not null,
  from_addr text,
  to_addrs text,
  subject text,
  body_text text,
  message_id text,
  in_reply_to text,
  created_at timestamptz not null default now(),
  constraint outreach_messages_dir_chk check (direction in ('in', 'out'))
);

create table if not exists public.outreach_blocklist (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null,
  value text not null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (workspace_id, kind, value),
  constraint outreach_blocklist_kind_chk check (kind in ('email', 'domain'))
);

create index if not exists outreach_targets_ws_idx on public.outreach_targets (workspace_id, created_at desc);
create index if not exists outreach_people_target_idx on public.outreach_people (target_id);
create index if not exists outreach_drafts_ws_status_idx on public.outreach_drafts (workspace_id, status, updated_at desc);
create index if not exists outreach_messages_draft_idx on public.outreach_messages (draft_id, created_at);
create index if not exists outreach_drafts_email_idx on public.outreach_drafts (workspace_id, lower(email));

alter table public.outreach_settings enable row level security;
alter table public.outreach_targets enable row level security;
alter table public.outreach_people enable row level security;
alter table public.outreach_drafts enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.outreach_blocklist enable row level security;

do $$
declare t text;
begin
  foreach t in array array['outreach_settings','outreach_targets','outreach_people','outreach_drafts','outreach_messages','outreach_blocklist']
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
