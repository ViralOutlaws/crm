-- Additiv: Herkunft von Leads (z. B. website-kontakt, website-ki-check) + Metadaten (Seite, Referrer, UTM)
alter table public.contacts add column if not exists quelle text;
alter table public.contacts add column if not exists meta jsonb;
create index if not exists contacts_email_created_idx on public.contacts (workspace_id, lower(email), created_at desc);
