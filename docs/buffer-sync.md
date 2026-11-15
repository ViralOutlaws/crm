# Buffer → CRM Sync

Die Edge Function `buffer-sync` spiegelt Instagram-Posts aus Buffer (Org `6af8e48cf0ed12641d594e71`,
Channel `6af8e4ed62b70b94b0345d48`) nach `social_media_posts`. pg_cron-Job `buffer-sync` läuft alle 15 Minuten.

| Buffer | CRM |
|---|---|
| `scheduled` / `sending` | Status `Geplant` |
| `sent` | Status `Veröffentlicht`, `quelle` = Instagram-Link |
| `error` | Status `Geplant`, `meta.buffer_status = 'error'`, `meta.buffer_error` |
| nicht mehr in Buffer (war geplant) | `meta.buffer_status = 'removed'` (wird nicht gelöscht) |

- Format: reel → Reel, story → Story, Post mit mehreren Medien → Karussell, sonst Beitrag.
- `datum`/`uhrzeit` in Europe/Berlin (sentAt, sonst dueAt).
- Buffer überschreibt nur: status, datum, uhrzeit, caption, hashtags, format, quelle, meta.buffer_* / due_at / sent_at /
  external_link / instagram_type, automatisch erzeugtes format_detail und Buffer-Medien in `assets`.
- CRM-Felder (saeule, freigabe, reel_skript, visual_hinweise, cta, thema, hook) werden nur beim Anlegen vorbelegt.
  Assets mit Storage-Pfad (`path`) werden nie überschrieben.
- Nur Zeilen mit Buffer-ID (24 Hex-Zeichen) oder `meta.source = 'buffer'` werden angefasst.

Secrets (nie ins Repo): `BUFFER_API_KEY`, `BUFFER_SYNC_SECRET` (Function-Secrets) und Vault-Eintrag `buffer_sync_secret`
(gleicher Wert wie `BUFFER_SYNC_SECRET`). Manuell testen: `POST /functions/v1/buffer-sync` mit Header `x-sync-secret`,
Body `{"dry_run": true}` zeigt nur die geplanten Änderungen.

## Vorschaubilder

Pro Buffer-Post lädt der Sync das Buffer-Thumbnail (bzw. das erste Bild) einmal herunter und legt es privat in
`social-assets/<workspace_id>/buffer/<buffer_id>/thumb.jpg` ab. In `assets` steht es als Eintrag mit
`role: "thumbnail"` und `source_url`. Neu geladen wird nur, wenn Buffer ein anderes Thumbnail liefert; es gibt immer
genau einen Eintrag. Kims hochgeladene Dateien bleiben unverändert, das Vorschaubild zählt nicht als CRM-Datei.
Die Oberfläche zeigt es als Cover (signierte URL) und blendet es aus Dateiliste und ZIP aus.
