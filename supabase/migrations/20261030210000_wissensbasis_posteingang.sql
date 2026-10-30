-- Wissensbasis, Pipeline-Schätzung, Kontakt-Mails und Posteingang.
-- Neue Spalten und Tabellen. Keine Umbenennung bestehender Spalten.

alter table public.contacts add column if not exists status_seit timestamptz;
alter table public.contacts add column if not exists ki_wert numeric(12,2);
alter table public.contacts add column if not exists ki_paket text;
alter table public.contacts add column if not exists ki_grund text;
alter table public.contacts add column if not exists ki_override boolean not null default false;

update public.contacts
set status_seit = coalesce(status_seit, updated_at, created_at, now())
where status_seit is null;

create table if not exists public.wissensbasis (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  section text not null,
  content text not null default '',
  updated_at timestamptz not null default now(),
  unique (workspace_id, section)
);

create table if not exists public.contact_emails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists contact_emails_ws_email_uidx
  on public.contact_emails (workspace_id, lower(email));

create table if not exists public.mail_folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  imap_path text not null,
  parent_path text,
  name text not null,
  delimiter text not null default '/',
  role text not null default 'other',
  uidvalidity text,
  last_uid bigint not null default 0,
  unique (workspace_id, imap_path)
);

create table if not exists public.mail_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  field text not null,
  contains text not null,
  target_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel text not null default 'email',
  subject text,
  contact_id uuid references public.contacts(id) on delete set null,
  suggested_contact_id uuid references public.contacts(id) on delete set null,
  status text not null default 'neu',
  klassifikation text,
  folder_path text,
  folder_role text,
  thread_key text,
  unread boolean not null default true,
  suggested_folder text,
  draft_body text,
  draft_status text,
  first_inbound_at timestamptz,
  first_reply_at timestamptz,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_ws_updated_idx
  on public.conversations (workspace_id, updated_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction text not null,
  from_addr text,
  to_addrs text,
  cc_addrs text,
  subject text,
  body_text text,
  body_html text,
  imap_uid bigint,
  imap_folder text,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_idx
  on public.messages (conversation_id, created_at);

insert into public.wissensbasis (workspace_id, section, content)
select w.id, s.section, s.content
from public.workspaces w
cross join (values
  ('ton', 'Du schreibst wie Kim von Viral Outlaws: klar, freundlich, auf Deutsch, ohne Floskeln. Wir sind eine Webdesign- und KI-Agentur. Kurze Absätze. Kein Druck, kein erfundener Smalltalk.'),
  ('begruessung', 'Guten Tag, wenn der Name fehlt. Sonst den Vornamen. Abschluss: Viele Grüße, Kim, Viral Outlaws.'),
  ('niemals', 'Erfinde nie Preise, Termine oder Referenzen. Schicke nie Zahlungslinks. Warte immer, bis Kim auf Senden drückt. Lösche nie etwas von allein.'),
  ('preise', 'Preise nur aus der Tabelle pakete und aus bestätigten Angeboten. Steht dort nichts, sag das und erfinde keine Zahl.')
) as s(section, content)
on conflict (workspace_id, section) do nothing;

alter table public.wissensbasis enable row level security;
alter table public.contact_emails enable row level security;
alter table public.mail_folders enable row level security;
alter table public.mail_rules enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

do $$
declare t text;
begin
  foreach t in array array['wissensbasis','contact_emails','mail_folders','mail_rules','conversations','messages']
  loop
    execute format('drop policy if exists %I_all on public.%I', t, t);
    execute format(
      'create policy %I_all on public.%I for all to authenticated using (workspace_id = public.get_my_workspace_id()) with check (workspace_id = public.get_my_workspace_id())',
      t, t
    );
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
