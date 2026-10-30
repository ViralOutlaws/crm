# crm

## Nummern

Migration `supabase/migrations/20261030200000_doc_numbers.sql` ist auf der Live-Datenbank angewendet.

- Kundennummer `KD-10001` aufwärts, je Workspace, nur lesbar in der Oberfläche. Bestehende Kontakte werden nach `created_at` gefüllt.
- Neue Belege: `RE-2026-1001`, `AN-2026-1001`, `GS-2026-1001`. Die Nummer setzt ein Trigger in derselben Transaktion. Sie ist danach fest.
- Schon ausgestellte Nummern wie `R007` oder `R0001` bleiben, auch wenn eine Altnummer doppelt vorkommt. Ein Unique-Index gilt nur für das neue Schema `RE-` / `AN-` / `GS-`.
- In den Einstellungen lässt sich der nächste Startwert nur über die letzte vergebene Nummer anheben.
- Rechnungen mit Datum im laufenden Jahr (Europe/Berlin) lassen sich nicht archivieren.

## Posteingang

Zugangsdaten nur als Supabase-Secrets, nie im Frontend oder im Repo:

- `MAIL_IMAP_HOST` Standard `imaps.udag.de`
- `MAIL_IMAP_PORT` Standard `993` (SSL/TLS, United Domains; alternativ 143 mit STARTTLS)
- `MAIL_SMTP_HOST` Standard `smtps.udag.de`
- `MAIL_SMTP_PORT` Standard `465` (SSL/TLS; United Domains nennt auch 587 mit STARTTLS)
- `MAIL_USER` volle E-Mail-Adresse oder Mailbox-Name
- `MAIL_PASS` Mailbox-Passwort
- `MAIL_FROM_NAME` Anzeigename

United Domains, geprüft an der offiziellen Hilfe: IMAP `imaps.udag.de:993`, SMTP `smtps.udag.de:465`, kein SPA. Der IMAP-Wurzelordner auf iPhone und in Outlook ist `INBOX`.

`MAIL_SENT_FOLDER` ist optional. Sonst sucht der Versand den Ordner mit dem IMAP-Flag `\Sent` oder einem Namen wie Gesendet, Sent, Sent Items, Gesendete Elemente, INBOX.Gesendet. Nach dem SMTP-Versand wird die Mail dorthin kopiert (APPEND), damit sie im normalen Mailprogramm liegt.

Fehlen die Secrets, zeigt der Posteingang „E-Mail noch nicht verbunden“. Website-Anfragen bleiben nutzbar. Nichts wird ohne den Button Senden verschickt, und nichts wird automatisch gelöscht.

Migration `supabase/migrations/20261030210000_wissensbasis_posteingang.sql` nicht selbst auf die Live-Datenbank anwenden.

Funktionen neu ausrollen: `mail-sync`, `mail-send`, `inbox-draft`, `deal-estimate`, `website-lead`, `jarvis-chat`. `ANTHROPIC_API_KEY` liegt bereits bei den Supabase-Secrets.
