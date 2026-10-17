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

Live spricht Jarvis Satz für Satz, sobald der Chat einen Satz geliefert hat. Die Anfrage geht an `jarvis-tts` mit `{text}` (höchstens 1500 Zeichen). ElevenLabs bekommt `voice_settings.speed` 1.2, sofern `ELEVENLABS_SPEED` nichts anderes setzt (geklemmt auf 0.7 bis 1.2). Die Datei spielt der Browser mit `playbackRate` 1.0 und `preservesPitch` (`ELEVEN_PLAYBACK_RATE` in `jarvis/speech.js`, dort änderbar). Ein höheres Wiedergabetempo klingt bei dieser Stimme verzerrt; das Tempo kommt vom Server. Die Core-Animation folgt der laufenden Wiedergabe über einen Web-Audio-Analyser. Schlägt ElevenLabs fehl, spricht der Browser weiter. Die Stummschaltung bleibt. Die Demo (`?demo=1`) ruft ElevenLabs nicht auf.

Ein lokales `localStorage.jarvis_fn` auf `http://localhost` oder `http://127.0.0.1` … `/jarvis-chat` lenkt die Stimme auf dasselbe Ziel mit `/jarvis-tts`.

## Freisprechen

Der Kopfhörer neben dem Mikrofon schaltet dauerhaftes Zuhören ein. Nach der ersten Mikrofonfreigabe ist es an und bleibt in `localStorage` unter `jarvis_handsfree` (`1` an, `0` aus). Die Web Speech API läuft auf `de-DE`, `continuous`, und startet nach `end` oder einem harmlosen Fehler neu. Ein finales Ergebnis plus etwa 1,2 Sekunden Ruhe (`SILENCE_MS` in `jarvis/listen.js`) sendet den Satz. Tippt man dabei auf das Mikrofon, geht ein angefangener Satz sofort raus. Ist Freisprechen aus, bleibt die Taste das Antippen zum Sprechen.

Während Jarvis spricht oder eine Antwort holt, ist die Erkennung aus, damit die Lautsprecher nicht als Frage zurückkommen. Danach geht das Mikrofon wieder an. „Stopp“, „Stop“ oder „Halt“ als eigener Satz bricht die Ausgabe ab und geht nicht ans Modell. Mitsprechen während der Antwort ist aus: die Erkennung würde Jarvis selbst hören. Die Mikrofontaste bricht die Ausgabe ab und hört danach wieder zu.

iPhone und iPad sowie Browser ohne Web Speech API bleiben beim Tippen auf das Mikrofon. Dort steht ein Hinweis unter der Eingabe. Chrome schickt die Erkennung an Google; die Demo ruft dabei weder Supabase noch ElevenLabs auf und öffnet das Mikrofon nicht von selbst.

## Lokal testen

Statische Dateien vom Repo-Wurzelverzeichnis aus:

```bash
python3 -m http.server 8765
```

Demo ohne Anmeldung und ohne Supabase-Aufruf: `http://127.0.0.1:8765/jarvis/?demo=1&noboot=1`

Die Funktion lokal gegen die gehostete API zu legen, geht über ein localhost-Proxy und `localStorage.jarvis_fn` (nur `http://localhost` oder `http://127.0.0.1`). Sonst ruft die Oberfläche `https://jjfmxiqippkgqkwihgek.supabase.co/functions/v1/jarvis-chat` auf.

## CORS

Erlaubt sind `https://crm.viraloutlaws.de` sowie `http://localhost` und `http://127.0.0.1` mit beliebigem Port. Andere Browser-Origins bekommen 403. Aufrufe ohne Origin (curl) sind erlaubt.

## Go-live

Nicht automatisch gegen die Live-Datenbank ausführen. Reihenfolge:

1. `supabase/migrations/20261017190000_jarvis_actions.sql`, falls `jarvis_actions` noch fehlt. Der erste Check erlaubt nur `insert` und `update`.
2. `supabase/migrations/20261017220000_jarvis_actions_delete.sql` ist optional. Sie erweitert den Check nur um `delete`. Die nächste Datei ersetzt diesen Check, egal ob Schritt 2 schon lief.
3. `supabase/migrations/20261017230000_jarvis_actions_restore.sql`. Sie setzt den Action-Check auf `insert`, `update`, `delete` und `restore`, nimmt `pakete` und `ziele` in den Tabellen-Check auf und setzt die Insert-Policy neu (`user_id = auth.uid()` und `workspace_id = get_my_workspace_id()`). Kein Update- und kein Delete-Recht auf dem Protokoll. Bestehende Zeilen bleiben gültig.
4. `supabase functions deploy jarvis-chat` ohne `--no-verify-jwt`. Ohne diesen Redeploy kennt die laufende Funktion Anlegen, Ändern, Löschen und Rückgängig nicht.

`jarvis-tts` braucht dafür keinen Redeploy. Der Jarvis-Cache heißt `jarvis-v4`, damit das Handy das Vollbild-Layout lädt. Ein Redeploy von `jarvis-chat` ändert an diesem Layout nichts.

Ohne Schritt 3 schlägt nur der Logeintrag für Löschen und Rückgängig fehl. Die CRM-Änderung bleibt, die Antwort enthält `log_warning`. Solange die Tabelle fehlt, bleibt jede andere Schreibaktion ebenfalls erhalten und die Antwort enthält `log_warning`.

Für `entwurf`, `pausiert` und den Social-Status `Idee` ist keine weitere Migration nötig. Diese Spalten sind freier Text ohne CHECK.

## Bestätigung

Jede Schreibaktion erscheint zuerst als Karte (Zusammenfassung, Bestätigen, Abbrechen). Erst danach prüft `revalidate()` den Plan erneut und schreibt. Mehrere Zeilen zeigen Anzahl und eine Vorschau. Löschen ist rot, mit Anzahl, Titeln und der Taste „Endgültig löschen“. Mehrere oder alle Zeilen löscht Jarvis nur, wenn Kim das ausdrücklich gesagt hat. „Rückgängig“ macht die letzte protokollierte Änderung nach einer weiteren Karte rückgängig. Jede Aktion landet in `jarvis_actions` mit dem vollen Zeilenstand: Löschen in `summary.before` (Aufgaben zusätzlich in `summary.row`), Ändern in `before` und `after`, Anlegen in `after`. Rückgängig schreibt `action = restore` und ebenfalls den vollen Stand, damit ein zweites Rückgängig denselben Weg zurückgeht. E-Mails, Mahnungen und Datei-Uploads gibt es nicht. `settings`, `integration_secrets`, Profile und Workspaces fasst Jarvis nicht an. Was nicht geht, sagt er in einem Satz, statt ersatzweise ein Panel zu öffnen.

## Status

- `crm_insert`, `crm_update` und `crm_delete` schreiben die Tabellen, die das CRM in `index.html` speichert: Kontakte, Angebote, Rechnungen, Retainer, Pakete, Aufgaben, Wiedervorlagen, Termine, Social-Posts, Ausgaben, ROI und Ziele. `workspace_id` setzt der Server. Unbekannte Spalten werden abgelehnt.
- Aufgaben, die Jarvis anlegt, haben ohne andere Angabe `todo`, damit sie im Kanban sichtbar sind. Erledigen setzt `done`, Wieder-Öffnen setzt `todo`, `doing` bleibt gültig. Ein Bot steht weiter als `Zuständig: Marky (Marketing / Social).` in der Beschreibung.
- Eine Löschkarte nennt die Anzahl und bis zu zwölf Titel. Höchstens 300 Zeilen pro Aufruf, höchstens 30 neue Zeilen. Die bestätigten IDs werden gelöscht oder geändert, nicht eine neue „alle“-Suche. Gelöschte und geänderte Zeilen stehen komplett im Protokoll (`summary.before`), damit Rückgängig sie zurücksetzen kann.
- Angebote kennen `entwurf`, `gesendet`, `akzeptiert`, `abgelehnt`. Rechnungen kennen `entwurf`, `offen-rg`, `bezahlt`, `ueberfaellig`. Sagt Kim bei einer Rechnung „gesendet“ oder „offen“, speichert Jarvis `offen-rg`. Fehlt der Status, bleibt es ein Entwurf. Entwürfe zählen nicht als gesendete Angebote und nicht als offene Forderungen.
- Social-Status sind `Idee`, `Geplant`, `Content fertig`, `Erstellt`, `Veröffentlicht`. Ohne Angabe bleibt es `Idee`. Assets und Dateien schreibt Jarvis nicht. Format und Säule nutzen dieselben Werte wie der Redaktionsplan.
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

`/sw.js` fasst `/jarvis/` nicht an. Der CRM-Cache heißt `vo-crm-v5`, damit bestehende Installationen das neue `index.html` laden. Der Jarvis-Worker (`jarvis/sw.js`, Cache `jarvis-v4`) gilt nur für `/jarvis/`.

Auf dem Handy füllt Jarvis den Bildschirm (`100dvh`, Safe-Area, kein horizontales Scrollen). `manifest.json` verlangt `fullscreen` und fällt auf `standalone` zurück, `start_url` und `scope` sind `/jarvis/`. iOS nutzt `apple-mobile-web-app-capable` und `black-translucent`. Ein einmaliger Hinweis im mobilen Browser erklärt „Zum Home-Bildschirm“. `maximum-scale` bleibt offen, damit Zoomen geht; das Eingabefeld ist auf dem Handy 16px, damit iOS beim Fokussieren nicht selbst hineinzoomt.

## Folgepunkte

Mahnungen und E-Mails, Social-Dateien hochladen (Anzeige der Vorschaubilder ist da), Retainer-Rechnungen erzeugen, Posts bei den Netzwerken veröffentlichen, Nutzer und Auswertungen. Zielwerte und Paketpreise im lokalen Einstellungsobjekt bleiben unangetastet; Jarvis schreibt die Tabellen `ziele` und `pakete`. Die CRM-Navigation kennt Ausgaben, eine eigene Seitenhülle ist dort nicht vorhanden; Jarvis liest und schreibt die Tabelle trotzdem.
