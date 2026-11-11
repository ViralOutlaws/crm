import { assertEquals } from "jsr:@std/assert@1";
import {
  attemptLabel,
  clampAttemptMax,
  defaultNextStep,
  ilikeExact,
  matchOpenLead,
  planCall,
  planDoNotCall,
  planList,
  sameTel,
  terminTitel,
  wiedervorlageText,
} from "./bot_calls.ts";

const LEAD = { firma: "Nordstern Muster GmbH", person: "Lea Beispiel", tel: "0800 1112233", email: "lea@example.test", note: "Formular defekt" };

Deno.test("Neuer Lead wird geplant und nicht zum Kontakt", () => {
  const plan = planCall({
    result: "Mailbox/nicht erreicht",
    lead: { ...LEAD, workspace_id: "weg", id: "weg" },
    workspace_id: "fremd",
  });
  assertEquals(plan.ok, false);
  if (plan.ok) return;

  const ok = planCall({ result: "Mailbox/nicht erreicht", note: "Band", lead: LEAD, workspace_id: "ignoriert" });
  if (!ok.ok) throw new Error(ok.error);
  assertEquals(ok.contactId, null);
  assertEquals(ok.leadId, null);
  assertEquals(ok.newLead?.firma, LEAD.firma);
  assertEquals(ok.newLead && "workspace_id" in ok.newLead, false);
  assertEquals(ok.sperre, false);
  assertEquals(ok.wiedervorlage, null);
  assertEquals(ok.termin, null);
  assertEquals(ok.call.nextStep, defaultNextStep("Mailbox/nicht erreicht"));
});

Deno.test("Termin und Rückruf brauchen ein Datum und legen den nächsten Schritt an", () => {
  assertEquals(planCall({ result: "Termin", contact_id: "11111111-1111-4111-8111-111111111111" }).ok, false);
  assertEquals(planCall({ result: "Rückruf", lead_id: "22222222-2222-4222-8222-222222222222" }).ok, false);

  const termin = planCall({
    result: "Termin",
    contact_id: "11111111-1111-4111-8111-111111111111",
    next_date: "2026-11-12",
    zeit: "08:30",
    befund: "Formular auf dem Handy defekt",
    slot1: "Do 8:30",
    slot2: "Fr 16:00",
  });
  if (!termin.ok) throw new Error(termin.error);
  assertEquals(termin.termin, { datum: "2026-11-12", zeit: "08:30", notiz: "Formular auf dem Handy defekt" });
  assertEquals(termin.wiedervorlage, null);
  assertEquals(termin.newLead, null);
  assertEquals(termin.call.nextStep, "Entwurf zeigen");

  const rueck = planCall({
    result: "Rückruf",
    lead_id: "22222222-2222-4222-8222-222222222222",
    next_date: "2026-11-13",
  });
  if (!rueck.ok) throw new Error(rueck.error);
  assertEquals(rueck.wiedervorlage, { datum: "2026-11-13" });
  assertEquals(rueck.termin, null);
  assertEquals(rueck.call.nextStep, "Rückruf");
});

Deno.test("Sperre setzt den Vermerk, ohne Datum und ohne Kontakt anzulegen", () => {
  const plan = planCall({ result: "Sperre", objection: "Nicht mehr anrufen", lead: LEAD });
  if (!plan.ok) throw new Error(plan.error);
  assertEquals(plan.sperre, true);
  assertEquals(plan.call.nextStep, "Nicht mehr anrufen");
  assertEquals(plan.call.objection, "Nicht mehr anrufen");
  assertEquals(plan.newLead?.firma, LEAD.firma);
  assertEquals(plan.wiedervorlage, null);
  assertEquals(plan.termin, null);
});

Deno.test("Kontakt und Lead gleichzeitig, schlechtes Datum, fremdes Ergebnis", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assertEquals(planCall({ result: "Kein Interesse", contact_id: id, lead: LEAD }), { ok: false, error: "Entweder Kontakt oder Lead." });
  assertEquals(planCall({ result: "Gewonnen", contact_id: id }), { ok: false, error: "Ergebnis unbekannt." });
  assertEquals(planCall({ result: "Kein Interesse", contact_id: id, next_date: "2026-02-31" }), { ok: false, error: "Datum ungültig." });
  assertEquals(planCall({ result: "Kein Interesse", contact_id: "kein-uuid" }), { ok: false, error: "Kontakt ungültig." });
  assertEquals(planCall({ result: "Kein Interesse", lead: { firma: "A", email: "keine" } }), { ok: false, error: "E-Mail ungültig." });
  assertEquals(planCall({ result: "Kein Interesse" }), { ok: false, error: "Lead fehlt." });
});

Deno.test("Offene Leads werden über die Nummer erkannt, übernommene nicht", () => {
  const leads = [
    { id: "offen", firma: "Andere", person: null, tel: "+49 800 1112233", converted_contact_id: null },
    { id: "weg", firma: "Nordstern Muster GmbH", person: "Lea Beispiel", tel: "0800 1112233", converted_contact_id: "kontakt" },
  ];
  assertEquals(matchOpenLead(LEAD, leads), "offen");
  assertEquals(sameTel("0049 800 1112233", "08001112233"), true);
  assertEquals(matchOpenLead({ ...LEAD, tel: null }, [
    { id: "name", firma: "nordstern muster gmbh", person: "lea beispiel", tel: null },
  ]), "name");
  assertEquals(matchOpenLead({ ...LEAD, tel: "0800999" }, leads), null);
});

Deno.test("Liste und Sperre verlangen klare Ziele", () => {
  assertEquals(planList({}), { ok: true, contactId: null, leadId: null, limit: 50, openLeads: false });
  assertEquals(planList({ limit: 100, open_leads: true }), { ok: true, contactId: null, leadId: null, limit: 100, openLeads: true });
  assertEquals(planList({ limit: 101 }).ok, false);
  assertEquals(planList({ limit: 1.5 }).ok, false);
  const id = "33333333-3333-4333-8333-333333333333";
  assertEquals(planDoNotCall({ contact_id: id, do_not_call: true }), { ok: true, contactId: id, leadId: null, on: true });
  assertEquals(planDoNotCall({ do_not_call: true }).ok, false);
  assertEquals(planDoNotCall({ contact_id: id, lead_id: id, do_not_call: false }).ok, false);
  assertEquals(planDoNotCall({ lead_id: id }).ok, false);
});

Deno.test("Texte für Wiedervorlage, Termin und Zähler", () => {
  assertEquals(wiedervorlageText("Nordstern Muster GmbH", "Lea Beispiel"), "Rückruf: Nordstern Muster GmbH · Lea Beispiel");
  assertEquals(terminTitel("Nordstern Muster GmbH"), "Entwurf zeigen: Nordstern Muster GmbH");
  assertEquals(attemptLabel(2, 5), "Versuch 2 von 5");
  assertEquals(attemptLabel(0, 9), "Versuch 0 von 5");
  assertEquals(clampAttemptMax(3), 3);
  assertEquals(ilikeExact("100%_a"), "100\\%\\_a");
});
