-- Geheimnis für das iPhone-Kalenderabo. Nur der SHA-256-Hash, nie der Token.
-- RLS an, keine Policy, keine Rechte für anon oder authenticated. Nur die Service-Role der Function calendar-feed.

create table if not exists public.calendar_feed_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  token_hash text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists calendar_feed_tokens_hash_idx on public.calendar_feed_tokens (token_hash);

alter table public.calendar_feed_tokens enable row level security;

revoke all on table public.calendar_feed_tokens from public, anon, authenticated;
grant all on table public.calendar_feed_tokens to service_role;
