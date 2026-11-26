-- Outreach 26.11.2026: Allgäu als einzige aktive Region, dauerhaftes Anti-Doppel-Tracking, schnellerer Nachtlauf.
-- Keine Spalte wird umbenannt. Gebiete werden nicht gelöscht, nur über active_regions ausgeblendet.

-- 1) Regionen: Gebiete bekommen einen Regionsschlüssel, die Einstellungen eine Liste aktiver Regionen.
alter table public.outreach_areas add column if not exists region text;
update public.outreach_areas set region = lower(state) where region is null;
update public.outreach_areas set region = 'allgaeu' where id in ('memmingen', 'kempten');

alter table public.outreach_settings add column if not exists active_regions text[] not null default array['allgaeu']::text[];
update public.outreach_settings set active_regions = array['allgaeu']::text[];

-- 2) Durchsatz: bis zu 6 Websites pro Lauf, Standard 4.
alter table public.outreach_settings drop constraint if exists outreach_settings_prep_chk;
alter table public.outreach_settings add constraint outreach_settings_prep_chk check (
  prep_from >= 0 and prep_until <= 24 and prep_from < prep_until
  and prep_target between 1 and 200 and prep_batch between 1 and 6
);
update public.outreach_settings set prep_batch = 4 where prep_batch < 4;

-- 3) Vorrat und Ziele merken sich OSM-ID und das echte OSM-Merkmal.
alter table public.outreach_pool add column if not exists osm_id text;
alter table public.outreach_pool add column if not exists kind text;
alter table public.outreach_targets add column if not exists osm_id text;

-- 4) Dauerhaftes Gedächtnis: wer wann welche Mail bekommen hat. Auch alte Listen außerhalb des CRM.
create table if not exists public.outreach_contacted (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ref text not null,
  firma text,
  domain text,
  email text,
  osm_id text,
  ort text,
  sent_at timestamptz,
  subject text,
  source text not null default 'crm',
  draft_id uuid,
  note text,
  created_at timestamptz not null default now(),
  unique (workspace_id, ref)
);
create index if not exists outreach_contacted_email_idx on public.outreach_contacted (workspace_id, lower(email));
create index if not exists outreach_contacted_domain_idx on public.outreach_contacted (workspace_id, domain);
create index if not exists outreach_contacted_sent_idx on public.outreach_contacted (workspace_id, sent_at desc);

alter table public.outreach_contacted enable row level security;
drop policy if exists outreach_contacted_all on public.outreach_contacted;
create policy outreach_contacted_all on public.outreach_contacted
  for all using (workspace_id = get_my_workspace_id()) with check (workspace_id = get_my_workspace_id());
grant select, insert, update, delete on public.outreach_contacted to authenticated;
grant all on public.outreach_contacted to service_role;

-- Jede gesendete Outreach-Mail landet automatisch im Gedächtnis, egal über welchen Weg sie rausging.
create or replace function public.outreach_remember_sent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'gesendet' and (old.status is distinct from 'gesendet') then
    insert into public.outreach_contacted (workspace_id, ref, firma, domain, email, osm_id, ort, sent_at, subject, source, draft_id)
    select new.workspace_id, 'draft:' || new.id, t.firma, nullif(lower(regexp_replace(coalesce(t.domain, ''), '^www\.', '')), ''),
           lower(new.email), t.osm_id, t.ort, coalesce(new.sent_at, now()), new.subject, 'crm', new.id
    from (select 1) one
    left join public.outreach_targets t on t.id = new.target_id
    on conflict (workspace_id, ref) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists outreach_remember_sent on public.outreach_drafts;
create trigger outreach_remember_sent after update of status on public.outreach_drafts
  for each row execute function public.outreach_remember_sent();

-- Bisher gesendete CRM-Mails nachtragen (auch die später abgemeldeten).
insert into public.outreach_contacted (workspace_id, ref, firma, domain, email, osm_id, ort, sent_at, subject, source, draft_id)
select d.workspace_id, 'draft:' || d.id, t.firma, nullif(lower(regexp_replace(coalesce(t.domain, ''), '^www\.', '')), ''),
       lower(d.email), t.osm_id, t.ort, d.sent_at, d.subject, 'crm', d.id
from public.outreach_drafts d
left join public.outreach_targets t on t.id = d.target_id
where d.sent_at is not null
on conflict (workspace_id, ref) do nothing;

-- 5) Nachtlauf alle 5 statt 15 Minuten. Außerhalb des Fensters endet jeder Aufruf sofort.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.alter_job(jobid, schedule => '*/5 * * * *') from cron.job where jobname = 'outreach-night';
  end if;
end $$;
