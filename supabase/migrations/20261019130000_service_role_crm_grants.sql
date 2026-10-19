-- service_role umgeht RLS, braucht aber eigene Tabellenrechte.
-- Nur die Spalten, die Edge Functions mit der Service-Role wirklich lesen oder schreiben.
-- kal_events hat im CRM kein updated_at; die Spalte wird hier nicht vergeben.
-- Schon vergeben und hier nicht angefasst: bot_tokens, bot_runs, calendar_feed_tokens,
-- jarvis_actions (grant all) und integration_secrets (select). jarvis-dispatch schreibt
-- Aufgaben mit dem Nutzer-JWT, die Service-Role dort nur bot_runs.

-- calendar-feed liest offene Aufgaben und Termine.
grant select (id, workspace_id, titel, beschreibung, faellig, status)
  on public.aufgaben to service_role;
grant select (id, workspace_id, titel, datum, zeit, notiz)
  on public.kal_events to service_role;

-- bot-api mirror setzt die verknüpfte Aufgabe auf done und hängt das Ergebnis an.
grant update (status, beschreibung, updated_at)
  on public.aufgaben to service_role;

-- bot-api create_contacts liest Dubletten und legt Kontakte an.
-- website-lead liest, führt zusammen und legt Kontakte an.
grant select (id, workspace_id, firma, plz, email, web, tel, notizen, created_at)
  on public.contacts to service_role;
grant insert (
  id, workspace_id, firma, person, branche, str, plz, ort, tel, email, web,
  status, quelle, ana, notes, archiviert, notizen, dokumente, checks, meta, updated_at
) on public.contacts to service_role;
grant update (notizen, tel, web, updated_at)
  on public.contacts to service_role;

-- social-post liest, legt an und ändert Redaktionsplan-Zeilen.
grant select (id, workspace_id, external_id, datum, format, saeule, status, assets)
  on public.social_media_posts to service_role;
grant insert (
  workspace_id, external_id, datum, uhrzeit, format, format_detail, saeule, thema, hook,
  caption, hashtags, visual_hinweise, cta, quelle, freigabe, content_ordner, reel_skript,
  status, updated_at
) on public.social_media_posts to service_role;
grant update (
  workspace_id, external_id, datum, uhrzeit, format, format_detail, saeule, thema, hook,
  caption, hashtags, visual_hinweise, cta, quelle, freigabe, content_ordner, reel_skript,
  status, assets, updated_at
) on public.social_media_posts to service_role;
