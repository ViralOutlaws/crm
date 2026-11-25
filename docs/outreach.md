# Outreach

Akquise im CRM: Firmen lesen, Entscheider aus dem Impressum ziehen, einen deutschen Entwurf schreiben, Kim gibt jede Mail frei, erst dann geht sie über die bestehende United-Domains-Mailbox raus.

Die Oberfläche ist der Punkt **Outreach** in der Seitenleiste. Der alte **Posteingang** ist dort nicht mehr. `mail-sync`, `mail-send`, die Mail-Tabellen und die Secrets bleiben. Es wird nichts gelöscht.

Nichts wird ohne Freigabe genau dieser Mail verschickt. Antworten gehen nur raus, wenn Kim auf **Senden** drückt.

## Ablauf

1. **Ziele.** URLs, eine pro Zeile, oder Branche plus Region. Die Funktion `outreach-research` holt die Website und das Impressum (höchstens acht Adressen pro Lauf). Sie liest Firma, Geschäftsführer oder Inhaber, Adresse und eine geschäftliche E-Mail. Eine persönliche Adresse geht vor `info@`. Gibt es nur eine allgemeine Adresse, steht das in der Karte. Optional entsteht eine Adresse nach dem Muster `vorname.nachname`. Die ist als **Vermutet** markiert und geht nur raus, wenn Kim das Häkchen im Entwurf setzt. Kein LinkedIn, keine bezahlte Schnittstelle. Die Suche nutzt die öffentliche HTML-Seite von DuckDuckGo und kann leer bleiben. Dann die URLs direkt einfügen.
2. **Entwurf.** `outreach-draft` schreibt eine kurze Mail auf Deutsch. Quelle sind die Wissensbasis und gewonnene Kontakte, und zwar nur Firma, Branche, Ort und Website. Referenzen, die nicht im CRM stehen, werden nicht erfunden. Absender ist Kim, Viral Outlaws. Im Text steht ein Satz zum Abmelden. Ohne `ANTHROPIC_API_KEY` liegt eine feste Vorlage im Entwurf.
3. **Freigabe.** Status: Entwurf, Freigegeben, Gesendet, Antwort, Abgemeldet. Ablehnen und Löschen gibt es dazu. Mehrere Entwürfe lassen sich auf einmal freigeben. Vermutete Adressen nicht: die brauchen das eigene Häkchen. Ein Entwurf, der nach der Freigabe geändert wird, fällt auf Entwurf zurück.
4. **Versand.** **Freigegebene senden** ruft `outreach-send` auf. Die Funktion nimmt nur den Status Freigegeben, prüft Sperrliste, Bestandskunden und das Limit, und schickt höchstens eine Mail pro Aufruf über `MAIL_*` (gleicher Weg wie `mail-send`). Solange die Seite offen bleibt, folgt die nächste Mail nach dem Abstand. **Versand anhalten** stoppt die Reihe. Ein Kontakt mit Kundennummer `KD-…` entsteht beim Versand, oder früher über **Kontakt anlegen**. Die Nummer vergibt der vorhandene Trigger. Schon vergebene Rechnungsnummern bleiben.
5. **Postfach.** Nur Mails, die Outreach verschickt hat, und die Antworten darauf. Filter Gesendet, Antwort, Abgemeldet, dazu Suche und ein Punkt für ungelesen. **KI-Entwurf** schreibt einen Text ins Feld und verschickt ihn nicht. **Senden** schickt genau diesen Text.
6. **Antworten.** `mail-sync` erkennt eine Antwort an der Message-ID oder an Absender plus Betreff und setzt den Status auf Antwort. Eine Abmelde-Formulierung setzt Abgemeldet und die Adresse auf die Sperrliste. Dieselbe Adresse und dieselbe Firma werden nicht erneut angeschrieben. Kontakte, die schon im CRM sind, auch nicht. Gewonnene Kontakte heißen in der Liste Bestandskunde.

Tageslimit und Abstand stehen auf der Seite Ziele (Standard 20 Mails am Tag, 5 Minuten, Europe/Berlin) und gelten auch für Antworten.

## Tabellen

Migration `supabase/migrations/20261125160000_outreach.sql`:

| Tabelle | Inhalt |
|---|---|
| `outreach_settings` | Tageslimit, Abstand, ob Vermutungen an sind |
| `outreach_targets` | Gelesene Firma, Domain, Impressum, Auszug |
| `outreach_people` | Person, Rolle, Adresse, Art der E-Mail |
| `outreach_drafts` | Betreff, Text, Status, Freigabe, Kundenlink |
| `outreach_messages` | Verlauf im Postfach, Ausgang und Antwort |
| `outreach_blocklist` | Adressen, die nicht mehr angeschrieben werden |

RLS wie bei der Wissensbasis: nur der eigene Workspace. Der Service-Role-Key und die Mail-Secrets stehen nicht im Frontend.

## Vor dem Live-Gang

Die Migration ist nicht angewendet. Die Funktionen sind nicht ausgerollt. Zuerst die Screenshots ansehen.

1. Migration `20261125160000_outreach.sql` auf dem Projekt `jjfmxiqippkgqkwihgek` anwenden.
2. Funktionen ausrollen: `outreach-research`, `outreach-draft`, `outreach-send`, `outreach-reply`, und `mail-sync` neu, damit Antworten im Postfach landen.
3. Secrets bleiben, wo sie sind: `MAIL_IMAP_HOST`, `MAIL_IMAP_PORT`, `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM_NAME`, `ANTHROPIC_API_KEY`. Nichts davon ins Frontend oder ins Repo.
4. Im Modul das Tageslimit prüfen.
5. Eine eigene Testadresse freigeben und senden, bevor echte Firmen drankommen.
6. Es gibt keinen Cron, der die Warteschlange allein leert. Dafür muss die Seite offen sein, oder Kim drückt erneut **Freigegebene senden**.

Die Demo unter `/?demo=outreach` zeigt erfundene Firmen auf `.example.test` und verschickt nichts.
