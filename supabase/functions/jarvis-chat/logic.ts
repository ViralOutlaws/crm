// Reine Planung/Validierung für Jarvis-Schreibwerkzeuge. Kein Netzwerk, keine Secrets.
// Jeder Plan wird serverseitig erneut geprüft, bevor etwas geschrieben wird.
import { revalidateCrm } from "./schema.ts";

export const BOTS: Record<string, { name: string; role: string; letter: string }> = {
  webby: { name: "Webby", role: "Websites", letter: "W" },
  marky: { name: "Marky", role: "Marketing / Social", letter: "M" },
  saley: { name: "Saley", role: "Vertrieb", letter: "S" },
  cashy: { name: "Cashy", role: "Finanzen", letter: "C" },
  developy: { name: "Developy", role: "Software", letter: "D" },
};

export const PIPE = ["lead", "erstgespraech", "angebot", "gewonnen", "verloren"] as const;
export const PIPE_LABEL: Record<string, string> = {
  lead: "Lead",
  erstgespraech: "Erstgespräch",
  angebot: "Angebot",
  gewonnen: "Gewonnen",
  verloren: "Verloren",
};
const QUELLEN = ["website", "ki-check", "empfehlung", "instagram", "google", "kaltakquise", "sonstiges"];
const POS_TYP = ["einmalig", "pauschal", "monatlich", "jaehrlich", "stuendlich", "taeglich", "nach-aufwand"];
const KAL_TYP = ["termin", "anruf", "aufgabe", "erinnerung", "sonstiges"];
export const FORMATE = ["Beitrag", "Karussell", "Story", "Reel"];
export const SAEULEN = ["Webdesign", "KI", "Performance-Marketing", "Ratgeber", "Referenz", "Kim & Allgäu"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT_ID = /^[A-Za-z0-9._-]{1,120}$/;

export type Plan = {
  kind: string;
  tool: string;
  table: string;
  action: "insert" | "update" | "delete";
  summary: string;
  lines: string[];
  bot: string | null;
  danger?: boolean;
  data: Record<string, unknown>;
};

export type Ctx = { today: string };

export const WRITE_TOOLS = new Set([
  "upsert_contact",
  "create_aufgabe",
  "create_wiedervorlage",
  "create_kal_event",
  "create_angebot",
  "create_rechnung",
  "save_social_post",
  "route_to_bot",
  "dispatch_to_bot",
  "meeting_recap",
  "create_retainer",
  "create_ausgabe",
  "create_roi",
  "set_aufgaben_status",
  "delete_aufgaben",
  "crm_insert",
  "crm_update",
  "crm_delete",
  "crm_undo",
]);

export function isWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name);
}

/** Anlegen und Status todo/done laufen sofort. Löschen und jeder andere Bereich bleiben eine Karte. */
export function runsWithoutCard(plan: { tool: string; kind: string; table: string; data?: Record<string, unknown> }): boolean {
  if (plan.tool === "delete_aufgaben" || plan.kind === "aufgabe_delete" || plan.kind === "crm_delete") return false;
  if (plan.tool === "create_aufgabe" && plan.kind === "aufgabe") return true;
  if (plan.tool === "set_aufgaben_status" && plan.kind === "aufgabe_status") return true;
  if (plan.kind === "crm_insert" && plan.table === "aufgaben") return true;
  if (plan.kind === "crm_update" && plan.table === "aufgaben") {
    const data = plan.data || {};
    const patch = data.patch && typeof data.patch === "object" && !Array.isArray(data.patch) ? data.patch as Record<string, unknown> : null;
    const virtual = data.virtual && typeof data.virtual === "object" && !Array.isArray(data.virtual) ? data.virtual as Record<string, unknown> : {};
    if (!patch || Object.keys(virtual).length) return false;
    const keys = Object.keys(patch);
    if (keys.length !== 1 || keys[0] !== "status") return false;
    return patch.status === "todo" || patch.status === "done";
  }
  return false;
}

export function openPanelFor(tool: string): string | null {
  switch (tool) {
    case "list_social_posts":
    case "save_social_post":
      return "content_week";
    case "list_invoices":
    case "create_rechnung":
      return "invoices";
    case "pipeline_summary":
    case "search_contacts":
    case "upsert_contact":
    case "create_angebot":
      return "pipeline";
    case "list_tasks_and_events":
    case "list_tasks":
    case "create_aufgabe":
    case "create_wiedervorlage":
    case "create_kal_event":
      return "agenda";
    case "morning_briefing":
      return "agenda";
    case "route_to_bot":
    case "dispatch_to_bot":
    case "list_bot_runs":
    case "get_bot_run":
      return "bots";
    case "customer_file":
      return "customer";
    case "open_area":
      return null;
    case "meeting_recap":
      return "customer";
    case "create_retainer":
      return "retainer";
    case "create_ausgabe":
      return "ausgaben";
    case "create_roi":
      return "roi";
    case "set_aufgaben_status":
    case "delete_aufgaben":
      return "aufgaben";
    default:
      return null;
  }
}

export function berlinToday(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export function berlinHour(d = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "numeric",
    hourCycle: "h23",
  }).format(d));
}

export function greeting(d = new Date()): string {
  const hour = berlinHour(d);
  if (hour >= 5 && hour < 11) return "Guten Morgen";
  if (hour >= 11 && hour < 18) return "Guten Tag";
  return "Guten Abend";
}

export function speakDate(iso: string, now = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return String(iso || "");
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const wd = WEEKDAYS[new Date(Date.UTC(y, month - 1, day)).getUTCDay()];
  const spoken = `${wd}, ${day}. ${MONTHS[month - 1]}`;
  return y === Number(berlinToday(now).slice(0, 4)) ? spoken : `${spoken} ${y}`;
}

export function deDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return String(iso ?? "");
  return `${m[3]}.${m[2]}.${m[1]}`;
}

export function briefingSpoken(
  d: { date: string; events: unknown[]; tasks: Array<{ overdue?: boolean }>; overdueInvoices: unknown[]; reminders: unknown[]; nextSteps: unknown[] },
  now = new Date(),
): string {
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

export function weekRange(today: string): { from: string; to: string } {
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = dt.getUTCDay() || 7;
  const mon = new Date(dt);
  mon.setUTCDate(dt.getUTCDate() - (wd - 1));
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { from: iso(mon), to: iso(sun) };
}

export function eur(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export function sumNetto(positions: Array<{ optional?: boolean; total?: number }>): number {
  const n = positions.reduce((s, p) => s + (p.optional ? 0 : Number(p.total) || 0), 0);
  return Math.round(n * 100) / 100;
}

export function botFromText(s: unknown): string | null {
  const m = String(s ?? "").match(/Zuständig:\s*([A-Za-zÄÖÜäöüß]+)/i);
  if (!m) return null;
  return matchBot(m[1]);
}

const SYSTEM = `Du bist Jarvis, der Assistent von Kim bei Viral Outlaws, einer Performance-Marketing-Agentur.
Du sprichst Deutsch, knapp und klar, wie ein HUD-Copilot. Über die Agentur sprichst du immer als „wir“, nie als Außenstehender.
Jede Anfrage ist genau eines: handeln, antworten, zeigen oder plaudern.
Handeln: Kim will Daten ändern. Eine Aufgabe anlegen oder als erledigt bzw. offen markieren speichert sofort, ohne Bestätigungskarte: create_aufgabe und set_aufgaben_status. Danach ein kurzer Satz, dass sie angelegt, erledigt oder wieder offen ist. Löschen bleibt eine Karte. Für alles andere lege sofort die Bestätigungskarte vor, mit sinnvollen Vorgaben (Entwurf, pausiert, todo, Datum aus dem Tagesblock). Frag nur, wenn ein Pflichtwert wirklich fehlt. Die Karte ist die Bestätigung, frag nicht doppelt. „Lösche alle Aufgaben“ ruft delete_aufgaben mit all und confirm true auf, ohne Rückfrage.
Antworten: Kim fragt nach Daten. Lies das passende Werkzeug und antworte nur daraus.
Zeigen: Kim will etwas sehen. Nutze open_area und beantworte die Frage aus den mitgelieferten Zeilen.
Plaudern: kurz, ohne Werkzeug.
Du erfindest niemals Zahlen, Namen, Beträge, Termine, Status oder Zitate. Nur was ein Werkzeug zurückgibt, darfst du als Tatsache sagen.
Wenn ein Werkzeug nichts liefert, ein Feld leer ist oder eine Abfrage scheitert, sagst du ausdrücklich, dass die Daten fehlen.
create_aufgabe und set_aufgaben_status speichern sofort. Ihr Werkzeug antwortet mit ausgeführt. Sag dann in einem kurzen Satz, dass die Aufgabe angelegt, erledigt oder wieder offen ist. Bitte dabei nicht um Bestätigung.
Alle anderen Schreibwerkzeuge speichern nichts von selbst. Sie legen Kim eine Bestätigung vor und antworten mit awaiting_confirmation.
Solange eine solche Karte offen ist, sagst du nicht, etwas sei angelegt, gespeichert oder gelöscht. Bitte um Bestätigung.
Sprich in kurzen Sätzen, ohne Markdown, ohne Aufzählungszeichen und ohne IDs. Ein Datum sprichst du als „Samstag, 17. Oktober“, einen Betrag als „1.250 Euro“.
Sag nie, ein Löschen oder eine andere Karte sei schon ausgeführt, bevor sie bestätigt wurde. Eine Aufgabe, die create_aufgabe oder set_aufgaben_status gerade gespeichert hat, darfst du als angelegt oder erledigt bezeichnen.
Du versendest keine E-Mails, keine Mahnungen und lädst keine Dateien und keine Social-Assets hoch. „Gesendet“ und „Bezahlt“ sind nur Status im CRM, kein Versand.
Kontakte haben eine Kundennummer wie KD-10001. Danach suchst du mit search_contacts oder customer_file. Angebots- und Rechnungsnummern setzt der Server. Du trägst keine Nummer ein und änderst keine schon vergebene Nummer.
Anlegen, Ändern und Löschen läuft über crm_insert, crm_update und crm_delete, mit Bestätigungskarte. Ausnahme: eine neue Zeile in aufgaben und eine Statusänderung dort auf todo oder done speichern sofort, ohne Karte. Tabellen: contacts, angebote, rechnungen, retainer, pakete, aufgaben, wiedervorlagen, kal_events, social_media_posts, ausgaben, roi_daten, ziele. workspace_id setzt der Server. settings, integration_secrets, Profile und Workspaces fasst du nicht an.
crm_delete zeigt Anzahl und Titel, die Karte ist rot. Eine einzelne Zeile braucht confirm nicht. Mehrere oder alle nur, wenn Kim das ausdrücklich sagt, dann confirm true. crm_update und crm_insert zeigen bei mehreren Zeilen Anzahl und Vorschau. all braucht ebenfalls confirm true.
Status Rechnung: entwurf, offen-rg (auch wenn Kim gesendet oder offen sagt), bezahlt, ueberfaellig. Angebot: entwurf, gesendet, akzeptiert, abgelehnt. Aufgabe: todo, doing, done. Ein Bot steht als Zeile „Zuständig: Name (Rolle).“ in der Beschreibung, ein Termin-Ende als „Bis: HH:MM“ in der Notiz.
„Rückgängig“ ruft crm_undo auf. Das macht die letzte protokollierte Änderung nach einer weiteren Karte rückgängig.
Die älteren Werkzeuge create_angebot und create_rechnung legen weiter nur Entwürfe an. Für einen anderen Status nimm crm_insert oder crm_update. Aufgaben anlegen und erledigen geht über create_aufgabe und set_aufgaben_status, sofort und ohne Karte. delete_aufgaben bleibt mit Karte.
Wenn eine Aktion nicht unterstützt ist oder ein Werkzeug einen Fehler meldet, sagst du das in einem klaren Satz. Du öffnest dann nicht ersatzweise ein Panel.
Fehlt der Status, bleiben Angebote und Rechnungen ein Entwurf und Social-Posts eine Idee. Sagt Kim einen anderen CRM-Status, übernimmst du ihn mit crm_insert oder crm_update.
Bots: Webby ist Website und Tech, Marky Marketing und Social, Saley Vertrieb und Leads, Cashy Finanzen und Rechnungen, Developy Software und Jarvis. „Webby soll eine Website für ein Yogastudio bauen“ ist dispatch_to_bot an Webby, eine Karte mit Bot und Auftrag, kein stiller Versand. route_to_bot und create_aufgabe mit Bot legen nur die CRM-Aufgabe an. Danach bietet die Oberfläche den Versand an. dispatch_to_bot nicht zusätzlich in derselben Runde aufrufen. list_bot_runs und get_bot_run lesen den Stand. Fehlt die Verbindung, bleibt der Lauf auf queued. Spracherkennung: Marki, Markie und Marky sind Marky. Sally und Sali sind Saley. Kashy und Cashi sind Cashy. Webbi und Weby sind Webby. Developi ist Developy.
Angebot, Rechnung, Notiz, Retainer, Termin oder Aufgabe zu einem genannten Kunden: such den Kontakt und nimm die ID. Nennt Kim einen Namen, speichere nicht ohne diesen Kunden. Mehrere Treffer: frag nach, rate nicht.
list_tasks filtert Aufgaben nach bot, due (today, overdue, week) und done. Die Zeile „Zuständig:“ zählt als Treffer. „Der Kunde von gestern“ ist search_contacts mit newest true.
„Bestätigen“, „passt so“ und „ja, mach“ gelten der offenen Karte. „Abbrechen“ und „nein“ verwerfen sie. Eine Löschkarte braucht das Wort „löschen“. Wiederhole die Karte dann nicht.
Beträge aus dem CRM sind netto, sofern das Werkzeug nicht ausdrücklich brutto nennt.
Öffne passende Werkzeuge, damit das HUD ein Panel zeigen kann.
Jeden CRM-Bereich öffnest du mit open_area: contacts, pipeline, angebote, rechnungen, retainer, pakete, aufgaben, wiedervorlagen, kalender, social, ausgaben, roi, ziele. Filter aus der Frage übernimmst du (only, status, quelle, query, from, to, view).
Auf Briefing oder den ersten Tagesstart nutzt du morning_briefing. Sprich das Feld summary in drei bis vier Sätzen und füge keine Zahlen hinzu. Die Begrüßung darin folgt der Uhr in Europe/Berlin: 5 bis 11 Uhr Guten Morgen, 11 bis 18 Uhr Guten Tag, sonst Guten Abend. Ein Datum sprichst du als „Samstag, 17. Oktober“, nie als 2026-10-17.
Auf „Was ist der Stand bei …“ nutzt du customer_file. Sprich das Feld summary in zwei Sätzen, ohne neue Zahlen.
Eine Gesprächsnotiz, ein Recap oder „merk dir das Telefonat“ geht an meeting_recap: eine einzige Bestätigung. Die Notiz wird angehängt und überschreibt nichts, dazu die vereinbarten Aufgaben und eine Wiedervorlage.
Retainer legst du über crm_insert an, standardmäßig pausiert, außer Kim sagt ausdrücklich aktiv. Paketpreise stehen in der Tabelle pakete, Zielwerte in ziele. Die Einstellungen mit dem Leistungskatalog fasst du nicht an.
upsert_contact.notes ersetzt die internen Notizen. Zum Anhängen neue_notiz oder meeting_recap nutzen.`;

type TextBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

export const MAX_TOOL_ROUNDS = 6;
export const HISTORY_IDLE_MS = 30 * 60 * 1000;

export function addIsoDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function weekdayName(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

const WEEKDAY_INDEX: Record<string, number> = {
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6,
};

export function resolveDayPhrase(today: string, phrase: string): string | null {
  const s = String(phrase || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (/\buebermorgen\b/.test(s)) return addIsoDays(today, 2);
  if (/\bgestern\b/.test(s)) return addIsoDays(today, -1);
  if (/\bmorgen\b/.test(s)) return addIsoDays(today, 1);
  if (/\bheute\b/.test(s)) return today;
  const hit = /\b(naechsten|naechster|naechste|kommenden|kommende|diesen|diese|diesem)\s+(sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag)\b/.exec(s);
  if (!hit) return null;
  const want = WEEKDAY_INDEX[hit[2]];
  const [y, m, d] = today.split("-").map(Number);
  const current = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  let delta = (want - current + 7) % 7;
  const upcoming = hit[1].startsWith("naechst") || hit[1].startsWith("kommend");
  if (upcoming && delta === 0) delta = 7;
  return addIsoDays(today, delta);
}

export function upcomingDays(today: string, count = 14): string {
  const parts: string[] = [];
  for (let i = 0; i <= count; i++) {
    const iso = addIsoDays(today, i);
    const [y, m, d] = iso.split("-").map(Number);
    const year = y === Number(today.slice(0, 4)) ? "" : ` ${y}`;
    parts.push(`${weekdayName(iso)}, ${d}. ${MONTHS[m - 1]}${year} = ${iso}`);
  }
  return parts.join("; ");
}

export function berlinClock(d = new Date()): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

export function systemBlocks(today: string, name: string, now = new Date()): TextBlock[] {
  return [
    { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: `Heute ist ${speakDate(today, now)}, ${berlinClock(now)} Uhr (Europe/Berlin). Internes Datum nur für Filter: ${today}. Der angemeldete Nutzer heißt ${name || "Kim"}. Nächste Tage, ISO nur für Werkzeuge: ${upcomingDays(today, 14)}. „nächsten Dienstag“ ist der nächste Dienstag nach heute.`,
    },
  ];
}

type ToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  cache_control?: { type: "ephemeral" };
};

const TOOLS: ToolDef[] = [
  {
    name: "search_contacts",
    description: "Sucht Kontakte und Leads im CRM (Firma, Person, E-Mail, Ort, Kundennummer wie KD-10001). Optional nach Pipeline-Phase filtern. Nur lesen.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", description: "Suchtext, kann leer sein" },
        status: { type: "string", description: "lead | erstgespraech | angebot | gewonnen | verloren" },
        newest: { type: "boolean", description: "true für die zuletzt angelegten Kontakte, zum Beispiel der Kunde von gestern" },
        limit: { type: "integer" },
      },
    },
  },
  {
    name: "pipeline_summary",
    description: "Zählt Kontakte je Pipeline-Phase und summiert den offenen Deal-Wert (netto). Nur lesen.",
    input_schema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "list_invoices",
    description: "Listet Rechnungen. scope open = offen und überfällig (ohne Entwürfe und bezahlte), overdue = nur überfällig, drafts = Entwürfe. Beträge netto. Nur lesen.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { scope: { type: "string", description: "open | overdue | drafts" } },
    },
  },
  {
    name: "list_tasks_and_events",
    description: "Aufgaben, Kalender und Wiedervorlagen für heute oder diese Woche (Montag–Sonntag, Europe/Berlin). Überfällige offene Aufgaben gehören zu heute. Nur lesen.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        scope: { type: "string", description: "today | week" },
        from: { type: "string", description: "YYYY-MM-DD, optional" },
        to: { type: "string", description: "YYYY-MM-DD, optional" },
      },
    },
  },
  {
    name: "list_social_posts",
    description: "Geplante Social-Media-Posts in einem Datumsbereich. Ohne Datum: aktuelle Woche. Nur lesen.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        from: { type: "string" },
        to: { type: "string" },
      },
    },
  },
  {
    name: "upsert_contact",
    description: "Legt einen Kontakt/Lead an oder aktualisiert ihn (Firma, Phase, Notizen, nächster Schritt, Deal-Wert). Speichert erst nach Kims Bestätigung. Kein Löschen, kein Archivieren.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", description: "UUID zum Aktualisieren, sonst neu" },
        firma: { type: "string" },
        person: { type: "string" },
        email: { type: "string" },
        tel: { type: "string" },
        str: { type: "string" },
        plz: { type: "string" },
        ort: { type: "string" },
        web: { type: "string" },
        instagram: { type: "string" },
        facebook: { type: "string" },
        gbusiness: { type: "string" },
        branche: { type: "string" },
        status: { type: "string", description: "lead | erstgespraech | angebot | gewonnen | verloren" },
        quelle: { type: "string", description: "website | ki-check | empfehlung | instagram | google | kaltakquise | sonstiges" },
        deal_wert: { type: "number", description: "Euro netto" },
        naechster_schritt: { type: "string", description: "YYYY-MM-DD" },
        naechster_schritt_text: { type: "string" },
        notes: { type: "string", description: "Ersetzt die internen Notizen" },
        ana: { type: "string" },
        neue_notiz: { type: "string", description: "Hängt eine Notiz an die Timeline an" },
      },
    },
  },
  {
    name: "create_aufgabe",
    description: "Legt eine Aufgabe sofort im Kanban an, Status immer Offen, ohne Bestätigungskarte. Optional einem Bot zuweisen (webby, marky, saley, cashy, developy). Erledigen geht über set_aufgaben_status, Löschen über delete_aufgaben und bleibt eine Karte.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["titel"],
      properties: {
        titel: { type: "string" },
        beschreibung: { type: "string" },
        prioritaet: { type: "string", description: "hoch | normal | niedrig" },
        faellig: { type: "string" },
        kontakt_id: { type: "string" },
        bot: { type: "string" },
      },
    },
  },
  {
    name: "create_wiedervorlage",
    description: "Legt eine Wiedervorlage/Erinnerung an (immer unerledigt). Erst nach Bestätigung. Kein Löschen.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["text", "datum"],
      properties: {
        text: { type: "string" },
        datum: { type: "string" },
        kontakt_id: { type: "string" },
      },
    },
  },
  {
    name: "create_kal_event",
    description: "Legt einen Kalendereintrag an. Typ: termin, anruf, aufgabe, erinnerung, sonstiges. Erst nach Bestätigung. Kein Löschen.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["titel", "datum"],
      properties: {
        titel: { type: "string" },
        datum: { type: "string" },
        zeit: { type: "string", description: "HH:MM" },
        bis: { type: "string", description: "HH:MM, landet in der Notiz" },
        typ: { type: "string" },
        kontakt_id: { type: "string" },
        notiz: { type: "string" },
      },
    },
  },
  {
    name: "create_angebot",
    description: "Legt ein Angebot ausschließlich als Entwurf an (Status entwurf). Wird nicht versendet. Positionen mit desc, qty, price, optional typ. Erst nach Bestätigung.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["betreff", "positions"],
      properties: {
        kunde_id: { type: "string" },
        betreff: { type: "string" },
        datum: { type: "string" },
        valid_bis: { type: "string" },
        notes: { type: "string" },
        status: { type: "string", description: "Nur entwurf erlaubt" },
        positions: { type: "array" },
      },
    },
  },
  {
    name: "create_rechnung",
    description: "Legt eine Rechnung ausschließlich als Entwurf an (Status entwurf). Nicht offen, nicht versendet, nicht bezahlt, keine E-Mail. Erst nach Bestätigung.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["betreff", "positions"],
      properties: {
        kunde_id: { type: "string" },
        betreff: { type: "string" },
        datum: { type: "string" },
        faellig: { type: "string" },
        notes: { type: "string" },
        status: { type: "string" },
        positions: { type: "array" },
      },
    },
  },
  {
    name: "save_social_post",
    description: "Legt einen Social-Media-Post als Entwurf an (CRM-Status Idee) oder aktualisiert einen bestehenden, der noch nicht veröffentlicht ist. Status Veröffentlicht kann Jarvis nicht setzen. Erst nach Bestätigung.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        external_id: { type: "string" },
        datum: { type: "string" },
        uhrzeit: { type: "string" },
        format: { type: "string", description: "Beitrag | Karussell | Story | Reel" },
        saeule: { type: "string" },
        thema: { type: "string" },
        hook: { type: "string" },
        caption: { type: "string" },
        hashtags: {},
        cta: { type: "string" },
        visual_hinweise: { type: "string" },
        status: { type: "string", description: "Nur Entwurf/Idee" },
      },
    },
  },
  {
    name: "route_to_bot",
    description: "Übergibt einen Auftrag an einen Bot, indem eine CRM-Aufgabe für diesen Bot angelegt wird. Erst nach Kims Bestätigung, kein direkter Versand.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["bot", "auftrag"],
      properties: {
        bot: { type: "string", description: "webby | marky | saley | cashy | developy" },
        auftrag: { type: "string" },
        details: { type: "string" },
        faellig: { type: "string" },
        kontakt_id: { type: "string" },
      },
    },
  },
];

const EXTRA_TOOLS: ToolDef[] = [
  {
    name: "dispatch_to_bot",
    description: "Schickt einen Auftrag an einen Grok-Bot: webby Website/Tech, marky Marketing/Social, saley Vertrieb/Leads, cashy Finanzen/Rechnungen, developy Software/Jarvis. Die Karte zeigt Bot und Auftrag. Erst nach Bestätigung. „Webby soll eine Website für ein Yogastudio bauen“ ist dieses Werkzeug. Nicht zusammen mit create_aufgabe in derselben Runde.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["bot", "title"],
      properties: {
        bot: { type: "string" },
        title: { type: "string" },
        instructions: { type: "string" },
        aufgabe_id: { type: "string" },
        kontakt_id: { type: "string" },
      },
    },
  },
  {
    name: "list_bot_runs",
    description: "Liest die letzten Bot-Läufe. Optional bot und status (queued, sent, in_arbeit, erledigt, blockiert, fehler). Nur lesen.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        bot: { type: "string" },
        status: { type: "string" },
      },
    },
  },
  {
    name: "get_bot_run",
    description: "Liest einen Bot-Lauf mit Status, Ergebnis, Links und dem Ereignisprotokoll. Nur lesen.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["run_id"],
      properties: { run_id: { type: "string" } },
    },
  },
  {
    name: "list_tasks",
    description: "Listet bis zu 25 Aufgaben. Filter: bot (webby, marky, saley, cashy, developy, auch die gesprochenen Varianten), due today|overdue|week, done true|false, query für Titel oder Zuständig-Zeile. Nur lesen.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        bot: { type: "string" },
        due: { type: "string", description: "today | overdue | week" },
        done: { type: "boolean" },
        query: { type: "string" },
      },
    },
  },
  {
    name: "open_area",
    description: "Öffnet einen CRM-Bereich im HUD und liefert die ersten etwa 25 Zeilen zum Antworten. area: contacts, pipeline, angebote, rechnungen, retainer, pakete, aufgaben, wiedervorlagen, kalender, social, ausgaben, roi, ziele. Filter optional: query, status, quelle, only (overdue|open|drafts), from, to, view (week|month). Nur lesen.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["area"],
      properties: {
        area: { type: "string" },
        query: { type: "string" },
        status: { type: "string" },
        quelle: { type: "string" },
        only: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
        view: { type: "string" },
      },
    },
  },
  {
    name: "morning_briefing",
    description: "Tagesbriefing: Termine heute, fällige und überfällige Aufgaben, überfällige Rechnungen, fällige Wiedervorlagen, Kontakte mit fälligem naechster_schritt. Feld summary in 3–4 Sätzen sprechen. Nur lesen.",
    input_schema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "customer_file",
    description: "Kunden-Akte. Findet einen Kontakt unscharf über firma/person oder per kontakt_id. Liefert Phase, Angebote, Rechnungen, Notizen, offene Aufgaben, letzte Termine. Feld summary in zwei Sätzen sprechen. Nur lesen.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string" },
        kontakt_id: { type: "string" },
      },
    },
  },
  {
    name: "meeting_recap",
    description: "Gesprächsnotiz. Eine Bestätigung für: Notiz anhängen (nichts überschreiben), vereinbarte Aufgaben und eine Wiedervorlage. kunde oder kontakt_id, notiz, aufgaben[], wiedervorlage {text, datum}.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["notiz", "wiedervorlage"],
      properties: {
        kunde: { type: "string" },
        kontakt_id: { type: "string" },
        firma: { type: "string" },
        notiz: { type: "string" },
        aufgaben: { type: "array" },
        wiedervorlage: { type: "object" },
      },
    },
  },
  {
    name: "create_retainer",
    description: "Legt einen Retainer an. Ohne Status ist er pausiert und wird nicht abgerechnet. Erst nach Bestätigung. Kein Löschen, keine Rechnung.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["paket", "betrag"],
      properties: {
        kunde_id: { type: "string" },
        paket: { type: "string" },
        betrag: { type: "number" },
        start_datum: { type: "string" },
        next_datum: { type: "string" },
        abrechnungstag: { type: "string" },
        leistungen: { type: "string" },
        status: { type: "string", description: "pausiert (Standard) | aktiv | gekuendigt" },
      },
    },
  },
  {
    name: "create_ausgabe",
    description: "Erfasst eine Ausgabe oder Einnahme. Erst nach Bestätigung. Verschickt kein Geld.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["beschreibung", "datum", "netto"],
      properties: {
        typ: { type: "string", description: "ausgabe | einnahme" },
        datum: { type: "string" },
        beschreibung: { type: "string" },
        kategorie: { type: "string" },
        netto: { type: "number" },
        mwst_pct: { type: "number" },
        notiz: { type: "string" },
      },
    },
  },
  {
    name: "create_roi",
    description: "Legt eine ROI-Zeile an (Kanal, Monat, Jahr, Budget, Kennzahlen). Erst nach Bestätigung.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["monat", "jahr"],
      properties: {
        kunde_id: { type: "string" },
        kanal: { type: "string" },
        monat: { type: "integer" },
        jahr: { type: "integer" },
        budget: { type: "number" },
        klicks: { type: "number" },
        leads: { type: "number" },
        abschluesse: { type: "number" },
        umsatz: { type: "number" },
        notiz: { type: "string" },
      },
    },
  },
  {
    name: "set_aufgaben_status",
    description: "Markiert Aufgaben sofort als erledigt (done) oder wieder offen (todo), eine oder mehrere, ohne Bestätigungskarte. Filter: id, ids, query (Titel), only (open|done|doing|overdue), all. Kein Löschen.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["status"],
      properties: {
        status: { type: "string", description: "done (erledigt) oder todo (offen)" },
        id: { type: "string" },
        ids: { type: "array", items: { type: "string" } },
        query: { type: "string", description: "Teil des Titels" },
        only: { type: "string", description: "open | done | doing | overdue" },
        all: { type: "boolean", description: "Alle Aufgaben in diesem Statuswechsel, nur wenn Kim alle meint" },
      },
    },
  },
  {
    name: "delete_aufgaben",
    description: "Löscht Aufgaben endgültig, eine, einen Filter oder alle. Die Karte listet Anzahl und Titel. confirm muss true sein, wenn es mehrere oder alle sind und Kim das ausdrücklich gesagt hat. Ohne confirm bei Menge oder alle lehnt das Werkzeug ab. Nicht für Kontakte, Rechnungen oder andere Tabellen.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        ids: { type: "array", items: { type: "string" } },
        query: { type: "string", description: "Teil des Titels" },
        only: { type: "string", description: "open | done | doing | overdue" },
        all: { type: "boolean", description: "Wirklich jede Aufgabe. Nur mit confirm true." },
        confirm: { type: "boolean", description: "true nur bei ausdrücklichem Mehrfach- oder Alle-Löschen" },
      },
    },
  },
  {
    name: "crm_insert",
    description: "Legt eine oder mehrere CRM-Zeilen an (rows, höchstens 30). table: contacts, angebote, rechnungen, retainer, pakete, aufgaben, wiedervorlagen, kal_events, social_media_posts, ausgaben, roi_daten, ziele. Kein workspace_id, keine settings, keine Geheimnisse, keine Datei-Uploads. Aufgaben: bot webby|marky|saley|cashy|developy, und eine neue Aufgabe speichert sofort ohne Karte. Termine: bis als HH:MM. Status nur die CRM-Werte, Rechnung gesendet heißt offen-rg. Außer bei aufgaben erst die Bestätigungskarte.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["table", "rows"],
      properties: {
        table: { type: "string" },
        rows: { type: "array", items: { type: "object" } },
      },
    },
  },
  {
    name: "crm_update",
    description: "Ändert bestehende Zeilen. id, ids, query (Titel, Firma, Betreff) oder all. all nur mit confirm true, und nur wenn Kim alle meint. patch enthält nur die Felder, die sich ändern. Mehrere Treffer: Karte mit Anzahl und Vorschau. Kein Versand, kein Upload, keine settings.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["table", "patch"],
      properties: {
        table: { type: "string" },
        id: { type: "string" },
        ids: { type: "array", items: { type: "string" } },
        query: { type: "string" },
        all: { type: "boolean" },
        confirm: { type: "boolean" },
        patch: { type: "object" },
      },
    },
  },
  {
    name: "crm_delete",
    description: "Löscht Zeilen endgültig. Die Karte ist rot und nennt Anzahl und Titel. confirm muss true sein, wenn es mehrere oder alle sind und Kim das ausdrücklich gesagt hat. Eine einzelne ID braucht confirm nicht. Nicht für settings oder Geheimnisse.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["table"],
      properties: {
        table: { type: "string" },
        id: { type: "string" },
        ids: { type: "array", items: { type: "string" } },
        query: { type: "string" },
        all: { type: "boolean" },
        confirm: { type: "boolean" },
      },
    },
  },
  {
    name: "crm_undo",
    description: "Macht die letzte protokollierte Jarvis-Änderung rückgängig, nach einer Bestätigungskarte. Nur wenn Kim Rückgängig sagt. Ohne Argumente.",
    input_schema: { type: "object", additionalProperties: false, properties: {} },
  },
];

export function anthropicTools(): ToolDef[] {
  const all = [...TOOLS.slice(0, -1), ...EXTRA_TOOLS, TOOLS[TOOLS.length - 1]];
  return all.map((t, i) => i === all.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : { ...t });
}

export function planFromTool(name: string, input: unknown, ctx: Ctx): Plan {
  const o = asObj(input);
  switch (name) {
    case "upsert_contact":
      return planContact(o);
    case "create_aufgabe":
      return planAufgabe(o, "create_aufgabe");
    case "route_to_bot":
      return planRoute(o);
    case "dispatch_to_bot":
      return planDispatch(o);
    case "create_wiedervorlage":
      return planWv(o);
    case "create_kal_event":
      return planEvent(o);
    case "create_angebot":
      return planDoc(o, "angebot", ctx);
    case "create_rechnung":
      return planDoc(o, "rechnung", ctx);
    case "save_social_post":
      return planSocial(o);
    case "meeting_recap":
      return planMeeting(o);
    case "create_retainer":
      return planRetainer(o);
    case "create_ausgabe":
      return planAusgabe(o);
    case "create_roi":
      return planRoi(o);
    default:
      throw new Error("Unbekanntes Schreibwerkzeug. Löschen, Versand und Bezahl-Status sind nicht erlaubt.");
  }
}

export function revalidate(input: unknown, ctx: Ctx): Plan {
  const p = asObj(input);
  const kind = String(p.kind ?? "");
  const data = asObj(p.data);
  switch (kind) {
    case "contact_insert": {
      const copy = { ...data };
      delete copy.id;
      return planContact(copy);
    }
    case "contact_update":
      return planContact(data);
    case "aufgabe":
      return planAufgabe({
        titel: data.titel,
        beschreibung: stripBotLine(String(data.beschreibung ?? "")),
        prioritaet: data.prioritaet,
        faellig: data.faellig,
        kontakt_id: data.kontakt_id,
        bot: p.bot ?? undefined,
      }, p.tool === "route_to_bot" ? "route_to_bot" : "create_aufgabe");
    case "wiedervorlage":
      return planWv(data);
    case "kal_event":
      return planEvent(data);
    case "angebot":
      return planDoc(data, "angebot", ctx);
    case "rechnung":
      return planDoc(data, "rechnung", ctx);
    case "meeting":
      return planMeeting({
        ...data,
        aufgaben: Array.isArray(data.aufgaben)
          ? data.aufgaben.map((item) => {
            const t = asObj(item);
            return { ...t, beschreibung: stripBotLine(String(t.beschreibung ?? "")), bot: t.bot };
          })
          : [],
      });
    case "retainer":
      return planRetainer(data);
    case "ausgabe":
      return planAusgabe(data);
    case "roi":
      return planRoi(data);
    case "aufgabe_status":
      return planAufgabeChange(selectorFromPlan(data), rowsFromPlan(data), { op: "status", status: normAufgabeStatus(data.status) }, true);
    case "aufgabe_delete":
      return planAufgabeChange(selectorFromPlan(data), rowsFromPlan(data), { op: "delete" }, true);
    case "crm_insert":
    case "crm_update":
    case "crm_delete":
    case "crm_undo":
      return revalidateCrm(kind, data, ctx.today);
    case "bot_dispatch":
      return planDispatch(data);
    case "social_insert":
    case "social_update": {
      const copy = { ...data };
      if (kind === "social_insert") {
        delete copy.id;
        delete copy.external_id;
      }
      delete copy.keep_status;
      delete copy.status;
      return planSocial(copy);
    }
    default:
      throw new Error("Diese Aktion ist nicht erlaubt.");
  }
}

export function socialUpdateAllowed(status: unknown): boolean {
  return String(status ?? "") !== "Veröffentlicht";
}

function planMeeting(o: Record<string, unknown>): Plan {
  const kontakt_id = optUuid(o, "kontakt_id");
  if (!kontakt_id) throw new Error("Kontakt fehlt. Bitte Firma oder ID angeben.");
  const firma = clip(o.firma, 200) || "Kontakt";
  const neue_notiz = clip(o.notiz ?? o.neue_notiz, 4000);
  if (!neue_notiz) throw new Error("Gesprächsnotiz fehlt.");
  const raw = o.aufgaben === undefined ? [] : o.aufgaben;
  if (!Array.isArray(raw)) throw new Error("Aufgaben müssen eine Liste sein.");
  if (raw.length > 6) throw new Error("Maximal 6 Aufgaben pro Gespräch.");
  const aufgaben = raw.map((item) => {
    const planned = planAufgabe({ ...asObj(item), kontakt_id }, "create_aufgabe");
    return {
      titel: planned.data.titel,
      beschreibung: planned.data.beschreibung,
      prioritaet: planned.data.prioritaet,
      faellig: planned.data.faellig,
      kontakt_id,
      bot: planned.bot,
      status: "todo",
    };
  });
  const wvIn = asObj(o.wiedervorlage ?? { text: o.wv_text, datum: o.wv_datum });
  const wv = planWv({ ...wvIn, kontakt_id });
  const lines = [
    `Kontakt: ${firma}`,
    `Notiz wird angehängt, bestehende Notizen bleiben: ${neue_notiz.slice(0, 180)}`,
    ...(aufgaben.length
      ? aufgaben.map((a) => `Aufgabe: ${a.titel}${a.bot ? " · " + BOTS[String(a.bot)].name : ""} · offen${a.faellig ? " · " + a.faellig : ""}`)
      : ["Keine neuen Aufgaben"]),
    `Wiedervorlage: ${wv.data.text} am ${wv.data.datum}`,
  ];
  return {
    kind: "meeting",
    tool: "meeting_recap",
    table: "contacts",
    action: "update",
    summary: "Gespräch bei " + firma + " speichern",
    lines,
    bot: aufgaben.find((a) => a.bot)?.bot ? String(aufgaben.find((a) => a.bot)?.bot) : null,
    data: {
      kontakt_id,
      firma,
      neue_notiz,
      aufgaben,
      wiedervorlage: { text: wv.data.text, datum: wv.data.datum, kontakt_id },
    },
  };
}

function planRetainer(o: Record<string, unknown>): Plan {
  const paket = reqStr(o, "paket", 200, "Paket");
  const betrag = num(o.betrag, 0, 1_000_000, "Betrag");
  const kunde_id = o.kunde_id ? optUuid(o, "kunde_id") : null;
  const status = normRetainerStatus(o.status);
  const start_datum = o.start_datum ? optDate(o, "start_datum") : null;
  const next_datum = o.next_datum ? optDate(o, "next_datum") : null;
  let tag = "1";
  if (o.abrechnungstag !== undefined && o.abrechnungstag !== null && String(o.abrechnungstag).trim() !== "") {
    tag = String(o.abrechnungstag).toLowerCase().trim();
    if (!["1", "5", "10", "15", "20", "25", "letzter"].includes(tag)) throw new Error("Rechnungstag ungültig.");
  }
  const leistungen = o.leistungen !== undefined ? clip(o.leistungen, 4000) : null;
  return {
    kind: "retainer",
    tool: "create_retainer",
    table: "retainer",
    action: "insert",
    summary: "Retainer anlegen",
    lines: [
      `Paket: ${paket}`,
      `Betrag: ${eur(betrag)} / Monat`,
      `Status: ${status}${status === "aktiv" ? " (zählt im CRM als aktiver Retainer)" : " (pausiert, keine Abrechnung)"}`,
    ],
    bot: null,
    data: { kunde_id, paket, betrag, start_datum, abrechnungstag: tag, next_datum, status, leistungen },
  };
}

function planAusgabe(o: Record<string, unknown>): Plan {
  const beschreibung = reqStr(o, "beschreibung", 300, "Beschreibung");
  const datum = optDate(o, "datum");
  if (!datum) throw new Error("Datum fehlt.");
  const typ = String(o.typ ?? "ausgabe").toLowerCase() === "einnahme" ? "einnahme" : "ausgabe";
  const netto = num(o.netto ?? o.betrag, 0, 10_000_000, "Netto");
  const mwst_pct = o.mwst_pct === undefined || o.mwst_pct === null || o.mwst_pct === "" ? 19 : num(o.mwst_pct, 0, 100, "MwSt");
  const mwst_betrag = Math.round(netto * mwst_pct) / 100;
  const brutto = Math.round((netto + mwst_betrag) * 100) / 100;
  const kategorie = o.kategorie !== undefined ? clip(o.kategorie, 80) : null;
  const notiz = o.notiz !== undefined ? clip(o.notiz, 2000) : null;
  return {
    kind: "ausgabe",
    tool: "create_ausgabe",
    table: "ausgaben",
    action: "insert",
    summary: typ === "einnahme" ? "Einnahme erfassen" : "Ausgabe erfassen",
    lines: [
      `${typ === "einnahme" ? "Einnahme" : "Ausgabe"}: ${beschreibung}`,
      `Datum: ${datum}`,
      `Netto: ${eur(netto)}`,
      `Brutto: ${eur(brutto)} (${mwst_pct} % MwSt.)`,
    ],
    bot: null,
    data: { typ, datum, beschreibung, kategorie, netto, mwst_pct, mwst_betrag, brutto, notiz },
  };
}

function planRoi(o: Record<string, unknown>): Plan {
  const kanalRaw = String(o.kanal ?? "google").toLowerCase().trim();
  const channels = ["google", "meta", "instagram", "seo", "sonstiges"];
  if (!channels.includes(kanalRaw)) throw new Error("Kanal: google, meta, instagram, seo oder sonstiges.");
  const monat = num(o.monat, 1, 12, "Monat");
  const jahr = num(o.jahr, 2000, 2100, "Jahr");
  const budget = num(o.budget ?? 0, 0, 10_000_000, "Budget");
  const klicks = num(o.klicks ?? 0, 0, 100_000_000, "Klicks");
  const leads = num(o.leads ?? 0, 0, 1_000_000, "Leads");
  const abschluesse = num(o.abschluesse ?? 0, 0, 1_000_000, "Abschlüsse");
  const umsatz = num(o.umsatz ?? 0, 0, 100_000_000, "Umsatz");
  const kunde_id = o.kunde_id ? optUuid(o, "kunde_id") : null;
  const notiz = o.notiz !== undefined ? clip(o.notiz, 2000) : null;
  const roas = budget > 0 ? Math.round((umsatz / budget) * 100) / 100 : 0;
  const roi = budget > 0 ? Math.round(((umsatz - budget) / budget) * 10000) / 100 : 0;
  const cpl = leads > 0 ? Math.round((budget / leads) * 100) / 100 : 0;
  return {
    kind: "roi",
    tool: "create_roi",
    table: "roi_daten",
    action: "insert",
    summary: "ROI-Zeile anlegen",
    lines: [
      `Kanal: ${kanalRaw}`,
      `Zeitraum: ${monat}/${jahr}`,
      `Budget: ${eur(budget)}`,
      `Umsatz: ${eur(umsatz)}`,
      `ROAS: ${roas}`,
    ],
    bot: null,
    data: { kunde_id, kanal: kanalRaw, monat, jahr, budget, klicks, leads, abschluesse, umsatz, roas, roi, cpl, notiz },
  };
}

function normRetainerStatus(v: unknown): string {
  const s = String(v ?? "").toLowerCase().trim();
  if (!s) return "pausiert";
  if (s === "aktiv" || s === "pausiert" || s === "gekuendigt") return s;
  throw new Error("Retainer-Status: aktiv, pausiert oder gekuendigt.");
}

function planContact(o: Record<string, unknown>): Plan {
  const id = o.id ? optUuid(o, "id") : null;
  const data: Record<string, unknown> = {};
  const lines: string[] = [];
  if (id) data.id = id;
  if (o.firma !== undefined) {
    const firma = clip(o.firma, 200);
    if (!firma) throw new Error("Firma darf nicht leer sein.");
    data.firma = firma;
    lines.push(`Firma: ${firma}`);
  }
  const fields: Array<[string, number, string]> = [
    ["person", 160, "Person"],
    ["email", 200, "E-Mail"],
    ["tel", 60, "Telefon"],
    ["str", 200, "Straße"],
    ["plz", 16, "PLZ"],
    ["ort", 120, "Ort"],
    ["web", 300, "Web"],
    ["instagram", 160, "Instagram"],
    ["facebook", 200, "Facebook"],
    ["gbusiness", 300, "Google Business"],
    ["branche", 120, "Branche"],
    ["notes", 5000, "Interne Notizen"],
    ["ana", 5000, "Analyse"],
    ["naechster_schritt_text", 300, "Nächster Schritt"],
  ];
  for (const [key, max, label] of fields) {
    if (o[key] === undefined) continue;
    const s = clip(o[key], max);
    data[key] = s;
    if (s) lines.push(`${label}: ${s.slice(0, 160)}`);
  }
  if (typeof data.email === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    throw new Error("E-Mail ist ungültig.");
  }
  if (o.status !== undefined && o.status !== null && String(o.status).trim() !== "") {
    const st = normPipe(o.status);
    data.status = st;
    lines.push(`Phase: ${PIPE_LABEL[st]}`);
  }
  if (o.quelle !== undefined && o.quelle !== null && String(o.quelle).trim() !== "") {
    const q = String(o.quelle).toLowerCase().trim();
    if (!QUELLEN.includes(q)) throw new Error("Unbekannte Quelle.");
    data.quelle = q;
    lines.push(`Quelle: ${q}`);
  }
  if (o.deal_wert !== undefined) {
    if (o.deal_wert === null || o.deal_wert === "") data.deal_wert = null;
    else {
      data.deal_wert = num(o.deal_wert, 0, 10_000_000, "Deal-Wert");
      lines.push(`Deal-Wert: ${eur(Number(data.deal_wert))} netto`);
    }
  }
  if (o.naechster_schritt !== undefined) {
    if (o.naechster_schritt === null || o.naechster_schritt === "") data.naechster_schritt = null;
    else {
      data.naechster_schritt = optDate(o, "naechster_schritt");
      lines.push(`Nächster Schritt am: ${data.naechster_schritt}`);
    }
  }
  if (o.neue_notiz !== undefined) {
    const n = clip(o.neue_notiz, 5000);
    if (n) {
      data.neue_notiz = n;
      lines.push(`Neue Notiz: ${n.slice(0, 160)}`);
    }
  }
  if (!id) {
    if (typeof data.firma !== "string") throw new Error("Firma fehlt.");
    if (!data.status) {
      data.status = "lead";
      lines.push("Phase: Lead");
    }
    lines.unshift(`Neuer Kontakt: ${data.firma}`);
    return {
      kind: "contact_insert",
      tool: "upsert_contact",
      table: "contacts",
      action: "insert",
      summary: "Neuen Kontakt anlegen",
      lines,
      bot: null,
      data,
    };
  }
  if (Object.keys(data).length <= 1) throw new Error("Keine Felder zum Aktualisieren.");
  lines.unshift("Bestehenden Kontakt aktualisieren");
  return {
    kind: "contact_update",
    tool: "upsert_contact",
    table: "contacts",
    action: "update",
    summary: "Kontakt aktualisieren",
    lines,
    bot: null,
    data,
  };
}

function planAufgabe(o: Record<string, unknown>, tool: string): Plan {
  const bot = o.bot !== undefined && o.bot !== null && String(o.bot).trim() !== "" ? normBot(o.bot) : null;
  const titel = reqStr(o, "titel", 300, "Titel");
  const extra = o.beschreibung !== undefined ? clip(o.beschreibung, 4000) : null;
  const parts: string[] = [];
  if (bot) parts.push(`Zuständig: ${BOTS[bot].name} (${BOTS[bot].role}).`);
  if (extra) parts.push(extra);
  const beschreibung = parts.join("\n").slice(0, 5000);
  const prioritaet = o.prioritaet !== undefined && o.prioritaet !== null && String(o.prioritaet).trim() !== ""
    ? normPrio(o.prioritaet)
    : "normal";
  const faellig = o.faellig !== undefined && o.faellig !== null && String(o.faellig).trim() !== ""
    ? optDate(o, "faellig")
    : null;
  const kontakt_id = o.kontakt_id ? optUuid(o, "kontakt_id") : null;
  const lines = [
    `Aufgabe: ${titel}`,
    bot ? `Zuständig: ${BOTS[bot].name} (${BOTS[bot].role})` : "Zuständig: niemand",
    `Priorität: ${prioritaet}`,
    `Fällig: ${faellig ?? "ohne Datum"}`,
    "Status: Offen",
  ];
  if (extra) lines.push(`Notiz: ${extra.slice(0, 180)}`);
  return {
    kind: "aufgabe",
    tool,
    table: "aufgaben",
    action: "insert",
    summary: bot ? `Aufgabe an ${BOTS[bot].name}` : "Aufgabe anlegen",
    lines,
    bot,
    data: { titel, beschreibung, status: "todo", prioritaet, faellig, kontakt_id },
  };
}

export const AUFGABE_MATCH_LIMIT = 300;

export type AufgabeScope = "single" | "bulk" | "all";

export type AufgabeSelector = {
  id: string | null;
  ids: string[];
  query: string | null;
  only: "open" | "done" | "doing" | "overdue" | null;
  bot: string | null;
  all: boolean;
  confirm: boolean;
  scope: AufgabeScope;
};

export type AufgabeRow = { id: string; titel: string; status?: string | null };

const AUFGABE_ONLY = new Set(["open", "done", "doing", "overdue"]);

export function normAufgabeStatus(v: unknown): "done" | "todo" {
  const s = String(v ?? "").toLowerCase().trim();
  if (["done", "erledigt", "complete", "completed", "abgehakt", "fertig"].includes(s)) return "done";
  if (["todo", "offen", "open", "unerledigt"].includes(s)) return "todo";
  throw new Error("Status muss erledigt (done) oder offen (todo) sein.");
}

function flag(v: unknown): boolean {
  return v === true || String(v).toLowerCase() === "true";
}

export function parseAufgabeSelector(input: unknown, mode: "status" | "delete"): AufgabeSelector {
  const o = asObj(input);
  const id = optUuid(o, "id");
  const rawIds = o.ids === undefined || o.ids === null ? [] : o.ids;
  if (!Array.isArray(rawIds)) throw new Error("ids muss eine Liste sein.");
  const ids = [...new Set(rawIds.map((item) => {
    const s = String(item ?? "").trim();
    if (!UUID.test(s)) throw new Error("Eine Aufgaben-ID ist ungültig.");
    return s;
  }))];
  if (id && !ids.includes(id)) ids.unshift(id);
  if (ids.length > AUFGABE_MATCH_LIMIT) throw new Error("Zu viele Aufgaben auf einmal.");
  const query = clip(o.query, 80);
  let only: AufgabeSelector["only"] = null;
  if (o.only !== undefined && o.only !== null && String(o.only).trim() !== "") {
    const s = String(o.only).toLowerCase().trim();
    if (!AUFGABE_ONLY.has(s)) throw new Error("Filter only muss open, done, doing oder overdue sein.");
    only = s as AufgabeSelector["only"];
  }
  const all = flag(o.all);
  const confirm = flag(o.confirm);
  const bot = o.bot !== undefined && o.bot !== null && String(o.bot).trim() !== "" ? normBot(o.bot) : null;
  if (all && (ids.length > 0 || query || only || bot)) throw new Error("Entweder alle Aufgaben oder ein Filter, nicht beides.");
  if (!all && !ids.length && !query && !only && !bot) throw new Error("Welche Aufgaben? Nenne einen Titel, eine ID oder einen Filter.");
  const scope: AufgabeScope = all ? "all" : !query && !only && !bot && ids.length === 1 ? "single" : "bulk";
  if (mode === "delete" && scope === "all" && !confirm) {
    throw new Error("Alle Aufgaben lösche ich nur, wenn Kim das ausdrücklich sagt. Dann confirm auf true setzen.");
  }
  return { id: ids[0] ?? null, ids, query, only, bot, all, confirm, scope };
}

export function planAufgabeChange(
  selector: AufgabeSelector,
  rows: AufgabeRow[],
  change: { op: "status"; status: "done" | "todo" } | { op: "delete" },
  frozen = false,
): Plan {
  const seen = new Set<string>();
  let list = rows.map((r) => {
    const id = String(r.id ?? "").trim();
    if (!UUID.test(id)) throw new Error("Aufgaben-ID ungültig.");
    if (seen.has(id)) throw new Error("Dieselbe Aufgabe steht doppelt in der Liste.");
    seen.add(id);
    return { id, titel: clip(r.titel, 300) || "Ohne Titel", status: r.status == null ? null : String(r.status) };
  });
  if (!frozen && change.op === "status") list = list.filter((r) => r.status !== change.status);
  if (!list.length) {
    throw new Error(change.op === "delete"
      ? "Keine passende Aufgabe gefunden."
      : change.status === "done"
      ? "Keine offene Aufgabe dafür. Sie ist vielleicht schon erledigt."
      : "Keine erledigte Aufgabe dafür. Sie ist vielleicht schon offen.");
  }
  if (list.length > AUFGABE_MATCH_LIMIT) throw new Error("Zu viele Aufgaben. Bitte enger filtern.");
  const many = selector.scope === "all" || list.length > 1;
  if (!frozen && change.op === "delete" && many && !selector.confirm) {
    throw new Error(`Das träfe ${list.length} Aufgaben. Mehrere oder alle lösche ich nur, wenn Kim das ausdrücklich sagt. Dann confirm auf true setzen.`);
  }
  const titles = list.map((r) => r.titel);
  const shown = titles.slice(0, 12);
  const lines = [
    `Anzahl: ${list.length}`,
    change.op === "delete" ? "Endgültig löschen." : change.status === "done" ? "Status: Erledigt" : "Status: Offen",
    ...shown,
  ];
  if (titles.length > shown.length) lines.push(`… und ${titles.length - shown.length} weitere`);
  const scope: AufgabeScope = selector.scope === "all" ? "all" : list.length === 1 ? "single" : "bulk";
  const one = list.length === 1;
  let summary: string;
  if (change.op === "delete") {
    summary = scope === "all" ? `Alle ${list.length} Aufgaben löschen` : one ? `Aufgabe löschen: ${titles[0]}` : `${list.length} Aufgaben löschen`;
  } else if (change.status === "done") {
    summary = one ? `Aufgabe erledigen: ${titles[0]}` : `${list.length} Aufgaben erledigen`;
  } else {
    summary = one ? `Aufgabe wieder öffnen: ${titles[0]}` : `${list.length} Aufgaben wieder öffnen`;
  }
  return {
    kind: change.op === "delete" ? "aufgabe_delete" : "aufgabe_status",
    tool: change.op === "delete" ? "delete_aufgaben" : "set_aufgaben_status",
    table: "aufgaben",
    action: change.op === "delete" ? "delete" : "update",
    summary,
    lines,
    bot: null,
    ...(change.op === "delete" ? { danger: true } : {}),
    data: {
      ids: list.map((r) => r.id),
      titles,
      count: list.length,
      scope,
      confirm: selector.confirm || frozen,
      ...(change.op === "status" ? { status: change.status } : {}),
    },
  };
}

function selectorFromPlan(data: Record<string, unknown>): AufgabeSelector {
  const ids = Array.isArray(data.ids) ? data.ids.map((id) => String(id)) : [];
  const scope: AufgabeScope = data.scope === "all" || data.scope === "bulk" || data.scope === "single"
    ? data.scope
    : ids.length > 1 ? "bulk" : "single";
  return { id: ids[0] ?? null, ids, query: null, only: null, bot: null, all: scope === "all", confirm: true, scope };
}

function rowsFromPlan(data: Record<string, unknown>): AufgabeRow[] {
  const ids = data.ids;
  const titles = data.titles;
  if (!Array.isArray(ids) || !Array.isArray(titles) || !ids.length || ids.length !== titles.length) {
    throw new Error("Die Aufgabenliste ist unvollständig.");
  }
  if (Number(data.count) !== ids.length) throw new Error("Die Anzahl passt nicht zur Liste.");
  return ids.map((id, i) => ({ id: String(id), titel: String(titles[i] ?? "") }));
}

function planDispatch(o: Record<string, unknown>): Plan {
  const bot = normBot(o.bot);
  const title = clip(o.title, 300) || clip(o.auftrag, 300);
  if (!title) throw new Error("Titel fehlt.");
  const instructions = clip(o.instructions ?? o.details ?? o.beschreibung, 4000) || "";
  const aufgabe_id = o.aufgabe_id ? optUuid(o, "aufgabe_id") : null;
  const kontakt_id = o.kontakt_id ? optUuid(o, "kontakt_id") : null;
  const create_aufgabe = !aufgabe_id && o.create_aufgabe !== false;
  const focus = bot === "webby"
    ? "Website / Tech"
    : bot === "saley"
    ? "Vertrieb / Leads"
    : bot === "cashy"
    ? "Finanzen / Rechnungen"
    : bot === "developy"
    ? "Software / Jarvis"
    : BOTS[bot].role;
  return {
    kind: "bot_dispatch",
    tool: "dispatch_to_bot",
    table: "bot_runs",
    action: "insert",
    summary: `Auftrag an ${BOTS[bot].name}`,
    lines: [
      `Bot: ${BOTS[bot].name} (${focus})`,
      `Auftrag: ${title}`,
      instructions ? `Anweisung: ${instructions.slice(0, 180)}` : "Anweisung: —",
      create_aufgabe ? "Neue Aufgabe im CRM und Versand an den Bot" : "Bestehende Aufgabe, kein zweites Kanban",
    ],
    bot,
    data: { bot, title, instructions, aufgabe_id, kontakt_id, create_aufgabe },
  };
}

function planRoute(o: Record<string, unknown>): Plan {
  const bot = normBot(o.bot);
  const titel = reqStr(o, "auftrag", 300, "Auftrag");
  return planAufgabe({
    titel,
    beschreibung: o.details ?? o.beschreibung,
    prioritaet: o.prioritaet,
    faellig: o.faellig,
    kontakt_id: o.kontakt_id,
    bot,
  }, "route_to_bot");
}

function planWv(o: Record<string, unknown>): Plan {
  const text = reqStr(o, "text", 500, "Text");
  const datum = optDate(o, "datum");
  if (!datum) throw new Error("Datum fehlt.");
  const kontakt_id = o.kontakt_id ? optUuid(o, "kontakt_id") : null;
  return {
    kind: "wiedervorlage",
    tool: "create_wiedervorlage",
    table: "wiedervorlagen",
    action: "insert",
    summary: "Wiedervorlage anlegen",
    lines: [`Erinnerung: ${text}`, `Datum: ${datum}`, "Erledigt: nein"],
    bot: null,
    data: { text, datum, kontakt_id, done: false },
  };
}

function planEvent(o: Record<string, unknown>): Plan {
  const titel = reqStr(o, "titel", 300, "Titel");
  const datum = optDate(o, "datum");
  if (!datum) throw new Error("Datum fehlt.");
  const zeit = o.zeit ? clock(o.zeit, "Uhrzeit") : null;
  let typ = "termin";
  if (o.typ !== undefined && o.typ !== null && String(o.typ).trim() !== "") {
    typ = String(o.typ).toLowerCase().trim();
    if (!KAL_TYP.includes(typ)) throw new Error("Termintyp ungültig.");
  }
  const kontakt_id = o.kontakt_id ? optUuid(o, "kontakt_id") : null;
  let notiz = o.notiz !== undefined ? clip(o.notiz, 4000) : null;
  if (o.bis) {
    const bis = clock(o.bis, "Ende");
    notiz = [notiz, `Bis: ${bis}`].filter(Boolean).join("\n");
  }
  return {
    kind: "kal_event",
    tool: "create_kal_event",
    table: "kal_events",
    action: "insert",
    summary: "Termin anlegen",
    lines: [`Termin: ${titel}`, `Datum: ${datum}`, `Uhrzeit: ${zeit ?? "ohne"}`, `Typ: ${typ}`],
    bot: null,
    data: { titel, datum, zeit, typ, kontakt_id, notiz },
  };
}

function planDoc(o: Record<string, unknown>, kind: "angebot" | "rechnung", ctx: Ctx): Plan {
  if (o.status !== undefined && o.status !== null && String(o.status).trim() !== "") {
    const st = String(o.status).toLowerCase().trim();
    if (st !== "entwurf" && st !== "draft") {
      throw new Error(kind === "rechnung"
        ? "Rechnungen legt Jarvis nur als Entwurf an und markiert sie nicht als offen, versendet oder bezahlt."
        : "Angebote legt Jarvis nur als Entwurf an und versendet sie nicht.");
    }
  }
  const betreff = reqStr(o, "betreff", 300, "Betreff");
  const kunde_id = o.kunde_id ? optUuid(o, "kunde_id") : null;
  const datum = o.datum ? optDate(o, "datum") : ctx.today;
  if (!datum) throw new Error("Datum fehlt.");
  const positions = normPositions(o.positions);
  const netto = sumNetto(positions);
  const notes = o.notes !== undefined ? clip(o.notes, 5000) : null;
  if (kind === "angebot") {
    const valid_bis = o.valid_bis ? optDate(o, "valid_bis") : null;
    return {
      kind: "angebot",
      tool: "create_angebot",
      table: "angebote",
      action: "insert",
      summary: "Angebot als Entwurf anlegen",
      lines: [
        `Betreff: ${betreff}`,
        `Datum: ${datum}`,
        `Gültig bis: ${valid_bis ?? "ohne"}`,
        `Positionen: ${positions.length}`,
        `Summe netto: ${eur(netto)}`,
        "Status: Entwurf (wird nicht versendet)",
      ],
      bot: null,
      data: { kunde_id, betreff, datum, valid_bis, positions, notes, status: "entwurf", netto },
    };
  }
  const faellig = o.faellig ? optDate(o, "faellig") : null;
  return {
    kind: "rechnung",
    tool: "create_rechnung",
    table: "rechnungen",
    action: "insert",
    summary: "Rechnung als Entwurf anlegen",
    lines: [
      `Betreff: ${betreff}`,
      `Datum: ${datum}`,
      `Fällig: ${faellig ?? "ohne"}`,
      `Positionen: ${positions.length}`,
      `Summe netto: ${eur(netto)}`,
      "Status: Entwurf (nicht offen, nicht versendet, nicht bezahlt)",
    ],
    bot: null,
    data: { kunde_id, betreff, datum, faellig, positions, notes, status: "entwurf", r_typ: "normal", netto },
  };
}

function planSocial(o: Record<string, unknown>): Plan {
  if (o.status !== undefined && o.status !== null && String(o.status).trim() !== "") {
    const st = String(o.status).toLowerCase();
    if (!["idee", "entwurf", "draft"].includes(st)) {
      throw new Error("Social-Posts legt Jarvis nur als Entwurf an (CRM-Status Idee), nicht als veröffentlicht.");
    }
  }
  const id = o.id ? optUuid(o, "id") : null;
  const external_id = o.external_id !== undefined && o.external_id !== null && String(o.external_id).trim() !== ""
    ? clip(o.external_id, 120)
    : null;
  if (external_id && !EXT_ID.test(external_id)) throw new Error("external_id ungültig.");
  const isUpdate = !!(id || external_id);
  const data: Record<string, unknown> = {};
  const lines: string[] = [];
  if (id) data.id = id;
  if (external_id) data.external_id = external_id;
  if (o.datum !== undefined && o.datum !== null && String(o.datum).trim() !== "") {
    data.datum = optDate(o, "datum");
    lines.push(`Datum: ${data.datum}`);
  }
  for (const [key, max, label] of [
    ["uhrzeit", 60, "Uhrzeit"],
    ["thema", 300, "Thema"],
    ["hook", 1000, "Hook"],
    ["caption", 5000, "Caption"],
    ["cta", 500, "CTA"],
    ["visual_hinweise", 2000, "Visual"],
    ["format_detail", 200, "Format-Detail"],
  ] as Array<[string, number, string]>) {
    if (o[key] === undefined) continue;
    const s = clip(o[key], max);
    data[key] = s;
    if (s && (key === "thema" || key === "hook" || key === "uhrzeit")) lines.push(`${label}: ${s.slice(0, 140)}`);
  }
  if (o.format !== undefined && o.format !== null && String(o.format).trim() !== "") {
    data.format = normFormat(o.format);
    lines.push(`Format: ${data.format}`);
  }
  if (o.saeule !== undefined && o.saeule !== null && String(o.saeule).trim() !== "") {
    const s = String(o.saeule).trim();
    const hit = SAEULEN.find((x) => x.toLowerCase() === s.toLowerCase());
    if (!hit) throw new Error("Unbekannte Säule.");
    data.saeule = hit;
    lines.push(`Säule: ${hit}`);
  }
  if (o.hashtags !== undefined) {
    data.hashtags = normTags(o.hashtags);
    lines.push(`Hashtags: ${(data.hashtags as string[]).slice(0, 8).join(" ")}`);
  }
  if (!isUpdate) {
    if (!data.thema && !data.hook && !data.caption) throw new Error("Thema, Hook oder Caption fehlt.");
    data.status = "Idee";
    lines.unshift("Neuer Social-Post");
    lines.push("Status: Entwurf (CRM: Idee)");
    return {
      kind: "social_insert",
      tool: "save_social_post",
      table: "social_media_posts",
      action: "insert",
      summary: "Social-Post als Entwurf anlegen",
      lines,
      bot: null,
      data,
    };
  }
  if (Object.keys(data).filter((k) => k !== "id" && k !== "external_id").length === 0) {
    throw new Error("Keine Felder zum Aktualisieren.");
  }
  data.keep_status = true;
  lines.unshift("Social-Post aktualisieren");
  lines.push("Status bleibt unverändert, außer der Post ist bereits veröffentlicht – dann wird abgelehnt.");
  return {
    kind: "social_update",
    tool: "save_social_post",
    table: "social_media_posts",
    action: "update",
    summary: "Social-Post aktualisieren",
    lines,
    bot: null,
    data,
  };
}

function normPositions(v: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(v) || v.length === 0) throw new Error("Mindestens eine Position angeben.");
  if (v.length > 30) throw new Error("Maximal 30 Positionen.");
  return v.map((raw, i) => {
    const p = asObj(raw);
    const desc = clip(p.desc ?? p.titel ?? p.bezeichnung, 300);
    if (!desc) throw new Error(`Position ${i + 1}: Beschreibung fehlt.`);
    const qty = num(p.qty ?? p.menge ?? 1, 0.01, 100000, `Menge Position ${i + 1}`);
    const price = num(p.price ?? p.preis ?? 0, 0, 10_000_000, `Preis Position ${i + 1}`);
    let typ = "einmalig";
    if (p.typ !== undefined && p.typ !== null && String(p.typ).trim() !== "") {
      typ = String(p.typ).toLowerCase().trim();
      if (!POS_TYP.includes(typ)) throw new Error(`Position ${i + 1}: unbekannte Abrechnungsart.`);
    }
    const optional = p.optional === true;
    const total = Math.round(qty * price * 100) / 100;
    return { desc, detail: clip(p.detail ?? p.beschreibung, 2000) ?? "", typ, optional, qty, price, total };
  });
}

function normTags(v: unknown): string[] {
  let arr: Array<string | null> = [];
  if (Array.isArray(v)) arr = v.map((x) => clip(x, 80));
  else if (typeof v === "string") arr = v.split(/[\s,]+/).map((x) => clip(x, 80));
  else throw new Error("Hashtags ungültig.");
  return arr.filter((t): t is string => !!t).slice(0, 40).map((t) => t.startsWith("#") ? t : `#${t}`);
}

function normFormat(v: unknown): string {
  const s = String(v).toLowerCase().trim();
  if (s === "reel" || s === "reels") return "Reel";
  if (s === "story" || s === "stories") return "Story";
  if (s === "karussell" || s === "carousel" || s === "karussellpost") return "Karussell";
  if (s === "beitrag" || s === "post") return "Beitrag";
  const hit = FORMATE.find((x) => x.toLowerCase() === s);
  if (!hit) throw new Error("Format muss Beitrag, Karussell, Story oder Reel sein.");
  return hit;
}

function normPipe(v: unknown): string {
  const s = String(v).toLowerCase().trim();
  const map: Record<string, string> = {
    lead: "lead",
    erstgespräch: "erstgespraech",
    erstgespraech: "erstgespraech",
    angebot: "angebot",
    gewonnen: "gewonnen",
    verloren: "verloren",
  };
  if (!map[s]) throw new Error("Phase muss Lead, Erstgespräch, Angebot, Gewonnen oder Verloren sein.");
  return map[s];
}

const BOT_ALIASES: Record<string, string> = {
  webby: "webby",
  webbi: "webby",
  weby: "webby",
  website: "webby",
  websites: "webby",
  web: "webby",
  marky: "marky",
  marki: "marky",
  markie: "marky",
  marketing: "marky",
  social: "marky",
  saley: "saley",
  sally: "saley",
  sali: "saley",
  vertrieb: "saley",
  sales: "saley",
  cashy: "cashy",
  kashy: "cashy",
  cashi: "cashy",
  finanzen: "cashy",
  finance: "cashy",
  developy: "developy",
  developi: "developy",
  software: "developy",
  dev: "developy",
};

export function matchBot(v: unknown): string | null {
  const s = String(v ?? "").toLowerCase().trim();
  return BOT_ALIASES[s] || null;
}

export function normBot(v: unknown): string {
  const hit = matchBot(v);
  if (!hit) throw new Error("Bot muss Webby, Marky, Saley, Cashy oder Developy sein.");
  return hit;
}

function normPrio(v: unknown): string {
  const s = String(v ?? "").toLowerCase().trim();
  if (["hoch", "high", "prio"].includes(s)) return "hoch";
  if (["niedrig", "low", "gering"].includes(s)) return "niedrig";
  if (["normal", "mittel", "medium"].includes(s)) return "normal";
  throw new Error("Priorität: hoch, normal oder niedrig.");
}

function stripBotLine(s: string): string {
  return s.replace(/^Zuständig:\s*(Webby|Marky|Saley|Cashy|Developy)\s*\([^)]*\)\.\s*/i, "").trim();
}

function asObj(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Ungültige Eingabe.");
  return input as Record<string, unknown>;
}

function stripUnsafe(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c === 0 || c === 60 || c === 62) continue;
    out += ch;
  }
  return out;
}

function clip(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = stripUnsafe(String(v)).trim();
  return s ? s.slice(0, max) : null;
}

function reqStr(o: Record<string, unknown>, key: string, max: number, label: string): string {
  const s = clip(o[key], max);
  if (!s) throw new Error(`${label} fehlt.`);
  return s;
}

function optUuid(o: Record<string, unknown>, key: string): string | null {
  if (o[key] === undefined || o[key] === null || o[key] === "") return null;
  const s = String(o[key]).trim();
  if (!UUID.test(s)) throw new Error(`${key} ist keine gültige ID.`);
  return s;
}

function optDate(o: Record<string, unknown>, key: string): string | null {
  if (o[key] === undefined || o[key] === null || o[key] === "") return null;
  const s = String(o[key]).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !isRealDate(s)) throw new Error(`${key} muss YYYY-MM-DD sein.`);
  return s;
}

function isRealDate(s: string): boolean {
  const [y, m, d] = s.split("-").map(Number);
  if (y < 2000 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function clock(v: unknown, label: string): string {
  const s = String(v).trim().slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(s)) throw new Error(`${label} muss HH:MM sein.`);
  const [h, m] = s.split(":").map(Number);
  if (h > 23 || m > 59) throw new Error(`${label} ist ungültig.`);
  return s;
}

function num(v: unknown, min: number, max: number, label: string): number {
  const n = typeof v === "number"
    ? v
    : typeof v === "string"
    ? Number(v.replace(/\s/g, "").replace(",", "."))
    : NaN;
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label} ist ungültig.`);
  return Math.round(n * 100) / 100;
}
