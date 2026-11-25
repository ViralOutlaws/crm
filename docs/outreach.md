# Outreach

Akquise im CRM: Firmen lesen, Entscheider aus dem Impressum ziehen, einen deutschen Entwurf schreiben, Kim gibt jede Mail frei, erst dann geht sie über die bestehende United-Domains-Mailbox raus.

Die Oberfläche ist der Punkt **Outreach** in der Seitenleiste. Der alte **Posteingang** ist dort nicht mehr. `mail-sync`, `mail-send`, die Mail-Tabellen und die Secrets bleiben. Es wird nichts gelöscht.

Nichts wird ohne Freigabe genau dieser Mail verschickt. Antworten gehen nur raus, wenn Kim auf **Senden** drückt.

## Ablauf

1. **Ziele.** URLs, eine pro Zeile, oder Branche plus Region. Die Funktion `outreach-research` holt die Website und das Impressum (höchstens acht Adressen pro Lauf). Sie liest Firma, Geschäftsführer oder Inhaber, Adresse und eine geschäftliche E-Mail. Eine persönliche Adresse geht vor `info@`. Gibt es nur eine allgemeine Adresse, steht das in der Karte. Optional entsteht eine Adresse nach dem Muster `vorname.nachname`. Die ist als **Vermutet** markiert und geht nur raus, wenn Kim das Häkchen im Entwurf setzt. Kein LinkedIn, keine bezahlte Schnittstelle. Die Suche von Hand nutzt die öffentliche HTML-Seite von DuckDuckGo und kann leer bleiben. Dann die URLs direkt einfügen.
   **Nachtlauf.** `outreach-night` sucht und schreibt Entwürfe, während das CRM zu ist. Standard ist 01:00 bis 07:00 Europe/Berlin, Ziel 50 offene Entwürfe mit Status Entwurf, damit sie morgens in der Freigabe liegen. **Start ab** und **Fertig bis** stehen auf der Seite und gelten auch am Wochenende. Der Lauf hört auf, wenn das Ziel erreicht ist, die Kandidaten aus sind, oder die Bis-Stunde da ist. Nichts wird dabei verschickt.
   Die Suchprofile sind Schalter, jedes mit Branche und Ort. Vorbelegt, in der Oberfläche änderbar: Ärzte und Praxen (Arzt, Zahnarzt, Physio), Maschinenbau und Industrie, Handwerk (Elektriker, Sanitär/Heizung, Maler, Dachdecker, Kfz und Ähnliches), Gastronomie, Kanzleien und Beratung (Steuerberater, Anwälte, Immobilien), Salon und Fitness. Ort standardmäßig Deutschland. Ein Ortsname, zum Beispiel München, begrenzt die Suche auf die Kästen dieser Stadt. Schreinerei, Tischlerei und Möbel sind nicht in den Standards und lassen sich auch nicht als Merkmal speichern.
   Die Quelle ist OpenStreetMap über die öffentliche Overpass-Schnittstelle. Das ist kostenlos und ohne Schlüssel erlaubt, die Daten stehen unter der ODbL. Die faire Nutzung heißt: eine Abfrage zur Zeit, kleiner Kasten, Timeout, höchstens zwölf Treffer mit Website-Merkmal, Kennung `ViralOutlawsCRM/outreach`. Kein Abruf von ganz Deutschland. Der Cron kommt alle 15 Minuten. Außerhalb des Fensters und bei vollem Ziel ruft er Overpass nicht auf. Was übrig ist, liegt in `outreach_pool` und wird im nächsten Schritt gelesen, ohne Overpass noch einmal zu fragen. `outreach_coverage` merkt sich Profil und Gebiet. Der nächste Morgen macht dort weiter. Firmen ohne zwei brauchbare Beobachtungen bekommen keinen KI-Entwurf. Die Vorlage aus den Beobachtungen geht vor, das Modell nur, wenn die Vorlage durchfällt. Der Knopf **Einen Suchlauf jetzt** macht denselben kleinen Schritt am Tag, zum Prüfen.
2. **Entwurf.** Neben dem Impressum liest die Recherche die Startseite und, wenn vorhanden, die Kontaktseite. Gespeichert werden bis zu drei Beobachtungen mit Quelle, zum Beispiel Jahreszahl, fehlendes viewport-Meta, Formular erst auf der Unterseite, Skripte ohne defer, fehlende meta description. Weniger als zwei solcher Punkte: kein Entwurf, Status `zu wenig Substanz`.
   Die Mail ist ein sachlicher Hinweis plus zwei oder drei Punkte, die der Betrieb selbst umsetzen kann. Eine Referenz aus gewonnenen Kontakten nur, wenn Gewerk und Notiz passen. Sonst fällt sie weg. Siezen, etwa 120 Wörter, Frage ohne Druck, Absender Kim und Viral Outlaws, Abmeldesatz. Werbesprache und Ausrufezeichen fliegen raus. Ein KI-Entwurf, der das nicht erfüllt, wird einmal neu geschrieben und sonst durch die Vorlage aus den Beobachtungen ersetzt. Im Editor stehen die Beobachtungen mit Quelle neben dem Text.
3. **Freigabe.** Status: Entwurf, Freigegeben, Gesendet, Antwort, Abgemeldet. Ablehnen und Löschen gibt es dazu. Mehrere Entwürfe lassen sich auf einmal freigeben. Vermutete Adressen nicht: die brauchen das eigene Häkchen. Ein Entwurf, der nach der Freigabe geändert wird, fällt auf Entwurf zurück.
4. **Versand.** pg_cron ruft jede Minute `outreach-send` auf, auch wenn das CRM zu ist. Jeder Lauf nimmt höchstens eine Mail mit Status Freigegeben, und nur wenn der gespeicherte Abstand um ist. Die Stufen sind 1, 2, 3 oder 5 Minuten, Standard 2. Eine Minute ist die schnellste Stufe. Tageslimit Standard 50, in der Oberfläche änderbar, höchstens 100. Das Fenster bleibt Montag–Freitag, 8 bis 18 Uhr Europe/Berlin. Die Bis-Stunde ist aus. **Versand pausieren** setzt `paused` und stoppt Knopf und Cron. In der Oberfläche steht der Hinweis, dass schneller Versand über das Hauptpostfach als Spam gelten und die Adresse blockieren kann. Browser und Cron teilen sich `claim_outreach_draft`: eine Advisory-Sperre pro Workspace, danach `sending_at` für 15 Minuten. Ein zweiter Lauf bekommt dieselbe Mail nicht. Der Kontakt mit Kundennummer `KD-…` entsteht beim Versand, oder früher über **Kontakt anlegen**. Die Nummer vergibt der vorhandene Trigger. Schon vergebene Rechnungsnummern bleiben. Ohne Freigabe geht keine Mail raus.
5. **Postfach.** Nur Mails, die Outreach verschickt hat, und die Antworten darauf. Filter Gesendet, Antwort, Abgemeldet, dazu Suche und ein Punkt für ungelesen. **KI-Entwurf** schreibt einen Text ins Feld und verschickt ihn nicht. **Senden** schickt genau diesen Text.
6. **Antworten.** `mail-sync` erkennt eine Antwort an der Message-ID oder an Absender plus Betreff und setzt den Status auf Antwort. Eine Abmelde-Formulierung setzt Abgemeldet und die Adresse auf die Sperrliste. Dieselbe Adresse und dieselbe Firma werden nicht erneut angeschrieben. Kontakte, die schon im CRM sind, auch nicht. Gewonnene Kontakte heißen in der Liste Bestandskunde.

Tageslimit und Abstand stehen auf der Seite Ziele (Standard 50 Mails am Tag, 2 Minuten). Das Fenster ist Montag bis Freitag, 8 bis 18 Uhr Europe/Berlin. Antworten, die Kim selbst schickt, zählen beim Abstand und beim Tageslimit mit, hängen aber nicht am Fenster.

## Tabellen

Migrationen `20261125160000_outreach.sql`, `20261125170000_outreach_observations.sql`, `20261125180000_outreach_send_cron.sql`, `20261125190000_outreach_night.sql` und `20261125200000_outreach_morning_speed.sql`:

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

## Vor dem Live-Gang

Die Migration ist nicht angewendet. Die Funktionen sind nicht ausgerollt. Zuerst die Screenshots ansehen.

1. Die fünf Outreach-Migrationen anwenden, zuletzt `20261125200000_outreach_morning_speed.sql`. Sie stellt den Versand auf jede Minute. Der Nachtlauf bleibt alle 15 Minuten und ruft Overpass nur zwischen Start ab und Fertig bis auf.
2. Funktionen ausrollen: `outreach-research`, `outreach-draft`, `outreach-send`, `outreach-reply`, `outreach-night`, und `mail-sync` neu, damit Antworten im Postfach landen.
3. Secrets bleiben, wo sie sind: `MAIL_IMAP_HOST`, `MAIL_IMAP_PORT`, `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM_NAME`, `ANTHROPIC_API_KEY`. Nichts davon ins Frontend oder ins Repo.
4. `OUTREACH_CRON_SECRET` als Function-Secret setzen und denselben Wert in den Vault legen, ohne ihn zu loggen: `select vault.create_secret('<secret>', 'outreach_cron_secret', 'Header x-outreach-cron für outreach-send und outreach-night');` Beide Crons senden den Wert als Header `x-outreach-cron`. Fehlt er, geht nachts nichts in die Suche und tagsüber nichts im Hintergrund raus.
5. Optional `CRM_WORKSPACE_ID`, sonst der Workspace `566f2d4d-5b66-4ba8-b6a1-1edf413a1689`.
6. Im Modul Tageslimit, Stunden und **Versand pausieren** prüfen.
7. Eine eigene Testadresse freigeben. Innerhalb des Fensters holt der Cron sie auch bei geschlossenem CRM. Der Knopf **Jetzt eine senden** nimmt dieselbe Sperre.

Die Demo unter `/?demo=outreach` zeigt erfundene Firmen auf `.example.test` und verschickt nichts.
