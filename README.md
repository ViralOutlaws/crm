# crm

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
