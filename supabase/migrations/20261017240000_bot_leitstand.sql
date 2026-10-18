-- Bot-Leitstand. Idempotent. Nicht automatisch auf die Live-Datenbank anwenden.
-- bot_runs: eingeloggte Nutzer nur im eigenen Workspace, wie die anderen CRM-Tabellen.
-- bot_tokens: kein anon, kein authenticated. Nur die Service-Role (Edge Function bot-api).

create table if not exists public.bot_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  bot text not null,
  aufgabe_id uuid references public.aufgaben(id) on delete set null,
  title text not null,
  instructions text not null default '',
  status text not null default 'queued',
  result text,
  links jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  events jsonb not null default '[]'::jsonb
);

alter table public.bot_runs add column if not exists aufgabe_id uuid references public.aufgaben(id) on delete set null;
alter table public.bot_runs add column if not exists title text;
alter table public.bot_runs add column if not exists instructions text not null default '';
alter table public.bot_runs add column if not exists status text not null default 'queued';
alter table public.bot_runs add column if not exists result text;
alter table public.bot_runs add column if not exists links jsonb not null default '[]'::jsonb;
alter table public.bot_runs add column if not exists created_by uuid;
alter table public.bot_runs add column if not exists created_at timestamptz not null default now();
alter table public.bot_runs add column if not exists updated_at timestamptz not null default now();
alter table public.bot_runs add column if not exists events jsonb not null default '[]'::jsonb;

alter table public.bot_runs drop constraint if exists bot_runs_bot_check;
alter table public.bot_runs add constraint bot_runs_bot_check
  check (bot in ('webby', 'marky', 'saley', 'cashy', 'developy'));

alter table public.bot_runs drop constraint if exists bot_runs_status_check;
alter table public.bot_runs add constraint bot_runs_status_check
  check (status in ('queued', 'sent', 'in_arbeit', 'erledigt', 'blockiert', 'fehler'));

create index if not exists bot_runs_ws_bot_created_idx
  on public.bot_runs (workspace_id, bot, created_at desc);

alter table public.bot_runs enable row level security;
drop policy if exists workspace_access on public.bot_runs;
create policy workspace_access on public.bot_runs
  for all to authenticated
  using (workspace_id = public.get_my_workspace_id())
  with check (workspace_id = public.get_my_workspace_id());

revoke all on public.bot_runs from anon;
grant select, insert, update, delete on public.bot_runs to authenticated;
grant all on public.bot_runs to service_role;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bot_runs'
     ) then
    alter publication supabase_realtime add table public.bot_runs;
  end if;
end $$;

-- id ist der Surrogat-Schlüssel. Gespeichert wird nur der SHA-256 des Tokens, nie der Token selbst.
create table if not exists public.bot_tokens (
  id uuid primary key default gen_random_uuid(),
  bot text not null,
  workspace_id uuid not null references public.workspaces(id),
  token_hash text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.bot_tokens add column if not exists bot text;
alter table public.bot_tokens add column if not exists workspace_id uuid references public.workspaces(id);
alter table public.bot_tokens add column if not exists token_hash text;
alter table public.bot_tokens add column if not exists created_at timestamptz not null default now();
alter table public.bot_tokens add column if not exists revoked_at timestamptz;

alter table public.bot_tokens drop constraint if exists bot_tokens_bot_check;
alter table public.bot_tokens add constraint bot_tokens_bot_check
  check (bot in ('webby', 'marky', 'saley', 'cashy', 'developy'));

create unique index if not exists bot_tokens_hash_idx on public.bot_tokens (token_hash);

alter table public.bot_tokens enable row level security;
drop policy if exists workspace_access on public.bot_tokens;
revoke all on public.bot_tokens from anon, authenticated;
grant all on public.bot_tokens to service_role;
