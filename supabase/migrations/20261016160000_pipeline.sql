-- Pipeline: Deal-Wert, nächster Schritt; Status auf feste Phasen migrieren (Originalwert in meta.status_alt)
alter table public.contacts add column if not exists deal_wert numeric(12,2);
alter table public.contacts add column if not exists naechster_schritt date;
alter table public.contacts add column if not exists naechster_schritt_text text;
create index if not exists contacts_ns_idx on public.contacts (workspace_id, naechster_schritt);

update public.contacts set
  meta = coalesce(meta,'{}'::jsonb) || jsonb_build_object('status_alt', status),
  status = case status when 'kontakt' then 'lead' when 'termin' then 'erstgespraech'
                       when 'angebot' then 'angebot' when 'offen' then 'angebot'
                       when 'kunde' then 'gewonnen' when 'absage' then 'verloren' else 'lead' end
where status is null or status not in ('lead','erstgespraech','angebot','gewonnen','verloren');

update public.contacts set
  meta = coalesce(meta,'{}'::jsonb) || jsonb_build_object('quelle_alt', quelle),
  quelle = case when quelle = 'website-ki-check' then 'ki-check' else 'website' end
where quelle like 'website-%';
