# Jarvis

Sprach- und Chat-Oberfläche für den Alltag im CRM. Das alte CRM bleibt unter `/` als Backup erreichbar. Jarvis liegt unter `/jarvis/` und nutzt dieselbe Supabase-Anmeldung.

## Deploy der Funktion

```bash
supabase functions deploy jarvis-chat
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set JARVIS_MODEL=claude-sonnet-5-5
```

`JARVIS_MODEL` ist optional. Ohne das Secret nimmt die Funktion `claude-sonnet-5-5`. Der Schlüssel bleibt nur serverseitig.

In `supabase/config.toml` steht `verify_jwt = false`, weil die Funktion das Nutzer-JWT selbst prüft und OPTIONS für CORS beantworten muss. Daten liest und schreibt sie mit dem JWT der angemeldeten Person, also unter RLS. Die Service-Role wird nicht verwendet.

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

## Bestätigung

Jede Schreibaktion erscheint zuerst als Karte (Zusammenfassung, Bestätigen, Abbrechen). Erst danach prüft `revalidate()` den Plan erneut und schreibt. Löschen, E-Mail-Versand und die Status Bezahlt oder Versendet gibt es nicht.

## Status

- Aufgaben, die Jarvis anlegt, haben immer `todo`, damit sie im Kanban sichtbar sind.
- Angebote entstehen als `entwurf`.
- Rechnungen entstehen ebenfalls als `entwurf`, obwohl das CRM-Dropdown nur Offen, Bezahlt und Überfällig kennt. So zählen sie nicht als offene Forderung. Ein späteres Speichern im CRM kann den Status auf Offen setzen.
- Social-Entwürfe sind Status `Idee`. `Veröffentlicht` ändert Jarvis nicht.
- Bot-Aufträge sind Aufgaben. Die erste Zeile der Beschreibung lautet `Zuständig: Marky (Marketing / Social).` Es gibt dafür keine neue Spalte.
- Retainer legt Jarvis standardmäßig als `pausiert` an. `aktiv` nur, wenn das ausdrücklich in der Karte steht.
- Eine Gesprächsnotiz wird an `notes` und an die Notiz-Timeline angehängt. Vorhandene Notizen bleiben.

## Bereiche

Kontakte, Pipeline, Angebote, Rechnungen, Retainer, Pakete, Aufgaben, Wiedervorlagen, Kalender, Social (Woche/Monat, Medien über signierte Storage-URLs), Ausgaben, ROI und Ziele. Jedes Panel hat einen Link „Im CRM öffnen“ (`/?page=…`). Der Launcher „Bereiche“ und Sprache oder Text öffnen dieselben Panels. Filter wie „nur überfällige“ oder „nur Leads aus Instagram“ laufen über die Panel-Daten.

Das Morgen-Briefing läuft live einmal am Tag beim Öffnen und immer auf den Befehl „Briefing“. Die Kunden-Akte öffnet sich über „Was ist der Stand bei …“. Ein Gespräch wird als eine Karte aus Notiz, Aufgaben und Wiedervorlage vorgeschlagen.

## Service Worker

`/sw.js` fasst `/jarvis/` nicht an. Der Jarvis-Worker (`jarvis/sw.js`, Cache `jarvis-v1`) gilt nur für `/jarvis/`.

## Folgepunkte

Aufgaben abhaken, Löschen, Rechnungen als bezahlt oder versendet markieren, Mahnungen und E-Mails, Social-Dateien hochladen (Anzeige der Vorschaubilder ist da), Ziele und Paketpreise bearbeiten, Retainer-Rechnungen erzeugen, ElevenLabs, Posts veröffentlichen, Nutzer und Auswertungen. Die CRM-Navigation kennt Ausgaben, eine eigene Seitenhülle ist dort nicht vorhanden; Jarvis liest die Tabelle trotzdem.
