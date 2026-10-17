# Jarvis

Sprach- und Chat-Oberfläche für den Alltag im CRM. Das alte CRM bleibt unter `/` als Backup erreichbar. Jarvis liegt unter `/jarvis/` und nutzt dieselbe Supabase-Anmeldung.

## Deploy der Funktionen

```bash
supabase functions deploy jarvis-chat
supabase functions deploy jarvis-tts
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set JARVIS_MODEL=claude-sonnet-5-5
supabase secrets set ELEVENLABS_API_KEY=...
supabase secrets set ELEVENLABS_VOICE_ID=amAPTcyESqCO9CgYuf64
supabase secrets set ELEVENLABS_MODEL=eleven_multilingual_v2
supabase secrets set ELEVENLABS_SPEED=1.2
```

`JARVIS_MODEL` ist optional. Ohne das Secret nimmt `jarvis-chat` `claude-sonnet-5-5`.

`ELEVENLABS_API_KEY` ist für die Stimme Pflicht. `ELEVENLABS_VOICE_ID` ist optional und steht sonst auf `amAPTcyESqCO9CgYuf64`. `ELEVENLABS_MODEL` ist optional: Standard `eleven_multilingual_v2`, schnellere Alternative `eleven_flash_v2_5`. Andere Werte werden ignoriert. `ELEVENLABS_SPEED` ist optional und setzt `voice_settings.speed`. Der Standard ist 1.2. Zahlen werden auf 0.7 bis 1.2 geklemmt, ungültige Angaben bleiben bei 1.2. Der ElevenLabs-Schlüssel bleibt nur serverseitig.

Beide Funktionen stehen in `supabase/config.toml` mit `verify_jwt = false`, weil sie das Nutzer-JWT selbst prüfen und OPTIONS für CORS beantworten müssen. Beim Deploy kein `--no-verify-jwt` setzen. `jarvis-chat` liest und schreibt mit dem JWT der angemeldeten Person, also unter RLS. Die Service-Role wird nicht verwendet. `jarvis-tts` prüft nur die Anmeldung und streamt `audio/mpeg`.

## Stimme

Live spricht Jarvis Satz für Satz, sobald der Chat einen Satz geliefert hat. Die Anfrage geht an `jarvis-tts` mit `{text}` (höchstens 1500 Zeichen). ElevenLabs bekommt `voice_settings.speed` 1.2, sofern `ELEVENLABS_SPEED` nichts anderes setzt (geklemmt auf 0.7 bis 1.2). Die Datei spielt der Browser zusätzlich mit `playbackRate` 1.2 und `preservesPitch` (`ELEVEN_PLAYBACK_RATE` in `jarvis/speech.js`, dort änderbar). Die Core-Animation folgt der laufenden Wiedergabe über einen Web-Audio-Analyser. Schlägt ElevenLabs fehl, spricht der Browser weiter, dann ohne dieses Tempo. Die Stummschaltung bleibt. Die Demo (`?demo=1`) ruft ElevenLabs nicht auf.

Ein lokales `localStorage.jarvis_fn` auf `http://localhost` oder `http://127.0.0.1` … `/jarvis-chat` lenkt die Stimme auf dasselbe Ziel mit `/jarvis-tts`.

## Lokal testen

Statische Dateien vom Repo-Wurzelverzeichnis aus:

```bash
python3 -m http.server 8765
```

Demo ohne Anmeldung und ohne Supabase-Aufruf: `http://127.0.0.1:8765/jarvis/?demo=1&noboot=1`

Die Funktion lokal gegen die gehostete API zu legen, geht über ein localhost-Proxy und `localStorage.jarvis_fn` (nur `http://localhost` oder `http://127.0.0.1`). Sonst ruft die Oberfläche `https://jjfmxiqippkgqkwihgek.supabase.co/functions/v1/jarvis-chat` auf.

## CORS

Erlaubt sind `https://crm.viraloutlaws.de` sowie `http://localhost` und `http://127.0.0.1` mit beliebigem Port. Andere Browser-Origins bekommen 403. Aufrufe ohne Origin (curl) sind erlaubt.

## Migration

`supabase/migrations/20261017190000_jarvis_actions.sql` legt das Protokoll `jarvis_actions` an. Nicht automatisch gegen die Live-Datenbank ausführen. Solange die Tabelle fehlt, bleibt die CRM-Schreibaktion erhalten und die Antwort enthält `log_warning`.

Für `entwurf`, `pausiert` und den Social-Status `Idee` ist keine weitere Migration nötig. Diese Spalten sind freier Text ohne CHECK.

## Bestätigung

Jede Schreibaktion erscheint zuerst als Karte (Zusammenfassung, Bestätigen, Abbrechen). Erst danach prüft `revalidate()` den Plan erneut und schreibt. Löschen, E-Mail-Versand und die Status Bezahlt oder Versendet gibt es nicht.

## Status

- Aufgaben, die Jarvis anlegt, haben immer `todo`, damit sie im Kanban sichtbar sind.
- Angebote und Rechnungen entstehen als `entwurf`. Das CRM kennt diesen Status in Dropdown, Filter und Badge. Speichern im CRM lässt den Entwurf stehen. Entwürfe zählen nicht als gesendete Angebote und nicht als offene oder überfällige Forderungen.
- Social-Entwürfe sind Status `Idee`. `Veröffentlicht` ändert Jarvis nicht. Format und Säule nutzen dieselben Werte wie der Redaktionsplan.
- Bot-Aufträge sind Aufgaben. Die erste Zeile der Beschreibung lautet `Zuständig: Marky (Marketing / Social).` Es gibt dafür keine neue Spalte. Im CRM steht dasselbe im Feld „Zugewiesen an Bot“ und auf der Karte.
- Termine haben keine Ende-Spalte. Steht ein Ende fest, liegt es in `notiz` als eigene Zeile `Bis: HH:MM`. Das CRM zeigt sie im Feld „Bis“.
- Retainer legt Jarvis standardmäßig als `pausiert` an. `aktiv` nur, wenn das ausdrücklich in der Karte steht. Pausierte Retainer zählen nicht im MRR.
- Kontakte nutzen die Phasen `lead`, `erstgespraech`, `angebot`, `gewonnen`, `verloren` und die Quellen `website`, `ki-check`, `empfehlung`, `instagram`, `google`, `kaltakquise`, `sonstiges`.
- Eine Gesprächsnotiz wird angehängt, nichts überschrieben: in `notes` als Block `[YYYY-MM-DD] Gespräch:` und zusätzlich als Timeline-Eintrag `{typ:'notiz'}`. Beides ist in der Kundenakte sichtbar.
- ROI-Kanäle von Jarvis sind `google`, `meta`, `instagram`, `seo`, `sonstiges`. Bestehende Werte `beide` und `sonstige` bleiben.
- Ausgaben dürfen eine freie Kategorie und einen MwSt-Satz zwischen 0 und 100 haben. Das CRM behält den Wert beim erneuten Speichern.

## Bereiche

Kontakte, Pipeline, Angebote, Rechnungen, Retainer, Pakete, Aufgaben, Wiedervorlagen, Kalender, Social (Woche/Monat, Medien über signierte Storage-URLs), Ausgaben, ROI und Ziele. Jedes Panel hat einen Link „Im CRM öffnen“ (`/?page=…`). Der Launcher „Bereiche“ und Sprache oder Text öffnen dieselben Panels. Filter wie „nur überfällige“ oder „nur Leads aus Instagram“ laufen über die Panel-Daten.

Das Morgen-Briefing läuft live einmal am Tag beim Öffnen und immer auf den Befehl „Briefing“. Die Kunden-Akte öffnet sich über „Was ist der Stand bei …“. Ein Gespräch wird als eine Karte aus Notiz, Aufgaben und Wiedervorlage vorgeschlagen.

## Service Worker

`/sw.js` fasst `/jarvis/` nicht an. Der CRM-Cache heißt `vo-crm-v5`, damit bestehende Installationen das neue `index.html` laden. Der Jarvis-Worker (`jarvis/sw.js`, Cache `jarvis-v2`) gilt nur für `/jarvis/`.

## Folgepunkte

Aufgaben abhaken, Löschen, Rechnungen als bezahlt oder versendet markieren, Mahnungen und E-Mails, Social-Dateien hochladen (Anzeige der Vorschaubilder ist da), Ziele und Paketpreise bearbeiten, Retainer-Rechnungen erzeugen, Posts veröffentlichen, Nutzer und Auswertungen. Die CRM-Navigation kennt Ausgaben, eine eigene Seitenhülle ist dort nicht vorhanden; Jarvis liest die Tabelle trotzdem.
