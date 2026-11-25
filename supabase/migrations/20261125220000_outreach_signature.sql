-- Geschäftssignatur für Outreach-Mails (Name, Adresse, Kontakt, Impressum).
-- Der Versand hängt sie an jede Mail an. In den Outreach-Einstellungen änderbar.
alter table public.outreach_settings add column if not exists signature text;

-- Vorbelegen aus den Firmendaten im CRM (settings.data ist JSON-Text).
with company as (
  select p.workspace_id, (s.data::jsonb) as d
  from public.settings s
  join public.profiles p on p.id = s.user_id
  where coalesce(nullif(trim((s.data::jsonb)->>'str'), ''), nullif(trim((s.data::jsonb)->>'plz'), '')) is not null
)
update public.outreach_settings o
set signature = concat_ws(E'\n',
    coalesce(nullif(trim(c.d->>'inhaber'), ''), 'Kim Lukas Tobler'),
    coalesce(nullif(trim(c.d->>'name'), ''), 'Viral Outlaws'),
    nullif(concat_ws(', ', nullif(trim(c.d->>'str'), ''), nullif(trim(c.d->>'plz'), '')), ''),
    nullif(concat_ws(' · ', 'Tel. ' || nullif(trim(c.d->>'tel'), ''), nullif(trim(c.d->>'email'), '')), ''),
    nullif(regexp_replace(trim(coalesce(c.d->>'web', '')), '^https?://', ''), ''),
    'Impressum: https://www.viraloutlaws.de/impressum'
  ),
  updated_at = now()
from company c
where c.workspace_id = o.workspace_id
  and (o.signature is null or trim(o.signature) = '');
