// Erlaubte CRM-Spalten, abgeleitet aus den sbSave*-Aufrufen in index.html.
// workspace_id setzt der Server. Einstellungen und Geheimnisse sind keine Schreibziele.

export const CRM_MATCH_LIMIT = 300;
export const CRM_INSERT_LIMIT = 30;
const PREVIEW = 12;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BLOCKED = new Set([
  "settings", "setting", "einstellungen",
  "integration_secrets", "secrets", "secret", "geheimnisse", "geheimnis",
  "profiles", "profile", "workspaces", "workspace", "nutzer", "users",
  "social_posts", "jarvis_actions",
]);

const ALIAS: Record<string, string> = {
  contacts: "contacts", contact: "contacts", kontakte: "contacts", kontakt: "contacts",
  angebote: "angebote", angebot: "angebote",
  rechnungen: "rechnungen", rechnung: "rechnungen",
  retainer: "retainer",
  pakete: "pakete", paket: "pakete",
  aufgaben: "aufgaben", aufgabe: "aufgaben", kanban: "aufgaben",
  wiedervorlagen: "wiedervorlagen", wiedervorlage: "wiedervorlagen",
  kal_events: "kal_events", kalender: "kal_events", termin: "kal_events", termine: "kal_events",
  social_media_posts: "social_media_posts", social: "social_media_posts", posts: "social_media_posts",
  ausgaben: "ausgaben", ausgabe: "ausgaben",
  roi_daten: "roi_daten", roi: "roi_daten",
  ziele: "ziele", ziel: "ziele",
};

type Col =
  | { kind: "text"; max: number }
  | { kind: "enum"; values: string[]; aliases?: Record<string, string> }
  | { kind: "date" }
  | { kind: "time" }
  | { kind: "bool" }
  | { kind: "num"; min: number; max: number; int?: boolean }
  | { kind: "uuid" }
  | { kind: "json"; max: number }
  | { kind: "tags" }
  | { kind: "positions" };

type TableSpec = {
  label: string;
  area: string;
  title: string[];
  search: string[];
  stamp: boolean;
  required: string[];
  defaults: Record<string, unknown>;
  virtual: string[];
  columns: Record<string, Col>;
  restore: Record<string, Col>;
};

const PIPE = ["lead", "erstgespraech", "angebot", "gewonnen", "verloren"];
const QUELLE = ["website", "ki-check", "empfehlung", "instagram", "google", "kaltakquise", "sonstiges"];
const POS = ["einmalig", "pauschal", "monatlich", "jaehrlich", "stuendlich", "taeglich", "nach-aufwand"];
const KAL = ["termin", "anruf", "aufgabe", "erinnerung", "sonstiges"];
const SOCIAL_STATUS = ["Idee", "Geplant", "Content fertig", "Erstellt", "Veröffentlicht"];
const SAEULE = ["Webdesign", "KI", "Performance-Marketing", "Ratgeber", "Referenz", "Kim & Allgäu"];
const FORMAT = ["Beitrag", "Karussell", "Story", "Reel"];

const TABLES: Record<string, TableSpec> = {
  contacts: spec("Kontakt", "contacts", ["firma", "person"], ["firma", "person", "email"], true, ["firma"], { status: "lead", archiviert: false }, ["neue_notiz"], {
    firma: { kind: "text", max: 200 },
    person: { kind: "text", max: 160 },
    email: { kind: "text", max: 200 },
    tel: { kind: "text", max: 60 },
    str: { kind: "text", max: 200 },
    plz: { kind: "text", max: 16 },
    ort: { kind: "text", max: 120 },
    web: { kind: "text", max: 300 },
    instagram: { kind: "text", max: 160 },
    facebook: { kind: "text", max: 200 },
    gbusiness: { kind: "text", max: 300 },
    branche: { kind: "text", max: 120 },
    status: { kind: "enum", values: PIPE, aliases: { erstgespräch: "erstgespraech" } },
    quelle: { kind: "enum", values: QUELLE },
    deal_wert: { kind: "num", min: 0, max: 10_000_000 },
    naechster_schritt: { kind: "date" },
    naechster_schritt_text: { kind: "text", max: 300 },
    notes: { kind: "text", max: 5000 },
    ana: { kind: "text", max: 5000 },
    photo: { kind: "text", max: 500 },
    notizen: { kind: "json", max: 20000 },
    dokumente: { kind: "json", max: 20000 },
    checks: { kind: "json", max: 8000 },
    archiviert: { kind: "bool" },
    meta: { kind: "json", max: 8000 },
  }),
  angebote: spec("Angebot", "angebote", ["betreff", "nr"], ["betreff", "nr"], true, ["betreff"], { status: "entwurf", archiviert: false, positions: [] }, [], {
    kunde_id: { kind: "uuid" },
    nr: { kind: "text", max: 40 },
    betreff: { kind: "text", max: 300 },
    datum: { kind: "date" },
    valid_bis: { kind: "date" },
    status: { kind: "enum", values: ["entwurf", "gesendet", "akzeptiert", "abgelehnt"], aliases: { draft: "entwurf", versendet: "gesendet", sent: "gesendet", angenommen: "akzeptiert", accepted: "akzeptiert", rejected: "abgelehnt" } },
    positions: { kind: "positions" },
    notes: { kind: "text", max: 5000 },
    archiviert: { kind: "bool" },
  }),
  rechnungen: spec("Rechnung", "rechnungen", ["betreff", "nr"], ["betreff", "nr"], true, ["betreff"], { status: "entwurf", archiviert: false, positions: [], r_typ: "normal", anzahl: 0 }, [], {
    kunde_id: { kind: "uuid" },
    nr: { kind: "text", max: 40 },
    betreff: { kind: "text", max: 300 },
    datum: { kind: "date" },
    faellig: { kind: "date" },
    status: { kind: "enum", values: ["entwurf", "offen-rg", "bezahlt", "ueberfaellig"], aliases: { draft: "entwurf", offen: "offen-rg", gesendet: "offen-rg", versendet: "offen-rg", sent: "offen-rg", paid: "bezahlt", überfällig: "ueberfaellig", ueberfaellig: "ueberfaellig", overdue: "ueberfaellig" } },
    positions: { kind: "positions" },
    notes: { kind: "text", max: 5000 },
    r_typ: { kind: "enum", values: ["normal", "anzahlung", "schluss"] },
    anzahl: { kind: "num", min: 0, max: 10_000_000 },
    anztext: { kind: "text", max: 300 },
    archiviert: { kind: "bool" },
  }),
  retainer: spec("Retainer", "retainer", ["paket"], ["paket"], true, ["paket"], { status: "pausiert", betrag: 0, abrechnungstag: "1" }, [], {
    kunde_id: { kind: "uuid" },
    paket: { kind: "text", max: 200 },
    betrag: { kind: "num", min: 0, max: 10_000_000 },
    start_datum: { kind: "date" },
    abrechnungstag: { kind: "text", max: 8 },
    next_datum: { kind: "date" },
    status: { kind: "enum", values: ["aktiv", "pausiert", "gekuendigt"], aliases: { active: "aktiv", pause: "pausiert", paused: "pausiert", gekündigt: "gekuendigt" } },
    leistungen: { kind: "text", max: 4000 },
  }),
  pakete: spec("Paket", "pakete", ["label", "kategorie"], ["label", "kategorie"], true, ["label"], { typ: "einmalig" }, [], {
    kategorie: { kind: "text", max: 80 },
    label: { kind: "text", max: 200 },
    beschreibung: { kind: "text", max: 2000 },
    preis: { kind: "num", min: 0, max: 10_000_000 },
    typ: { kind: "enum", values: POS },
  }),
  aufgaben: spec("Aufgabe", "aufgaben", ["titel"], ["titel"], true, ["titel"], { status: "todo", prioritaet: "normal" }, ["bot"], {
    kontakt_id: { kind: "uuid" },
    titel: { kind: "text", max: 300 },
    beschreibung: { kind: "text", max: 5000 },
    status: { kind: "enum", values: ["todo", "doing", "done"], aliases: { offen: "todo", open: "todo", "in arbeit": "doing", in_arbeit: "doing", erledigt: "done", fertig: "done", complete: "done", completed: "done" } },
    prioritaet: { kind: "enum", values: ["hoch", "normal", "niedrig", "mittel"], aliases: { high: "hoch", low: "niedrig", gering: "niedrig", medium: "normal" } },
    faellig: { kind: "date" },
  }),
  wiedervorlagen: spec("Wiedervorlage", "wiedervorlagen", ["text"], ["text"], false, ["text", "datum"], { done: false }, [], {
    kontakt_id: { kind: "uuid" },
    text: { kind: "text", max: 500 },
    datum: { kind: "date" },
    done: { kind: "bool" },
  }),
  kal_events: spec("Termin", "kalender", ["titel"], ["titel"], false, ["titel", "datum"], { typ: "termin" }, ["bis"], {
    titel: { kind: "text", max: 300 },
    datum: { kind: "date" },
    zeit: { kind: "time" },
    typ: { kind: "enum", values: KAL },
    kontakt_id: { kind: "uuid" },
    notiz: { kind: "text", max: 4000 },
  }),
  social_media_posts: spec("Social-Post", "social", ["thema", "hook", "external_id"], ["thema", "hook"], true, [], { status: "Idee", hashtags: [] }, [], {
    external_id: { kind: "text", max: 120 },
    datum: { kind: "date" },
    uhrzeit: { kind: "text", max: 60 },
    format: { kind: "enum", values: FORMAT, aliases: { post: "Beitrag", reel: "Reel", reels: "Reel", story: "Story", stories: "Story", karussell: "Karussell", carousel: "Karussell" } },
    format_detail: { kind: "text", max: 200 },
    saeule: { kind: "enum", values: SAEULE },
    thema: { kind: "text", max: 300 },
    hook: { kind: "text", max: 1000 },
    caption: { kind: "text", max: 5000 },
    hashtags: { kind: "tags" },
    visual_hinweise: { kind: "text", max: 2000 },
    cta: { kind: "text", max: 500 },
    quelle: { kind: "text", max: 200 },
    freigabe: { kind: "text", max: 200 },
    content_ordner: { kind: "text", max: 300 },
    reel_skript: { kind: "text", max: 8000 },
    status: { kind: "enum", values: SOCIAL_STATUS, aliases: { idee: "Idee", entwurf: "Idee", draft: "Idee", geplant: "Geplant", "content fertig": "Content fertig", erstellt: "Erstellt", veröffentlicht: "Veröffentlicht", veroeffentlicht: "Veröffentlicht" } },
  }, {
    assets: { kind: "json", max: 80000 },
    meta: { kind: "json", max: 8000 },
  }),
  ausgaben: spec("Ausgabe", "ausgaben", ["beschreibung"], ["beschreibung"], false, ["beschreibung", "datum"], { typ: "ausgabe", netto: 0, mwst_pct: 0 }, [], {
    typ: { kind: "enum", values: ["ausgabe", "einnahme"] },
    datum: { kind: "date" },
    beschreibung: { kind: "text", max: 300 },
    kategorie: { kind: "text", max: 120 },
    netto: { kind: "num", min: -10_000_000, max: 10_000_000 },
    mwst_pct: { kind: "num", min: 0, max: 100 },
    mwst_betrag: { kind: "num", min: -10_000_000, max: 10_000_000 },
    brutto: { kind: "num", min: -10_000_000, max: 10_000_000 },
    notiz: { kind: "text", max: 2000 },
    beleg_name: { kind: "text", max: 200 },
  }),
  roi_daten: spec("ROI", "roi", ["kanal"], ["kanal", "notiz"], false, ["monat", "jahr"], { kanal: "google", budget: 0, klicks: 0, leads: 0, abschluesse: 0, umsatz: 0, roas: 0, roi: 0, cpl: 0 }, [], {
    kunde_id: { kind: "uuid" },
    kanal: { kind: "enum", values: ["google", "meta", "instagram", "seo", "sonstiges", "beide", "sonstige"] },
    monat: { kind: "num", min: 1, max: 12, int: true },
    jahr: { kind: "num", min: 2000, max: 2100, int: true },
    budget: { kind: "num", min: 0, max: 10_000_000 },
    klicks: { kind: "num", min: 0, max: 100_000_000, int: true },
    leads: { kind: "num", min: 0, max: 100_000_000, int: true },
    abschluesse: { kind: "num", min: 0, max: 100_000_000, int: true },
    umsatz: { kind: "num", min: 0, max: 10_000_000 },
    roas: { kind: "num", min: 0, max: 1_000_000 },
    roi: { kind: "num", min: -1_000_000, max: 1_000_000 },
    cpl: { kind: "num", min: 0, max: 10_000_000 },
    notiz: { kind: "text", max: 2000 },
  }),
  ziele: spec("Ziel", "ziele", ["mrr_ziel", "kunden_ziel"], [], true, [], {}, [], {
    mrr_ziel: { kind: "num", min: 0, max: 100_000_000 },
    kunden_ziel: { kind: "num", min: 0, max: 1_000_000, int: true },
    kunden_datum: { kind: "date" },
    meilensteine: { kind: "json", max: 20000 },
  }),
};

export type Virtual = { bot?: string | null; bis?: string | null; neue_notiz?: string | null };

export type CrmPlan = {
  kind: string;
  tool: string;
  table: string;
  action: "insert" | "update" | "delete";
  summary: string;
  lines: string[];
  bot: null;
  danger?: boolean;
  data: Record<string, unknown>;
};

export type CrmSelector = {
  table: string;
  ids: string[];
  query: string | null;
  all: boolean;
  confirm: boolean;
  scope: "single" | "bulk" | "all";
  patch: Record<string, unknown> | null;
};

const BOTS: Record<string, string> = {
  webby: "Zuständig: Webby (Websites).",
  marky: "Zuständig: Marky (Marketing / Social).",
  saley: "Zuständig: Saley (Vertrieb).",
  cashy: "Zuständig: Cashy (Finanzen).",
  developy: "Zuständig: Developy (Software).",
};

export function resolveTable(name: unknown): string {
  const s = String(name ?? "").toLowerCase().trim();
  if (!s) throw new Error("Welche Tabelle?");
  if (BLOCKED.has(s) || s.includes("secret")) {
    throw new Error("Einstellungen, Profile, Workspaces und Geheimnisse ändert Jarvis nicht.");
  }
  const table = ALIAS[s];
  if (!table) throw new Error(`„${clip(name, 40) ?? "Tabelle"}“ kann Jarvis nicht ändern.`);
  return table;
}

export function areaForTable(table: string): string {
  return TABLES[table]?.area ?? table;
}

export function searchColumns(table: string): string[] {
  return TABLES[resolveTable(table)].search;
}

export function stampsUpdatedAt(table: string): boolean {
  return TABLES[table]?.stamp === true;
}

export function rowTitle(table: string, row: Record<string, unknown>): string {
  const spec = TABLES[table];
  if (!spec) return "Eintrag";
  for (const key of spec.title) {
    const v = row[key];
    if (v != null && String(v).trim()) return clip(v, 180) || "Eintrag";
  }
  if (table === "ziele") {
    if (row.mrr_ziel != null) return `MRR ${row.mrr_ziel}`;
    if (row.kunden_ziel != null) return `Kunden ${row.kunden_ziel}`;
  }
  return "Eintrag";
}

export function planCrmInsert(input: unknown, today: string): CrmPlan {
  const o = asObj(input);
  const table = resolveTable(o.table);
  const spec = TABLES[table];
  const rawRows = o.rows === undefined ? (o.values === undefined ? null : [o.values]) : o.rows;
  const list = Array.isArray(rawRows) ? rawRows : rawRows && typeof rawRows === "object" ? [rawRows] : null;
  if (!list?.length) throw new Error("rows fehlt. Mindestens eine Zeile angeben.");
  if (list.length > CRM_INSERT_LIMIT) throw new Error(`Höchstens ${CRM_INSERT_LIMIT} Zeilen auf einmal anlegen.`);
  const rows = list.map((row, i) => normalize(table, asObj(row), "insert", today, i));
  if (table === "social_media_posts") {
    for (const row of rows) {
      if (!row.columns.thema && !row.columns.hook && !row.columns.caption) throw new Error("Thema, Hook oder Caption fehlt.");
    }
  }
  if (table === "ziele") {
    for (const row of rows) {
      if (!Object.keys(row.columns).length) throw new Error("Ziel braucht mrr_ziel, kunden_ziel, kunden_datum oder meilensteine.");
    }
  }
  const titles = rows.map((r) => rowTitle(table, { ...r.columns, ...flatVirtual(r.virtual) }));
  const lines = previewLines(rows.length, titles, rows.length === 1 ? fieldLines(table, rows[0].columns, rows[0].virtual) : []);
  return {
    kind: "crm_insert",
    tool: "crm_insert",
    table,
    action: "insert",
    summary: rows.length === 1 ? `${spec.label} anlegen: ${titles[0]}` : `${rows.length} ${plural(spec.label, rows.length)} anlegen`,
    lines,
    bot: null,
    data: { table, rows: rows.map(flatStored), count: rows.length, titles },
  };
}

export function parseCrmSelector(input: unknown, mode: "update" | "delete"): CrmSelector {
  const o = asObj(input);
  const table = resolveTable(o.table);
  const ids = readIds(o);
  const query = clip(o.query, 80);
  const all = flag(o.all);
  const confirm = flag(o.confirm);
  if (all && (ids.length || query)) throw new Error("Entweder alle Zeilen oder ein Filter, nicht beides.");
  if (!all && !ids.length && !query) throw new Error("Welche Zeilen? Nenne eine ID, einen Suchtext oder all.");
  const scope = all ? "all" : !query && ids.length === 1 ? "single" : "bulk";
  if (all && !confirm) {
    throw new Error(mode === "delete"
      ? "Alle Zeilen lösche ich nur, wenn Kim das ausdrücklich sagt. Dann confirm auf true setzen."
      : "Alle Zeilen ändere ich nur, wenn Kim das ausdrücklich sagt. Dann confirm auf true setzen.");
  }
  let patch: Record<string, unknown> | null = null;
  if (mode === "update") {
    patch = asObj(o.patch ?? o.values ?? {});
    if (!Object.keys(patch).length) throw new Error("patch fehlt. Welche Felder sollen sich ändern?");
    normalize(table, patch, "patch", "2026-01-01", 0);
  }
  return { table, ids, query, all, confirm, scope, patch };
}

export function planCrmChange(
  selector: CrmSelector,
  hits: Array<{ id: string; titel: string }>,
  frozen = false,
): CrmPlan {
  const spec = TABLES[selector.table];
  const seen = new Set<string>();
  const list = hits.map((h) => {
    const id = String(h.id ?? "").trim();
    if (!UUID.test(id)) throw new Error("Eine ID ist ungültig.");
    if (seen.has(id)) throw new Error("Dieselbe Zeile steht doppelt in der Liste.");
    seen.add(id);
    return { id, titel: clip(h.titel, 180) || "Eintrag" };
  });
  if (!list.length) throw new Error("Keine passende Zeile gefunden.");
  if (list.length > CRM_MATCH_LIMIT) throw new Error("Zu viele Zeilen. Bitte enger filtern.");
  const many = selector.scope === "all" || list.length > 1;
  const mode = selector.patch ? "update" : "delete";
  if (!frozen && mode === "delete" && many && !selector.confirm) {
    throw new Error(`Das träfe ${list.length} Zeilen. Mehrere oder alle lösche ich nur, wenn Kim das ausdrücklich sagt. Dann confirm auf true setzen.`);
  }
  const titles = list.map((r) => r.titel);
  let fieldPreview: string[] = [];
  let patch: Record<string, unknown> | null = null;
  let virtual: Virtual = {};
  if (mode === "update" && selector.patch) {
    const norm = normalize(selector.table, selector.patch, "patch", "2026-01-01", 0);
    patch = norm.columns;
    virtual = norm.virtual;
    fieldPreview = fieldLines(selector.table, patch, virtual);
  }
  const lines = previewLines(list.length, titles, fieldPreview);
  const one = list.length === 1;
  const summary = mode === "delete"
    ? (selector.scope === "all" ? `Alle ${list.length} ${plural(spec.label, list.length)} löschen` : one ? `${spec.label} löschen: ${titles[0]}` : `${list.length} ${plural(spec.label, list.length)} löschen`)
    : (one ? `${spec.label} ändern: ${titles[0]}` : `${list.length} ${plural(spec.label, list.length)} ändern`);
  return {
    kind: mode === "delete" ? "crm_delete" : "crm_update",
    tool: mode === "delete" ? "crm_delete" : "crm_update",
    table: selector.table,
    action: mode === "delete" ? "delete" : "update",
    summary,
    lines,
    bot: null,
    ...(mode === "delete" ? { danger: true } : {}),
    data: {
      table: selector.table,
      ids: list.map((r) => r.id),
      titles,
      count: list.length,
      scope: selector.scope === "all" ? "all" : list.length === 1 ? "single" : "bulk",
      confirm: selector.confirm || frozen,
      ...(patch ? { patch } : {}),
      ...(Object.keys(virtual).length ? { virtual } : {}),
    },
  };
}

export type UndoEntry = {
  action: string;
  table: string;
  recordId: string | null;
  summary: Record<string, unknown>;
};

export function planCrmUndo(batch: string, entries: UndoEntry[]): CrmPlan {
  if (!UUID.test(batch)) throw new Error("Die Änderung ist nicht mehr nachvollziehbar.");
  if (!entries.length) throw new Error("Es gibt keine protokollierte Änderung zum Rückgängigmachen.");
  if (entries.length > CRM_MATCH_LIMIT) throw new Error("Die letzte Änderung ist zu groß für ein Rückgängig.");
  const tables = new Set(entries.map((e) => e.table));
  if (tables.size !== 1) throw new Error("Die letzte Änderung mischt Tabellen. Die mache ich nicht automatisch rückgängig.");
  const table = [...tables][0];
  if (!TABLES[table]) throw new Error("Diese Tabelle kann ich nicht rückgängig machen.");
  const inverses = entries.map((e) => {
    if (e.action === "insert") {
      if (!e.recordId || !UUID.test(e.recordId)) throw new Error("Die letzte Anlage hat keine ID im Protokoll.");
      return "delete" as const;
    }
    if (e.action !== "update" && e.action !== "delete") throw new Error("Diese Protokollzeile kann ich nicht rückgängig machen.");
    const snap = snapshotOf(e.summary);
    if (!snap) throw new Error("Im Protokoll fehlt der vorherige Stand. Rückgängig ist dafür nicht möglich.");
    return e.action === "delete" ? "insert" as const : "update" as const;
  });
  const inverse = inverses.every((a) => a === "delete") ? "delete" : inverses.every((a) => a === "insert") ? "insert" : "update";
  const titles = entries.map((e) => clip(e.summary.titel, 180) || rowTitle(table, snapshotOf(e.summary) || {}) );
  return undoCard(batch, table, titles, inverse);
}

export function revalidateCrm(kind: string, data: Record<string, unknown>, today: string): CrmPlan {
  if (kind === "crm_insert") {
    const rows = data.rows;
    if (!Array.isArray(rows)) throw new Error("Die Zeilenliste ist unvollständig.");
    return planCrmInsert({ table: data.table, rows }, today);
  }
  if (kind === "crm_update" || kind === "crm_delete") {
    const ids = data.ids;
    const titles = data.titles;
    if (!Array.isArray(ids) || !Array.isArray(titles) || !ids.length || ids.length !== titles.length) {
      throw new Error("Die Zeilenliste ist unvollständig.");
    }
    if (Number(data.count) !== ids.length) throw new Error("Die Anzahl passt nicht zur Liste.");
    const selector: CrmSelector = {
      table: resolveTable(data.table),
      ids: ids.map((id) => String(id)),
      query: null,
      all: data.scope === "all",
      confirm: true,
      scope: data.scope === "all" || data.scope === "bulk" || data.scope === "single" ? data.scope : ids.length > 1 ? "bulk" : "single",
      patch: kind === "crm_update" ? { ...(asObj(data.patch)), ...(asObj(data.virtual ?? {})) } : null,
    };
    if (kind === "crm_update" && !selector.patch) throw new Error("patch fehlt.");
    return planCrmChange(selector, ids.map((id, i) => ({ id: String(id), titel: String(titles[i] ?? "") })), true);
  }
  if (kind === "crm_undo") {
    const batch = String(data.batch ?? "");
    const titles = data.titles;
    const inverse = data.inverse;
    if (!UUID.test(batch)) throw new Error("Die Änderung ist nicht mehr nachvollziehbar.");
    if (!Array.isArray(titles) || !titles.length || Number(data.count) !== titles.length) throw new Error("Die Zeilenliste ist unvollständig.");
    if (inverse !== "insert" && inverse !== "update" && inverse !== "delete") throw new Error("Rückgängig ist so nicht erlaubt.");
    return undoCard(batch, resolveTable(data.table), titles.map((t) => String(t)), inverse);
  }
  throw new Error("Diese Aktion ist nicht erlaubt.");
}

export function splitWrite(table: string, row: Record<string, unknown>, mode: "insert" | "patch", today: string): { columns: Record<string, unknown>; virtual: Virtual } {
  return normalize(table, row, mode, today, 0);
}

export function columnsFromSnapshot(table: string, snapshot: Record<string, unknown>): Record<string, unknown> {
  const spec = TABLES[table];
  if (!spec) throw new Error("Diese Tabelle kann ich nicht wiederherstellen.");
  const out: Record<string, unknown> = {};
  for (const key of Object.keys({ ...spec.columns, ...spec.restore })) {
    if (key in snapshot) out[key] = snapshot[key];
  }
  return out;
}

export function applyVirtual(table: string, columns: Record<string, unknown>, virtual: Virtual, today: string): Record<string, unknown> {
  const next = { ...columns };
  if (table === "aufgaben" && virtual.bot) {
    const line = BOTS[virtual.bot];
    const rest = String(next.beschreibung ?? "").replace(/^Zuständig:\s*(Webby|Marky|Saley|Cashy|Developy)\s*\([^)]*\)\.\s*/i, "").trim();
    next.beschreibung = rest ? `${line}\n${rest}` : line;
  }
  if (table === "kal_events" && virtual.bis) {
    next.notiz = joinBis(next.notiz == null ? "" : String(next.notiz), virtual.bis);
  }
  if (table === "contacts" && virtual.neue_notiz) {
    const prev = Array.isArray(next.notizen) ? next.notizen : [];
    next.notizen = [...prev, { id: crypto.randomUUID(), typ: "notiz", text: virtual.neue_notiz, datum: today, createdAt: new Date().toISOString() }];
  }
  return next;
}

function plural(label: string, n: number): string {
  if (n === 1) return label;
  if (label === "ROI") return "ROI-Zeilen";
  if (label === "Social-Post") return "Social-Posts";
  if (label === "Retainer") return "Retainer";
  if (label.endsWith("ung")) return `${label}en`;
  if (label.endsWith("e")) return `${label}n`;
  return `${label}e`;
}

function spec(
  label: string,
  area: string,
  title: string[],
  search: string[],
  stamp: boolean,
  required: string[],
  defaults: Record<string, unknown>,
  virtual: string[],
  columns: Record<string, Col>,
  restore: Record<string, Col> = {},
): TableSpec {
  return { label, area, title, search, stamp, required, defaults, virtual, columns, restore };
}

function normalize(table: string, row: Record<string, unknown>, mode: "insert" | "patch", today: string, index: number): { columns: Record<string, unknown>; virtual: Virtual } {
  const spec = TABLES[table];
  const prefix = index ? `Zeile ${index + 1}: ` : "";
  const columns: Record<string, unknown> = {};
  const virtual: Virtual = {};
  for (const key of Object.keys(row)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") throw new Error("Feld nicht erlaubt.");
    if (["workspace_id", "user_id", "id", "created_at", "updated_at"].includes(key)) {
      throw new Error(`${prefix}${key} setzt der Server, nicht das Werkzeug.`);
    }
    if (spec.restore[key]) throw new Error(`${prefix}Dateien und Assets ändert Jarvis nicht.`);
    if (spec.virtual.includes(key)) {
      if (key === "bot") virtual.bot = normBot(row.bot);
      else if (key === "bis") virtual.bis = clock(row.bis, "Ende");
      else if (key === "neue_notiz") virtual.neue_notiz = clip(row.neue_notiz, 4000);
      continue;
    }
    const col = spec.columns[key];
    if (!col) throw new Error(`${prefix}„${key}“ ist in ${spec.label} nicht beschreibbar.`);
    const value = coerce(col, row[key], key);
    if (key === "email" && typeof value === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new Error("E-Mail ist ungültig.");
    }
    if (key === "photo" && typeof value === "string" && value.startsWith("data:")) {
      throw new Error("Fotos nur als kurze URL, nicht als Datei.");
    }
    if (key === "external_id" && typeof value === "string" && !/^[A-Za-z0-9._-]{1,120}$/.test(value)) {
      throw new Error("external_id ist ungültig.");
    }
    columns[key] = value;
  }
  if (mode === "insert") {
    for (const [key, value] of Object.entries(spec.defaults)) {
      if (!(key in columns) && !(key in row)) columns[key] = value;
    }
    if ((table === "angebote" || table === "rechnungen" || table === "kal_events" || table === "wiedervorlagen" || table === "ausgaben") && !("datum" in columns) && spec.columns.datum) {
      columns.datum = today;
    }
    if (table === "ausgaben" && columns.netto != null && columns.mwst_pct != null && columns.mwst_betrag == null && columns.brutto == null) {
      const netto = Number(columns.netto);
      const pct = Number(columns.mwst_pct);
      columns.mwst_betrag = Math.round(netto * pct) / 100;
      columns.brutto = Math.round((netto + Number(columns.mwst_betrag)) * 100) / 100;
    }
    for (const key of spec.required) {
      if (columns[key] == null || columns[key] === "") throw new Error(`${prefix}${key} fehlt.`);
    }
  }
  if (mode === "patch" && table === "ausgaben" && columns.netto != null && columns.mwst_pct != null && columns.mwst_betrag == null && columns.brutto == null) {
    const netto = Number(columns.netto);
    const pct = Number(columns.mwst_pct);
    columns.mwst_betrag = Math.round(netto * pct) / 100;
    columns.brutto = Math.round((netto + Number(columns.mwst_betrag)) * 100) / 100;
  }
  if (mode === "patch" && !Object.keys(columns).length && !virtual.bot && !virtual.bis && !virtual.neue_notiz) {
    throw new Error("Keine Felder zum Aktualisieren.");
  }
  return { columns, virtual };
}

function coerce(col: Col, value: unknown, key: string): unknown {
  if (value === null) {
    if (col.kind === "bool" || col.kind === "positions" || col.kind === "tags") throw new Error(`${key} darf nicht leer sein.`);
    return null;
  }
  if (col.kind === "text") {
    const s = clip(value, col.max);
    if (!s) throw new Error(`${key} ist leer.`);
    return s;
  }
  if (col.kind === "enum") {
    const raw = String(value ?? "").trim();
    const alias = col.aliases?.[raw.toLowerCase()];
    const hit = col.values.find((v) => v.toLowerCase() === raw.toLowerCase()) ?? (alias && col.values.includes(alias) ? alias : null);
    if (!hit) throw new Error(`${key} muss einer dieser Werte sein: ${col.values.join(", ")}.`);
    return hit;
  }
  if (col.kind === "date") {
    const s = String(value ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`${key} muss YYYY-MM-DD sein.`);
    return s;
  }
  if (col.kind === "time") return clock(value, key);
  if (col.kind === "bool") {
    if (value === true || value === false) return value;
    const s = String(value).toLowerCase();
    if (["true", "1", "ja"].includes(s)) return true;
    if (["false", "0", "nein"].includes(s)) return false;
    throw new Error(`${key} muss ja oder nein sein.`);
  }
  if (col.kind === "num") {
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/\s/g, "").replace(",", ".")) : NaN;
    if (!Number.isFinite(n) || n < col.min || n > col.max) throw new Error(`${key} ist ungültig.`);
    return col.int ? Math.round(n) : Math.round(n * 100) / 100;
  }
  if (col.kind === "uuid") {
    const s = String(value ?? "").trim();
    if (!UUID.test(s)) throw new Error(`${key} ist keine gültige ID.`);
    return s;
  }
  if (col.kind === "tags") return normTags(value);
  if (col.kind === "positions") return normPositions(value);
  if (col.kind === "json") {
    const v = typeof value === "string" ? tryJson(value) : value;
    if (!v || typeof v !== "object") throw new Error(`${key} muss eine Liste oder ein Objekt sein.`);
    if (JSON.stringify(v).length > col.max) throw new Error(`${key} ist zu groß.`);
    return v;
  }
  throw new Error(`${key} ist ungültig.`);
}

function normPositions(v: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(v)) throw new Error("Positionen müssen eine Liste sein.");
  if (v.length > 30) throw new Error("Maximal 30 Positionen.");
  return v.map((raw, i) => {
    const p = asObj(raw);
    const desc = clip(p.desc ?? p.titel ?? p.bezeichnung, 300);
    if (!desc) throw new Error(`Position ${i + 1}: Beschreibung fehlt.`);
    const qty = Number(p.qty ?? p.menge ?? 1);
    const price = Number(String(p.price ?? p.preis ?? 0).replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0 || qty > 100000) throw new Error(`Position ${i + 1}: Menge ungültig.`);
    if (!Number.isFinite(price) || price < 0 || price > 10_000_000) throw new Error(`Position ${i + 1}: Preis ungültig.`);
    let typ = "einmalig";
    if (p.typ != null && String(p.typ).trim()) {
      typ = String(p.typ).toLowerCase().trim();
      if (!POS.includes(typ)) throw new Error(`Position ${i + 1}: unbekannte Abrechnungsart.`);
    }
    const optional = p.optional === true;
    return { desc, detail: clip(p.detail ?? p.beschreibung, 2000) ?? "", typ, optional, qty: Math.round(qty * 100) / 100, price: Math.round(price * 100) / 100, total: Math.round(qty * price * 100) / 100 };
  });
}

function normTags(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\s,]+/) : null;
  if (!arr) throw new Error("Hashtags ungültig.");
  return arr.map((t) => clip(t, 80)).filter((t): t is string => !!t).slice(0, 40).map((t) => t.startsWith("#") ? t : `#${t}`);
}

function normBot(v: unknown): string {
  const s = String(v ?? "").toLowerCase().trim();
  const aliases: Record<string, string> = { webby: "webby", website: "webby", websites: "webby", marky: "marky", marketing: "marky", social: "marky", saley: "saley", vertrieb: "saley", cashy: "cashy", finanzen: "cashy", developy: "developy", software: "developy" };
  if (!aliases[s]) throw new Error("Bot muss Webby, Marky, Saley, Cashy oder Developy sein.");
  return aliases[s];
}

function joinBis(notiz: string, bis: string): string {
  const rest = notiz.split(/\r?\n/).filter((line) => !/^Bis:\s*\d{1,2}:\d{2}\s*$/.test(line.trim())).join("\n").trim();
  return rest ? `${rest}\nBis: ${bis}` : `Bis: ${bis}`;
}

function snapshotOf(summary: Record<string, unknown>): Record<string, unknown> | null {
  const snap = summary.before ?? summary.row;
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return null;
  return snap as Record<string, unknown>;
}

function undoCard(batch: string, table: string, titles: string[], inverse: "insert" | "update" | "delete"): CrmPlan {
  const spec = TABLES[table];
  const n = titles.length;
  const summary = inverse === "delete"
    ? `${n} angelegte ${plural(spec.label, n)} wieder löschen`
    : inverse === "insert"
    ? `${n} gelöschte ${plural(spec.label, n)} wiederherstellen`
    : `${n} ${plural(spec.label, n)} auf den vorherigen Stand setzen`;
  const lines = previewLines(n, titles, [inverse === "delete" ? "Hebt die letzte Anlage auf." : inverse === "insert" ? "Stellt die gelöschten Zeilen wieder her." : "Setzt die Felder auf den Stand vor der letzten Änderung."]);
  return {
    kind: "crm_undo",
    tool: "crm_undo",
    table,
    action: inverse,
    summary,
    lines,
    bot: null,
    ...(inverse === "delete" ? { danger: true } : {}),
    data: { batch, table, titles, count: n, inverse },
  };
}

function previewLines(count: number, titles: string[], extra: string[]): string[] {
  const shown = titles.slice(0, PREVIEW);
  const lines = [`Anzahl: ${count}`, ...extra, ...shown];
  if (titles.length > shown.length) lines.push(`… und ${titles.length - shown.length} weitere`);
  return lines;
}

function fieldLines(table: string, columns: Record<string, unknown>, virtual: Virtual): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(columns)) {
    if (key === "positions" || key === "notizen" || key === "dokumente" || key === "checks" || key === "meilensteine" || key === "hashtags") {
      const n = Array.isArray(value) ? value.length : 1;
      lines.push(`${key}: ${n}`);
    } else if (value != null && String(value).length < 80) lines.push(`${key}: ${value}`);
    if (lines.length >= 6) break;
  }
  if (virtual.bot) lines.push(BOTS[virtual.bot]);
  if (virtual.bis) lines.push(`Bis: ${virtual.bis}`);
  if (virtual.neue_notiz) lines.push(`Neue Notiz: ${virtual.neue_notiz.slice(0, 80)}`);
  return lines;
}

function flatStored(row: { columns: Record<string, unknown>; virtual: Virtual }): Record<string, unknown> {
  return { ...row.columns, ...flatVirtual(row.virtual) };
}

function flatVirtual(v: Virtual): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (v.bot) o.bot = v.bot;
  if (v.bis) o.bis = v.bis;
  if (v.neue_notiz) o.neue_notiz = v.neue_notiz;
  return o;
}

function readIds(o: Record<string, unknown>): string[] {
  const id = o.id == null || o.id === "" ? null : String(o.id).trim();
  const raw = o.ids === undefined || o.ids === null ? [] : o.ids;
  if (!Array.isArray(raw)) throw new Error("ids muss eine Liste sein.");
  const ids = [...new Set(raw.map((item) => {
    const s = String(item ?? "").trim();
    if (!UUID.test(s)) throw new Error("Eine ID ist ungültig.");
    return s;
  }))];
  if (id) {
    if (!UUID.test(id)) throw new Error("id ist keine gültige ID.");
    if (!ids.includes(id)) ids.unshift(id);
  }
  if (ids.length > CRM_MATCH_LIMIT) throw new Error("Zu viele IDs auf einmal.");
  return ids;
}

function flag(v: unknown): boolean {
  return v === true || String(v).toLowerCase() === "true";
}

function asObj(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Ungültige Eingabe.");
  return input as Record<string, unknown>;
}

function clip(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string" && typeof v !== "number") return null;
  let out = "";
  for (const ch of String(v)) {
    const c = ch.charCodeAt(0);
    if (c === 0 || c === 60 || c === 62) continue;
    out += ch;
  }
  const s = out.trim();
  return s ? s.slice(0, max) : null;
}

function clock(v: unknown, label: string): string {
  const m = String(v ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error(`${label} muss HH:MM sein.`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`${label} ist ungültig.`);
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function tryJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    throw new Error("JSON ist ungültig.");
  }
}
