-- Seitentext der Startseite für das belegte Kompliment im Einstieg der Outreach-Mail.
-- Neue Spalte. Keine Umbenennung, keine Belegnummern.

alter table public.outreach_targets add column if not exists page_excerpt text;
