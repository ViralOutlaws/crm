import {
  anthropicTools,
  botFromText,
  planFromTool,
  revalidate,
  sumNetto,
  systemBlocks,
  weekRange,
} from "./logic.ts";

const ctx = { today: "2026-10-17" };

Deno.test("Systemprompt ist deutsch, cached und spricht als wir", () => {
  const blocks = systemBlocks("2026-10-17", "Kim");
  if (!blocks[0].cache_control || blocks[0].cache_control.type !== "ephemeral") {
    throw new Error("system cache_control fehlt");
  }
  const text = blocks[0].text;
  for (const part of ["wir", "erfind", "Bestätigung", "Entwurf", "Idee"]) {
    if (!text.includes(part)) throw new Error(`Prompt ohne ${part}`);
  }
  if (!blocks[1].text.includes("Kim")) throw new Error("Name fehlt");
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
