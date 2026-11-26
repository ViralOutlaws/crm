import { assert, assertEquals } from "jsr:@std/assert@1";
import { decodeWords, isAutoReply, mailBodyText, mimeHeader } from "./mime.ts";
import { replyPlan } from "./outreach.ts";

Deno.test("decodeWords: Q und B", () => {
  assertEquals(decodeWords("=?UTF-8?Q?Aw:_Anfragen_nach_Feierabend?="), "Aw: Anfragen nach Feierabend");
  assertEquals(decodeWords("=?utf-8?B?w5xiZXI=?="), "Über");
  assertEquals(decodeWords("=?ISO-8859-1?Q?Gr=FC=DFe?="), "Grüße");
});

Deno.test("mimeHeader faltet Zeilen", () => {
  assertEquals(mimeHeader("Subject: =?UTF-8?Q?Aw:_Anfragen?=\r\n =?UTF-8?Q?_nach_Feierabend?=\r\n", "subject"), "Aw: Anfragen nach Feierabend");
});

Deno.test("mailBodyText: multipart mit quoted-printable", () => {
  const header = 'Content-Type: multipart/alternative; boundary="xx"\r\n';
  const body = '--xx\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nVielen Dank f=C3=BCr Ihre Nachricht.=\r\n Wir melden uns.\r\n--xx\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>x</p>\r\n--xx--\r\n';
  assertEquals(mailBodyText(header, body), "Vielen Dank für Ihre Nachricht. Wir melden uns.");
});

Deno.test("mailBodyText: base64 html", () => {
  const header = "Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n";
  const html = "<p>Hallo<br>Gr&uuml;&szlig;e</p>";
  assert(mailBodyText(header, btoa(html)).startsWith("Hallo"));
});

Deno.test("isAutoReply: Header und Betreff", () => {
  assert(isAutoReply("Auto-Submitted: auto-replied\r\n", "Aw: Anfragen"));
  assert(!isAutoReply("Auto-Submitted: no\r\n", "Aw: Anfragen"));
  assert(isAutoReply("X-Autoreply: yes\r\n", "Aw: x"));
  assert(isAutoReply("Precedence: auto_reply\r\n", "Aw: x"));
  assert(isAutoReply("", "Automatische Antwort: Anfragen"));
  assert(isAutoReply("", "Out of Office: Termin"));
  assert(!isAutoReply("", "Aw: Anfragen nach Feierabend"));
});

Deno.test("replyPlan: Autoreply bleibt gesendet und sperrt nie", () => {
  const drafts = [{ id: "d1", email: "info@schalander-kempten.de", subject: "Anfragen nach Feierabend auf schalander-kempten.de", messageId: "<outreach.d1.1@viraloutlaws.de>", status: "gesendet" }];
  const plan = replyPlan({ fromEmail: "info@schalander-kempten.de", subject: "Aw: Anfragen nach Feierabend auf schalander-kempten.de", text: "Bitte abmelden? Reservierungen nur telefonisch.", header: "", drafts, auto: true });
  assertEquals(plan?.auto, true);
  assertEquals(plan?.nextStatus, "gesendet");
  assertEquals(plan?.blockEmail, null);
  const real = replyPlan({ fromEmail: "chef@schalander-kempten.de", subject: "Re: egal", text: "Gern, Dienstag passt.", header: "In-Reply-To: <outreach.d1.1@viraloutlaws.de>\r\n", drafts });
  assertEquals(real?.nextStatus, "antwort");
  assertEquals(real?.auto, false);
});

Deno.test("binär gelesene 8-Bit-Mail wird UTF-8", () => {
  const raw = String.fromCharCode(...new TextEncoder().encode("Grüße aus Kempten"));
  assertEquals(mailBodyText("Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n", raw), "Grüße aus Kempten");
  assertEquals(mimeHeader("Subject: " + String.fromCharCode(...new TextEncoder().encode("Aw: Öffnungszeiten")) + "\r\n", "subject"), "Aw: Öffnungszeiten");
});
