-- Additiv: Hash (SHA-256) des Webhook-Secrets für die Edge Function website-lead.
-- RLS aktiv ohne Policies => nur Service Role (Edge Function) kann lesen. Klartext wird nie gespeichert.
create table if not exists public.integration_secrets (
  name text primary key,
  sha256 text not null,
  updated_at timestamptz not null default now()
);
alter table public.integration_secrets enable row level security;
revoke all on public.integration_secrets from anon, authenticated;
grant select on public.integration_secrets to service_role;
