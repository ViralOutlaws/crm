import test from "node:test";
import assert from "node:assert/strict";
import { NOT_CONNECTED, connectionFromRuns, demoLeitstand, leitstandView } from "./data.js";

test("Verbindung kommt aus dem letzten Lauf, nicht aus Secrets", () => {
  assert.equal(connectionFromRuns([]), "unbekannt");
  assert.equal(connectionFromRuns([{ status: "queued", result: NOT_CONNECTED, events: [] }]), "nicht verbunden");
  assert.equal(connectionFromRuns([{ status: "sent", result: "Webhook angenommen.", events: [] }]), "verbunden");
  assert.equal(connectionFromRuns([{ status: "fehler", result: "Webhook nicht erreichbar.", events: [] }]), "fehler");
  assert.equal(NOT_CONNECTED, "Bot noch nicht verbunden");
});

test("Leitstand hat fünf Karten mit Auftrag und Test", () => {
  const view = demoLeitstand();
  assert.equal(view.leitstand, true);
  assert.equal(view.bots.length, 5);
  const webby = view.bots.find((b) => b.id === "webby");
  const marky = view.bots.find((b) => b.id === "marky");
  assert.equal(webby.focus, "Website / Tech");
  assert.equal(webby.connection, "verbunden");
  assert.equal(webby.runs[0].title, "Website für ein Yogastudio");
  assert.equal(marky.focus, "Marketing / Social");
  assert.equal(marky.connection, "nicht verbunden");
  assert.match(marky.runs[0].result, /Bot noch nicht verbunden/);
  const empty = leitstandView([]);
  assert.equal(empty.bots.every((b) => b.connection === "unbekannt"), true);
});
