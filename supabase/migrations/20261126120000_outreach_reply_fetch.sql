-- Outreach-Antworten: eigener Abruf (Cron), Autoreply-Kennzeichen, Doppelschutz. Keine Spalte umbenannt.
alter table public.outreach_messages add column if not exists auto boolean not null default false;
alter table public.outreach_messages add column if not exists imap_uid bigint;
alter table public.outreach_messages add column if not exists imap_folder text;
create unique index if not exists outreach_messages_imap_uniq
  on public.outreach_messages (workspace_id, imap_folder, imap_uid) where imap_uid is not null;

create table if not exists public.outreach_mail_cursor (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  imap_path text not null,
  last_uid bigint not null default 0,
  checked_at timestamptz,
  primary key (workspace_id, imap_path)
);
alter table public.outreach_mail_cursor enable row level security;
drop policy if exists outreach_mail_cursor_all on public.outreach_mail_cursor;
create policy outreach_mail_cursor_all on public.outreach_mail_cursor
  for all using (workspace_id = public.get_my_workspace_id()) with check (workspace_id = public.get_my_workspace_id());

-- Antworten alle 2 Minuten abholen (nur Outreach-Antworten, nichts anderes wird gespeichert).
do $$ begin
  perform cron.unschedule('outreach-replies') where exists (select 1 from cron.job where jobname = 'outreach-replies');
end $$;
select cron.schedule('outreach-replies', '*/2 * * * *', $cron$
  select net.http_post(
    url := 'https://jjfmxiqippkgqkwihgek.supabase.co/functions/v1/mail-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-outreach-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'outreach_cron_secret' limit 1)
    ),
    body := '{"op":"outreach"}'::jsonb,
    timeout_milliseconds := 60000
  );
$cron$);

-- Neue Tabellen bekommen hier keine Standardrechte: ausdrücklich vergeben.
grant select, insert, update, delete on public.outreach_mail_cursor to authenticated, service_role;
