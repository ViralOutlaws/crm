-- Beobachtungen je Firma und die dafür genutzten Punkte am Entwurf.
-- Neue Spalten. Keine Umbenennung, keine Belegnummern.
-- Nicht von allein auf die Live-Datenbank anwenden.

alter table public.outreach_targets add column if not exists observations jsonb not null default '[]'::jsonb;
alter table public.outreach_targets add column if not exists branche text;

alter table public.outreach_targets drop constraint if exists outreach_targets_status_chk;
alter table public.outreach_targets
  add constraint outreach_targets_status_chk
  check (status in ('neu', 'recherchiert', 'uebersprungen', 'fehler', 'duenn'));

alter table public.outreach_drafts add column if not exists observations jsonb not null default '[]'::jsonb;
