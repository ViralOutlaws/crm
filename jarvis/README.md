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

`jarvis-chat`, `jarvis-tts` und `jarvis-dispatch` stehen in `supabase/config.toml` mit `verify_jwt = false`, weil sie das Nutzer-JWT selbst prüfen und OPTIONS für CORS beantworten müssen. `bot-api` steht ebenfalls auf `verify_jwt = false`, weil sich die Bots mit einem eigenen Token anmelden, nicht mit dem Nutzer-JWT. Beim Deploy kein `--no-verify-jwt` setzen. `jarvis-chat` liest und schreibt mit dem JWT der angemeldeten Person, also unter RLS. `jarvis-dispatch` legt den Lauf mit demselben JWT an. `bot-api` nutzt die Service-Role nur innerhalb der Funktion und gibt sie nie heraus. `jarvis-tts` prüft nur die Anmeldung und streamt `audio/mpeg`.

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

`jarvis-tts` braucht dafür keinen Redeploy. Der Jarvis-Cache heißt `jarvis-v9`. Begrüßung, Tagesliste und das Verständnis in `jarvis-chat` brauchen den Redeploy in Schritt 4. Der Leitstand braucht zusätzlich die Schritte im nächsten Abschnitt.

Ohne Schritt 3 schlägt nur der Logeintrag für Löschen und Rückgängig fehl. Die CRM-Änderung bleibt, die Antwort enthält `log_warning`. Solange die Tabelle fehlt, bleibt jede andere Schreibaktion ebenfalls erhalten und die Antwort enthält `log_warning`.

Für `entwurf`, `pausiert` und den Social-Status `Idee` ist keine weitere Migration nötig. Diese Spalten sind freier Text ohne CHECK.

## Bot-Leitstand

Jarvis schickt Aufträge an die fünf Grok-Bots und holt das Ergebnis zurück ins CRM. Webby ist Website und Tech, Marky Marketing und Social, Saley Vertrieb und Leads, Cashy Finanzen und Rechnungen, Developy Software und Jarvis. „Webby soll eine Website für ein Yogastudio bauen“ wird `dispatch_to_bot` an Webby. Die Karte zeigt Bot und Auftrag. Erst nach Bestätigung legt `jarvis-dispatch` die Aufgabe und den Lauf an und ruft den Webhook. Fehlt URL oder Schlüssel, bleibt der Lauf auf `queued` und die Meldung ist genau `Bot noch nicht verbunden`. Eine Aufgabe, die nur einem Bot zugewiesen wird, bleibt im Kanban. Die Oberfläche fragt danach, ob der Auftrag auch an den Bot geht.

Die Karte Bot-Status öffnet den Leitstand: Verbindung, letzter Lauf, Zeitlinie, Ergebnis und Links, dazu „Auftrag senden“ und „Verbindung testen“. Live aktualisiert sich über Supabase Realtime und zusätzlich alle fünf Sekunden. Die Demo ruft dabei weder Supabase noch einen Webhook auf.

### Go-live Leitstand

Nicht automatisch gegen die Live-Datenbank ausführen. Die Schritte aus dem Abschnitt Go-live oben (Migrationen `20261017190000`, optional `20261017220000`, `20261017230000`, danach `supabase functions deploy jarvis-chat`) bleiben Voraussetzung, weil Löschen, Rückgängig und die neuen Werkzeuge in `jarvis-chat` liegen. Danach, in dieser Reihenfolge:

1. `supabase/migrations/20261017240000_bot_leitstand.sql` anwenden. Sie legt `bot_runs` an (RLS wie die anderen Workspace-Tabellen, nur `authenticated` im eigenen Workspace) und `bot_tokens` (keine Policy, `revoke` für `anon` und `authenticated`, nur `service_role`). Gespeichert wird der SHA-256, nie der Token. `bot_runs` kommt in die Realtime-Publication, falls `supabase_realtime` existiert.
2. `supabase functions deploy jarvis-dispatch` ohne `--no-verify-jwt`.
3. `supabase functions deploy bot-api` ohne `--no-verify-jwt`.
4. `supabase functions deploy jarvis-chat` ohne `--no-verify-jwt`, damit `dispatch_to_bot`, `list_bot_runs` und `get_bot_run` in der laufenden Funktion sind. Derselbe Befehl wie im Go-live oben, nach diesem Branch.
5. Secrets, ein Paar pro Bot. Ohne Paar bleibt der Auftrag auf `queued` mit `Bot noch nicht verbunden`:

```bash
supabase secrets set BOT_WEBHOOK_WEBBY_URL='https://…'
supabase secrets set BOT_WEBHOOK_WEBBY_KEY='…'
supabase secrets set BOT_WEBHOOK_MARKY_URL='https://…'
supabase secrets set BOT_WEBHOOK_MARKY_KEY='…'
supabase secrets set BOT_WEBHOOK_SALEY_URL='https://…'
supabase secrets set BOT_WEBHOOK_SALEY_KEY='…'
supabase secrets set BOT_WEBHOOK_CASHY_URL='https://…'
supabase secrets set BOT_WEBHOOK_CASHY_KEY='…'
supabase secrets set BOT_WEBHOOK_DEVELOPY_URL='https://…'
supabase secrets set BOT_WEBHOOK_DEVELOPY_KEY='…'
```

Optional, nur wenn der Empfänger einen anderen Headernamen will. Standard ist `X-Webhook-Key`. Der Schlüssel geht immer zusätzlich als `Authorization: Bearer <key>`:

```bash
supabase secrets set BOT_WEBHOOK_KEY_HEADER='X-Webhook-Key'
```

`CRM_URL` ist optional und steht sonst auf `https://crm.viraloutlaws.de`.

6. Token pro Bot, einmalig, von Webby mit Management-Zugang. Das Skript druckt den Token ein Mal und das `INSERT` für den Hash. Den Token in die Grok-Routine legen, nicht ins Repo und nicht in den Chat:

```bash
node scripts/bot-token.mjs webby <workspace-uuid>
node scripts/bot-token.mjs marky <workspace-uuid>
node scripts/bot-token.mjs saley <workspace-uuid>
node scripts/bot-token.mjs cashy <workspace-uuid>
node scripts/bot-token.mjs developy <workspace-uuid>
```

Das ausgegebene `INSERT` im SQL-Editor ausführen. Widerruf steht als `update` unter dem Hash. Ein widerrufener Token gilt nicht mehr.

7. Pro Bot eine Grok-Bot-Routine mit Webhook-Trigger. Kim kopiert die Webhook-URL in `BOT_WEBHOOK_<BOT>_URL` und den Sender-Key in `BOT_WEBHOOK_<BOT>_KEY` (Schritt 5). Der Body ist JSON `{run_id, bot, title, instructions, aufgabe_id, crm_url, callback_url}` und bei einem Verbindungstest zusätzlich `ping: true`. Die Routine arbeitet den Auftrag und ruft `callback_url` auf, das ist `/functions/v1/bot-api`, mit `Authorization: Bearer <Bot-Token>` aus Schritt 6. `POST {"op":"update","run_id","status":"in_arbeit"}`, später `status` `erledigt` mit `result` und `links`, danach `POST {"op":"mirror","run_id"}`. Spiegeln setzt die verknüpfte Aufgabe auf `done` und hängt einen Block `[YYYY-MM-DD] Bot-Ergebnis (Name):` an. Die Zeile `Zuständig:` bleibt. `blockiert` und `fehler` setzen die Aufgabe nicht auf erledigt. `GET` ohne `run_id` listet nur die eigenen Läufe dieses Bots in seinem Workspace.

Der statische Stand unter `/jarvis/` muss aus diesem Branch liegen. Der Cache heißt `jarvis-v9`.

### Härtung

Die Oberfläche schreibt `bot_runs` nicht. „Abbrechen“ verwirft nur die Karte oder das Formular. `status`, `result` und `events` setzen `jarvis-dispatch` (Service-Role, nach geprüftem Nutzer-JWT, Workspace aus dem Profil) und `bot-api`. `created_by` beim Insert durch `authenticated` ist immer `auth.uid()`.

Nicht automatisch anwenden. Nach dem Leitstand-Go-live:

1. `supabase/migrations/20261018010000_bot_leitstand_harden.sql` anwenden.
2. `supabase functions deploy jarvis-dispatch` ohne `--no-verify-jwt`.
3. `supabase functions deploy bot-api` ohne `--no-verify-jwt`.

Ohne Schritt 2 kann ein neuer Auftrag den Lauf nicht mehr auf `sent` setzen, weil das Nutzer-JWT `status` und `events` nicht mehr schreiben darf. `jarvis-chat` bleibt unverändert. `bot_tokens` bleibt für `anon` und `authenticated` zu. Ein späteres `GRANT` an diese Rollen zieht der Event-Trigger wieder ein. Spaltennamen bleiben.

### Was der Bot nicht darf

`bot-api` liest und ändert nur Läufe mit demselben `bot` und derselben `workspace_id` wie der Token. Ein fremder Lauf antwortet mit 404. Ein unbekannter oder widerrufener Token ist 401. Ein Hash landet erst nach gültigem Token in der Limit-Map: mehr als 60 Anfragen pro Minute und Token sind 429, gezählt pro Instanz. Ungültige Versuche zählen pro IP, höchstens 20 pro Minute und höchstens 256 Adressen; abgelaufene Einträge fallen weg. Danach antwortet diese IP mit 429, bevor erneut die Datenbank gefragt wird. Erlaubte Wechsel: `queued` nach `sent`, `in_arbeit` oder `fehler`; `sent` nach `in_arbeit`, `erledigt`, `blockiert` oder `fehler`; `in_arbeit` nach `erledigt`, `blockiert` oder `fehler`; `blockiert` zurück nach `in_arbeit`, `erledigt` oder `fehler`; `fehler` nach `queued` oder `in_arbeit`. `erledigt` ist das Ende. Derselbe Status bleibt erlaubt, damit ein Ergebnis nachgetragen werden kann. `queued` direkt nach `erledigt` ist nicht erlaubt. `crm_insert` fasst `bot_runs` und `bot_tokens` nicht an.

## Bestätigung

Die Karten Heute, Pipeline, Offene Rechnungen und Bot-Status öffnen das passende Panel. Eine Pipeline-Stufe filtert auf diese Phase. Eine Aufgabe in der Heute-Liste öffnet die Aufgabe zum Bearbeiten. Das Kästchen fragt kurz nach und schreibt den Status erst nach Ja, über dieselbe Bestätigung wie `set_aufgaben_status`. Fälligkeiten in den Listen stehen als `tt.mm.jjjj`.

Die Begrüßung folgt der Uhr in Europe/Berlin: 5 bis 11 Uhr „Guten Morgen“, 11 bis 18 Uhr „Guten Tag“, sonst „Guten Abend“. Ein gesprochenes Datum ist „Samstag, 17. Oktober“, nie `2026-10-17`.

Volumen offen ist die Summe der Deal-Werte (netto) in Lead, Erstgespräch und Angebot, dieselbe Zahl wie „Offene Pipeline“ im CRM. Ein Kontakt ohne Betrag zählt mit 0. Entwürfe aus der Angebots-Liste zählen nicht mit. Vier Kontakte in Angebot und 0,00 € heißt: bei keinem dieser Deals steht ein Betrag.

Jarvis sortiert jede Anfrage in handeln, antworten, zeigen oder plaudern. Eine Änderung legt sofort die Karte vor. „Lösche alle Aufgaben“ wird nicht noch einmal nachgefragt. Ein genanntes Unternehmen wird vor dem Speichern gesucht. Mehrere Treffer fragen nach, ein unbekanntes Unternehmen wird nicht still weggelassen. `open_area` gibt die ersten Zeilen an das Modell. `list_tasks` filtert nach Bot, Fälligkeit und erledigt, die Zeile „Zuständig“ zählt mit. „Der Kunde von gestern“ sucht die neuesten Kontakte. Gesprochene Bot-Namen Marki, Sally, Kashy, Webbi und Developi landen beim richtigen Bot. Im Freisprechen reagiert Jarvis nur auf „Jarvis“ und hört danach etwa 15 Sekunden ohne das Wort weiter. „Bestätigen“, „passt so“ und „ja, mach“ bestätigen eine offene Karte, „abbrechen“ und „nein“ verwerfen sie. Eine Löschkarte braucht „löschen“. Nach etwa 30 Minuten ohne Satz beginnt der Gesprächsverlauf neu. Die Antwort bleibt kurz, ohne Markdown und ohne IDs.

Jede Schreibaktion erscheint zuerst als Karte (Zusammenfassung, Bestätigen, Abbrechen). Erst danach prüft `revalidate()` den Plan erneut und schreibt. Mehrere Zeilen zeigen Anzahl und eine Vorschau. Löschen ist rot, mit Anzahl, Titeln und der Taste „Endgültig löschen“. Mehrere oder alle Zeilen löscht Jarvis nur, wenn Kim das ausdrücklich gesagt hat. „Rückgängig“ macht die letzte protokollierte Änderung nach einer weiteren Karte rückgängig. Jede Aktion landet in `jarvis_actions` mit dem vollen Zeilenstand: Löschen in `summary.before` (Aufgaben zusätzlich in `summary.row`), Ändern in `before` und `after`, Anlegen in `after`. Rückgängig schreibt `action = restore` und ebenfalls den vollen Stand, damit ein zweites Rückgängig denselben Weg zurückgeht. E-Mails, Mahnungen und Datei-Uploads gibt es nicht. `settings`, `integration_secrets`, Profile und Workspaces fasst Jarvis nicht an. Was nicht geht, sagt er in einem Satz, statt ersatzweise ein Panel zu öffnen.

## Status

- `crm_insert`, `crm_update` und `crm_delete` schreiben die Tabellen, die das CRM in `index.html` speichert: Kontakte, Angebote, Rechnungen, Retainer, Pakete, Aufgaben, Wiedervorlagen, Termine, Social-Posts, Ausgaben, ROI und Ziele. `workspace_id` setzt der Server. Unbekannte Spalten werden abgelehnt.
- Aufgaben, die Jarvis anlegt, haben ohne andere Angabe `todo`, damit sie im Kanban sichtbar sind. Erledigen setzt `done`, Wieder-Öffnen setzt `todo`, `doing` bleibt gültig. Ein Bot steht weiter als `Zuständig: Marky (Marketing / Social).` in der Beschreibung.
- Eine Löschkarte nennt die Anzahl und bis zu zwölf Titel. Höchstens 300 Zeilen pro Aufruf, höchstens 30 neue Zeilen. Die bestätigten IDs werden gelöscht oder geändert, nicht eine neue „alle“-Suche. Gelöschte und geänderte Zeilen stehen komplett im Protokoll (`summary.before`), damit Rückgängig sie zurücksetzen kann.
- Angebote kennen `entwurf`, `gesendet`, `akzeptiert`, `abgelehnt`. Rechnungen kennen `entwurf`, `offen-rg`, `bezahlt`, `ueberfaellig`. Sagt Kim bei einer Rechnung „gesendet“ oder „offen“, speichert Jarvis `offen-rg`. Fehlt der Status, bleibt es ein Entwurf. Entwürfe zählen nicht als gesendete Angebote und nicht als offene Forderungen.
- Social-Status sind `Idee`, `Geplant`, `Content fertig`, `Erstellt`, `Veröffentlicht`. Ohne Angabe bleibt es `Idee`. Assets und Dateien schreibt Jarvis nicht. Format und Säule nutzen dieselben Werte wie der Redaktionsplan.
- Bot-Aufträge im Kanban sind Aufgaben. Die erste Zeile der Beschreibung lautet `Zuständig: Marky (Marketing / Social).` Es gibt dafür keine neue Spalte. Der Versand an den Grok-Bot ist ein eigener Lauf in `bot_runs` und steht im Leitstand. Im CRM steht die Zuständig-Zeile weiter im Feld „Zugewiesen an Bot“ und auf der Karte.
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

`/sw.js` fasst `/jarvis/` nicht an. Der CRM-Cache heißt `vo-crm-v5`, damit bestehende Installationen das neue `index.html` laden. Der Jarvis-Worker (`jarvis/sw.js`, Cache `jarvis-v9`) gilt nur für `/jarvis/`. Auf schmalen Screens liegen Bereiche, Zum CRM und Abmelden in einem Menü, der Untertitel unter dem Logo entfällt unter 420px, der Platzhalter ist „Sag oder schreib etwas…“.

Auf dem Handy füllt Jarvis den Bildschirm (`100dvh`, Safe-Area, kein horizontales Scrollen). `manifest.json` verlangt `fullscreen` und fällt auf `standalone` zurück, `start_url` und `scope` sind `/jarvis/`. iOS nutzt `apple-mobile-web-app-capable` und `black-translucent`. Ein einmaliger Hinweis im mobilen Browser erklärt „Zum Home-Bildschirm“. `maximum-scale` bleibt offen, damit Zoomen geht; das Eingabefeld ist auf dem Handy 16px, damit iOS beim Fokussieren nicht selbst hineinzoomt.

## Folgepunkte

Mahnungen und E-Mails, Social-Dateien hochladen (Anzeige der Vorschaubilder ist da), Retainer-Rechnungen erzeugen, Posts bei den Netzwerken veröffentlichen, Nutzer und Auswertungen. Zielwerte und Paketpreise im lokalen Einstellungsobjekt bleiben unangetastet; Jarvis schreibt die Tabellen `ziele` und `pakete`. Die CRM-Navigation kennt Ausgaben, eine eigene Seitenhülle ist dort nicht vorhanden; Jarvis liest und schreibt die Tabelle trotzdem.
