import { assertEquals } from "jsr:@std/assert";
import {
  classifyHeuristic,
  folderRole,
  isFreemail,
  parseListLine,
  pickRecentUids,
  pickSentFolder,
  sanitizeHtml,
  shouldDraft,
  mailFingerprint,
  threadKey,
} from "./mail.ts";

Deno.test("Gelöschte Mails haben einen stabilen Fingerabdruck", () => {
  const a = mailFingerprint("Beispielbetrieb <demo@example.test>", "Website: Beispielbetrieb", "Bitte um Rückruf.");
  const b = mailFingerprint("demo@example.test", "  Website: Beispielbetrieb ", "Bitte   um Rückruf.");
  assertEquals(a, b);
  assertEquals(a.includes("demo@example.test"), true);
  assertEquals(mailFingerprint("Andere <andere@example.test>", "Website: Beispielbetrieb", "Bitte um Rückruf.") === a, false);
});

Deno.test("Ordnerrollen und Sent-Erkennung", () => {
  assertEquals(folderRole("INBOX", ["\\Inbox"]), "inbox");
  assertEquals(folderRole("Gesendet", []), "sent");
  assertEquals(folderRole("INBOX.Gesendet", []), "sent");
  assertEquals(folderRole("Kunden/Web", []), "other");
  const listed = [
    parseListLine('* LIST (\\HasNoChildren) "/" "INBOX"'),
    parseListLine('* LIST (\\Sent) "/" "Gesendete Elemente"'),
    parseListLine('* LIST (\\HasChildren) "/" "Kunden"'),
  ].filter((x) => !!x);
  assertEquals(pickSentFolder(listed), "Gesendete Elemente");
  assertEquals(listed[2]?.role, "other");
});

Deno.test("Die neuesten UIDs, nicht die ältesten", () => {
  const uids = Array.from({ length: 500 }, (_, i) => i + 1);
  const newest = pickRecentUids(uids, 200);
  assertEquals(newest[0], 301);
  assertEquals(newest[newest.length - 1], 500);
  assertEquals(newest.length, 200);
  const older = pickRecentUids(uids, 50, { beforeUid: 301 });
  assertEquals(older[0], 251);
  assertEquals(older[older.length - 1], 300);
  assertEquals(older.length, 50);
  assertEquals(pickRecentUids(uids, 80, { afterUid: 500 }), []);
  const gap = pickRecentUids(uids, 80, { afterUid: 490 });
  assertEquals(gap[0], 491);
  assertEquals(gap[gap.length - 1], 500);
  assertEquals(gap.length, 10);
});

Deno.test("Freemail, Thread, HTML, Klassifikation", () => {
  assertEquals(isFreemail("a@gmail.com"), true);
  assertEquals(isFreemail("a@atelier-lumen.example"), false);
  assertEquals(threadKey("AW: Re: Website"), "website");
  const html = sanitizeHtml('<img src="https://x.test/a.png"><script>alert(1)</script><b onclick="x">Hi</b>');
  assertEquals(html.includes("script"), false);
  assertEquals(html.includes("onclick"), false);
  assertEquals(html.includes("data-remote-src"), true);
  assertEquals(classifyHeuristic("Unsubscribe newsletter", false), "newsletter");
  assertEquals(shouldDraft("newsletter", false), false);
  assertEquals(shouldDraft("anfrage", false), true);
  assertEquals(shouldDraft("sonstiges", true), true);
});

Deno.test("Mail-Header: Umlaute kodiert, nur CRLF, Datum gesetzt", async () => {
  const { buildRfc822, encodeHeader } = await import("./mail.ts");
  const enc = encodeHeader("Anfragen nach Feierabend auf zahnärzte-wedding.de unterwegs am Handy – Größe");
  if (!/^=\?UTF-8\?B\?/.test(enc)) throw new Error("nicht kodiert");
  for (const word of enc.split("\r\n ")) if (word.length > 75) throw new Error("Wort zu lang");
  if (encodeHeader("Nur ASCII") !== "Nur ASCII") throw new Error("ASCII verändert");
  const raw = buildRfc822("info@viraloutlaws.de", ["a@b.de"], "Grüße", "Zeile 1\nZeile 2\r\n", "Kim");
  if (/[^\r]\n/.test(raw)) throw new Error("nacktes LF");
  if (!/^Date: /m.test(raw)) throw new Error("Datum fehlt");
  if (!raw.includes("Content-Transfer-Encoding: 8bit")) throw new Error("CTE fehlt");
});
