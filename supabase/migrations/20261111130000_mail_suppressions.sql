-- Verhindert, dass eine im CRM gelöschte IMAP-Mail beim nächsten Sync neu angelegt wird.
-- Die Zeile merkt sich nur den Fingerabdruck, keinen Kontakt und keinen Beleg.

create table if not exists public.mail_suppressions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  fingerprint text not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, fingerprint)
);

alter table public.mail_suppressions enable row level security;

drop policy if exists mail_suppressions_all on public.mail_suppressions;
create policy mail_suppressions_all on public.mail_suppressions
  for all to authenticated
  using (workspace_id = public.get_my_workspace_id())
  with check (workspace_id = public.get_my_workspace_id());

revoke all on public.mail_suppressions from anon, public;
grant select, insert, update, delete on public.mail_suppressions to authenticated;
grant all on public.mail_suppressions to service_role;
