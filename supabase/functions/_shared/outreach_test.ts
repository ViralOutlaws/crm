import { assertEquals } from "jsr:@std/assert";
import {
  assertPublicHttpUrl,
  composePeerMail,
  contactSeed,
  emailMatchesPerson,
  finalizeMail,
  guessEmail,
  isGenericEmail,
  isOptOut,
  MAIL_WORD_MAX,
  matchingReference,
  observeSite,
  outreachSkip,
  parseSearchLinks,
  preferredPerson,
  readCompany,
  replyPlan,
  reviewMail,
  sendDecision,
  splitUrls,
  SUBSTANCE_LABEL,
  wordCount,
} from "./outreach.ts";

const PAGE = `<!doctype html><html><head><title>Impressum | Musterwerk GmbH</title></head><body>
<a href="/impressum">Impressum</a>
<h1>Impressum</h1>
<p>Musterwerk GmbH<br>Hafenstraße 4<br>87435 Kempten</p>
<p>Geschäftsführerin: Lena Muster</p>
<p>E-Mail: info@musterwerk.example.test</p>
<p>Direkt: lena.muster@musterwerk.example.test</p>
</body></html>`;

Deno.test("Impressum liefert Firma, Person, Adresse und bevorzugt die persönliche Adresse", () => {
  const read = readCompany({
    pageHtml: PAGE,
    pageUrl: "https://www.musterwerk.example.test/",
    impressumHtml: PAGE,
    impressumUrl: "https://musterwerk.example.test/impressum",
    guess: true,
  });
  assertEquals(read.firma.includes("Musterwerk"), true);
  assertEquals(read.domain, "musterwerk.example.test");
  assertEquals(read.plz, "87435");
  assertEquals(read.ort, "Kempten");
  assertEquals(read.str.includes("Hafenstraße"), true);
  const best = preferredPerson(read.people);
  assertEquals(best?.person, "Lena Muster");
  assertEquals(best?.rolle.toLowerCase().includes("geschäftsführerin"), true);
  assertEquals(best?.email, "lena.muster@musterwerk.example.test");
  assertEquals(best?.emailArt, "veroeffentlicht");
  assertEquals(read.people.some((p) => p.emailArt === "generisch" && p.email.startsWith("info@")), true);
  assertEquals(read.people.some((p) => p.emailArt === "vermutet"), false);
});

Deno.test("Nur info@ bleibt als allgemeine Adresse sichtbar, die Vermutung ist extra", () => {
  const html = `<html><head><title>Beispielhof</title></head><body>
<p>Beispielhof</p><p>Dorfweg 2</p><p>87435 Kempten</p>
<p>Inhaber: Jonas Beispiel</p>
<p>Mail: info@beispielhof.example.test</p>
</body></html>`;
  const read = readCompany({ pageHtml: html, pageUrl: "https://beispielhof.example.test", guess: true });
  const best = preferredPerson(read.people);
  assertEquals(best?.emailArt, "generisch");
  assertEquals(best?.hinweis.includes("allgemeine Adresse"), true);
  const guess = read.people.find((p) => p.emailArt === "vermutet");
  assertEquals(guess?.email, "jonas.beispiel@beispielhof.example.test");
  assertEquals(guess?.hinweis.includes("Vermutet"), true);
  assertEquals(preferredPerson(read.people)?.emailArt === "vermutet", false);
});

Deno.test("Umlaut im Namen wird im Muster zu ae, oe, ue, ss", () => {
  assertEquals(guessEmail("Jürgen Weiß", "atelier.example.test")?.email, "juergen.weiss@atelier.example.test");
  assertEquals(emailMatchesPerson("lena.muster@musterwerk.example.test", "Lena Muster"), true);
  assertEquals(isGenericEmail("info@beispielhof.example.test"), true);
  assertEquals(isGenericEmail("lena.muster@musterwerk.example.test"), false);
});

Deno.test("Interne Adressen und LinkedIn-Treffer bleiben draußen", () => {
  assertEquals(assertPublicHttpUrl("http://127.0.0.1/impressum").ok, false);
  assertEquals(assertPublicHttpUrl("http://169.254.169.254/").ok, false);
  assertEquals(assertPublicHttpUrl("http://10.1.1.1/").ok, false);
  assertEquals(assertPublicHttpUrl("https://localhost/impressum").ok, false);
  assertEquals(assertPublicHttpUrl("file:///etc/passwd").ok, false);
  assertEquals(assertPublicHttpUrl("https://musterwerk.example.test/impressum").ok, true);
  const links = parseSearchLinks(
    '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fmusterwerk.example.test%2F&rut=1">x</a>'
      + '<a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.linkedin.com%2Fin%2Fwer">y</a>'
      + '<a href="//duckduckgo.com/l/?uddg=http%3A%2F%2F127.0.0.1%2F">z</a>',
  );
  assertEquals(links, ["https://musterwerk.example.test/"]);
  assertEquals(splitUrls("https://a.example.test\nhttps://a.example.test https://b.example.test").length, 2);
});

Deno.test("Bestandskunden, CRM-Kontakte und alte Outreach-Ziele werden nicht erneut angeschrieben", () => {
  const base = {
    blocklist: ["weg@example.test"],
    crm: [
      { email: "kunde@hof.example.test", domain: "hof.example.test", customer: true },
      { email: "lead@neu.example.test", domain: "neu.example.test", customer: false },
    ],
    priorEmails: ["schon@alt.example.test"],
    priorDomains: ["www.alt.example.test"],
    rejectedEmails: ["nein@weg.example.test"],
  };
  assertEquals(outreachSkip({ ...base, email: "weg@example.test", domain: "frei.example.test" }), "Abgemeldet");
  assertEquals(outreachSkip({ ...base, email: "kunde@hof.example.test", domain: "hof.example.test" }), "Bestandskunde");
  assertEquals(outreachSkip({ ...base, email: "neu@hof.example.test", domain: "https://www.hof.example.test" }), "Bestandskunde");
  assertEquals(outreachSkip({ ...base, email: "lead@neu.example.test", domain: "neu.example.test" }), "Schon im CRM");
  assertEquals(outreachSkip({ ...base, email: "andere@alt.example.test", domain: "alt.example.test" }), "Schon angeschrieben");
  assertEquals(outreachSkip({ ...base, email: "frei@offen.example.test", domain: "offen.example.test" }), null);
});

Deno.test("Versand nur nach Freigabe, Vermutung nur mit Häkchen, mit Limit und Abstand", () => {
  const now = 1_000_000;
  const base = { kind: "outreach" as const, status: "freigegeben", emailArt: "veroeffentlicht", guessOk: false, skip: null, sentToday: 0, dailyLimit: 20, lastSentAt: null, now, gapMinutes: 5 };
  assertEquals(sendDecision(base).ok, true);
  assertEquals(sendDecision({ ...base, status: "entwurf" }).ok, false);
  assertEquals(sendDecision({ ...base, emailArt: "vermutet", guessOk: false }).ok, false);
  assertEquals(sendDecision({ ...base, emailArt: "vermutet", guessOk: true }).ok, true);
  assertEquals(sendDecision({ ...base, skip: "Bestandskunde" }).ok, false);
  assertEquals(sendDecision({ ...base, status: "abgemeldet" }).ok, false);
  assertEquals(sendDecision({ ...base, sentToday: 20 }).ok, false);
  assertEquals(sendDecision({ ...base, lastSentAt: now - 60_000 }).ok, false);
  assertEquals(sendDecision({ ...base, kind: "reply", status: "antwort" }).ok, true);
  assertEquals(sendDecision({ ...base, kind: "reply", status: "entwurf" }).ok, false);
});

Deno.test("Antworten werden dem Outreach zugeordnet, Abmelden sperrt, fremde Mails nicht", () => {
  const drafts = [{
    id: "d1",
    email: "lena.muster@musterwerk.example.test",
    subject: "Musterwerk: eine Frage zur Website",
    messageId: "<outreach.d1.1@viraloutlaws.de>",
    status: "gesendet",
    contactId: "c1",
  }];
  const byId = replyPlan({
    fromEmail: "lena.muster@musterwerk.example.test",
    subject: "AW: Musterwerk: eine Frage zur Website",
    text: "Klingt interessant, wir melden uns.",
    header: "In-Reply-To: <outreach.d1.1@viraloutlaws.de>\r\n",
    drafts,
  });
  assertEquals(byId?.nextStatus, "antwort");
  assertEquals(byId?.blockEmail, null);
  const opt = replyPlan({
    fromEmail: "lena.muster@musterwerk.example.test",
    subject: "Re: Musterwerk: eine Frage zur Website",
    text: "Bitte abmelden, kein Interesse.",
    header: "",
    drafts,
  });
  assertEquals(opt?.nextStatus, "abgemeldet");
  assertEquals(opt?.blockEmail, "lena.muster@musterwerk.example.test");
  const foreign = replyPlan({
    fromEmail: "andere@example.test",
    subject: "Rechnung Oktober",
    text: "Anbei die Rechnung.",
    header: "In-Reply-To: <newsletter.9@example.test>",
    drafts,
  });
  assertEquals(foreign, null);
  assertEquals(isOptOut("Wir haben Interesse an einer neuen Website."), false);
});

const THIN = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Schreinerei mit Werkstatt und Abholung vor Ort im Allgäu">
<title>Beispiel</title>
<script src="/app.js" defer></script>
</head><body>
<h1>Werkstatt</h1>
<a href="https://instagram.com/beispiel">Instagram</a>
<p>Termin nach Absprache.</p>
<form action="/kontakt"><input name="name"></form>
<p>Copyright 2026</p>
</body></html>`;

const OLD = `<!doctype html><html><head><title>Musterwerk</title>
<script src="/a.js"></script><script src="/b.js"></script>
</head><body>
<p>Rufen Sie uns an: <a href="tel:+498317700">0831 7700</a></p>
<img src="/a.jpg"><img src="/b.jpg"><img src="/c.jpg"><img src="/d.jpg">
</body></html>`;

const IMP = `<html><body><p>Musterwerk GmbH</p><p>Stand: 2019</p><p>Geschäftsführerin: Lena Muster</p></body></html>`;

Deno.test("Die Seite liefert konkrete Beobachtungen mit Quelle, eine dünne Seite nicht", () => {
  const notes = observeSite({
    pageHtml: OLD,
    pageUrl: "https://musterwerk.example.test/",
    impressumHtml: IMP,
    impressumUrl: "https://musterwerk.example.test/impressum",
    year: 2026,
  });
  assertEquals(notes.length >= 2 && notes.length <= 3, true);
  assertEquals(notes.some((n) => n.text.includes("2019") && n.source.includes("impressum")), true);
  assertEquals(notes.some((n) => n.kind === "mobil" && n.source === "https://musterwerk.example.test/"), true);
  assertEquals(notes.every((n) => n.tip.length > 10 && n.source.startsWith("https://")), true);
  const thin = observeSite({ pageHtml: THIN, pageUrl: "https://duenn.example.test/", year: 2026 });
  assertEquals(thin.length < 2, true);
});

Deno.test("Die Mail gibt umsetzbare Tipps, eine Referenz nur wenn sie passt", () => {
  const notes = observeSite({
    pageHtml: OLD,
    pageUrl: "https://musterwerk.example.test/",
    impressumHtml: IMP,
    impressumUrl: "https://musterwerk.example.test/impressum",
    year: 2026,
  });
  const refs = [{
    firma: "Werkstatt Berg",
    branche: "Schreinerei",
    ort: "Immenstadt",
    note: "Anfragen kamen per Telefon, ein Formular nimmt Maß und Terminwunsch auf.",
  }];
  const plain = composePeerMail({ person: "Lena Muster", firma: "Musterwerk GmbH", observations: notes, references: refs, branche: "Bäckerei" });
  if (!plain) throw new Error("keine Mail");
  assertEquals(reviewMail(plain.body, { observations: notes, references: refs }).join(","), "");
  assertEquals(plain.body.includes("Werkstatt Berg"), false);
  assertEquals(/Soll ich Ihnen das kurz zeigen\?/.test(plain.body), true);
  assertEquals(/Bitte abmelden/.test(plain.body), true);
  assertEquals(/!/.test(plain.body), false);
  assertEquals(wordCount(plain.body) <= MAIL_WORD_MAX, true);
  const fit = composePeerMail({ person: "Mara Holm", firma: "Holzform e.K.", observations: notes, references: refs, branche: "Schreinerei" });
  if (!fit) throw new Error("keine Referenzmail");
  assertEquals(fit.body.includes("Werkstatt Berg"), true);
  assertEquals(reviewMail(fit.body, { observations: notes, references: refs }).join(","), "");
  assertEquals(matchingReference(refs, "Bäckerei"), null);
  const fluffy = "Guten Tag Lena,\n\nich hoffe, diese Mail erreicht Sie gut! Unsere innovative Lösung ist maßgeschneidert.\n\nSoll ich Ihnen das kurz zeigen?\n\nViele Grüße\nKim\nViral Outlaws\n\nBitte abmelden.";
  assertEquals(reviewMail(fluffy, { observations: notes, references: refs }).includes(SUBSTANCE_LABEL), true);
  const invented = plain.body.replace("Soll ich", "Bei Fantasie GmbH war das schon so.\n\nSoll ich");
  assertEquals(reviewMail(invented, { observations: notes, references: refs }).includes("Referenz nicht belegt"), true);
  const kept = finalizeMail({
    person: "Lena Muster",
    firma: "Musterwerk GmbH",
    observations: notes,
    attempts: [{ subject: "Kurz", body: fluffy }],
  });
  assertEquals(kept.ok && kept.source === "vorlage", true);
  const thin = finalizeMail({ person: "Ada", firma: "Dünn", observations: observeSite({ pageHtml: THIN, pageUrl: "https://duenn.example.test/", year: 2026 }) });
  assertEquals(thin.ok, false);
  const seed = contactSeed({ firma: "Musterwerk GmbH", person: "Lena Muster", email: "lena.muster@musterwerk.example.test", str: "Hafenstraße 4", plz: "87435", ort: "Kempten", web: "https://musterwerk.example.test" });
  assertEquals(seed.status, "lead");
  assertEquals("kundennummer" in seed, false);
});
