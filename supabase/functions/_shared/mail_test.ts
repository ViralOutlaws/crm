import { assertEquals } from "jsr:@std/assert";
import {
  classifyHeuristic,
  folderRole,
  isFreemail,
  parseListLine,
  pickSentFolder,
  sanitizeHtml,
  shouldDraft,
  threadKey,
} from "./mail.ts";

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
