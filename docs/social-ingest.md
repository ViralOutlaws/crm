# Social-Media-Ingest (für Marky)

Neue oder geänderte Posts für den CRM-Bereich **Social Media** (crm.viraloutlaws.de) per HTTP einspielen.
Daten: Tabelle `social_media_posts` (Supabase, EU/Irland), Dateien im privaten Bucket `social-assets`.

- **URL & Secret:** `/workspace/.secrets/marky-social-ingest.env` (`SOCIAL_INGEST_URL`, `SOCIAL_INGEST_SECRET`). Secret niemals ausgeben oder committen.
- **Auth:** Header `x-webhook-secret: $SOCIAL_INGEST_SECRET`, `Content-Type: application/json`, immer `POST`.
- **Schnellweg:** `python3 /workspace/crm/scripts/social_ingest.py posts.json` – legt alle Posts an/aktualisiert sie und lädt die Dateien aus `asset_pfade` hoch (`--no-assets` = nur Texte).

## 1. Posts anlegen/aktualisieren (`action: "upsert"`, Standard)
Body: ein Post-Objekt, eine Liste oder `{"posts": [...]}` (max. 100). Upsert über `id` (= externe ID), also beliebig oft wiederholbar.

| Feld | Typ | Pflicht | Hinweis |
|---|---|---|---|
| `id` | string | ja | externe ID, `A-Z a-z 0-9 . _ -`, max 120 (z. B. `2026-10-19_karussell_servus-aus-woringen`) |
| `datum` | string | – | `YYYY-MM-DD` |
| `uhrzeit` | string | – | Freitext, z. B. `18:30` oder `12:00 (Frame 1)` |
| `format` | string | – | `Beitrag` · `Karussell` · `Story` · `Reel` |
| `format_detail` | string | – | z. B. `Karussell (6 Slides, 1080×1350)` |
| `saeule` | string | – | `Webdesign` · `KI` · `Performance-Marketing` · `Ratgeber` · `Referenz` · `Kim & Allgäu` |
| `status` | string | – | `Idee` (Standard) · `Geplant` · `Content fertig` · `Erstellt` · `Veröffentlicht` |
| `thema`, `hook`, `caption` | string | – | Caption max 5000 Zeichen (bei Stories: Caption-Idee) |
| `hashtags` | string[] oder string | – | Liste oder leerzeichengetrennt |
| `visual_hinweise`, `cta`, `quelle`, `freigabe`, `content_ordner`, `reel_skript` | string | – | |

Unbekannte Felder (z. B. `asset_pfade`) werden ignoriert. `<` und `>` werden entfernt.
Hinweis: Ein Upsert überschreibt alle Textfelder des Posts – leere/fehlende Felder werden geleert, Dateien bleiben erhalten.

```bash
set -a; . /workspace/.secrets/marky-social-ingest.env; set +a
curl -s -X POST "$SOCIAL_INGEST_URL" -H "x-webhook-secret: $SOCIAL_INGEST_SECRET" -H "Content-Type: application/json" \
  -d '{"posts":[{"id":"2026-11-16_beitrag_beispiel","datum":"2026-11-16","uhrzeit":"18:30","format":"Beitrag","saeule":"KI","status":"Idee","thema":"Beispiel","caption":"Text …","hashtags":"#memmingen #allgäu"}]}'
# -> {"ok":true,"upserted":1,"posts":[{"id":"<uuid>","external_id":"2026-11-16_beitrag_beispiel"}]}
```

## 2. Dateien hochladen (2 Schritte, max. 50 MB pro Datei)
**a) Upload-URL holen** (Post muss existieren). Gleicher Dateiname = ersetzen.
```bash
curl -s -X POST "$SOCIAL_INGEST_URL" -H "x-webhook-secret: $SOCIAL_INGEST_SECRET" -H "Content-Type: application/json" \
  -d '{"action":"asset-upload-url","external_id":"2026-11-16_beitrag_beispiel","filename":"slide_01.png","content_type":"image/png","size":1834221,"order":1}'
# -> {"ok":true,"path":"…/slide_01.png","upload_url":"https://…","method":"PUT","headers":{"Content-Type":"image/png","x-upsert":"true"},"expires_in_s":7200}
```
`filename`: `A-Z a-z 0-9 . _ - ( )` und Leerzeichen. `content_type`: `image/*`, `video/*` oder `application/pdf`. `order` = Reihenfolge (Slide/Frame).

**b) Datei hochladen:**
```bash
curl -s -X PUT "<upload_url>" -H "Content-Type: image/png" -H "x-upsert: true" --data-binary @slide_01.png
```

## 3. Weitere Aktionen
- Datei löschen: `{"action":"asset-delete","external_id":"…","filename":"slide_01.png"}`
- Übersicht: `{"action":"list"}` → alle Posts mit Status und Anzahl Dateien

## Fehler
`401` Secret falsch · `400` Validierung (Meldung nennt das Feld) · `404` Post unbekannt (erst upsert) · `413` JSON > 2 MB · `500` Datenbank/Storage.

## Im CRM
Social Media → Wochen- oder Listenansicht, Filter nach Säule/Format/Status, Status direkt änderbar, Vorschau, Einzel-Download, „Alle als ZIP“, „Caption kopieren“ (Caption + Hashtags).
Der alte „Content Planer“ ist nur ausgeblendet; Tabelle `social_posts` bleibt unverändert.
