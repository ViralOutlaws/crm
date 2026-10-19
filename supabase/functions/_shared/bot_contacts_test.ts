import { assertEquals } from "jsr:@std/assert@1";
import {
  BODY_LIMIT,
  CONTACT_BATCH_MAX,
  CONTACT_BODY_LIMIT,
  CONTACT_QUELLE_DEFAULT,
  CONTACT_STATUS_DEFAULT,
  berlinDay,
  contactBatchSummary,
  contactInputs,
  contactLookup,
  duplicateId,
  likePattern,
  normFirma,
  orIlike,
  planContactBatch,
  prepareContact,
  requestTooLarge,
  webDomain,
  withWorkspaceLock,
} from "./bot_contacts.ts";

const DAY = "2026-10-19";

const existing = [
  { id: "alt", firma: "müller", plz: "87700", email: "alt@beispiel.de", web: "https://beispiel.de/start" },
  { id: "andere", firma: "Andere GmbH", plz: "80331", email: null, web: null },
];

Deno.test("Standard ist lead und sonstiges, fremde Felder fallen weg", () => {
  const prepared = prepareContact({
    firma: "  Neue Firma  ",
    workspace_id: "fremd",
    id: "nicht-uebernehmen",
    archiviert: true,
    deal_wert: 10,
    status: "Lead",
  }, "Saley", DAY);
  if (!prepared.ok) throw new Error(prepared.error);
  assertEquals(prepared.row.status, CONTACT_STATUS_DEFAULT);
  assertEquals(prepared.row.quelle, CONTACT_QUELLE_DEFAULT);
  assertEquals(prepared.row.notes, `[${DAY}] Angelegt von Bot Saley`);
  assertEquals(prepared.row.firma, "Neue Firma");
  assertEquals("workspace_id" in prepared.row, false);
  assertEquals("id" in prepared.row, false);
  assertEquals("archiviert" in prepared.row, false);
});

Deno.test("Quelle nur aus QUELLEN, Status nur aus der Pipeline", () => {
  const known = prepareContact({ firma: "A", quelle: "KI-Check", status: "Gewonnen", notes: "Bitte anrufen" }, "Saley", DAY);
  if (!known.ok) throw new Error(known.error);
  assertEquals(known.row.quelle, "ki-check");
  assertEquals(known.row.status, "gewonnen");
  assertEquals(known.row.notes, `Bitte anrufen\n[${DAY}] Angelegt von Bot Saley`);

  const website = prepareContact({ firma: "A", quelle: "Website" }, "Saley", DAY);
  if (!website.ok) throw new Error(website.error);
  assertEquals(website.row.quelle, "website");
  const sonstiges = prepareContact({ firma: "A", quelle: "Sonstiges" }, "Saley", DAY);
  if (!sonstiges.ok) throw new Error(sonstiges.error);
  assertEquals(sonstiges.row.quelle, "sonstiges");
  assertEquals(sonstiges.row.notes, `[${DAY}] Angelegt von Bot Saley`);

  const rejected = prepareContact({ firma: "A", quelle: "Messe", status: "kunde" }, "Saley", DAY);
  if (!rejected.ok) throw new Error(rejected.error);
  assertEquals(rejected.row.quelle, "sonstiges");
  assertEquals(rejected.row.status, "lead");
  assertEquals(rejected.row.notes, `[${DAY}] Angelegt von Bot Saley (Quelle: Messe)`);

  const fuzzy = prepareContact({ firma: "A", quelle: "ki check" }, "Saley", DAY);
  if (!fuzzy.ok) throw new Error(fuzzy.error);
  assertEquals(fuzzy.row.quelle, "sonstiges");
  assertEquals(fuzzy.row.notes, `[${DAY}] Angelegt von Bot Saley (Quelle: ki check)`);
});

Deno.test("Firma fehlt, E-Mail ungültig, lange Notiz behält die Bot-Zeile", () => {
  assertEquals(prepareContact({ person: "Kim" }, "Saley", DAY), { ok: false, error: "Firma fehlt." });
  assertEquals(prepareContact({ firma: "A", email: "keine-mail" }, "Saley", DAY).ok, false);
  const line = `[${DAY}] Angelegt von Bot Saley`;
  const prepared = prepareContact({ firma: "A", notes: "x".repeat(2000) }, "Saley", DAY);
  if (!prepared.ok) throw new Error(prepared.error);
  assertEquals(prepared.row.notes?.endsWith(line), true);
  assertEquals(prepared.row.notes?.length, 2000);
});

Deno.test("Dublette über Firma und PLZ, Rechtsform und Schreibweise egal", () => {
  assertEquals(normFirma("Müller GmbH & Co. KG"), "müller");
  assertEquals(normFirma("Müller   UG (haftungsbeschränkt)"), "müller");
  assertEquals(normFirma("Müller e.K."), "müller");
  assertEquals(duplicateId({ firma: "Müller GmbH", plz: "87 700", email: "", web: "" }, existing), "alt");
  assertEquals(duplicateId({ firma: "Müller GmbH", plz: "80331", email: "", web: "" }, existing), null);
  assertEquals(duplicateId({ firma: "Andere", plz: "80331", email: "", web: "" }, existing), "andere");
});

Deno.test("Dublette über E-Mail oder Domain, leere Werte treffen nichts", () => {
  assertEquals(duplicateId({ firma: "Neu", plz: "11111", email: "ALT@Beispiel.de", web: "" }, existing), "alt");
  assertEquals(webDomain("https://www.Beispiel.de/impressum?x=1"), "beispiel.de");
  assertEquals(duplicateId({ firma: "Neu", plz: "", email: "", web: "www.beispiel.de/kontakt" }, existing), "alt");
  assertEquals(duplicateId({ firma: "Neu", plz: "99999", email: "", web: "" }, [
    { id: "leer", firma: "Anders", plz: "00000", email: "", web: "" },
  ]), null);
});

Deno.test("Batch erkennt die eigene Dublette und bleibt beim erneuten Aufruf stehen", () => {
  let n = 0;
  const first = planContactBatch([
    { firma: "Neu GmbH", plz: "12345", email: "neu@firma.de" },
    { firma: "Neu", plz: "12345" },
    { firma: "Neu", plz: "12345", email: "NEU@firma.de", web: "https://fremd.test" },
  ], existing, "Saley", () => `neu-${++n}`, DAY);
  assertEquals(first.map((p) => p.kind), ["insert", "duplicate", "duplicate"]);
  if (first[0].kind !== "insert" || first[1].kind !== "duplicate" || first[2].kind !== "duplicate") return;
  assertEquals(first[1].existing_id, "neu-1");
  assertEquals(first[2].existing_id, "neu-1");
  const again = planContactBatch([
    { firma: "Neu GmbH", plz: "12345" },
  ], [...existing, { id: "neu-1", firma: "Neu GmbH", plz: "12345", email: "neu@firma.de", web: null }], "Saley", () => "soll-nicht", DAY);
  assertEquals(again, [{ kind: "duplicate", existing_id: "neu-1" }]);
});

Deno.test("create_contact ist ein Objekt, die Liste hat höchstens 50", () => {
  const one = contactInputs("create_contact", { op: "create_contact", firma: "A", workspace_id: "weg" });
  assertEquals(one.ok, true);
  if (one.ok) assertEquals(one.items.length, 1);
  const wrapped = contactInputs("create_contact", { contact: { firma: "B" } });
  assertEquals(wrapped.ok, true);
  assertEquals(contactInputs("create_contacts", { contacts: { firma: "A" } }).ok, false);
  assertEquals(contactInputs("create_contacts", { contacts: [] }).ok, false);
  const tooMany = contactInputs("create_contacts", { contacts: Array.from({ length: CONTACT_BATCH_MAX + 1 }, () => ({ firma: "A" })) });
  assertEquals(tooMany, { ok: false, error: "Höchstens 50 Kontakte." });
  assertEquals(contactBatchSummary([{ created: true }, { duplicate: true }, { error: "Firma fehlt." }]), "Kontakte: 1 angelegt, 1 Dubletten, 1 Fehler.");
});

Deno.test("Dublettenfilter nennt E-Mail, Domain und PLZ, nicht die ganze Tabelle", () => {
  const lookup = contactLookup([
    { firma: "Müller GmbH", plz: "87 700", email: "ALT@Beispiel.de", web: "https://www.Beispiel.de/start" },
    { firma: "Ohne PLZ", plz: "  ", email: "keine-mail", web: "https://foo_bar.com/pfad" },
    { firma: "", plz: "00000", email: "", web: "" },
  ]);
  assertEquals(lookup.emails, ["alt@beispiel.de"]);
  assertEquals(lookup.domains, ["beispiel.de", "foo_bar.com"]);
  assertEquals(lookup.plz, ["87 700", "87700"]);
  assertEquals(lookup.emptyPlz, true);
  assertEquals(orIlike("email", lookup.emails.map(likePattern)), 'email.ilike."alt@beispiel.de"');
  assertEquals(orIlike("web", [`%${likePattern("foo_bar.com")}%`]), 'web.ilike."%foo\\_bar.com%"');
  assertEquals(orIlike("email", ['a"b@x.de']), 'email.ilike."a\\"b@x.de"');
});

Deno.test("E-Mail oder Domain mit Anführungszeichen, Komma, Klammer oder Backslash überspringt nur den Eintrag", () => {
  const plans = planContactBatch([
    { firma: "Kaputt Mail", email: 'a"b@x.de' },
    { firma: "Komma", email: "a,b@x.de" },
    { firma: "Klammer", web: "https://bad(site).de/pfad" },
    { firma: "Slash", web: "https://bad\\site.de" },
    { firma: "Bleibt" },
  ], [], "Saley", () => "neu", DAY);
  assertEquals(plans.map((p) => p.kind), ["error", "error", "error", "error", "insert"]);
  assertEquals(plans[0], { kind: "error", error: "E-Mail ungültig." });
  assertEquals(plans[2], { kind: "error", error: "Domain ungültig." });
  if (plans[4].kind !== "insert") return;
  assertEquals(plans[4].row.firma, "Bleibt");
});

Deno.test("Body über 32.000 nur für create_contacts bis 240.000", () => {
  assertEquals(requestTooLarge(BODY_LIMIT, "update"), false);
  assertEquals(requestTooLarge(BODY_LIMIT + 1, "update"), true);
  assertEquals(requestTooLarge(BODY_LIMIT + 1, "create_contact"), true);
  assertEquals(requestTooLarge(CONTACT_BODY_LIMIT, "create_contacts"), false);
  assertEquals(requestTooLarge(CONTACT_BODY_LIMIT + 1, "create_contacts"), true);
  assertEquals(requestTooLarge(CONTACT_BODY_LIMIT + 1, "list"), true);
});

Deno.test("Lock serialisiert einen Workspace, ein Fehler blockiert den nächsten nicht", async () => {
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  let active = 0;
  let maxSame = 0;
  const same = async () => {
    active += 1;
    maxSame = Math.max(maxSame, active);
    await delay(20);
    active -= 1;
  };
  await Promise.all([
    withWorkspaceLock("ws-same", same),
    withWorkspaceLock("ws-same", same),
  ]);
  assertEquals(maxSame, 1);

  let overlap = 0;
  let maxOverlap = 0;
  const other = async () => {
    overlap += 1;
    maxOverlap = Math.max(maxOverlap, overlap);
    await delay(20);
    overlap -= 1;
  };
  await Promise.all([
    withWorkspaceLock("ws-left", other),
    withWorkspaceLock("ws-right", other),
  ]);
  assertEquals(maxOverlap, 2);

  const failed = withWorkspaceLock("ws-fail", async () => {
    throw new Error("kaputt");
  });
  const next = withWorkspaceLock("ws-fail", async () => "ok");
  await failed.catch(() => {});
  assertEquals(await next, "ok");
});

Deno.test("Datum in der Notiz ist Europe/Berlin", () => {
  assertEquals(berlinDay(new Date("2026-10-19T21:30:00Z")), "2026-10-19");
  assertEquals(berlinDay(new Date("2026-10-19T22:30:00Z")), "2026-10-20");
});
