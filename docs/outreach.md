# Outreach

Akquise im CRM: Firmen lesen, Entscheider aus dem Impressum ziehen, einen deutschen Entwurf schreiben, Kim gibt jede Mail frei, erst dann geht sie über die bestehende United-Domains-Mailbox raus.

Die Oberfläche ist der Punkt **Outreach** in der Seitenleiste. Der alte **Posteingang** ist dort nicht mehr. `mail-sync`, `mail-send`, die Mail-Tabellen und die Secrets bleiben. Es wird nichts gelöscht.

Nichts wird ohne Freigabe genau dieser Mail verschickt. Antworten gehen nur raus, wenn Kim auf **Senden** drückt.

## Ablauf

1. **Ziele.** URLs, eine pro Zeile, oder Branche plus Region. Die Funktion `outreach-research` holt die Website und das Impressum (höchstens acht Adressen pro Lauf). Sie liest Firma, Geschäftsführer oder Inhaber, Adresse und eine geschäftliche E-Mail. Eine persönliche Adresse geht vor `info@`. Gibt es nur eine allgemeine Adresse, steht das in der Karte. Optional entsteht eine Adresse nach dem Muster `vorname.nachname`. Die ist als **Vermutet** markiert und geht nur raus, wenn Kim das Häkchen im Entwurf setzt. Kein LinkedIn, keine bezahlte Schnittstelle. Die Suche von Hand nutzt die öffentliche HTML-Seite von DuckDuckGo und kann leer bleiben. Dann die URLs direkt einfügen.
   **Nachtlauf.** `outreach-night` sucht und schreibt Entwürfe, während das CRM zu ist. Standard ist 01:00 bis 07:00 Europe/Berlin, Ziel 50 offene Entwürfe mit Status Entwurf, damit sie morgens in der Freigabe liegen. **Start ab** und **Fertig bis** stehen auf der Seite und gelten auch am Wochenende. Der Lauf hört auf, wenn das Ziel erreicht ist, die Kandidaten aus sind, oder die Bis-Stunde da ist. Nichts wird dabei verschickt.
   Die Suchprofile sind Schalter, jedes mit Branche und Ort. Vorbelegt, in der Oberfläche änderbar: Ärzte und Praxen (Arzt, Zahnarzt, Physio), Maschinenbau und Industrie, Handwerk (Elektriker, Sanitär/Heizung, Maler, Dachdecker, Kfz und Ähnliches), Gastronomie, Kanzleien und Beratung (Steuerberater, Anwälte, Immobilien), Salon und Fitness. Ort standardmäßig Deutschland. Ein Ortsname, zum Beispiel München, begrenzt die Suche auf die Kästen dieser Stadt. Schreinerei, Tischlerei und Möbel sind nicht in den Standards und lassen sich auch nicht als Merkmal speichern.
   Die Quelle ist OpenStreetMap über die öffentliche Overpass-Schnittstelle. Das ist kostenlos und ohne Schlüssel erlaubt, die Daten stehen unter der ODbL. Die faire Nutzung heißt: eine Abfrage zur Zeit, kleiner Kasten, Timeout, höchstens zwölf Treffer mit Website-Merkmal, Kennung `ViralOutlawsCRM/outreach`. Kein Abruf von ganz Deutschland. Der Cron kommt alle 15 Minuten. Außerhalb des Fensters und bei vollem Ziel ruft er Overpass nicht auf. Was übrig ist, liegt in `outreach_pool` und wird im nächsten Schritt gelesen, ohne Overpass noch einmal zu fragen. `outreach_coverage` merkt sich Profil und Gebiet. Der nächste Morgen macht dort weiter. Firmen ohne zwei brauchbare Beobachtungen bekommen keinen Entwurf. Claude schreibt zuerst, die Vorlage springt nur ein, wenn Claude zweimal durchfällt. Der Knopf **Einen Suchlauf jetzt** macht denselben kleinen Schritt am Tag, zum Prüfen.
2. **Entwurf.** Neben dem Impressum liest die Recherche die Startseite und, wenn vorhanden, die Kontaktseite. Gespeichert werden bis zu drei geprüfte Beobachtungen mit Quelle und der Seitentext der Startseite (`page_excerpt`). Weniger als zwei Beobachtungen: kein Entwurf, Status `zu wenig Substanz`.

   **Ziel der Mail:** Kim bleibt im Gedächtnis, der Empfänger erkennt den Bedarf selbst, und Kim steht als die Lösung da, ohne Anleitung. Aufbau in dieser Reihenfolge:

   1. **Betreff:** die konkrete Beobachtung, persönlich und neugierig, z. B. „praxis-muster.de mit Stand 2018“ oder „Anfragen nach Feierabend auf musterwerk.de“. Kein Werbe-Betreff.
   2. **Anrede:** Guten Tag Frau/Herr Nachname, Sie-Form.
   3. **Einstieg (1–2 Sätze):** der ehrliche Anlass aus der Recherche, wörtlich aus den Daten gebaut: „bei einer Recherche nach Arztpraxen in Ulm bin ich auf Ihre Website gestoßen.“ Branche aus dem Suchprofil, Ort aus dem Suchgebiet, sonst aus dem Impressum. Nie „zufällig“. Danach höchstens ein echtes Kompliment (Leistung, Spezialisierung, Referenz). Das Modell muss die Stelle aus dem Seitentext wörtlich als `beleg` mitliefern; steht sie dort nicht, fällt der Entwurf durch. Ohne Beleg kein Kompliment.
   4. **Problem aus Sicht der Kunden:** eine kurze Szene, z. B. „Wer abends einen Termin anfragen möchte, findet auf Ihrer Seite nur eine Telefonnummer. Viele Patienten warten dann nicht bis morgen, sondern fragen bei der nächsten Praxis an.“ 1–2 geprüfte Beobachtungen und was sie kosten. Keine Lösungsschritte: „Stellen Sie“, „Setzen Sie“, „Legen Sie“ fallen durch.
   5. **Brücke und Vorstellung (Ich-Form):** „Genau solche Stellen sind mein Job. Ich bin Kim Lukas Tobler von Viral Outlaws, wir bauen [Praxen / Industriebetrieben / Restaurants / Handwerksbetrieben …] moderne Websites [und KI-Lösungen], damit aus Besuchern [Terminanfragen / Projektanfragen / Reservierungen / Aufträge] werden.“ Eine echte Referenz nur, wenn sie zu Branche und Notiz passt (Schreinerei Wagner nur als echter Referenzkunde), sonst „Beispiele finden Sie auf viraloutlaws.de.“
   6. **Terminfrage:** „Ich würde Ihnen gern unverbindlich zeigen, wie das für Ihre Praxis aussehen könnte, in 15 Minuten online oder bei Ihnen vor Ort. Passt Ihnen ein kurzer Termin in den nächsten Tagen?“ Keine Ausweichoption, kein „Entwurf“.
   7. **Opt-out:** „Falls das kein Thema für Sie ist, genügt eine kurze Antwort, dann melde ich mich nicht mehr.“ Eine Antwort wie „kein Thema“ oder „kein Interesse“ sperrt die Adresse. Zitierter Verlauf in der Antwort zählt dabei nicht.
   8. **Signatur** wie bisher: Viele Grüße, Kim, Viral Outlaws (die Mails gehen per SMTP raus, nicht über die Webmail-Signatur).
   9. **P.S.** mit einer zweiten, kleinen geprüften Beobachtung als Wiedererkennungs-Haken, nur wenn eine da ist.

   **Länge:** 110–140 Wörter Fließtext, gezählt ohne Anrede, Signatur und P.S. Die Prüfung lässt 95–145 zu.
   **No-Gos:** keine Preise, kein „garantiert“, keine erfundenen Zahlen oder Referenzen, kein Belehren, kein Digitalbonus, keine Fachwörter (viewport, defer, h1, meta description), keine Ausrufezeichen, nie Möbel/Schreinerei außer Schreinerei Wagner, nie Kims Nebenjob.
   **Ablauf:** Claude schreibt zuerst (auch im Nachtlauf), `reviewMail` prüft alle Punkte oben. Fällt der Entwurf durch, schreibt Claude ihn einmal neu. Fällt er wieder durch, baut die Vorlage aus den Beobachtungen die Mail (ohne Kompliment). Fällt auch die durch, kein Entwurf. Die drei Beispiele stehen in `docs/outreach-beispiele.md`.

   **Follow-up (Konzept, noch nicht automatisiert):** Nach 5 Werktagen ohne Antwort höchstens ein Follow-up, nur als Entwurf und nur nach Kims Freigabe. 2–3 Sätze mit einem neuen Blickwinkel statt „wollte nur nachhaken“, z. B. eine weitere geprüfte Beobachtung oder was Kunden der Branche heute zuerst auf dem Handy suchen. Danach nichts mehr. Für die Automatik braucht `outreach-send` eine Ausnahme von „Schon angeschrieben“ für genau dieses eine Follow-up.
3. **Freigabe.** Status: Entwurf, Freigegeben, Gesendet, Antwort, Abgemeldet. Ablehnen und Löschen gibt es dazu. Mehrere Entwürfe lassen sich auf einmal freigeben. Vermutete Adressen nicht: die brauchen das eigene Häkchen. Ein Entwurf, der nach der Freigabe geändert wird, fällt auf Entwurf zurück.
4. **Versand.** pg_cron ruft jede Minute `outreach-send` auf, auch wenn das CRM zu ist. Jeder Lauf nimmt höchstens eine Mail mit Status Freigegeben, und nur wenn der gespeicherte Abstand um ist. Die Stufen sind 1, 2, 3 oder 5 Minuten, Standard 2. Eine Minute ist die schnellste Stufe. Tageslimit Standard 50, in der Oberfläche änderbar, höchstens 100. Das Fenster bleibt Montag–Freitag, 8 bis 18 Uhr Europe/Berlin. Die Bis-Stunde ist aus. **Versand pausieren** setzt `paused` und stoppt Knopf und Cron. In der Oberfläche steht der Hinweis, dass schneller Versand über das Hauptpostfach als Spam gelten und die Adresse blockieren kann. Browser und Cron teilen sich `claim_outreach_draft`: eine Advisory-Sperre pro Workspace, danach `sending_at` für 15 Minuten. Ein zweiter Lauf bekommt dieselbe Mail nicht. Der Kontakt mit Kundennummer `KD-…` entsteht beim Versand, oder früher über **Kontakt anlegen**. Die Nummer vergibt der vorhandene Trigger. Schon vergebene Rechnungsnummern bleiben. Ohne Freigabe geht keine Mail raus.
5. **Postfach.** Nur Mails, die Outreach verschickt hat, und die Antworten darauf. Filter Gesendet, Antwort, Abgemeldet, dazu Suche und ein Punkt für ungelesen. **KI-Entwurf** schreibt einen Text ins Feld und verschickt ihn nicht. **Senden** schickt genau diesen Text.
6. **Antworten.** `mail-sync` erkennt eine Antwort an der Message-ID oder an Absender plus Betreff und setzt den Status auf Antwort. Eine Abmelde-Formulierung setzt Abgemeldet und die Adresse auf die Sperrliste. Dieselbe Adresse und dieselbe Firma werden nicht erneut angeschrieben. Kontakte, die schon im CRM sind, auch nicht. Gewonnene Kontakte heißen in der Liste Bestandskunde.

Tageslimit und Abstand stehen auf der Seite Ziele (Standard 50 Mails am Tag, 2 Minuten). Das Fenster ist Montag bis Freitag, 8 bis 18 Uhr Europe/Berlin. Antworten, die Kim selbst schickt, zählen beim Abstand und beim Tageslimit mit, hängen aber nicht am Fenster.

## Tabellen

Migrationen `20261125160000_outreach.sql`, `20261125170000_outreach_observations.sql`, `20261125180000_outreach_send_cron.sql`, `20261125190000_outreach_night.sql`, `20261125200000_outreach_morning_speed.sql` und `20261125210000_outreach_page_text.sql` (Seitentext für das belegte Kompliment):

| Tabelle | Inhalt |
|---|---|
| `outreach_settings` | Tageslimit, Abstand 1/2/3/5, Pause, Versandstunden, Nachtfenster, Zielzahl |
| `outreach_profiles` | Branche, Ort, Merkmale, ein- und ausschaltbar |
| `outreach_areas` | Städte und Bezirke, jeder Kasten klein |
| `outreach_coverage` | Welches Profil in welchem Gebiet schon gesucht wurde |
| `outreach_pool` | Gefundene Websites, die der nächste Schritt noch liest |
| `outreach_targets` | Gelesene Firma, Domain, Impressum, bis zu drei Beobachtungen mit Quelle |
| `outreach_people` | Person, Rolle, Adresse, Art der E-Mail |
| `outreach_drafts` | Betreff, Text, Status, Freigabe, Kundenlink |
| `outreach_messages` | Verlauf im Postfach, Ausgang und Antwort |
| `outreach_blocklist` | Adressen, die nicht mehr angeschrieben werden |

RLS wie bei der Wissensbasis: nur der eigene Workspace. Der Service-Role-Key und die Mail-Secrets stehen nicht im Frontend.

## Live seit 25.11.2026

Migrationen angewendet, Funktionen ausgerollt, `OUTREACH_CRON_SECRET` als Function-Secret und im Vault (`outreach_cron_secret`), Crons `outreach-send` (jede Minute) und `outreach-night` (alle 15 Minuten, sucht nur im Nachtfenster). Secrets bleiben, wo sie sind: `MAIL_*`, `ANTHROPIC_API_KEY`. Nichts davon ins Frontend oder ins Repo.

Neue Migration ausrollen: Datei unter `supabase/migrations` anwenden, dann die betroffenen Funktionen mit `supabase functions deploy <name> --use-api` neu ausrollen.

Die Demo unter `/?demo=outreach` zeigt erfundene Firmen auf `.example.test` und verschickt nichts.

Hinweis Pages-Deploy: Die Läufe vom 25.11. sind am bekannten Artefakt-Race gescheitert (actions/deploy-pages#451, Upload und Deploy im selben Job). Abhilfe: in `.github/workflows/deploy.yml` Upload und Deploy in zwei Jobs trennen (`deploy` mit `needs: build`). Das braucht ein Token mit `workflow`-Scope.

## Signatur (seit 25.11.2026)

Jede Outreach-Mail und jede Antwort bekommt beim Versand eine volle Geschäftssignatur: Name, Firma, Adresse, Telefon, E-Mail, Website und Link zum Impressum (https://www.viraloutlaws.de/impressum). Kein Preis- oder MwSt.-Hinweis (Kleinunternehmer). Gespeichert in `outreach_settings.signature`, vorbelegt aus den Firmendaten im CRM (`settings`), änderbar unter Nachtlauf → Signatur. Der Entwurf selbst endet mit „Viele Grüße / Kim“ und dem P.S.; die Signatur hängt `outreach-send` hinter einer Trennzeile `-- ` an. Sie zählt nicht zur Wortzahl und ist im Editor als Vorschau sichtbar.

## „Einen Suchlauf jetzt“

Der Knopf ruft `outreach-night` mit dem Login auf. Der manuelle Lauf ignoriert das Nachtfenster, legt nur Entwürfe an und schickt nichts. Während er läuft, zeigt der Knopf einen Spinner, danach steht „X Betriebe gefunden, Y Entwürfe angelegt“ oder die echte Fehlermeldung im Nachtlauf-Kasten. Ursache des alten „passiert nichts“: overpass-api.de hat Anfragen aus der Supabase-Cloud sofort abgelehnt, die Funktion antwortete mit 400, und der Knopf zeigte nur die nichtssagende Meldung von supabase-js. Jetzt fragt die Kartensuche nacheinander mehrere Overpass-Server ab. Für Tests geht derselbe Lauf per Cron-Secret mit `{"manual": true}`.

Pages-Deploy für PR #28 (vo-crm-v16) neu angestoßen, 25.11.2026.

## „Jetzt senden“ (seit 25.11.2026)

In der Freigabe-Liste und im Editor eines freigegebenen Entwurfs gibt es „Jetzt senden“, in der Liste zusätzlich „Alle freigegebenen jetzt senden (N)“. Vorher kommt ein Bestätigungsdialog mit den Empfängern. `outreach-send` mit `op: "now"` und `draftIds` (Login des Nutzers, höchstens 10 pro Aufruf) nimmt per `claim_outreach_draft_now` genau diese Entwürfe: nur Status freigegeben, nur eigener Workspace. Versandfenster und Abstand gelten nicht; Pause, Tageslimit, Sperrliste, Abmeldungen, Duplikate, Bestandskunden und die gemeinsame Sperre mit dem Cron gelten weiter. Zwischen zwei Mails 4 Sekunden. Eigene Adressen (@viraloutlaws.de) bekommen keinen CRM-Kontakt.

Mails gehen jetzt mit `Date`-Header, RFC-2047-kodiertem Betreff und nur CRLF raus; damit klappt auch die Kopie in „Gesendet“.

Der Filter „Offen“ in der Freigabe ist entfallen. Er war kein eigener Status, nur die Sicht „Entwurf + Freigegeben“; in der Datenbank gab es nie den Status „offen“.

Pages-Deploy für PR #31 (vo-crm-v18) neu angestoßen.

## Stand 26.11.2026: Allgäu, Quality-Gate, Anti-Doppel

- **Aktive Region:** `outreach_settings.active_regions` (Standard `{allgaeu}`). Gebiete haben `outreach_areas.region`. Andere Gebiete (Berlin usw.) bleiben gespeichert, werden aber nicht gesucht. Ausweiten: Region in `active_regions` ergänzen.
- **Region per Impressum:** Ein Betrieb wird nur angeschrieben, wenn die PLZ im Impressum in der Region liegt (Allgäu: 87xxx, Teile von 86xxx/88xxx). Ohne Adresse im Impressum: übersprungen.
- **Ort im Text:** Der Anlass-Satz nennt nur den Ort aus dem Impressum, nie das Suchgebiet. `placeIssues` verwirft jede Mail, deren Orts- oder PLZ-Angaben nicht zum Impressum passen. `outreach-send` prüft das vor dem Versand noch einmal und schiebt die Mail sonst zurück in die Entwürfe.
- **Adresse:** Nur Adressen, deren Domain zur Website passt (`emailFitsSite`); Freemail nur, wenn der Name vor dem @ zur Website passt.
- **Anrede und Firma:** `plausibleName` blockiert Anreden wie „Herr angegebenen“; `extractCompany` überspringt Versicherer, Kammern, Agenturen aus dem Impressum.
- **Branche:** Aus dem echten OSM-Merkmal (`brancheFromKind`), bestätigt durch die Startseite (`verifyBranche`), sonst neutral „Betrieben“.
- **Bereits angeschrieben:** Tabelle `outreach_contacted` (Firma, Domain, E-Mail, OSM-ID, Ort, Datum, Betreff, Quelle). Ein Trigger trägt jede gesendete Mail automatisch ein. Alte Listen (Saley 25.11., Kaltakquise 09./10.11.) sind importiert (`/workspace/outreach-import/import_lists.py`). Recherche, Entwurf und Versand überspringen Treffer über E-Mail, Domain, Firmenname oder OSM-ID. UI: Freigabe → „Bereits angeschrieben“.
- **Blockliste:** Einträge vom Typ `domain` sperren jetzt die ganze Domain.
- **Durchsatz:** Cron alle 5 Minuten, 4 Websites pro Lauf (max. 6), bis zu 40 Treffer pro Overpass-Abfrage, maps.mail.ru zuerst (overpass-api.de antwortet aus der Cloud oft 406).

### Kontakte aus Outreach (26.11.2026)
- Versand legt keinen CRM-Kontakt und keine Kundennummer mehr an. Alles bleibt im Outreach-Modul (Entwurf, `outreach_contacted`, Outreach-Postfach).
- „Als Kontakt übernehmen“ (Postfach-Verlauf oder Editor) legt den Kontakt mit Quelle `outreach`, Branche, Adresse und Mailverlauf als Notizen an und verknüpft Entwurf und Gespräche.
- mail-sync legt für Absender aus `outreach_contacted` oder Outreach-Entwürfen keinen Kontakt an.
- Frühere Auto-Kontakte (KD-10062 bis KD-10086) tragen `meta.outreach_auto = true`; sie wurden nicht gelöscht.

### Antworten abholen (26.11.2026)
- Cron `outreach-replies` ruft alle 2 Minuten `mail-sync` mit `{"op":"outreach"}` auf (Header `x-outreach-cron`). Gelesen werden Posteingang, Spam und Papierkorb ab einem eigenen Zeiger (`outreach_mail_cursor`). Gespeichert werden nur Antworten auf Outreach-Mails (Message-ID oder Absender plus Betreff), in `outreach_messages`. Keine anderen Mails, kein Kontakt, keine Auto-Antwort.
- Abwesenheitsnotizen (Auto-Submitted, X-Autoreply, Precedence, Betreff) bekommen `auto = true`: im Postfach mit Filter „Automatisch“, Status bleibt „Gesendet“, keine Sperre.
- Öffnen des Postfach-Tabs holt sofort ab (höchstens einmal pro Minute).
- Nachholen: `{"op":"outreach","sinceDays":3,"allFolders":true}` liest alle Ordner außer Gesendet/Entwürfe.
- Ursache vorher: Seit der alte Posteingang weg ist, hat niemand `mail-sync` aufgerufen, und der IMAP-Leser brach bei zwei Literalen pro FETCH ab.
