import assert from "node:assert/strict";
import test from "node:test";
import { compareContacts, contactSortKey, demoView } from "./data.js";

test("Firma geht vor, sonst der Name, leer ans Ende", () => {
  const rows = [
    { firma: "Zebra GmbH", person: "Anna" },
    { firma: "apfel", person: "Zed" },
    { firma: "ÄPFEL", person: "egal" },
    { firma: "", person: "Müller" },
    { firma: "   ", person: "Öhr" },
    { firma: " ", person: " " },
    { firma: "", person: "" },
    { cells: { firma: "", person: "Banane" } },
    { cells: { firma: "müller GmbH", person: "Zoe" } },
  ];
  const keys = rows.slice().sort(compareContacts).map(contactSortKey);
  assert.deepEqual(keys.slice(-2), ["", ""]);
  assert.equal(keys.filter(Boolean).length, keys.length - 2);
  assert.ok(keys.indexOf("apfel") < keys.indexOf("Banane"));
  assert.ok(keys.indexOf("Banane") < keys.indexOf("Müller"));
  assert.ok(keys.indexOf("Müller") < keys.indexOf("müller GmbH"));
  assert.ok(keys.indexOf("müller GmbH") < keys.indexOf("Öhr"));
  assert.ok(keys.indexOf("Öhr") < keys.indexOf("Zebra GmbH"));
  assert.equal(compareContacts({ firma: "Alpha" }, { firma: "alpha" }), 0);
  assert.equal(compareContacts({ firma: "Äpfel" }, { firma: "apfel" }), 0);
  assert.ok(compareContacts({ firma: "Zeta", person: "Aaa" }, { firma: "Aaa", person: "Zeta" }) > 0);
  assert.ok(compareContacts({ firma: "Überblick" }, { firma: "Vogel" }) < 0);
});

test("Die Demo-Kontaktliste ist nach demselben Schlüssel sortiert", () => {
  const rows = demoView("contacts").rows;
  const keys = rows.map(contactSortKey);
  const sorted = keys.slice().sort((a, b) => a.localeCompare(b, "de", { sensitivity: "base" }));
  assert.deepEqual(keys, sorted);
  assert.ok(keys.length >= 6);
  assert.ok(keys.every((k) => k));
  assert.ok(keys.indexOf("Beispiel Bäckerei") < keys.indexOf("Beispiel Hotel"));
  assert.ok(keys.indexOf("Muster Physio") < keys.indexOf("Musterfirma GmbH"));
});
