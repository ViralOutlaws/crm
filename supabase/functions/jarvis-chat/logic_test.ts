import {
  anthropicTools,
  botFromText,
  briefingSpoken,
  deDate,
  greeting,
  parseAufgabeSelector,
  planAufgabeChange,
  planFromTool,
  revalidate,
  speakDate,
  sumNetto,
  systemBlocks,
  weekRange,
} from "./logic.ts";
import { parseCrmSelector, planCrmChange, planCrmInsert, planCrmUndo, resolveTable } from "./schema.ts";

const ctx = { today: "2026-10-17" };

Deno.test("Systemprompt ist deutsch, cached und spricht als wir", () => {
  const blocks = systemBlocks("2026-10-17", "Kim");
  if (!blocks[0].cache_control || blocks[0].cache_control.type !== "ephemeral") {
    throw new Error("system cache_control fehlt");
  }
  const text = blocks[0].text;
  for (const part of ["wir", "erfind", "Bestätigung", "Entwurf", "Idee", "delete_aufgaben", "set_aufgaben_status", "crm_delete", "crm_undo", "nicht ersatzweise ein Panel", "Bezahlt"]) {
    if (!text.includes(part)) throw new Error(`Prompt ohne ${part}`);
  }
  if (!blocks[1].text.includes("Kim")) throw new Error("Name fehlt");
});

Deno.test("Begrüßung folgt der Berliner Uhr und Daten sind deutsch", () => {
  const evening = new Date("2026-10-17T21:20:00Z");
  const morning = new Date("2026-10-17T06:30:00Z");
  const afternoon = new Date("2026-10-17T12:00:00Z");
  const night = new Date("2026-10-17T22:30:00Z");
  if (greeting(evening) !== "Guten Abend") throw new Error(greeting(evening));
  if (greeting(morning) !== "Guten Morgen") throw new Error(greeting(morning));
  if (greeting(afternoon) !== "Guten Tag") throw new Error(greeting(afternoon));
  if (greeting(night) !== "Guten Abend") throw new Error(greeting(night));
  if (speakDate("2026-10-17", evening) !== "Samstag, 17. Oktober") throw new Error(speakDate("2026-10-17", evening));
  if (speakDate("2025-03-01", evening) !== "Samstag, 1. März 2025") throw new Error(speakDate("2025-03-01", evening));
  if (deDate("2026-10-15") !== "15.10.2026") throw new Error(deDate("2026-10-15"));
  const spoken = briefingSpoken({
    date: "2026-10-17",
    events: [{}, {}],
    tasks: [{ overdue: true }, {}, {}],
    overdueInvoices: [{}],
    reminders: [{}],
    nextSteps: [{}],
  }, evening);
  if (!spoken.startsWith("Guten Abend, heute ist Samstag, 17. Oktober.")) throw new Error(spoken);
  if (spoken.includes("2026-10-17") || spoken.includes("Guten Morgen")) throw new Error(spoken);
  const blocks = systemBlocks("2026-10-17", "Kim");
  if (!blocks[1].text.includes("Samstag, 17. Oktober")) throw new Error(blocks[1].text);
  if (blocks[1].text.includes("Heute ist 2026-10-17")) throw new Error(blocks[1].text);
});

Deno.test("Tools cachen am letzten Werkzeug", () => {
  const tools = anthropicTools();
  if (tools.length < 8) throw new Error("zu wenige Tools");
  if (tools[tools.length - 1].name !== "route_to_bot") throw new Error("letztes Tool");
  if (!tools[tools.length - 1].cache_control) throw new Error("cache_control fehlt");
  if (tools[0].cache_control) throw new Error("cache nur am Ende");
});

Deno.test("route_to_bot wird zur Aufgabe mit Bot-Zeile", () => {
  const plan = planFromTool("route_to_bot", { bot: "marketing", auftrag: "3 Reels schneiden", details: "Hook zuerst" }, ctx);
  if (plan.kind !== "aufgabe" || plan.table !== "aufgaben" || plan.bot !== "marky") throw new Error(JSON.stringify(plan));
  if (plan.data.status !== "todo") throw new Error("status");
  if (!String(plan.data.beschreibung).startsWith("Zuständig: Marky (Marketing / Social).")) throw new Error(String(plan.data.beschreibung));
  if (botFromText(plan.data.beschreibung) !== "marky") throw new Error("parse");
});

Deno.test("Aufgabe bleibt offen, auch wenn der Status erledigt wäre", () => {
  const plan = planFromTool("create_aufgabe", { titel: "Backup prüfen", status: "done", prioritaet: "hoch" }, ctx);
  if (plan.data.status !== "todo" || plan.data.prioritaet !== "hoch") throw new Error(JSON.stringify(plan.data));
});

Deno.test("Rechnung und Angebot nur Entwurf, Summe ohne optionale Position", () => {
  let threw = false;
  try {
    planFromTool("create_rechnung", {
      betreff: "Retainer",
      status: "bezahlt",
      positions: [{ desc: "Betreuung", qty: 1, price: 100 }],
    }, ctx);
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("bezahlt hätte scheitern müssen");

  const plan = planFromTool("create_rechnung", {
    betreff: "Retainer",
    positions: [
      { desc: "Betreuung", qty: 2, price: 100 },
      { desc: "Optional", qty: 1, price: 50, optional: true },
    ],
  }, ctx);
  if (plan.data.status !== "entwurf" || plan.table !== "rechnungen") throw new Error("status");
  if (sumNetto(plan.data.positions as Array<{ optional?: boolean; total?: number }>) !== 200) throw new Error("summe");

  let sent = false;
  try {
    planFromTool("create_angebot", { betreff: "Web", status: "gesendet", positions: [{ desc: "Website", price: 10 }] }, ctx);
  } catch {
    sent = true;
  }
  if (!sent) throw new Error("gesendet hätte scheitern müssen");
});

Deno.test("Social nur als Idee, Veröffentlichen wird abgelehnt", () => {
  const plan = planFromTool("save_social_post", { thema: "Allgäu", format: "post", hashtags: "memmingen" }, ctx);
  if (plan.kind !== "social_insert" || plan.data.status !== "Idee" || plan.data.format !== "Beitrag") {
    throw new Error(JSON.stringify(plan.data));
  }
  const tags = plan.data.hashtags as string[];
  if (tags[0] !== "#memmingen") throw new Error(tags.join(","));
  let pub = false;
  try {
    planFromTool("save_social_post", { caption: "Live", status: "Veröffentlicht" }, ctx);
  } catch {
    pub = true;
  }
  if (!pub) throw new Error("veröffentlichen hätte scheitern müssen");
});

Deno.test("Bestätigung erzwingt Entwurf erneut und lehnt Löschen ab", () => {
  const plan = planFromTool("create_rechnung", {
    betreff: "Test",
    positions: [{ desc: "A", qty: 1, price: "10,5" }],
  }, ctx);
  plan.data.status = "bezahlt";
  let blocked = false;
  try {
    revalidate(plan, ctx);
  } catch {
    blocked = true;
  }
  if (!blocked) throw new Error("manipulierter Status");

  const social = revalidate({
    kind: "social_insert",
    data: { thema: "X", status: "Veröffentlicht", format: "Reel" },
  }, ctx);
  if (social.data.status !== "Idee") throw new Error("social status");

  const task = revalidate({
    kind: "aufgabe",
    tool: "create_aufgabe",
    bot: "webby",
    data: { titel: "Seite bauen", beschreibung: "Zuständig: Webby (Websites).\nHeader", status: "done" },
  }, ctx);
  if (task.data.status !== "todo" || task.bot !== "webby") throw new Error(JSON.stringify(task));
  if (String(task.data.beschreibung).match(/Zuständig/g)?.length !== 1) throw new Error(String(task.data.beschreibung));

  let del = false;
  try {
    planFromTool("delete_contact", { id: "x" }, ctx);
  } catch {
    del = true;
  }
  if (!del) throw new Error("delete");
});

Deno.test("Gespräch hängt eine Notiz an und bündelt Aufgaben plus Wiedervorlage", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const plan = planFromTool("meeting_recap", {
    kontakt_id: id,
    firma: "Beispiel-Café",
    notiz: "Budget etwa 900 Euro, Angebot nächste Woche.",
    aufgaben: [{ titel: "Angebot schicken", bot: "saley", status: "done" }],
    wiedervorlage: { text: "Angebot nachfassen", datum: "2026-10-24" },
  }, ctx);
  if (plan.kind !== "meeting" || plan.data.notes) throw new Error("notes würde überschreiben");
  if (plan.data.neue_notiz !== "Budget etwa 900 Euro, Angebot nächste Woche.") throw new Error("notiz");
  const tasks = plan.data.aufgaben as Array<{ status?: string; bot?: string }>;
  if (tasks.length !== 1 || tasks[0].status !== "todo" || tasks[0].bot !== "saley") throw new Error(JSON.stringify(tasks));
  if (!plan.lines.some((l) => l.includes("angehängt"))) throw new Error(plan.lines.join("|"));
  const again = revalidate(plan, ctx);
  if (again.data.neue_notiz !== plan.data.neue_notiz) throw new Error("revalidate");
  const ret = planFromTool("create_retainer", { paket: "Social", betrag: 500 }, ctx);
  if (ret.data.status !== "pausiert" || ret.table !== "retainer") throw new Error(JSON.stringify(ret.data));
});

Deno.test("Aufgaben löschen und erledigen laufen über die Karte", () => {
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  let all = false;
  try {
    parseAufgabeSelector({ all: true }, "delete");
  } catch (e) {
    all = e instanceof Error && e.message.includes("confirm");
  }
  if (!all) throw new Error("alle ohne confirm");

  const confirmed = parseAufgabeSelector({ all: true, confirm: true }, "delete");
  const plan = planAufgabeChange(confirmed, [
    { id: a, titel: "Angebot nachfassen", status: "todo" },
    { id: b, titel: "Reel schneiden", status: "doing" },
  ], { op: "delete" });
  if (!plan.danger || plan.action !== "delete" || plan.kind !== "aufgabe_delete" || plan.tool !== "delete_aufgaben") {
    throw new Error(JSON.stringify(plan));
  }
  if (plan.data.count !== 2) throw new Error("count");
  if (!plan.lines.includes("Anzahl: 2") || !plan.lines.includes("Angebot nachfassen") || !plan.lines.includes("Reel schneiden")) {
    throw new Error(plan.lines.join("|"));
  }

  let bulk = false;
  try {
    planAufgabeChange(parseAufgabeSelector({ query: "Angebot" }, "delete"), [
      { id: a, titel: "Angebot A" },
      { id: b, titel: "Angebot B" },
    ], { op: "delete" });
  } catch (e) {
    bulk = e instanceof Error && e.message.includes("confirm");
  }
  if (!bulk) throw new Error("mehrere ohne confirm");

  const single = planAufgabeChange(
    parseAufgabeSelector({ id: a }, "delete"),
    [{ id: a, titel: "Nur eine", status: "todo" }],
    { op: "delete" },
  );
  if (!single.danger || single.data.count !== 1 || single.data.confirm !== false) throw new Error(JSON.stringify(single.data));

  let done = false;
  try {
    planAufgabeChange(
      parseAufgabeSelector({ query: "Backup" }, "status"),
      [{ id: a, titel: "Backup", status: "done" }],
      { op: "status", status: "done" },
    );
  } catch (e) {
    done = e instanceof Error && e.message.includes("erledigt");
  }
  if (!done) throw new Error("schon erledigt");

  const statusPlan = planAufgabeChange(
    parseAufgabeSelector({ ids: [a, b] }, "status"),
    [{ id: a, titel: "Offen", status: "todo" }, { id: b, titel: "Fertig", status: "done" }],
    { op: "status", status: "done" },
  );
  if (statusPlan.danger || statusPlan.action !== "update" || statusPlan.data.count !== 1 || statusPlan.data.status !== "done") {
    throw new Error(JSON.stringify(statusPlan));
  }

  const again = revalidate(plan, ctx);
  if (!again.danger || again.action !== "delete" || again.data.count !== 2) throw new Error(JSON.stringify(again));
  const titles = again.data.titles as string[];
  if (titles[0] !== "Angebot nachfassen" || titles[1] !== "Reel schneiden") throw new Error(titles.join("|"));

  const statusAgain = revalidate(statusPlan, ctx);
  if (statusAgain.danger || statusAgain.data.status !== "done" || statusAgain.action !== "update") {
    throw new Error(JSON.stringify(statusAgain));
  }
  if ((statusAgain.data.ids as string[]).length !== 1) throw new Error("frozen filter");
});

Deno.test("CRM-Werkzeuge prüfen Spalten, Status und Löschbestätigung", () => {
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  let blocked = false;
  try {
    resolveTable("integration_secrets");
  } catch (e) {
    blocked = e instanceof Error && e.message.includes("Geheimnisse");
  }
  if (!blocked) throw new Error("secrets");

  let ws = false;
  try {
    planCrmInsert({ table: "contacts", rows: [{ firma: "Beispiel", workspace_id: "x" }] }, ctx.today);
  } catch (e) {
    ws = e instanceof Error && e.message.includes("workspace_id");
  }
  if (!ws) throw new Error("workspace");

  const paid = planCrmInsert({ table: "rechnungen", rows: [{ betreff: "Retainer", status: "bezahlt" }] }, ctx.today);
  const paidRow = (paid.data.rows as Array<Record<string, unknown>>)[0];
  if (paidRow.status !== "bezahlt" || paid.action !== "insert") throw new Error(JSON.stringify(paidRow));
  const sent = planCrmInsert({ table: "rechnungen", rows: [{ betreff: "Retainer", status: "gesendet" }] }, ctx.today);
  if ((sent.data.rows as Array<Record<string, unknown>>)[0].status !== "offen-rg") throw new Error("gesendet");

  const task = planCrmInsert({ table: "aufgaben", rows: [{ titel: "Reel schneiden", bot: "marky" }] }, ctx.today);
  const taskRow = (task.data.rows as Array<Record<string, unknown>>)[0];
  if (taskRow.status !== "todo" || taskRow.bot !== "marky") throw new Error(JSON.stringify(taskRow));

  const event = planCrmInsert({ table: "kal_events", rows: [{ titel: "Call", datum: "2026-10-20", bis: "9:30" }] }, ctx.today);
  if ((event.data.rows as Array<Record<string, unknown>>)[0].bis !== "09:30") throw new Error("bis");

  let assets = false;
  try {
    planCrmInsert({ table: "social_media_posts", rows: [{ thema: "Hook", assets: [] }] }, ctx.today);
  } catch (e) {
    assets = e instanceof Error && e.message.includes("Dateien");
  }
  if (!assets) throw new Error("assets");

  let all = false;
  try {
    parseCrmSelector({ table: "contacts", all: true }, "delete");
  } catch (e) {
    all = e instanceof Error && e.message.includes("confirm");
  }
  if (!all) throw new Error("all");

  const del = planCrmChange(parseCrmSelector({ table: "contacts", all: true, confirm: true }, "delete"), [
    { id: a, titel: "Beispiel GmbH" },
    { id: b, titel: "Café" },
  ]);
  if (!del.danger || del.action !== "delete" || del.data.count !== 2) throw new Error(JSON.stringify(del));
  if (!del.lines.includes("Anzahl: 2") || !del.lines.includes("Beispiel GmbH")) throw new Error(del.lines.join("|"));

  let many = false;
  try {
    planCrmChange(parseCrmSelector({ table: "contacts", query: "Beispiel" }, "delete"), [
      { id: a, titel: "A" },
      { id: b, titel: "B" },
    ]);
  } catch (e) {
    many = e instanceof Error && e.message.includes("confirm");
  }
  if (!many) throw new Error("bulk");

  const upd = planCrmChange(parseCrmSelector({ table: "rechnungen", query: "Retainer", patch: { status: "bezahlt" } }, "update"), [
    { id: a, titel: "Retainer März" },
    { id: b, titel: "Retainer April" },
  ]);
  if (upd.danger || upd.data.count !== 2 || (upd.data.patch as { status?: string }).status !== "bezahlt") throw new Error(JSON.stringify(upd));
  if (!upd.lines.includes("Anzahl: 2")) throw new Error(upd.lines.join("|"));

  const again = revalidate(del, ctx);
  if (!again.danger || again.action !== "delete" || again.data.count !== 2) throw new Error(JSON.stringify(again));

  const undo = planCrmUndo(a, [{
    action: "delete",
    table: "aufgaben",
    recordId: b,
    summary: { titel: "Reel schneiden", before: { id: b, titel: "Reel schneiden" } },
  }]);
  if (undo.kind !== "crm_undo" || undo.action !== "insert" || undo.danger) throw new Error(JSON.stringify(undo));
  const undoAgain = revalidate(undo, ctx);
  if (undoAgain.data.batch !== a || undoAgain.action !== "insert") throw new Error(JSON.stringify(undoAgain));

  const restoredDelete = planCrmUndo(a, [{
    action: "restore",
    table: "aufgaben",
    recordId: b,
    summary: { titel: "Reel schneiden", before: { id: b, titel: "Reel schneiden" }, after: null },
  }]);
  if (restoredDelete.action !== "insert" || restoredDelete.danger) throw new Error(JSON.stringify(restoredDelete));

  const restoredInsert = planCrmUndo(a, [{
    action: "restore",
    table: "aufgaben",
    recordId: b,
    summary: { titel: "Neu", before: null, after: { id: b, titel: "Neu" } },
  }]);
  if (restoredInsert.action !== "delete" || !restoredInsert.danger) throw new Error(JSON.stringify(restoredInsert));

  const restoredUpdate = planCrmUndo(a, [{
    action: "restore",
    table: "aufgaben",
    recordId: b,
    summary: {
      titel: "Alt",
      before: { id: b, titel: "Alt", status: "todo" },
      after: { id: b, titel: "Alt", status: "done" },
    },
  }]);
  if (restoredUpdate.action !== "update" || restoredUpdate.danger) throw new Error(JSON.stringify(restoredUpdate));

  let bare = false;
  try {
    planCrmUndo(a, [{ action: "restore", table: "aufgaben", recordId: b, summary: { titel: "Leer" } }]);
  } catch (e) {
    bare = e instanceof Error && e.message.includes("nicht rückgängig");
  }
  if (!bare) throw new Error("restore ohne Snapshot");
});

Deno.test("Wiedervorlage ist nie erledigt, Kontakt braucht Firma, Woche startet Montag", () => {
  const wv = planFromTool("create_wiedervorlage", { text: "Nachfassen", datum: "2026-10-20", done: true }, ctx);
  if (wv.data.done !== false || wv.table !== "wiedervorlagen") throw new Error("wv");
  let mail = false;
  try {
    planFromTool("upsert_contact", { firma: "Beispiel GmbH", email: "nein" }, ctx);
  } catch {
    mail = true;
  }
  if (!mail) throw new Error("email");
  const lead = planFromTool("upsert_contact", { firma: "Beispiel GmbH", status: "Erstgespräch" }, ctx);
  if (lead.data.status !== "erstgespraech" || lead.action !== "insert") throw new Error(JSON.stringify(lead.data));
  const w = weekRange("2026-10-17");
  if (w.from !== "2026-10-12" || w.to !== "2026-10-18") throw new Error(JSON.stringify(w));
});
