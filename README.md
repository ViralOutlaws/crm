# crm

## Nummern

Migration `supabase/migrations/20261030200000_doc_numbers.sql` (nicht selbst auf die Live-Datenbank anwenden).

- Kundennummer `KD-10001` aufwärts, je Workspace, nur lesbar in der Oberfläche. Bestehende Kontakte werden nach `created_at` gefüllt.
- Neue Belege: `RE-2026-1001`, `AN-2026-1001`, `GS-2026-1001`. Die Nummer setzt ein Trigger in derselben Transaktion. Sie ist danach fest.
- Schon ausgestellte Nummern wie `R007` oder `R0001` bleiben, auch wenn eine Altnummer doppelt vorkommt. Ein Unique-Index gilt nur für das neue Schema `RE-` / `AN-` / `GS-`.
- In den Einstellungen lässt sich der nächste Startwert nur über die letzte vergebene Nummer anheben.
- Rechnungen mit Datum im laufenden Jahr (Europe/Berlin) lassen sich nicht archivieren.
