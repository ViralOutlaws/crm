-- Buffer -> CRM Sync: pg_cron ruft alle 15 Minuten die Edge Function buffer-sync auf.
-- Das Shared Secret liegt NICHT hier, sondern im Supabase Vault (Name 'buffer_sync_secret')
-- und als Function-Secret BUFFER_SYNC_SECRET. Einrichten (einmalig, ohne das Secret zu loggen):
--   select vault.create_secret('<secret>', 'buffer_sync_secret', 'Header x-sync-secret für buffer-sync');
create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'buffer-sync';

select cron.schedule(
  'buffer-sync',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://jjfmxiqippkgqkwihgek.supabase.co/functions/v1/buffer-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'buffer_sync_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
