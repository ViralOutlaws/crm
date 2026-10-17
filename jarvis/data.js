// Daten für die Holo-Panels. Live-Abfragen laufen mit der CRM-Sitzung (RLS).
// Der Demo-Modus benutzt nur die Beispiele unten und importiert Supabase nicht.

export const SUPABASE_URL = "https://jjfmxiqippkgqkwihgek.supabase.co";
export const SUPABASE_KEY = "sb_publishable_gw9k2OPbyyacc_s6BoOM8Q_z1SwC7wB";

export const AREAS = [
  { id: "contacts", label: "Kontakte" },
  { id: "pipeline", label: "Pipeline" },
  { id: "angebote", label: "Angebote" },
  { id: "rechnungen", label: "Rechnungen" },
  { id: "retainer", label: "Retainer" },
  { id: "pakete", label: "Pakete" },
  { id: "aufgaben", label: "Aufgaben" },
  { id: "wiedervorlagen", label: "Wiedervorlagen" },
  { id: "kalender", label: "Kalender" },
  { id: "social", label: "Social" },
  { id: "ausgaben", label: "Ausgaben" },
  { id: "roi", label: "ROI" },
  { id: "ziele", label: "Ziele" },
];

const CRM = {
  contacts: "contacts",
  pipeline: "pipeline",
  angebote: "angebote",
  rechnungen: "rechnungen",
  retainer: "ziele",
  pakete: "konfigurator",
  aufgaben: "kanban",
  wiedervorlagen: "dashboard",
  kalender: "kalender",
  social: "social",
  ausgaben: "ausgaben",
  roi: "roi",
  ziele: "ziele",
  customer: "contacts",
  agenda: "kalender",
};

export function crmHref(page) {
  const id = CRM[page] || page || "dashboard";
  return `/?page=${encodeURIComponent(id)}`;
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function eur(n) {
  const v = Number(n);
  const x = Number.isFinite(v) ? v : 0;
  return x.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export function berlinToday(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export function berlinHour(d = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "numeric",
    hourCycle: "h23",
  }).format(d));
}

export function greeting(d = new Date()) {
  const hour = berlinHour(d);
  if (hour >= 5 && hour < 11) return "Guten Morgen";
  if (hour >= 11 && hour < 18) return "Guten Tag";
  return "Guten Abend";
}

export function speakDate(iso, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return String(iso || "");
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const wd = WEEKDAYS[new Date(Date.UTC(y, month - 1, day)).getUTCDay()];
  const spoken = `${wd}, ${day}. ${MONTHS[month - 1]}`;
  return y === Number(berlinToday(now).slice(0, 4)) ? spoken : `${spoken} ${y}`;
}

export function deDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return String(iso ?? "");
  return `${m[3]}.${m[2]}.${m[1]}`;
}

export function briefingSpoken(d, now = new Date()) {
  const overdue = d.tasks.filter((t) => t.overdue).length;
  const tasks = d.tasks.length === 0
    ? "Heute ist keine Aufgabe fällig."
    : `Bei den Aufgaben ${d.tasks.length === 1 ? "ist 1 fällig oder überfällig" : `sind ${d.tasks.length} fällig oder überfällig`}, davon ${overdue === 0 ? "keine überfällig" : overdue === 1 ? "1 überfällig" : `${overdue} überfällig`}.`;
  const invoices = d.overdueInvoices.length === 0
    ? "Keine Rechnung ist überfällig."
    : d.overdueInvoices.length === 1
    ? "1 Rechnung ist überfällig."
    : `${d.overdueInvoices.length} Rechnungen sind überfällig.`;
  const extra = (d.reminders.length || d.nextSteps.length)
    ? `Dazu ${d.reminders.length === 1 ? "1 fällige Wiedervorlage" : `${d.reminders.length} fällige Wiedervorlagen`} und ${d.nextSteps.length === 1 ? "1 Kontakt" : `${d.nextSteps.length} Kontakte`} mit fälligem nächsten Schritt.`
    : "Keine fällige Wiedervorlage und kein fälliger nächster Schritt.";
  const termine = d.events.length === 1 ? "steht 1 Termin" : `stehen ${d.events.length} Termine`;
  return `${greeting(now)}, heute ist ${speakDate(d.date, now)}. Im Kalender ${termine}. ${tasks} ${invoices} ${extra}`;
}

export function weekRange(today) {
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = dt.getUTCDay() || 7;
  const mon = new Date(dt);
  mon.setUTCDate(dt.getUTCDate() - (wd - 1));
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const iso = (x) => x.toISOString().slice(0, 10);
  return { from: iso(mon), to: iso(sun) };
}

export function fnUrl() {
  let stored = "";
  try { stored = localStorage.getItem("jarvis_fn") || ""; } catch { /* privat */ }
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(stored)) return stored.replace(/\/$/, "");
  return `${SUPABASE_URL}/functions/v1/jarvis-chat`;
}

export function ttsUrl() {
  const chat = fnUrl();
  if (chat.endsWith("/jarvis-chat")) return `${chat.slice(0, -"jarvis-chat".length)}jarvis-tts`;
  return `${SUPABASE_URL}/functions/v1/jarvis-tts`;
}

let client = null;
export async function getSupabase() {
  if (client) return client;
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });
  return client;
}

const PHASE = { lead: "Lead", erstgespraech: "Erstgespräch", angebot: "Angebot", gewonnen: "Gewonnen", verloren: "Verloren" };
const PHASE_ORDER = ["lead", "erstgespraech", "angebot", "gewonnen", "verloren"];

function base(title, crm, rows, columns, kpis, filters = []) {
  return { title, meta: "CRM", crm, wide: true, rows, columns, kpis, filters, note: "" };
}

const STAGE_LABEL = { lead: "Lead", erstgespraech: "Erstgespräch", angebot: "Angebot", gewonnen: "Gewonnen", verloren: "Verloren" };

export function filterRows(view, filter = {}) {
  if (!filter || !Object.keys(filter).length) return view;
  let rows = (view.rows || []).filter((r) => {
    if (filter.only === "overdue" && !r.overdue) return false;
    if (filter.only === "drafts" && r.flags?.status !== "entwurf" && r.flags?.status !== "Idee") return false;
    if (filter.only === "open" && r.flags?.closed) return false;
    if (filter.status && r.flags?.status !== filter.status) return false;
    if (filter.quelle && r.flags?.quelle !== filter.quelle) return false;
    if (filter.query && !String(r.search || "").includes(String(filter.query).toLowerCase())) return false;
    return true;
  });
  if (filter.due === "today") rows = rows.filter((r) => r.overdue || r.flags?.today);
  const next = { ...view, rows, note: "Filter aktiv." };
  if (view.lanes && filter.status) {
    const label = STAGE_LABEL[filter.status] || filter.status;
    next.lanes = { [filter.status]: view.lanes[filter.status] || [] };
    next.title = `Pipeline · ${label}`;
    next.wide = false;
  }
  return next;
}

function nettoOf(positions) {
  if (!Array.isArray(positions)) return 0;
  return positions.reduce((s, p) => {
    if (!p || p.optional) return s;
    const total = Number.isFinite(Number(p.total)) ? Number(p.total) : (Number(p.qty) || 0) * (Number(p.price) || 0);
    return s + total;
  }, 0);
}

function clip(v, n) {
  return String(v ?? "").replace(/[<>]/g, "").slice(0, n);
}

function botFromText(text) {
  const line = String(text || "").split("\n")[0] || "";
  const m = /Zuständig:\s*(Webby|Marky|Saley|Cashy|Developy)/i.exec(line);
  if (!m) return "";
  return { webby: "webby", marky: "marky", saley: "saley", cashy: "cashy", developy: "developy" }[m[1].toLowerCase()] || "";
}

const STANDARD = {
  google: [
    { label: "Google Ads Kampagnen-Setup", preis: 800, typ: "einmalig" },
    { label: "Google Ads Konto-Audit", preis: 350, typ: "einmalig" },
  ],
  meta: [
    { label: "Meta Ads Kampagnen-Setup", preis: 800, typ: "einmalig" },
    { label: "Reels / Video Ads", preis: 800, typ: "einmalig" },
  ],
  retainer: [
    { label: "Google Ads Management", preis: 500, typ: "monatlich" },
    { label: "Google + Meta Management", preis: 850, typ: "monatlich" },
    { label: "Full-Service Performance", preis: 1500, typ: "monatlich" },
  ],
  web: [
    { label: "Website Basic", preis: 2500, typ: "einmalig" },
    { label: "Website Professional", preis: 4500, typ: "einmalig" },
    { label: "Website-Wartung", preis: 99, typ: "monatlich" },
  ],
};

function rangeOf(filter, today, mode) {
  if (filter.from || filter.to) {
    const from = filter.from || filter.to || today;
    const to = filter.to || filter.from || today;
    return { from, to: to < from ? from : to };
  }
  if ((filter.view || mode) === "week") return weekRange(today);
  const [y, m] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

async function namesOf(sb, ids) {
  const map = new Map();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return map;
  const { data } = await sb.from("contacts").select("id, firma, person").in("id", uniq);
  for (const c of data || []) map.set(c.id, c.firma || c.person || "");
  return map;
}

function throwDb(error) {
  if (error) throw new Error(`CRM-Abfrage fehlgeschlagen: ${String(error.message || error).slice(0, 180)}`);
}

export async function loadArea(sb, area, filter = {}, userId) {
  const today = berlinToday();
  if (!AREAS.some((a) => a.id === area)) throw new Error("Unbekannter Bereich.");
  if (area === "contacts") return filterRows(await contactsView(sb, filter, today), filter);
  if (area === "pipeline") return filterRows(await pipelineView(sb), filter);
  if (area === "angebote") return filterRows(await docsView(sb, "angebote", today), filter);
  if (area === "rechnungen") return filterRows(await docsView(sb, "rechnungen", today), filter);
  if (area === "retainer") return filterRows(await retainerView(sb), filter);
  if (area === "pakete") return paketeView(sb, userId);
  if (area === "aufgaben") return filterRows(await aufgabenView(sb, today), filter);
  if (area === "wiedervorlagen") return filterRows(await wvView(sb, today), filter);
  if (area === "kalender") return kalenderView(sb, filter, today);
  if (area === "social") return socialView(sb, filter, today);
  if (area === "ausgaben") return filterRows(await ausgabenView(sb), filter);
  if (area === "roi") return filterRows(await roiView(sb), filter);
  return zieleView(sb);
}

async function contactsView(sb, filter, today) {
  let q = sb.from("contacts").select("id, firma, person, ort, status, quelle, deal_wert, naechster_schritt, archiviert").limit(200);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.quelle) q = q.eq("quelle", filter.quelle);
  const { data, error } = await q;
  throwDb(error);
  const rows = (data || []).filter((c) => !c.archiviert).map((c) => ({
    id: c.id,
    open: "customer",
    overdue: !!(c.naechster_schritt && c.naechster_schritt < today),
    flags: { status: c.status, quelle: c.quelle },
    search: `${c.firma || ""} ${c.person || ""} ${c.ort || ""}`.toLowerCase(),
    cells: {
      firma: c.firma || "",
      person: c.person || "",
      ort: c.ort || "",
      phase: PHASE[c.status] || c.status || "",
      quelle: c.quelle || "",
      deal: c.deal_wert == null ? "" : eur(c.deal_wert),
      naechster: c.naechster_schritt || "",
    },
    badge: { text: PHASE[c.status] || "", tone: c.status === "gewonnen" ? "f" : c.status === "verloren" ? "o" : "w" },
  }));
  return base("Kontakte", "contacts", rows, [
    { key: "firma", label: "Firma" }, { key: "person", label: "Person" }, { key: "ort", label: "Ort" },
    { key: "phase", label: "Phase" }, { key: "quelle", label: "Quelle" }, { key: "deal", label: "Deal netto", align: "r" },
    { key: "naechster", label: "Nächster Schritt" },
  ], [{ label: "Kontakte", value: String(rows.length) }], [
    { label: "nur Leads", filter: { status: "lead" } },
    { label: "nur Instagram", filter: { quelle: "instagram" } },
  ]);
}

async function pipelineView(sb) {
  const { data, error } = await sb.from("contacts").select("id, firma, person, ort, status, quelle, deal_wert, archiviert").limit(500);
  throwDb(error);
  const lanes = { lead: [], erstgespraech: [], angebot: [], gewonnen: [], verloren: [] };
  let volume = 0;
  for (const c of data || []) {
    if (c.archiviert || !lanes[c.status]) continue;
    const deal = c.deal_wert == null ? 0 : Number(c.deal_wert);
    if (["lead", "erstgespraech", "angebot"].includes(c.status)) volume += deal;
    if (lanes[c.status].length < 10) {
      lanes[c.status].push({ id: c.id, firma: c.firma || c.person || "Ohne Namen", ort: c.ort || "", quelle: c.quelle || "", deal_wert: c.deal_wert });
    }
  }
  const counts = Object.fromEntries(PHASE_ORDER.map((k) => [k, (data || []).filter((c) => !c.archiviert && c.status === k).length]));
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

async function docsView(sb, table, today) {
  const cols = table === "angebote"
    ? "id, nr, kunde_id, betreff, datum, status, positions, archiviert, valid_bis"
    : "id, nr, kunde_id, betreff, datum, status, positions, archiviert, faellig";
  const { data, error } = await sb.from(table).select(cols).limit(150);
  throwDb(error);
  const names = await namesOf(sb, (data || []).map((r) => r.kunde_id));
  const rows = (data || []).filter((r) => !r.archiviert).map((r) => {
    const due = table === "angebote" ? (r.valid_bis || "") : (r.faellig || "");
    const overdue = table === "rechnungen" && (r.status === "ueberfaellig" || (r.status === "offen-rg" && due && due < today));
    return {
      overdue,
      flags: { status: r.status, closed: r.status === "bezahlt" },
      search: `${r.nr || ""} ${r.betreff || ""}`.toLowerCase(),
      cells: {
        nr: r.nr || "",
        kunde: names.get(r.kunde_id) || "",
        betreff: r.betreff || "",
        datum: r.datum || "",
        faellig: due,
        netto: eur(nettoOf(r.positions)),
      },
      badge: { text: overdue ? "Überfällig" : r.status === "entwurf" ? "Entwurf" : r.status === "offen-rg" ? "Offen" : r.status === "bezahlt" ? "Bezahlt" : (r.status || ""), tone: overdue ? "o" : r.status === "entwurf" ? "e" : r.status === "bezahlt" ? "f" : "w" },
    };
  });
  const title = table === "angebote" ? "Angebote" : "Rechnungen";
  return base(title, table, rows, [
    { key: "nr", label: "Nr." }, { key: "kunde", label: "Kunde" }, { key: "betreff", label: "Betreff" },
    { key: "datum", label: "Datum" }, { key: "faellig", label: table === "angebote" ? "Gültig bis" : "Fällig" }, { key: "netto", label: "Netto", align: "r" },
  ], [
    { label: "Anzahl", value: String(rows.length) },
    { label: table === "rechnungen" ? "Offen" : "Entwürfe", value: String(table === "rechnungen" ? rows.filter((r) => r.overdue || r.flags.status === "offen-rg").length : rows.filter((r) => r.flags.status === "entwurf").length) },
  ], table === "rechnungen"
    ? [{ label: "nur überfällige", filter: { only: "overdue" } }, { label: "nur Entwürfe", filter: { only: "drafts" } }]
    : [{ label: "nur Entwürfe", filter: { only: "drafts" } }]);
}

async function retainerView(sb) {
  const { data, error } = await sb.from("retainer").select("id, kunde_id, paket, betrag, status, next_datum").limit(80);
  throwDb(error);
  const names = await namesOf(sb, (data || []).map((r) => r.kunde_id));
  const rows = (data || []).map((r) => ({
    flags: { status: r.status },
    search: String(r.paket || "").toLowerCase(),
    cells: { paket: r.paket || "", kunde: names.get(r.kunde_id) || "", betrag: eur(r.betrag), status: r.status || "", naechste: r.next_datum || "" },
    badge: { text: r.status || "", tone: r.status === "aktiv" ? "f" : "e" },
  }));
  const mrr = (data || []).filter((r) => r.status === "aktiv").reduce((s, r) => s + (Number(r.betrag) || 0), 0);
  return base("Retainer", "ziele", rows, [
    { key: "paket", label: "Paket" }, { key: "kunde", label: "Kunde" }, { key: "betrag", label: "Monat", align: "r" },
    { key: "status", label: "Status" }, { key: "naechste", label: "Nächste Rechnung" },
  ], [{ label: "Aktiv", value: String((data || []).filter((r) => r.status === "aktiv").length) }, { label: "MRR", value: eur(mrr), tone: "gold" }], [{ label: "nur aktive", filter: { status: "aktiv" } }]);
}

async function paketeView(sb, userId) {
  const db = await sb.from("pakete").select("*").limit(80);
  if (!db.error && db.data && db.data.length) {
    const g = generic(db.data);
    return { ...base("Pakete", "konfigurator", g.rows, g.columns, [{ label: "Einträge", value: String(g.rows.length) }]), note: "Aus der Tabelle pakete. Preise ändern folgt." };
  }
  let leistungen = null;
  if (userId) {
    const settings = await sb.from("settings").select("data").eq("user_id", userId).maybeSingle();
    if (!settings.error && settings.data?.data) {
      try {
        const parsed = typeof settings.data.data === "string" ? JSON.parse(settings.data.data) : settings.data.data;
        if (parsed?.leistungen) leistungen = parsed.leistungen;
      } catch { /* ignore */ }
    }
  }
  return katalog(leistungen || STANDARD, !!leistungen);
}

function katalog(source, fromSettings) {
  const rows = Object.entries(source).flatMap(([kat, items]) => (items || []).map((item) => ({
    search: `${kat} ${item.label || ""}`.toLowerCase(),
    cells: { kategorie: kat, leistung: item.label || "", preis: eur(item.preis), typ: item.typ || "" },
  })));
  return {
    ...base("Pakete", "konfigurator", rows, [
      { key: "kategorie", label: "Kategorie" }, { key: "leistung", label: "Leistung" }, { key: "preis", label: "Preis", align: "r" }, { key: "typ", label: "Typ" },
    ], [{ label: "Leistungen", value: String(rows.length) }]),
    note: fromSettings ? "Aus den CRM-Einstellungen. Preise ändern folgt." : "Standardkatalog. Preise ändern folgt.",
  };
}

async function aufgabenView(sb, today) {
  const { data, error } = await sb.from("aufgaben").select("id, titel, status, prioritaet, faellig, beschreibung").limit(200);
  throwDb(error);
  const rows = (data || []).map((t) => {
    const overdue = !!(t.faellig && t.faellig < today && t.status !== "done");
    return {
      id: t.id,
      open: "task",
      overdue,
      flags: { status: t.status, closed: t.status === "done", today: overdue || t.faellig === today },
      search: String(t.titel || "").toLowerCase(),
      cells: { titel: t.titel || "", faellig: deDate(t.faellig || ""), prio: t.prioritaet || "", bot: botFromText(t.beschreibung) },
      badge: { text: t.status === "done" ? "Erledigt" : overdue ? "Überfällig" : "Offen", tone: t.status === "done" ? "f" : overdue ? "o" : "w" },
    };
  });
  return base("Aufgaben", "kanban", rows, [
    { key: "titel", label: "Aufgabe" }, { key: "faellig", label: "Fällig" }, { key: "prio", label: "Priorität" }, { key: "bot", label: "Bot" },
  ], [
    { label: "Offen", value: String(rows.filter((r) => !r.flags.closed).length) },
    { label: "Überfällig", value: String(rows.filter((r) => r.overdue).length), tone: "red" },
  ], [{ label: "nur überfällige", filter: { only: "overdue" } }]);
}

async function wvView(sb, today) {
  const { data, error } = await sb.from("wiedervorlagen").select("id, text, datum, done, kontakt_id").limit(150);
  throwDb(error);
  const names = await namesOf(sb, (data || []).map((r) => r.kontakt_id));
  const rows = (data || []).map((w) => ({
    overdue: !!(!w.done && w.datum && w.datum < today),
    flags: { closed: !!w.done },
    search: String(w.text || "").toLowerCase(),
    cells: { text: w.text || "", datum: w.datum || "", kontakt: names.get(w.kontakt_id) || "" },
    badge: { text: w.done ? "Erledigt" : w.datum && w.datum <= today ? "Fällig" : "Geplant", tone: w.done ? "f" : w.datum && w.datum < today ? "o" : "w" },
  }));
  return base("Wiedervorlagen", "dashboard", rows, [
    { key: "datum", label: "Datum" }, { key: "text", label: "Erinnerung" }, { key: "kontakt", label: "Kontakt" },
  ], [{ label: "Offen", value: String(rows.filter((r) => !r.flags.closed).length) }], [{ label: "nur fällige", filter: { only: "overdue" } }]);
}

async function kalenderView(sb, filter, today) {
  const range = rangeOf(filter, today, "month");
  const { data, error } = await sb.from("kal_events").select("id, titel, datum, zeit, typ").gte("datum", range.from).lte("datum", range.to).order("datum").limit(120);
  throwDb(error);
  const rows = (data || []).map((e) => ({
    search: String(e.titel || "").toLowerCase(),
    cells: { datum: e.datum || "", zeit: e.zeit || "", titel: e.titel || "", typ: e.typ || "" },
  }));
  return { ...base("Kalender", "kalender", rows, [
    { key: "datum", label: "Datum" }, { key: "zeit", label: "Zeit" }, { key: "titel", label: "Titel" }, { key: "typ", label: "Typ" },
  ], [{ label: "Termine", value: String(rows.length) }], [{ label: "nur diese Woche", filter: { view: "week" } }, { label: "dieser Monat", filter: { view: "month" } }]), meta: `${range.from} – ${range.to}` };
}

async function socialView(sb, filter, today) {
  const range = rangeOf(filter, today, filter.view === "month" ? "month" : "week");
  const { data, error } = await sb.from("social_media_posts").select("id, datum, uhrzeit, format, saeule, hook, caption, hashtags, status, thema, assets").gte("datum", range.from).lte("datum", range.to).order("datum").limit(80);
  throwDb(error);
  const paths = (data || []).flatMap((p) => (Array.isArray(p.assets) ? p.assets.map((a) => a?.path).filter(Boolean) : []));
  const urls = new Map();
  for (let i = 0; i < paths.length; i += 80) {
    const signed = await sb.storage.from("social-assets").createSignedUrls(paths.slice(i, i + 80), 3600);
    for (const row of signed.data || []) if (row?.path && row.signedUrl) urls.set(row.path, row.signedUrl);
  }
  const posts = (data || []).map((p) => {
    const assets = Array.isArray(p.assets) ? p.assets : [];
    const thumbs = assets.map((a) => ({ url: a?.path ? urls.get(a.path) || "" : "", type: a?.type || "image" })).filter((t) => t.url).slice(0, 4);
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

async function ausgabenView(sb) {
  const { data, error } = await sb.from("ausgaben").select("id, typ, datum, beschreibung, kategorie, brutto").order("datum", { ascending: false }).limit(120);
  throwDb(error);
  const rows = (data || []).map((a) => ({
    flags: { status: a.typ },
    search: `${a.beschreibung || ""} ${a.kategorie || ""}`.toLowerCase(),
    cells: { datum: a.datum || "", typ: a.typ || "", text: a.beschreibung || "", kat: a.kategorie || "", brutto: eur(a.brutto) },
  }));
  const out = (data || []).filter((a) => a.typ !== "einnahme").reduce((s, a) => s + (Number(a.brutto) || 0), 0);
  return base("Ausgaben", "ausgaben", rows, [
    { key: "datum", label: "Datum" }, { key: "typ", label: "Typ" }, { key: "text", label: "Text" }, { key: "kat", label: "Kategorie" }, { key: "brutto", label: "Brutto", align: "r" },
  ], [{ label: "Ausgaben brutto", value: eur(out), tone: "red" }, { label: "Buchungen", value: String(rows.length) }]);
}

async function roiView(sb) {
  const { data, error } = await sb.from("roi_daten").select("id, kanal, monat, jahr, budget, leads, umsatz, roas").order("jahr", { ascending: false }).limit(80);
  throwDb(error);
  const rows = (data || []).map((r) => ({
    search: String(r.kanal || ""),
    cells: { kanal: r.kanal || "", zeit: `${r.monat}/${r.jahr}`, budget: eur(r.budget), leads: String(r.leads ?? ""), umsatz: eur(r.umsatz), roas: r.roas == null ? "" : String(r.roas) },
  }));
  return base("ROI", "roi", rows, [
    { key: "kanal", label: "Kanal" }, { key: "zeit", label: "Zeit" }, { key: "budget", label: "Budget", align: "r" },
    { key: "leads", label: "Leads", align: "r" }, { key: "umsatz", label: "Umsatz", align: "r" }, { key: "roas", label: "ROAS", align: "r" },
  ], [{ label: "Zeilen", value: String(rows.length) }]);
}

async function zieleView(sb) {
  const { data, error } = await sb.from("ziele").select("*").limit(40);
  if (error) return { ...base("Ziele", "ziele", [], [], []), note: "Tabelle ziele nicht lesbar. Zielwerte können im CRM lokal liegen. Bearbeiten folgt." };
  const g = generic(data || []);
  return { ...base("Ziele", "ziele", g.rows, g.columns, [{ label: "Einträge", value: String(g.rows.length) }]), note: g.rows.length ? "Rohdaten aus ziele. Bearbeiten folgt." : "Keine Zeilen in ziele. MRR-Ziele liegen im CRM teils nur lokal. Bearbeiten folgt." };
}

function generic(data) {
  const skip = new Set(["id", "workspace_id", "created_at", "updated_at"]);
  const keys = [...new Set(data.flatMap((r) => Object.keys(r)))].filter((k) => !skip.has(k)).slice(0, 7);
  return {
    columns: keys.map((k) => ({ key: k, label: k })),
    rows: data.slice(0, 40).map((r) => ({
      search: JSON.stringify(r).toLowerCase(),
      cells: Object.fromEntries(keys.map((k) => [k, r[k] == null ? "" : typeof r[k] === "object" ? JSON.stringify(r[k]).slice(0, 80) : String(r[k]).slice(0, 160)])),
    })),
  };
}

export async function loadBriefing(sb) {
  const today = berlinToday();
  const [ev, tasks, inv, wv, contacts] = await Promise.all([
    sb.from("kal_events").select("id, titel, datum, zeit, typ, notiz").eq("datum", today).limit(40),
    sb.from("aufgaben").select("id, titel, beschreibung, status, prioritaet, faellig").limit(300),
    sb.from("rechnungen").select("id, nr, kunde_id, faellig, status, positions, archiviert, betreff").limit(300),
    sb.from("wiedervorlagen").select("id, text, datum, done").eq("done", false).lte("datum", today).limit(40),
    sb.from("contacts").select("id, firma, person, status, naechster_schritt, naechster_schritt_text, archiviert").limit(400),
  ]);
  for (const r of [ev, tasks, inv, wv, contacts]) throwDb(r.error);
  const events = (ev.data || []).map((e) => ({ zeit: e.zeit || "", titel: e.titel, typ: e.typ || "termin", datum: e.datum })).sort((a, b) => String(a.zeit).localeCompare(String(b.zeit)));
  const taskRows = (tasks.data || []).filter((t) => t.faellig && t.faellig <= today && t.status !== "done").slice(0, 30).map((t) => ({
    titel: t.titel, faellig: t.faellig, status: t.status, prioritaet: t.prioritaet, bot: botFromText(t.beschreibung), overdue: t.faellig < today,
  }));
  const names = await namesOf(sb, (inv.data || []).map((r) => r.kunde_id));
  const overdueInvoices = (inv.data || []).filter((r) => !r.archiviert && (r.status === "ueberfaellig" || (r.status === "offen-rg" && r.faellig && r.faellig < today))).slice(0, 20).map((r) => ({
    nr: r.nr, kunde: names.get(r.kunde_id) || "Ohne Kunde", netto: nettoOf(r.positions), faellig: r.faellig,
  }));
  const reminders = (wv.data || []).map((w) => ({ text: w.text, datum: w.datum }));
  const nextSteps = (contacts.data || []).filter((c) => !c.archiviert && c.naechster_schritt && c.naechster_schritt <= today).slice(0, 20).map((c) => ({
    firma: c.firma || c.person || "Ohne Namen", datum: c.naechster_schritt, text: c.naechster_schritt_text || "",
  }));
  const spoken = briefingSpoken({ date: today, events, tasks: taskRows, overdueInvoices, reminders, nextSteps });
  return {
    title: "Agenda · Heute",
    meta: "Briefing · " + deDate(today),
    crm: "kalender",
    wide: true,
    spoken,
    note: spoken,
    agenda: { date: today, events, tasks: taskRows, reminders, invoices: overdueInvoices, nextSteps },
    kpis: [
      { label: "Termine", value: String(events.length) },
      { label: "Aufgaben fällig", value: String(taskRows.length), tone: overdue ? "red" : "" },
      { label: "Rechnungen überfällig", value: String(overdueInvoices.length), tone: overdueInvoices.length ? "red" : "" },
      { label: "Nächste Schritte", value: String(nextSteps.length), tone: "gold" },
    ],
  };
}

function norm(s) {
  return String(s || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreName(q, firma, person) {
  const f = norm(firma);
  const p = norm(person);
  if (f === q || p === q) return 100;
  if (f.startsWith(q) || p.startsWith(q)) return 80;
  if (f.includes(q) || p.includes(q)) return 60;
  const parts = q.split(" ").filter((t) => t.length > 1);
  const hay = `${f} ${p}`;
  const hit = parts.filter((t) => hay.includes(t)).length;
  if (parts.length && hit === parts.length) return 55;
  return hit ? 20 + hit * 5 : 0;
}

export async function loadCustomer(sb, queryOrId) {
  const today = berlinToday();
  let id = /^[0-9a-f-]{36}$/i.test(String(queryOrId)) ? String(queryOrId) : "";
  if (!id) {
    const { data, error } = await sb.from("contacts").select("id, firma, person, archiviert").limit(400);
    throwDb(error);
    const q = norm(queryOrId);
    const ranked = (data || []).filter((c) => !c.archiviert).map((c) => ({ ...c, score: scoreName(q, c.firma, c.person) })).filter((c) => c.score >= 40).sort((a, b) => b.score - a.score);
    if (!ranked.length) return { title: "Kunden-Akte", crm: "contacts", note: "Kein Kontakt gefunden.", rows: [], columns: [], kpis: [] };
    if (ranked.length > 1 && ranked[1].score >= 50 && ranked[0].score - ranked[1].score < 15) {
      return base("Mehrere Treffer", "contacts", ranked.slice(0, 6).map((r) => ({
        id: r.id, open: "customer", cells: { firma: r.firma || "", person: r.person || "" },
      })), [{ key: "firma", label: "Firma" }, { key: "person", label: "Person" }], [{ label: "Treffer", value: String(Math.min(6, ranked.length)) }]);
    }
    id = ranked[0].id;
  }
  const contact = await sb.from("contacts").select("id, firma, person, email, tel, ort, branche, status, quelle, deal_wert, naechster_schritt, naechster_schritt_text, notes, ana, notizen, archiviert").eq("id", id).maybeSingle();
  throwDb(contact.error);
  if (!contact.data || contact.data.archiviert) return { title: "Kunden-Akte", crm: "contacts", note: "Kontakt nicht gefunden.", rows: [], columns: [], kpis: [] };
  const c = contact.data;
  const [offers, invoices, tasks, events] = await Promise.all([
    sb.from("angebote").select("id, nr, betreff, datum, status, positions").eq("kunde_id", id).limit(20),
    sb.from("rechnungen").select("id, nr, betreff, datum, faellig, status, positions").eq("kunde_id", id).limit(20),
    sb.from("aufgaben").select("id, titel, status, prioritaet, faellig, beschreibung").eq("kontakt_id", id).limit(20),
    sb.from("kal_events").select("id, titel, datum, zeit, typ").eq("kontakt_id", id).order("datum", { ascending: false }).limit(8),
  ]);
  for (const r of [offers, invoices, tasks, events]) throwDb(r.error);
  const openTasks = (tasks.data || []).filter((t) => t.status !== "done");
  const openInv = (invoices.data || []).filter((r) => r.status === "offen-rg" || r.status === "ueberfaellig");
  const phase = PHASE[c.status] || c.status || "Lead";
  const step = c.naechster_schritt ? `nächster Schritt am ${speakDate(c.naechster_schritt)}` : "ein nächster Schritt ist nicht gesetzt";
  const spoken = `${c.firma || "Der Kontakt"} ist in der Phase ${phase}, ${step}. Wir haben ${(offers.data || []).length} Angebote und ${openInv.length} offene Rechnungen, dazu ${openTasks.length} offene Aufgaben.`;
  return {
    title: "Kunden-Akte",
    meta: c.firma || c.person || "Kontakt",
    crm: "contacts",
    wide: true,
    spoken,
    note: spoken,
    customer: {
      id: c.id,
      firma: c.firma,
      person: c.person,
      email: c.email,
      tel: c.tel,
      ort: c.ort,
      branche: c.branche,
      status: PHASE[c.status] || c.status,
      quelle: c.quelle,
      deal_wert: c.deal_wert,
      naechster_schritt: c.naechster_schritt,
      naechster_schritt_text: c.naechster_schritt_text,
      notes: clip(c.notes, 1200),
      ana: clip(c.ana, 600),
      notizen: Array.isArray(c.notizen) ? c.notizen.slice(-6).map((n) => ({ datum: n.datum || "", text: clip(n.text, 400) })) : [],
      angebote: (offers.data || []).map((a) => ({ nr: a.nr, betreff: a.betreff, datum: a.datum, status: a.status, netto: nettoOf(a.positions) })),
      rechnungen: (invoices.data || []).map((a) => ({ nr: a.nr, betreff: a.betreff, datum: a.datum, faellig: a.faellig, status: a.status, netto: nettoOf(a.positions), overdue: a.status === "ueberfaellig" || (a.status === "offen-rg" && a.faellig && a.faellig < today) })),
      aufgaben: openTasks.map((t) => ({ titel: t.titel, status: t.status, prioritaet: t.prioritaet, faellig: t.faellig, bot: botFromText(t.beschreibung) })),
      termine: (events.data || []).map((e) => ({ titel: e.titel, datum: e.datum, zeit: e.zeit, typ: e.typ })),
    },
  };
}

export async function loadSide(sb) {
  const today = berlinToday();
  const [ev, tasks, contacts, inv] = await Promise.all([
    sb.from("kal_events").select("titel, zeit").eq("datum", today).limit(8),
    sb.from("aufgaben").select("id, titel, status, prioritaet, faellig").neq("status", "done").limit(8),
    sb.from("contacts").select("status, deal_wert, archiviert").limit(500),
    sb.from("rechnungen").select("nr, kunde_id, status, faellig, positions, archiviert").limit(80),
  ]);
  const events = (ev.data || []).map((e) => ({ t: e.zeit || "–", x: e.titel || "Termin", type: "ev" }));
  const taskRows = (tasks.data || []).filter((t) => t.faellig && t.faellig <= today).slice(0, 5).map((t) => ({
    t: t.faellig, x: t.titel, type: "task", id: t.id, status: t.status || "todo", prio: t.prioritaet === "hoch", overdue: t.faellig < today,
  }));
  const counts = { lead: 0, erstgespraech: 0, angebot: 0, gewonnen: 0, verloren: 0 };
  let volume = 0;
  for (const c of contacts.data || []) {
    if (c.archiviert || !(c.status in counts)) continue;
    counts[c.status] += 1;
    if (["lead", "erstgespraech", "angebot"].includes(c.status)) volume += Number(c.deal_wert) || 0;
  }
  const names = await namesOf(sb, (inv.data || []).map((r) => r.kunde_id));
  const open = (inv.data || []).filter((r) => !r.archiviert && (r.status === "offen-rg" || r.status === "ueberfaellig")).slice(0, 4).map((r) => ({
    nr: r.nr || "",
    k: names.get(r.kunde_id) || "Ohne Kunde",
    b: nettoOf(r.positions),
    over: r.status === "ueberfaellig" || (r.faellig && r.faellig < today),
  }));
  return { today: [...events, ...taskRows], counts, volume, invoices: open, live: true, error: ev.error || tasks.error || contacts.error || inv.error ? "Ein Teil der Übersicht ist nicht lesbar." : "" };
}

/* ---------- Demo ---------- */

const DEMO_CONTACTS = [
  { id: "c-cafe", firma: "Beispiel-Café", person: "Kim Beispiel", ort: "Musterstadt", status: "erstgespraech", quelle: "ki-check", deal: 2400, naechster: "2026-10-17", text: "Angebot schicken" },
  { id: "c-baeck", firma: "Beispiel Bäckerei", person: "Alex Muster", ort: "Musterstadt", status: "lead", quelle: "instagram", deal: 900, naechster: "2026-10-20", text: "Erstgespräch" },
  { id: "c-physio", firma: "Muster Physio", person: "Sam Demo", ort: "Beispielort", status: "lead", quelle: "google", deal: 1200, naechster: "2026-10-22", text: "" },
  { id: "c-fit", firma: "Fitness-Studio Muster", person: "Robin Test", ort: "Musterstadt", status: "angebot", quelle: "website", deal: 4800, naechster: "2026-10-18", text: "Angebot nachfassen" },
  { id: "c-gmbh", firma: "Musterfirma GmbH", person: "Noah Beispiel", ort: "Beispielort", status: "gewonnen", quelle: "empfehlung", deal: 0, naechster: "", text: "" },
  { id: "c-hotel", firma: "Beispiel Hotel", person: "Mira Demo", ort: "Musterstadt", status: "gewonnen", quelle: "google", deal: 0, naechster: "", text: "" },
];

function contactRows() {
  return DEMO_CONTACTS.map((c) => ({
    id: c.id,
    open: "customer",
    overdue: !!(c.naechster && c.naechster < "2026-10-17"),
    flags: { status: c.status, quelle: c.quelle },
    search: `${c.firma} ${c.person} ${c.ort}`.toLowerCase(),
    cells: { firma: c.firma, person: c.person, ort: c.ort, phase: PHASE[c.status], quelle: c.quelle, deal: c.deal ? eur(c.deal) : "", naechster: c.naechster },
    badge: { text: PHASE[c.status], tone: c.status === "gewonnen" ? "f" : "w" },
  }));
}

function demoViews() {
  const contacts = base("Kontakte", "contacts", contactRows(), [
    { key: "firma", label: "Firma" }, { key: "person", label: "Person" }, { key: "ort", label: "Ort" },
    { key: "phase", label: "Phase" }, { key: "quelle", label: "Quelle" }, { key: "deal", label: "Deal netto", align: "r" },
    { key: "naechster", label: "Nächster Schritt" },
  ], [{ label: "Kontakte", value: String(DEMO_CONTACTS.length) }], [
    { label: "nur Leads", filter: { status: "lead" } },
    { label: "nur Instagram", filter: { quelle: "instagram" } },
  ]);
  const lanes = { lead: [], erstgespraech: [], angebot: [], gewonnen: [], verloren: [] };
  let volume = 0;
  for (const c of DEMO_CONTACTS) {
    lanes[c.status].push({ id: c.id, firma: c.firma, ort: c.ort, quelle: c.quelle, deal_wert: c.deal });
    if (["lead", "erstgespraech", "angebot"].includes(c.status)) volume += c.deal;
  }
  const counts = Object.fromEntries(PHASE_ORDER.map((k) => [k, lanes[k].length]));
  const pipeline = {
    ...base("Pipeline", "pipeline", [], [], [
      { label: "Leads", value: String(counts.lead) },
      { label: "Erstgespräch", value: String(counts.erstgespraech) },
      { label: "Angebot", value: String(counts.angebot) },
      { label: "Volumen offen", value: eur(volume), tone: "gold" },
    ]),
    lanes, counts, volume_netto: volume,
  };
  const angebote = base("Angebote", "angebote", [
    rowDoc("A-0042", "Beispiel-Café", "Social-Betreuung", "2026-10-10", "2026-11-10", "entwurf", 900),
    rowDoc("A-0041", "Fitness-Studio Muster", "Website + Ads", "2026-10-02", "2026-10-31", "gesendet", 4800),
  ], docCols(true), [{ label: "Anzahl", value: "2" }, { label: "Entwürfe", value: "1" }], [{ label: "nur Entwürfe", filter: { only: "drafts" } }]);
  const rechnungen = base("Rechnungen", "rechnungen", [
    rowDoc("R-0012", "Musterfirma GmbH", "Retainer Oktober", "2026-10-01", "2026-10-08", "ueberfaellig", 1500, true),
    rowDoc("R-0013", "Beispiel Hotel", "Kampagne", "2026-10-12", "2026-10-20", "offen-rg", 900, false),
    rowDoc("R-0014", "Beispiel-Café", "Setup", "2026-10-16", "2026-10-30", "entwurf", 450, false),
  ], docCols(false), [{ label: "Anzahl", value: "3" }, { label: "Offen", value: "2" }], [
    { label: "nur überfällige", filter: { only: "overdue" } },
    { label: "nur Entwürfe", filter: { only: "drafts" } },
  ]);
  const retainer = base("Retainer", "ziele", [
    { flags: { status: "aktiv" }, search: "social betreuung", cells: { paket: "Social Betreuung", kunde: "Musterfirma GmbH", betrag: eur(850), status: "aktiv", naechste: "2026-11-01" }, badge: { text: "aktiv", tone: "f" } },
    { flags: { status: "pausiert" }, search: "website wartung", cells: { paket: "Website-Wartung", kunde: "Beispiel Hotel", betrag: eur(99), status: "pausiert", naechste: "" }, badge: { text: "pausiert", tone: "e" } },
  ], [
    { key: "paket", label: "Paket" }, { key: "kunde", label: "Kunde" }, { key: "betrag", label: "Monat", align: "r" }, { key: "status", label: "Status" }, { key: "naechste", label: "Nächste Rechnung" },
  ], [{ label: "Aktiv", value: "1" }, { label: "MRR", value: eur(850), tone: "gold" }], [{ label: "nur aktive", filter: { status: "aktiv" } }]);
  const aufgaben = base("Aufgaben", "kanban", DEMO_TASKS.map(taskRow), [
    { key: "titel", label: "Aufgabe" }, { key: "faellig", label: "Fällig" }, { key: "prio", label: "Priorität" }, { key: "bot", label: "Bot" },
  ], [{ label: "Offen", value: "4" }, { label: "Überfällig", value: "1", tone: "red" }], [{ label: "nur überfällige", filter: { only: "overdue" } }]);
  const wiedervorlagen = base("Wiedervorlagen", "dashboard", [
    { overdue: true, flags: { closed: false }, search: "café anruf", cells: { datum: "2026-10-16", text: "Beispiel-Café anrufen", kontakt: "Beispiel-Café" }, badge: { text: "Fällig", tone: "o" } },
    { overdue: false, flags: { closed: false }, search: "hotel bericht", cells: { datum: "2026-10-24", text: "Bericht Beispiel Hotel", kontakt: "Beispiel Hotel" }, badge: { text: "Geplant", tone: "w" } },
  ], [
    { key: "datum", label: "Datum" }, { key: "text", label: "Erinnerung" }, { key: "kontakt", label: "Kontakt" },
  ], [{ label: "Offen", value: "2" }], [{ label: "nur fällige", filter: { only: "overdue" } }]);
  const week = weekRange("2026-10-17");
  const kalender = { ...base("Kalender", "kalender", [
    { search: "erstgespräch", cells: { datum: "2026-10-17", zeit: "09:30", titel: "Erstgespräch Beispiel-Café", typ: "termin" } },
    { search: "shooting", cells: { datum: "2026-10-17", zeit: "11:00", titel: "Content-Shooting Musterfirma", typ: "termin" } },
    { search: "sync", cells: { datum: "2026-10-20", zeit: "16:30", titel: "Team-Sync", typ: "sonstiges" } },
  ], [
    { key: "datum", label: "Datum" }, { key: "zeit", label: "Zeit" }, { key: "titel", label: "Titel" }, { key: "typ", label: "Typ" },
  ], [{ label: "Termine", value: "3" }], [{ label: "nur diese Woche", filter: { view: "week" } }, { label: "dieser Monat", filter: { view: "month" } }]), meta: `${week.from} – ${week.to}` };
  const posts = [
    post("2026-10-12", "18:00", "Reel", "3 Fehler auf Ihrer Website", "Wir zeigen drei Fehler, die Besucher abspringen lassen.", "#webdesign #kmu", "Idee", "linear-gradient(140deg,#fdad00,#7a3d00 60%,#0b0b0b)"),
    post("2026-10-13", "12:00", "Karussell", "KI für kleine Unternehmen", "Fünf Aufgaben, die eine KI heute schon abnimmt.", "#ki #business", "Content fertig", "linear-gradient(160deg,#0d3b4a,#36e2ff 120%)"),
    post("2026-10-14", "17:30", "Story", "Behind the Scenes", "So entsteht ein Social-Konzept bei uns.", "#bts", "Geplant", "linear-gradient(200deg,#2b2b2b,#fdad00 160%)"),
    post("2026-10-15", "18:00", "Reel", "Vorher / Nachher", "Ein klarer Auftritt verändert die Wirkung.", "#rebranding", "Idee", "linear-gradient(130deg,#1a1a1a,#fdad00 50%,#1a1a1a)"),
    post("2026-10-16", "11:00", "Beitrag", "Freitags-Frage", "Was hält Sie von der neuen Website ab?", "#community", "Idee", "radial-gradient(circle at 30% 30%,#fdad00,#3a2500 55%,#080808)"),
    post("2026-10-17", "10:00", "Karussell", "Checkliste Google-Profil", "Sieben Punkte für mehr Anfragen.", "#localseo", "Idee", "linear-gradient(170deg,#36e2ff,#0b2a33 50%,#080808)"),
  ];
  const social = {
    title: "Social · Woche",
    meta: `${week.from} – ${week.to}`,
    crm: "social",
    wide: true,
    posts,
    kpis: [
      { label: "Posts", value: String(posts.length) },
      { label: "Entwurf", value: String(posts.filter((p) => p.status === "Idee").length) },
      { label: "Veröffentlicht", value: "0", tone: "gold" },
    ],
    filters: [{ label: "diese Woche", filter: { view: "week" } }, { label: "dieser Monat", filter: { view: "month" } }],
    rows: [],
    columns: [],
  };
  const ausgaben = base("Ausgaben", "ausgaben", [
    { flags: { status: "ausgabe" }, search: "adobe", cells: { datum: "2026-10-01", typ: "ausgabe", text: "Adobe Creative Cloud", kat: "Software", brutto: eur(71.4) } },
    { flags: { status: "ausgabe" }, search: "meta", cells: { datum: "2026-10-05", typ: "ausgabe", text: "Meta Werbekosten Beispiel", kat: "Ads", brutto: eur(240) } },
  ], [
    { key: "datum", label: "Datum" }, { key: "typ", label: "Typ" }, { key: "text", label: "Text" }, { key: "kat", label: "Kategorie" }, { key: "brutto", label: "Brutto", align: "r" },
  ], [{ label: "Ausgaben brutto", value: eur(311.4), tone: "red" }, { label: "Buchungen", value: "2" }]);
  const roi = base("ROI", "roi", [
    { search: "google", cells: { kanal: "google", zeit: "9/2026", budget: eur(800), leads: "12", umsatz: eur(2400), roas: "3" } },
    { search: "meta", cells: { kanal: "meta", zeit: "9/2026", budget: eur(400), leads: "6", umsatz: eur(900), roas: "2.25" } },
  ], [
    { key: "kanal", label: "Kanal" }, { key: "zeit", label: "Zeit" }, { key: "budget", label: "Budget", align: "r" },
    { key: "leads", label: "Leads", align: "r" }, { key: "umsatz", label: "Umsatz", align: "r" }, { key: "roas", label: "ROAS", align: "r" },
  ], [{ label: "Zeilen", value: "2" }]);
  const ziele = { ...base("Ziele", "ziele", [
    { search: "mrr", cells: { ziel: "MRR", wert: eur(8000), stand: eur(850), bis: "2026-12-31" } },
    { search: "kunden", cells: { ziel: "Neukunden", wert: "6", stand: "2", bis: "2026-12-31" } },
  ], [
    { key: "ziel", label: "Ziel" }, { key: "wert", label: "Zielwert" }, { key: "stand", label: "Stand" }, { key: "bis", label: "Bis" },
  ], [{ label: "Ziele", value: "2" }]), note: "Beispieldaten. Im CRM liegen Zielwerte teils nur lokal. Bearbeiten folgt." };
  return { contacts, pipeline, angebote, rechnungen, retainer, pakete: katalog(STANDARD, false), aufgaben, wiedervorlagen, kalender, social, ausgaben, roi, ziele };
}

function rowDoc(nr, kunde, betreff, datum, faellig, status, netto, overdue = false) {
  const over = overdue || status === "ueberfaellig";
  return {
    overdue: over,
    flags: { status, closed: status === "bezahlt" },
    search: `${nr} ${betreff} ${kunde}`.toLowerCase(),
    cells: { nr, kunde, betreff, datum, faellig, netto: eur(netto) },
    badge: { text: over ? "Überfällig" : status === "entwurf" ? "Entwurf" : status === "offen-rg" ? "Offen" : status === "gesendet" ? "Gesendet" : status, tone: over ? "o" : status === "entwurf" ? "e" : "w" },
  };
}

function docCols(offer) {
  return [
    { key: "nr", label: "Nr." }, { key: "kunde", label: "Kunde" }, { key: "betreff", label: "Betreff" },
    { key: "datum", label: "Datum" }, { key: "faellig", label: offer ? "Gültig bis" : "Fällig" }, { key: "netto", label: "Netto", align: "r" },
  ];
}

const DEMO_TASKS = [
  { id: "a1000000-0000-4000-8000-000000000001", titel: "Angebot Beispiel-Café fertigstellen", faellig: "2026-10-15", prioritaet: "hoch", bot: "saley", status: "todo", beschreibung: "Zuständig: Saley (Vertrieb).\nAngebot schicken." },
  { id: "a1000000-0000-4000-8000-000000000002", titel: "KW-Posts prüfen", faellig: "2026-10-17", prioritaet: "normal", bot: "marky", status: "todo", beschreibung: "Zuständig: Marky (Marketing / Social)." },
  { id: "a1000000-0000-4000-8000-000000000003", titel: "Backup Website", faellig: "2026-10-17", prioritaet: "niedrig", bot: "webby", status: "todo", beschreibung: "Zuständig: Webby (Websites)." },
  { id: "a1000000-0000-4000-8000-000000000004", titel: "Landingpage skizzieren", faellig: "2026-10-21", prioritaet: "normal", bot: "developy", status: "todo", beschreibung: "Zuständig: Developy (Software)." },
];

function taskRow(t) {
  const overdue = t.faellig < "2026-10-17" && t.status !== "done";
  return {
    id: t.id,
    open: "task",
    overdue,
    flags: { status: t.status, closed: t.status === "done", today: overdue || t.faellig === "2026-10-17" },
    search: t.titel.toLowerCase(),
    cells: { titel: t.titel, faellig: deDate(t.faellig), prio: t.prioritaet, bot: t.bot },
    badge: { text: overdue ? "Überfällig" : "Offen", tone: overdue ? "o" : "w" },
  };
}

function taskDetail(t) {
  return {
    title: "Aufgabe",
    meta: t.titel,
    crm: "aufgaben",
    spoken: `${t.titel}, ${t.status === "done" ? "erledigt" : "offen"}${t.faellig ? `, fällig am ${speakDate(t.faellig)}` : ""}.`,
    task: t,
  };
}

export function demoTask(id) {
  const hit = DEMO_TASKS.find((t) => t.id === id);
  if (!hit) throw new Error("Die Aufgabe ist nicht in den Beispieldaten.");
  return taskDetail(hit);
}

export async function loadTask(sb, id) {
  const { data, error } = await sb.from("aufgaben").select("id, titel, status, prioritaet, faellig, beschreibung").eq("id", id).maybeSingle();
  throwDb(error);
  if (!data) throw new Error("Die Aufgabe ist nicht mehr da.");
  return taskDetail({
    id: data.id,
    titel: data.titel || "Ohne Titel",
    status: data.status || "todo",
    prioritaet: data.prioritaet || "normal",
    faellig: data.faellig || "",
    beschreibung: data.beschreibung || "",
    bot: botFromText(data.beschreibung),
  });
}

function post(datum, uhrzeit, format, hook, caption, tags, status, gradient) {
  return { datum, uhrzeit, format, hook, caption, hashtags: tags.split(" "), status, gradient, thumbs: [], saeule: "Webdesign" };
}

const VIEWS = demoViews();

export function demoView(id, filter) {
  const view = VIEWS[id];
  if (!view) throw new Error("Unbekannter Bereich.");
  return filterRows(structuredClone(view), filter);
}

export function demoSide() {
  return {
    live: false,
    today: [
      { t: "09:30", x: "Erstgespräch Beispiel-Café", type: "ev" },
      { t: "11:00", x: "Content-Shooting Musterfirma", type: "ev" },
      ...DEMO_TASKS.filter((t) => t.faellig <= "2026-10-17").map((t) => ({
        t: t.faellig, x: t.titel, type: "task", id: t.id, status: t.status, prio: t.prioritaet === "hoch",
      })),
    ],
    counts: { lead: 2, erstgespraech: 1, angebot: 1, gewonnen: 2, verloren: 0 },
    volume: 9300,
    invoices: [
      { nr: "R-0012", k: "Musterfirma GmbH", b: 1500, over: true },
      { nr: "R-0013", k: "Beispiel Hotel", b: 900, over: false },
    ],
  };
}

export function demoBriefing() {
  const today = "2026-10-17";
  const events = [
    { zeit: "09:30", titel: "Erstgespräch Beispiel-Café", typ: "termin" },
    { zeit: "11:00", titel: "Content-Shooting Musterfirma", typ: "termin" },
  ];
  const tasks = [
    { titel: "Angebot Beispiel-Café fertigstellen", faellig: "2026-10-15", prioritaet: "hoch", bot: "saley", overdue: true },
    { titel: "KW-Posts prüfen", faellig: "2026-10-17", prioritaet: "normal", bot: "marky", overdue: false },
    { titel: "Backup Website", faellig: "2026-10-17", prioritaet: "niedrig", bot: "webby", overdue: false },
  ];
  const invoices = [{ nr: "R-0012", kunde: "Musterfirma GmbH", netto: 1500, faellig: "2026-10-08" }];
  const reminders = [{ text: "Beispiel-Café anrufen", datum: "2026-10-16" }];
  const nextSteps = [{ firma: "Beispiel-Café", datum: "2026-10-17", text: "Angebot schicken" }];
  const spoken = briefingSpoken({ date: today, events, tasks, overdueInvoices: invoices, reminders, nextSteps });
  return {
    title: "Agenda · Heute",
    meta: "Briefing · " + deDate(today),
    crm: "kalender",
    wide: true,
    spoken,
    note: spoken,
    agenda: { date: today, events, tasks, reminders, invoices, nextSteps },
    kpis: [
      { label: "Termine", value: "2" },
      { label: "Aufgaben fällig", value: "3", tone: "red" },
      { label: "Rechnungen überfällig", value: "1", tone: "red" },
      { label: "Nächste Schritte", value: "1", tone: "gold" },
    ],
  };
}

export function demoCustomer(id) {
  const hit = DEMO_CONTACTS.find((c) => c.id === id) || DEMO_CONTACTS[0];
  if (hit.id !== "c-cafe" && id && id !== "c-cafe") {
    return {
      title: "Kunden-Akte",
      meta: hit.firma,
      crm: "contacts",
      wide: true,
      spoken: `${hit.firma} ist in der Phase ${PHASE[hit.status]}, ${hit.naechster ? `nächster Schritt am ${speakDate(hit.naechster)}` : "ein nächster Schritt ist nicht gesetzt"}. In den Beispieldaten liegen dazu keine Angebote, keine offenen Rechnungen und keine offene Aufgabe.`,
      customer: {
        id: hit.id, firma: hit.firma, person: hit.person, email: "hallo@beispiel.de", tel: "+49 170 000000", ort: hit.ort,
        branche: "Lokal", status: PHASE[hit.status], quelle: hit.quelle, deal_wert: hit.deal, naechster_schritt: hit.naechster,
        naechster_schritt_text: hit.text, notes: "Beispieldaten.", ana: "", notizen: [], angebote: [], rechnungen: [], aufgaben: [], termine: [],
      },
    };
  }
  const spoken = `Beispiel-Café ist in der Phase Erstgespräch, nächster Schritt am ${speakDate("2026-10-17")}. Wir haben 1 Angebot und 0 offene Rechnungen, dazu 1 offene Aufgabe.`;
  return {
    title: "Kunden-Akte",
    meta: "Beispiel-Café",
    crm: "contacts",
    wide: true,
    spoken,
    note: spoken,
    customer: {
      id: "c-cafe",
      firma: "Beispiel-Café",
      person: "Kim Beispiel",
      email: "hallo@beispiel-cafe.de",
      tel: "+49 170 111111",
      ort: "Musterstadt",
      branche: "Gastronomie",
      status: "Erstgespräch",
      quelle: "ki-check",
      deal_wert: 2400,
      naechster_schritt: "2026-10-17",
      naechster_schritt_text: "Angebot schicken",
      notes: "Interesse an Social und einer kleinen Website. Budget ungefähr 900 Euro im Monat.",
      ana: "Google-Profil unvollständig, Instagram unregelmäßig.",
      notizen: [{ datum: "2026-10-10", text: "KI-Check geschickt, Rückmeldung positiv." }],
      angebote: [{ nr: "A-0042", betreff: "Social-Betreuung", datum: "2026-10-10", status: "entwurf", netto: 900 }],
      rechnungen: [{ nr: "R-0014", betreff: "Setup", datum: "2026-10-16", faellig: "2026-10-30", status: "entwurf", netto: 450, overdue: false }],
      aufgaben: [{ titel: "Angebot schicken", status: "todo", prioritaet: "hoch", faellig: "2026-10-17", bot: "saley" }],
      termine: [{ titel: "Erstgespräch", datum: "2026-10-17", zeit: "09:30", typ: "termin" }],
    },
  };
}

export function demoFind(query) {
  const q = norm(query);
  const ranked = DEMO_CONTACTS.map((c) => ({ ...c, score: scoreName(q, c.firma, c.person) })).filter((c) => c.score >= 40).sort((a, b) => b.score - a.score);
  if (!ranked.length) return { kind: "none" };
  if (ranked.length > 1 && ranked[1].score >= 50 && ranked[0].score - ranked[1].score < 15) return { kind: "many", rows: ranked.slice(0, 6) };
  return { kind: "one", id: ranked[0].id, firma: ranked[0].firma };
}

export function demoMeeting() {
  return {
    kind: "meeting",
    tool: "meeting_recap",
    summary: "Gespräch bei Beispiel-Café speichern",
    lines: [
      "Kontakt: Beispiel-Café",
      "Notiz wird angehängt, bestehende Notizen bleiben: Budget etwa 900 Euro im Monat, Angebot nächste Woche.",
      "Aufgabe: Angebot schicken · Saley · offen · 2026-10-20",
      "Wiedervorlage: Angebot nachfassen am 2026-10-24",
    ],
    bot: "saley",
    data: {
      kontakt_id: "11111111-1111-4111-8111-111111111111",
      firma: "Beispiel-Café",
      neue_notiz: "Budget etwa 900 Euro im Monat, Angebot nächste Woche.",
      aufgaben: [{ titel: "Angebot schicken", status: "todo" }],
      wiedervorlage: { text: "Angebot nachfassen", datum: "2026-10-24" },
    },
  };
}

export const BOTS = [
  { id: "webby", name: "Webby", role: "Websites", letter: "W" },
  { id: "marky", name: "Marky", role: "Marketing / Social", letter: "M" },
  { id: "saley", name: "Saley", role: "Vertrieb", letter: "S" },
  { id: "cashy", name: "Cashy", role: "Finanzen", letter: "C" },
  { id: "developy", name: "Developy", role: "Software", letter: "D" },
];

export function botsView() {
  return {
    title: "Bots",
    meta: "Netzwerk",
    crm: "aufgaben",
    spoken: "Fünf Bots. Ein Auftrag wird eine Aufgabe und landet erst nach deiner Bestätigung.",
    rows: BOTS.map((b) => ({
      search: b.name.toLowerCase(),
      cells: { name: b.name, rolle: b.role, stand: "Bereit" },
      badge: { text: "Bereit", tone: "f" },
    })),
    columns: [
      { key: "name", label: "Bot" },
      { key: "rolle", label: "Rolle" },
      { key: "stand", label: "Stand" },
    ],
    kpis: [{ label: "Bots", value: String(BOTS.length) }],
    note: "Zuständig steht in der Aufgabe als erste Zeile. Es gibt keine eigene Bot-Tabelle.",
  };
}
