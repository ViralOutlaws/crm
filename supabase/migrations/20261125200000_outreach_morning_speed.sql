-- Versandtakt jede Minute. Der Nachtlauf bleibt 01:00 bis 07:00 Berlin.
-- outreach-send prüft den gespeicherten Abstand (1, 2, 3 oder 5 Minuten). Eine Minute ist die schnellste Stufe.
-- outreach-night prüft das Berliner Fenster selbst. Der Cron darf öfter laufen, Overpass nur innerhalb des Fensters.
-- Nicht von allein auf die Live-Datenbank anwenden.

alter table public.outreach_settings alter column daily_limit set default 50;
alter table public.outreach_settings alter column gap_minutes set default 2;
alter table public.outreach_settings alter column prep_from set default 1;
alter table public.outreach_settings alter column prep_until set default 7;

alter table public.outreach_settings drop constraint if exists outreach_settings_gap_chk;
alter table public.outreach_settings
  add constraint outreach_settings_gap_chk
  check (gap_minutes in (1, 2, 3, 5));

alter table public.outreach_profiles add column if not exists region text not null default 'Deutschland';

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'outreach-send';

select cron.schedule(
  'outreach-send',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://jjfmxiqippkgqkwihgek.supabase.co/functions/v1/outreach-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-outreach-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'outreach_cron_secret' limit 1)
    ),
    body := '{"op":"send"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

select cron.unschedule(jobid) from cron.job where jobname = 'outreach-night';

select cron.schedule(
  'outreach-night',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://jjfmxiqippkgqkwihgek.supabase.co/functions/v1/outreach-night',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-outreach-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'outreach_cron_secret' limit 1)
    ),
    body := '{"op":"run"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
