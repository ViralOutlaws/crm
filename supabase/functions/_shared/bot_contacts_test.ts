import { assertEquals } from "jsr:@std/assert@1";
import {
  CONTACT_BATCH_MAX,
  CONTACT_STATUS_DEFAULT,
  contactBatchSummary,
  contactInputs,
  duplicateId,
  normFirma,
  planContactBatch,
  prepareContact,
  webDomain,
} from "./bot_contacts.ts";

const existing = [
  { id: "alt", firma: "müller", plz: "87700", email: "alt@beispiel.de", web: "https://beispiel.de/start" },
  { id: "andere", firma: "Andere GmbH", plz: "80331", email: null, web: null },
];

Deno.test("Standard ist lead, Quelle der Bot, fremde Felder fallen weg", () => {
  const prepared = prepareContact({
    firma: "  Neue Firma  ",
    workspace_id: "fremd",
    id: "nicht-uebernehmen",
    archiviert: true,
    deal_wert: 10,
    status: "Lead",
  }, "Saley");
  if (!prepared.ok) throw new Error(prepared.error);
  assertEquals(prepared.row.status, CONTACT_STATUS_DEFAULT);
  assertEquals(prepared.row.quelle, "Bot: Saley");
  assertEquals(prepared.row.firma, "Neue Firma");
  assertEquals("workspace_id" in prepared.row, false);
  assertEquals("id" in prepared.row, false);
  assertEquals("archiviert" in prepared.row, false);
});

Deno.test("Firma fehlt, Status unbekannt, E-Mail ungültig", () => {
  assertEquals(prepareContact({ person: "Kim" }, "Saley"), { ok: false, error: "Firma fehlt." });
  assertEquals(prepareContact({ firma: "A", status: "kunde" }, "Saley").ok, false);
  assertEquals(prepareContact({ firma: "A", email: "keine-mail" }, "Saley").ok, false);
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
  ], existing, "Saley", () => `neu-${++n}`);
  assertEquals(first.map((p) => p.kind), ["insert", "duplicate", "duplicate"]);
  if (first[0].kind !== "insert" || first[1].kind !== "duplicate" || first[2].kind !== "duplicate") return;
  assertEquals(first[1].existing_id, "neu-1");
  assertEquals(first[2].existing_id, "neu-1");
  const again = planContactBatch([
    { firma: "Neu GmbH", plz: "12345" },
  ], [...existing, { id: "neu-1", firma: "Neu GmbH", plz: "12345", email: "neu@firma.de", web: null }], "Saley", () => "soll-nicht");
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
