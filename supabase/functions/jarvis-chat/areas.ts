// Lesen für Holo-Panels. Immer mit dem Nutzer-JWT, damit RLS gilt.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { canonicalKunde } from "../_shared/doc_numbers.ts";
import { botFromText, briefingSpoken, deDate, eur, speakDate, sumNetto, weekRange, type Ctx } from "./logic.ts";

type Row = Record<string, unknown>;
type View = Record<string, unknown>;

const AREAS = new Set([
  "contacts", "pipeline", "angebote", "rechnungen", "retainer", "pakete",
  "aufgaben", "wiedervorlagen", "kalender", "social", "ausgaben", "roi", "ziele",
]);

export async function openArea(sb: SupabaseClient, userId: string, input: Record<string, unknown>, ctx: Ctx) {
  const area = String(input.area || "").toLowerCase();
  if (!AREAS.has(area)) throw new Error("Unbekannter Bereich. Möglich: " + [...AREAS].join(", "));
  const filter = pickFilter(input);
  const view = await buildArea(sb, userId, area, filter, ctx);
  const rows = Array.isArray(view.rows) ? view.rows.slice(0, 25).map((r) => {
    const row = r as { id?: string; cells?: Record<string, unknown>; badge?: { text?: string } };
    return { id: row.id || null, cells: row.cells || {}, badge: row.badge?.text || "" };
  }) : [];
  const lanes = view.lanes && typeof view.lanes === "object"
    ? Object.fromEntries(Object.entries(view.lanes as Record<string, unknown[]>).map(([k, arr]) => [k, (arr || []).slice(0, 8)]))
    : undefined;
  return {
    ui: { panel: area === "social" ? "content_week" : area, data: view },
    forModel: {
      hinweis: (view.note || "Live aus dem CRM.") + " Die ersten Zeilen stehen in zeilen. Antworte daraus, erfinde keine weiteren.",
      filter,
      anzahl: Array.isArray(view.rows) ? view.rows.length : rows.length,
      kpis: view.kpis,
      zeilen: rows,
      ...(lanes ? { spalten: lanes } : {}),
    },
  };
}

export async function morningBriefing(sb: SupabaseClient, _userId: string, ctx: Ctx) {
  const today = ctx.today;
  const [ev, tasks, inv, wv, contacts] = await Promise.all([
    sb.from("kal_events").select("id, titel, datum, zeit, typ, notiz, kontakt_id").eq("datum", today).limit(40),
    sb.from("aufgaben").select("id, titel, beschreibung, status, prioritaet, faellig, kontakt_id").limit(300),
    sb.from("rechnungen").select("id, nr, kunde_id, faellig, status, positions, archiviert, betreff").limit(300),
    sb.from("wiedervorlagen").select("id, text, datum, done, kontakt_id").eq("done", false).lte("datum", today).limit(40),
    sb.from("contacts").select("id, firma, person, status, naechster_schritt, naechster_schritt_text, archiviert").limit(400),
  ]);
  for (const r of [ev, tasks, inv, wv, contacts]) if (r.error) throw new Error(dbErr(r.error.message));
  const events = (ev.data ?? []).map((e) => ({ zeit: e.zeit || "", titel: e.titel, typ: e.typ || "termin", datum: e.datum, notiz: clip(e.notiz, 160) }))
    .sort((a, b) => String(a.zeit).localeCompare(String(b.zeit)));
  const taskRows = (tasks.data ?? []).filter((t) => t.faellig && t.faellig <= today && t.status !== "done").slice(0, 30).map((t) => ({
    titel: t.titel, faellig: t.faellig, status: t.status, prioritaet: t.prioritaet, bot: botFromText(t.beschreibung), overdue: t.faellig < today,
  }));
  const names = await namesOf(sb, (inv.data ?? []).map((r) => r.kunde_id).filter(Boolean) as string[]);
  const overdueInvoices = (inv.data ?? []).filter((r) => !r.archiviert && (r.status === "ueberfaellig" || (r.status === "offen-rg" && r.faellig && r.faellig < today))).slice(0, 20).map((r) => ({
    nr: r.nr, kunde: names.get(r.kunde_id) || "Ohne Kunde", netto: nettoOf(r.positions), faellig: r.faellig,
  }));
  const reminders = (wv.data ?? []).map((w) => ({ text: w.text, datum: w.datum }));
  const nextSteps = (contacts.data ?? []).filter((c) => !c.archiviert && c.naechster_schritt && c.naechster_schritt <= today).slice(0, 20).map((c) => ({
    firma: c.firma || c.person || "Ohne Namen", datum: c.naechster_schritt, text: c.naechster_schritt_text || "", status: c.status,
  }));
  const summary = briefingSpoken({ date: today, events, tasks: taskRows, overdueInvoices, reminders, nextSteps });
  const view = {
    title: "Agenda · Heute",
    meta: "Briefing · " + deDate(today),
    crm: "kalender",
    wide: true,
    spoken: summary,
    note: summary,
    agenda: { date: today, events, tasks: taskRows, reminders, invoices: overdueInvoices, nextSteps },
    kpis: [
      { label: "Termine", value: String(events.length) },
      { label: "Aufgaben fällig", value: String(taskRows.length), tone: taskRows.some((t) => t.overdue) ? "red" : "" },
      { label: "Rechnungen überfällig", value: String(overdueInvoices.length), tone: overdueInvoices.length ? "red" : "" },
      { label: "Nächste Schritte", value: String(nextSteps.length), tone: "gold" },
    ],
  };
  return { ui: { panel: "agenda", data: view }, forModel: { summary, events, tasks: taskRows, overdue_invoices: overdueInvoices, wiedervorlagen: reminders, naechste_schritte: nextSteps, hinweis: "Sprich summary in 3–4 Sätzen. Keine zusätzlichen Zahlen." } };
}

export async function customerFile(sb: SupabaseClient, input: Record<string, unknown>, ctx: Ctx) {
  let id = typeof input.kontakt_id === "string" ? input.kontakt_id : "";
  if (!id) {
    const found = await fuzzyFind(sb, String(input.query || input.kunde || ""));
    if (found.kind === "none") {
      return { ui: null, forModel: { hinweis: "Kein Kontakt gefunden. Sag das klar, erfinde niemanden.", query: input.query || "" } };
    }
    if (found.kind === "many") {
      return { ui: { panel: "contacts", data: contactsList(found.rows, "Mehrere Treffer") }, forModel: { hinweis: "Mehrere Kontakte, nicht raten.", kandidaten: found.rows.map((r) => ({ id: r.id, firma: r.firma, person: r.person })) } };
    }
    id = found.id;
  }
  const contact = await sb.from("contacts").select("id, firma, person, email, tel, ort, branche, status, quelle, deal_wert, naechster_schritt, naechster_schritt_text, notes, ana, notizen, kundennummer, archiviert").eq("id", id).maybeSingle();
  if (contact.error) throw new Error(dbErr(contact.error.message));
  if (!contact.data || contact.data.archiviert) return { ui: null, forModel: { hinweis: "Kontakt nicht gefunden oder kein Zugriff." } };
  const c = contact.data;
  const [offers, invoices, tasks, events] = await Promise.all([
    sb.from("angebote").select("id, nr, betreff, datum, status, positions").eq("kunde_id", id).limit(20),
    sb.from("rechnungen").select("id, nr, betreff, datum, faellig, status, positions").eq("kunde_id", id).limit(20),
    sb.from("aufgaben").select("id, titel, status, prioritaet, faellig, beschreibung").eq("kontakt_id", id).limit(20),
    sb.from("kal_events").select("id, titel, datum, zeit, typ, notiz").eq("kontakt_id", id).order("datum", { ascending: false }).limit(8),
  ]);
  for (const r of [offers, invoices, tasks, events]) if (r.error) throw new Error(dbErr(r.error.message));
  const openTasks = (tasks.data ?? []).filter((t) => t.status !== "done");
  const summary = customerSummary(c, offers.data ?? [], invoices.data ?? [], openTasks, ctx.today);
  const notizen = Array.isArray(c.notizen) ? c.notizen.slice(-6).map((n) => ({
    datum: (n as Row).datum || "",
    text: clip((n as Row).text, 400),
  })) : [];
  const view = {
    title: "Kunden-Akte",
    meta: c.firma || c.person || "Kontakt",
    crm: "contacts",
    wide: true,
    spoken: summary,
    note: summary,
    customer: {
      id: c.id,
      firma: c.firma,
      kundennummer: c.kundennummer || null,
      person: c.person,
      email: c.email,
      tel: c.tel,
      ort: c.ort,
      branche: c.branche,
      status: c.status,
      quelle: c.quelle,
      deal_wert: c.deal_wert,
      naechster_schritt: c.naechster_schritt,
      naechster_schritt_text: c.naechster_schritt_text,
      notes: clip(c.notes, 1200),
      ana: clip(c.ana, 600),
      notizen,
      angebote: (offers.data ?? []).map((a) => ({ nr: a.nr, betreff: a.betreff, datum: a.datum, status: a.status, netto: nettoOf(a.positions) })),
      rechnungen: (invoices.data ?? []).map((a) => ({ nr: a.nr, betreff: a.betreff, datum: a.datum, faellig: a.faellig, status: a.status, netto: nettoOf(a.positions), overdue: a.status === "ueberfaellig" || (a.status === "offen-rg" && a.faellig && a.faellig < ctx.today) })),
      aufgaben: openTasks.map((t) => ({ titel: t.titel, status: t.status, prioritaet: t.prioritaet, faellig: t.faellig, bot: botFromText(t.beschreibung) })),
      termine: (events.data ?? []).map((e) => ({ titel: e.titel, datum: e.datum, zeit: e.zeit, typ: e.typ })),
    },
  };
  return { ui: { panel: "customer", data: view }, forModel: { summary, akte: view.customer, hinweis: "Sprich summary in zwei Sätzen. Keine zusätzlichen Zahlen." } };
}

export async function fuzzyFind(sb: SupabaseClient, query: string): Promise<
  { kind: "none" } | { kind: "one"; id: string; firma: string } | { kind: "many"; rows: Array<{ id: string; firma: string | null; person: string | null }> }
> {
  const kd = canonicalKunde(query);
  if (kd) {
    const exact = await sb.from("contacts").select("id, firma, person, kundennummer, archiviert").eq("kundennummer", kd).limit(5);
    if (exact.error) throw new Error(dbErr(exact.error.message));
    const rows = (exact.data ?? []).filter((c) => !c.archiviert);
    if (!rows.length) return { kind: "none" };
    if (rows.length > 1) return { kind: "many", rows: rows.map((r) => ({ id: r.id, firma: r.firma, person: r.person })) };
    return { kind: "one", id: rows[0].id, firma: rows[0].firma || rows[0].person || "Kontakt" };
  }
  const q = norm(query);
  if (!q) return { kind: "none" };
  const { data, error } = await sb.from("contacts").select("id, firma, person, kundennummer, archiviert").limit(400);
  if (error) throw new Error(dbErr(error.message));
  const ranked = (data ?? []).filter((c) => !c.archiviert).map((c) => ({ ...c, score: scoreName(q, c.firma, c.person) })).filter((c) => c.score >= 40).sort((a, b) => b.score - a.score);
  if (!ranked.length) return { kind: "none" };
  if (ranked.length > 1 && ranked[1].score >= 50 && ranked[0].score - ranked[1].score < 15) {
    return { kind: "many", rows: ranked.slice(0, 6).map((r) => ({ id: r.id, firma: r.firma, person: r.person })) };
  }
  return { kind: "one", id: ranked[0].id, firma: ranked[0].firma || ranked[0].person || "Kontakt" };
}

async function buildArea(sb: SupabaseClient, userId: string, area: string, filter: Filter, ctx: Ctx): Promise<View> {
  if (area === "contacts") return filterRows(await contactsView(sb, filter, ctx), filter);
  if (area === "pipeline") return pipelineView(sb);
  if (area === "angebote") return filterRows(await docsView(sb, "angebote", ctx), filter);
  if (area === "rechnungen") return filterRows(await docsView(sb, "rechnungen", ctx), filter);
  if (area === "retainer") return filterRows(await retainerView(sb), filter);
  if (area === "pakete") return paketeView(sb, userId);
  if (area === "aufgaben") return filterRows(await aufgabenView(sb, ctx), filter);
  if (area === "wiedervorlagen") return filterRows(await wvView(sb, ctx), filter);
  if (area === "kalender") return kalenderView(sb, filter, ctx);
  if (area === "social") return socialView(sb, filter, ctx);
  if (area === "ausgaben") return filterRows(await ausgabenView(sb), filter);
  if (area === "roi") return filterRows(await roiView(sb), filter);
  return zieleView(sb);
}

async function contactsView(sb: SupabaseClient, filter: Filter, ctx: Ctx): Promise<View> {
  let q = sb.from("contacts").select("id, firma, person, ort, status, quelle, deal_wert, naechster_schritt, naechster_schritt_text, kundennummer, archiviert").limit(200);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.quelle) q = q.eq("quelle", filter.quelle);
  const { data, error } = await q;
  if (error) throw new Error(dbErr(error.message));
  const rows = (data ?? []).filter((c) => !c.archiviert).map((c) => ({
    id: c.id,
    open: "customer",
    overdue: !!(c.naechster_schritt && c.naechster_schritt < ctx.today),
    flags: { status: c.status, quelle: c.quelle },
    search: `${c.firma} ${c.person} ${c.ort} ${c.kundennummer || ""}`.toLowerCase(),
    cells: {
      firma: c.firma || "",
      kundennummer: c.kundennummer || "",
      person: c.person || "",
      ort: c.ort || "",
      phase: labelPhase(c.status),
      quelle: c.quelle || "",
      deal: c.deal_wert == null ? "" : eur(Number(c.deal_wert)),
      naechster: c.naechster_schritt || "",
    },
    badge: { text: labelPhase(c.status), tone: c.status === "gewonnen" ? "f" : c.status === "verloren" ? "o" : "w" },
  }));
  return base("Kontakte", "contacts", rows, [
    { key: "kundennummer", label: "Kundennr." }, { key: "firma", label: "Firma" }, { key: "person", label: "Person" }, { key: "ort", label: "Ort" },
    { key: "phase", label: "Phase" }, { key: "quelle", label: "Quelle" }, { key: "deal", label: "Deal netto", align: "r" },
    { key: "naechster", label: "Nächster Schritt" },
  ], [
    { label: "Kontakte", value: String(rows.length) },
  ], [
    { label: "nur Leads", filter: { status: "lead" } },
    { label: "nur Instagram", filter: { quelle: "instagram" } },
  ]);
}

async function pipelineView(sb: SupabaseClient): Promise<View> {
  const { data, error } = await sb.from("contacts").select("id, firma, person, ort, status, quelle, deal_wert, archiviert").limit(500);
  if (error) throw new Error(dbErr(error.message));
  const lanes: Record<string, Row[]> = { lead: [], erstgespraech: [], angebot: [], gewonnen: [], verloren: [] };
  let volume = 0;
  for (const c of data ?? []) {
    if (c.archiviert || !lanes[c.status]) continue;
    const deal = c.deal_wert == null ? 0 : Number(c.deal_wert);
    if (["lead", "erstgespraech", "angebot"].includes(c.status)) volume += deal;
    if (lanes[c.status].length < 10) lanes[c.status].push({ id: c.id, firma: c.firma || c.person || "Ohne Namen", ort: c.ort || "", quelle: c.quelle || "", deal_wert: c.deal_wert });
  }
  const counts = Object.fromEntries(Object.entries(lanes).map(([k]) => [k, (data ?? []).filter((c) => !c.archiviert && c.status === k).length]));
  return {
    ...base("Pipeline", "pipeline", [], [], [
      { label: "Leads", value: String(counts.lead || 0) },
      { label: "Erstgespräch", value: String(counts.erstgespraech || 0) },
      { label: "Angebot", value: String(counts.angebot || 0) },
      { label: "Volumen offen", value: eur(volume), tone: "gold" },
    ]),
    lanes, counts, volume_netto: Math.round(volume * 100) / 100, wide: true,
  };
}

async function docsView(sb: SupabaseClient, table: "angebote" | "rechnungen", ctx: Ctx): Promise<View> {
  const cols = table === "angebote"
    ? "id, nr, kunde_id, betreff, datum, status, positions, archiviert, valid_bis"
    : "id, nr, kunde_id, betreff, datum, status, positions, archiviert, faellig";
  const res = await sb.from(table).select(cols).limit(150);
  if (res.error) throw new Error(dbErr(res.error.message));
  const data = (res.data ?? []) as Row[];
  const names = await namesOf(sb, data.map((r) => r.kunde_id).filter(Boolean) as string[]);
  const rows = data.filter((r) => !r.archiviert).map((r) => {
    const due = String((table === "angebote" ? r.valid_bis : r.faellig) || "");
    const status = String(r.status || "");
    const overdue = table === "rechnungen" && (status === "ueberfaellig" || (status === "offen-rg" && !!due && due < ctx.today));
    return {
      overdue,
      flags: { status, closed: status === "bezahlt" },
      search: `${r.nr} ${r.betreff}`.toLowerCase(),
      cells: {
        nr: String(r.nr || ""),
        kunde: names.get(String(r.kunde_id || "")) || "",
        betreff: String(r.betreff || ""),
        datum: String(r.datum || ""),
        faellig: due,
        netto: eur(nettoOf(r.positions)),
      },
      badge: { text: docLabel(status, overdue), tone: overdue ? "o" : status === "entwurf" ? "e" : status === "bezahlt" ? "f" : "w" },
    };
  });
  const open = rows.filter((r) => r.flags.status === "offen-rg" || r.flags.status === "ueberfaellig" || r.overdue);
  const title = table === "angebote" ? "Angebote" : "Rechnungen";
  const crm = table === "angebote" ? "angebote" : "rechnungen";
  return base(title, crm, rows, [
    { key: "nr", label: "Nr." }, { key: "kunde", label: "Kunde" }, { key: "betreff", label: "Betreff" },
    { key: "datum", label: "Datum" }, { key: "faellig", label: table === "angebote" ? "Gültig bis" : "Fällig" }, { key: "netto", label: "Netto", align: "r" },
  ], [
    { label: "Anzahl", value: String(rows.length) },
    { label: table === "rechnungen" ? "Offen" : "Entwürfe", value: String(table === "rechnungen" ? open.length : rows.filter((r) => r.flags.status === "entwurf").length) },
  ], table === "rechnungen"
    ? [{ label: "nur überfällige", filter: { only: "overdue" } }, { label: "nur Entwürfe", filter: { only: "drafts" } }]
    : [{ label: "nur Entwürfe", filter: { only: "drafts" } }]);
}

async function retainerView(sb: SupabaseClient): Promise<View> {
  const { data, error } = await sb.from("retainer").select("id, kunde_id, paket, betrag, status, next_datum, abrechnungstag").limit(80);
  if (error) throw new Error(dbErr(error.message));
  const names = await namesOf(sb, (data ?? []).map((r) => r.kunde_id).filter(Boolean) as string[]);
  const rows = (data ?? []).map((r) => ({
    flags: { status: r.status },
    search: `${r.paket}`.toLowerCase(),
    cells: { paket: r.paket || "", kunde: names.get(r.kunde_id) || "", betrag: eur(Number(r.betrag) || 0), status: r.status || "", naechste: r.next_datum || "", tag: String(r.abrechnungstag || "") },
    badge: { text: r.status || "", tone: r.status === "aktiv" ? "f" : "e" },
  }));
  const mrr = (data ?? []).filter((r) => r.status === "aktiv").reduce((s, r) => s + (Number(r.betrag) || 0), 0);
  return base("Retainer", "ziele", rows, [
    { key: "paket", label: "Paket" }, { key: "kunde", label: "Kunde" }, { key: "betrag", label: "Monat", align: "r" },
    { key: "status", label: "Status" }, { key: "naechste", label: "Nächste Rechnung" },
  ], [{ label: "Aktiv", value: String((data ?? []).filter((r) => r.status === "aktiv").length) }, { label: "MRR", value: eur(mrr), tone: "gold" }], [{ label: "nur aktive", filter: { status: "aktiv" } }]);
}

async function paketeView(sb: SupabaseClient, userId: string): Promise<View> {
  const db = await sb.from("pakete").select("*").limit(80);
  if (!db.error && db.data && db.data.length) {
    const g = generic(db.data as Row[]);
    return { ...base("Pakete", "konfigurator", g.rows, g.columns, [{ label: "Einträge", value: String(g.rows.length) }]), note: "Aus der Tabelle pakete." };
  }
  const settings = await sb.from("settings").select("data").eq("user_id", userId).maybeSingle();
  let leistungen: Record<string, Array<{ label?: string; preis?: number; typ?: string; desc?: string }>> | null = null;
  if (!settings.error && settings.data?.data) {
    try {
      const parsed = typeof settings.data.data === "string" ? JSON.parse(settings.data.data) : settings.data.data;
      if (parsed?.leistungen && typeof parsed.leistungen === "object") leistungen = parsed.leistungen;
    } catch { /* ignore */ }
  }
  const source = leistungen || STANDARD_PAKETE;
  const rows = Object.entries(source).flatMap(([kat, items]) => (items || []).map((item) => ({
    search: `${kat} ${item.label}`.toLowerCase(),
    cells: { kategorie: kat, leistung: item.label || "", preis: eur(Number(item.preis) || 0), typ: item.typ || "", detail: clip(item.desc, 120) },
  })));
  return {
    ...base("Pakete", "konfigurator", rows, [
      { key: "kategorie", label: "Kategorie" }, { key: "leistung", label: "Leistung" }, { key: "preis", label: "Preis", align: "r" }, { key: "typ", label: "Typ" },
    ], [{ label: "Leistungen", value: String(rows.length) }]),
    note: leistungen ? "Aus den gespeicherten CRM-Einstellungen. Preise ändern geht in dieser Stufe noch nicht." : "Standardkatalog wie im CRM-Konfigurator. Preise ändern geht in dieser Stufe noch nicht.",
  };
}

async function aufgabenView(sb: SupabaseClient, ctx: Ctx): Promise<View> {
  const { data, error } = await sb.from("aufgaben").select("id, titel, status, prioritaet, faellig, beschreibung").limit(200);
  if (error) throw new Error(dbErr(error.message));
  const rows = (data ?? []).map((t) => ({
    overdue: !!(t.faellig && t.faellig < ctx.today && t.status !== "done"),
    flags: { status: t.status, closed: t.status === "done" },
    search: String(t.titel || "").toLowerCase(),
    cells: { titel: t.titel || "", faellig: deDate(String(t.faellig || "")), status: t.status || "", prio: t.prioritaet || "", bot: botFromText(t.beschreibung) || "" },
    badge: { text: t.status === "done" ? "Erledigt" : t.faellig && t.faellig < ctx.today ? "Überfällig" : "Offen", tone: t.status === "done" ? "f" : t.faellig && t.faellig < ctx.today ? "o" : "w" },
  }));
  return base("Aufgaben", "kanban", rows, [
    { key: "titel", label: "Aufgabe" }, { key: "faellig", label: "Fällig" }, { key: "prio", label: "Priorität" }, { key: "bot", label: "Bot" },
  ], [{ label: "Offen", value: String(rows.filter((r) => !r.flags.closed).length) }, { label: "Überfällig", value: String(rows.filter((r) => r.overdue).length), tone: "red" }], [{ label: "nur überfällige", filter: { only: "overdue" } }]);
}

async function wvView(sb: SupabaseClient, ctx: Ctx): Promise<View> {
  const { data, error } = await sb.from("wiedervorlagen").select("id, text, datum, done, kontakt_id").limit(150);
  if (error) throw new Error(dbErr(error.message));
  const names = await namesOf(sb, (data ?? []).map((r) => r.kontakt_id).filter(Boolean) as string[]);
  const rows = (data ?? []).map((w) => ({
    overdue: !!(!w.done && w.datum && w.datum < ctx.today),
    flags: { closed: !!w.done },
    search: String(w.text || "").toLowerCase(),
    cells: { text: w.text || "", datum: w.datum || "", kontakt: names.get(w.kontakt_id) || "", status: w.done ? "Erledigt" : "Offen" },
    badge: { text: w.done ? "Erledigt" : w.datum && w.datum <= ctx.today ? "Fällig" : "Geplant", tone: w.done ? "f" : w.datum && w.datum < ctx.today ? "o" : "w" },
  }));
  return base("Wiedervorlagen", "dashboard", rows, [
    { key: "datum", label: "Datum" }, { key: "text", label: "Erinnerung" }, { key: "kontakt", label: "Kontakt" },
  ], [{ label: "Offen", value: String(rows.filter((r) => !r.flags.closed).length) }], [{ label: "nur fällige", filter: { only: "overdue" } }]);
}

async function kalenderView(sb: SupabaseClient, filter: Filter, ctx: Ctx): Promise<View> {
  const range = rangeOf(filter, ctx, "month");
  const { data, error } = await sb.from("kal_events").select("id, titel, datum, zeit, typ, notiz").gte("datum", range.from).lte("datum", range.to).order("datum").limit(120);
  if (error) throw new Error(dbErr(error.message));
  const rows = (data ?? []).map((e) => ({
    search: String(e.titel || "").toLowerCase(),
    cells: { datum: e.datum || "", zeit: e.zeit || "", titel: e.titel || "", typ: e.typ || "" },
  }));
  return { ...base("Kalender", "kalender", rows, [
    { key: "datum", label: "Datum" }, { key: "zeit", label: "Zeit" }, { key: "titel", label: "Titel" }, { key: "typ", label: "Typ" },
  ], [{ label: "Termine", value: String(rows.length) }], [{ label: "nur diese Woche", filter: { view: "week" } }, { label: "dieser Monat", filter: { view: "month" } }]), meta: `${range.from} – ${range.to}` };
}

async function socialView(sb: SupabaseClient, filter: Filter, ctx: Ctx): Promise<View> {
  const range = rangeOf(filter, ctx, filter.view === "month" ? "month" : "week");
  const { data, error } = await sb.from("social_media_posts").select("id, datum, uhrzeit, format, saeule, hook, caption, hashtags, status, thema, assets").gte("datum", range.from).lte("datum", range.to).order("datum").limit(80);
  if (error) throw new Error(dbErr(error.message));
  const urls = await signAssets(sb, data ?? []);
  const posts = (data ?? []).map((p) => {
    const assets = Array.isArray(p.assets) ? p.assets as Array<{ path?: string; type?: string }> : [];
    const thumbs = assets.map((a) => ({ url: a.path ? urls.get(a.path) || "" : "", type: a.type || "image" })).filter((t) => t.url).slice(0, 4);
    return { datum: p.datum, uhrzeit: p.uhrzeit, format: p.format, saeule: p.saeule, hook: p.hook, caption: clip(p.caption, 400), hashtags: p.hashtags || [], status: p.status, thema: p.thema, thumbs };
  });
  return {
    title: filter.view === "month" ? "Social · Monat" : "Social · Woche",
    meta: `${range.from} – ${range.to}`,
    crm: "social",
    wide: true,
    posts,
    kpis: [
      { label: "Posts", value: String(posts.length) },
      { label: "Entwurf", value: String(posts.filter((p) => p.status === "Idee").length) },
      { label: "Veröffentlicht", value: String(posts.filter((p) => p.status === "Veröffentlicht").length), tone: "gold" },
    ],
    filters: [{ label: "diese Woche", filter: { view: "week" } }, { label: "dieser Monat", filter: { view: "month" } }],
    rows: [],
    columns: [],
  };
}

async function ausgabenView(sb: SupabaseClient): Promise<View> {
  const { data, error } = await sb.from("ausgaben").select("id, typ, datum, beschreibung, kategorie, netto, brutto").order("datum", { ascending: false }).limit(120);
  if (error) throw new Error(dbErr(error.message));
  const rows = (data ?? []).map((a) => ({
    flags: { status: a.typ },
    search: `${a.beschreibung} ${a.kategorie}`.toLowerCase(),
    cells: { datum: a.datum || "", typ: a.typ || "", text: a.beschreibung || "", kat: a.kategorie || "", netto: eur(Number(a.netto) || 0), brutto: eur(Number(a.brutto) || 0) },
  }));
  const out = (data ?? []).filter((a) => a.typ !== "einnahme").reduce((s, a) => s + (Number(a.brutto) || 0), 0);
  return base("Ausgaben", "ausgaben", rows, [
    { key: "datum", label: "Datum" }, { key: "typ", label: "Typ" }, { key: "text", label: "Text" }, { key: "kat", label: "Kategorie" }, { key: "brutto", label: "Brutto", align: "r" },
  ], [{ label: "Ausgaben brutto", value: eur(out), tone: "red" }, { label: "Buchungen", value: String(rows.length) }]);
}

async function roiView(sb: SupabaseClient): Promise<View> {
  const { data, error } = await sb.from("roi_daten").select("id, kanal, monat, jahr, budget, leads, umsatz, roas, roi").order("jahr", { ascending: false }).limit(80);
  if (error) throw new Error(dbErr(error.message));
  const rows = (data ?? []).map((r) => ({
    search: String(r.kanal || ""),
    cells: { kanal: r.kanal || "", zeit: `${r.monat}/${r.jahr}`, budget: eur(Number(r.budget) || 0), leads: String(r.leads ?? ""), umsatz: eur(Number(r.umsatz) || 0), roas: r.roas == null ? "" : String(r.roas) },
  }));
  return base("ROI", "roi", rows, [
    { key: "kanal", label: "Kanal" }, { key: "zeit", label: "Zeit" }, { key: "budget", label: "Budget", align: "r" },
    { key: "leads", label: "Leads", align: "r" }, { key: "umsatz", label: "Umsatz", align: "r" }, { key: "roas", label: "ROAS", align: "r" },
  ], [{ label: "Zeilen", value: String(rows.length) }]);
}

async function zieleView(sb: SupabaseClient): Promise<View> {
  const { data, error } = await sb.from("ziele").select("*").limit(40);
  if (error) {
    return { ...base("Ziele", "ziele", [], [], []), note: "Die Tabelle ziele ist nicht lesbar (" + error.message.slice(0, 120) + "). Zielwerte im CRM können lokal liegen. Bearbeiten folgt." };
  }
  const g = generic((data ?? []) as Row[]);
  return { ...base("Ziele", "ziele", g.rows, g.columns, [{ label: "Einträge", value: String(g.rows.length) }]), note: g.rows.length ? "Rohdaten aus ziele. Bearbeiten der Zielwerte folgt." : "Keine Zeilen in ziele. Im CRM liegen MRR-Ziele teils nur lokal. Bearbeiten folgt." };
}

function contactsList(rows: Array<{ id: string; firma: string | null; person: string | null }>, title: string): View {
  return base(title, "contacts", rows.map((r) => ({
    id: r.id, open: "customer", search: `${r.firma} ${r.person}`.toLowerCase(),
    cells: { firma: r.firma || "", person: r.person || "" },
  })), [{ key: "firma", label: "Firma" }, { key: "person", label: "Person" }], [{ label: "Treffer", value: String(rows.length) }]);
}

function base(title: string, crm: string, rows: Row[], columns: Row[], kpis: Row[], filters: Row[] = []): View {
  return { title, meta: "CRM", crm, wide: true, rows, columns, kpis, filters, note: "" };
}

function filterRows(view: View, filter: Filter): View {
  const rows = ((view.rows as Row[]) || []).filter((r) => {
    if (filter.only === "overdue" && !r.overdue) return false;
    if (filter.only === "drafts" && (r.flags as Row | undefined)?.status !== "entwurf" && (r.flags as Row | undefined)?.status !== "Idee") return false;
    if (filter.only === "open" && (r.flags as Row | undefined)?.closed) return false;
    if (filter.status && (r.flags as Row | undefined)?.status !== filter.status) return false;
    if (filter.quelle && (r.flags as Row | undefined)?.quelle !== filter.quelle) return false;
    if (filter.query && !String(r.search || "").includes(filter.query.toLowerCase())) return false;
    return true;
  });
  const note = filter.only || filter.status || filter.quelle || filter.query ? `Filter aktiv.` : String(view.note || "");
  return { ...view, rows, note };
}

function generic(data: Row[]) {
  const skip = new Set(["id", "workspace_id", "created_at", "updated_at"]);
  const keys = [...new Set(data.flatMap((r) => Object.keys(r)))].filter((k) => !skip.has(k)).slice(0, 7);
  return {
    columns: keys.map((k) => ({ key: k, label: k })),
    rows: data.slice(0, 40).map((r) => ({
      search: JSON.stringify(r).toLowerCase(),
      cells: Object.fromEntries(keys.map((k) => [k, fmtCell(r[k])])),
    })),
  };
}

async function signAssets(sb: SupabaseClient, posts: Array<{ assets?: unknown }>) {
  const paths = posts.flatMap((p) => Array.isArray(p.assets) ? (p.assets as Array<{ path?: string }>).map((a) => a.path).filter(Boolean) as string[] : []);
  const map = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 80) {
    const { data } = await sb.storage.from("social-assets").createSignedUrls(paths.slice(i, i + 80), 3600);
    for (const row of data ?? []) if (row?.path && row.signedUrl) map.set(row.path, row.signedUrl);
  }
  return map;
}

async function namesOf(sb: SupabaseClient, ids: string[]) {
  const map = new Map<string, string>();
  const uniq = [...new Set(ids)];
  if (!uniq.length) return map;
  const { data } = await sb.from("contacts").select("id, firma, person").in("id", uniq);
  for (const c of data ?? []) map.set(c.id, c.firma || c.person || "");
  return map;
}

function nettoOf(positions: unknown): number {
  if (!Array.isArray(positions)) return 0;
  return sumNetto(positions.map((p) => {
    const o = p && typeof p === "object" ? p as { optional?: boolean; total?: number; qty?: number; price?: number } : {};
    const total = Number.isFinite(Number(o.total)) ? Number(o.total) : (Number(o.qty) || 0) * (Number(o.price) || 0);
    return { optional: !!o.optional, total };
  }));
}


function customerSummary(c: Row, offers: Row[], invoices: Row[], tasks: Row[], today: string) {
  const openInv = invoices.filter((r) => r.status === "offen-rg" || r.status === "ueberfaellig" || (r.status === "offen-rg" && r.faellig && String(r.faellig) < today));
  const phase = labelPhase(String(c.status || "lead"));
  const step = c.naechster_schritt ? `nächster Schritt am ${speakDate(String(c.naechster_schritt))}` : "ein nächster Schritt ist nicht gesetzt";
  return `${c.firma || "Der Kontakt"} ist in der Phase ${phase}, ${step}. Wir haben ${offers.length} Angebote und ${openInv.length} offene Rechnungen, dazu ${tasks.length} offene Aufgaben.`;
}

type Filter = { query?: string; status?: string; quelle?: string; only?: string; from?: string; to?: string; view?: string };

function pickFilter(input: Record<string, unknown>): Filter {
  const f: Filter = {};
  for (const k of ["query", "status", "quelle", "only", "from", "to", "view"] as const) {
    if (typeof input[k] === "string" && input[k]) f[k] = String(input[k]);
  }
  return f;
}

function rangeOf(filter: Filter, ctx: Ctx, mode: "week" | "month") {
  if (filter.from || filter.to) {
    const from = filter.from || filter.to || ctx.today;
    const to = filter.to || filter.from || ctx.today;
    return { from, to: to < from ? from : to };
  }
  if ((filter.view || mode) === "week") return weekRange(ctx.today);
  const [y, m] = ctx.today.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from, to: `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}` };
}

function labelPhase(s: string) {
  return ({ lead: "Lead", erstgespraech: "Erstgespräch", angebot: "Angebot", gewonnen: "Gewonnen", verloren: "Verloren" } as Record<string, string>)[s] || s || "";
}

function docLabel(status: string, overdue: boolean) {
  if (overdue && status !== "bezahlt") return "Überfällig";
  if (status === "entwurf") return "Entwurf";
  if (status === "offen-rg") return "Offen";
  if (status === "bezahlt") return "Bezahlt";
  return status || "";
}

function fmtCell(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 80);
  return String(v).slice(0, 160);
}

function clip(v: unknown, max: number) {
  return String(v ?? "").replace(/[<>]/g, "").slice(0, max);
}

function norm(s: string) {
  return s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreName(q: string, firma: string | null, person: string | null) {
  const f = norm(firma || "");
  const p = norm(person || "");
  if (f === q || p === q) return 100;
  if (f.startsWith(q) || p.startsWith(q)) return 80;
  if (f.includes(q) || p.includes(q)) return 60;
  const parts = q.split(" ").filter((t) => t.length > 1);
  const hay = `${f} ${p}`;
  const hit = parts.filter((t) => hay.includes(t)).length;
  if (parts.length && hit === parts.length) return 55;
  return hit ? 20 + hit * 5 : 0;
}

function dbErr(message: string) {
  return `CRM-Abfrage fehlgeschlagen: ${message.replace(/\s+/g, " ").slice(0, 180)}`;
}

const STANDARD_PAKETE: Record<string, Array<{ label: string; preis: number; typ: string; desc: string }>> = {
  google: [
    { label: "Google Ads Kampagnen-Setup", preis: 800, typ: "einmalig", desc: "Keyword-Recherche, Anzeigen, Tracking" },
    { label: "Google Ads Konto-Audit", preis: 350, typ: "einmalig", desc: "Analyse und Empfehlungen" },
  ],
  meta: [
    { label: "Meta Ads Kampagnen-Setup", preis: 800, typ: "einmalig", desc: "Zielgruppen, Creatives, Pixel" },
    { label: "Reels / Video Ads", preis: 800, typ: "einmalig", desc: "Zwei kurze Videoanzeigen" },
  ],
  retainer: [
    { label: "Google Ads Management", preis: 500, typ: "monatlich", desc: "Optimierung und Reporting" },
    { label: "Google + Meta Management", preis: 850, typ: "monatlich", desc: "Beide Kanäle, monatlicher Call" },
    { label: "Full-Service Performance", preis: 1500, typ: "monatlich", desc: "Strategie, Report, Call" },
  ],
  web: [
    { label: "Website Basic", preis: 2500, typ: "einmalig", desc: "Fünf Seiten" },
    { label: "Website Professional", preis: 4500, typ: "einmalig", desc: "Zehn Seiten, SEO-Grundlage" },
    { label: "Website-Wartung", preis: 99, typ: "monatlich", desc: "Updates, Backup, Hosting" },
  ],
};
