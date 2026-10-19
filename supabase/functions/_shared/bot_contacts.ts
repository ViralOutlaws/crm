// Reine Regeln für op create_contacts. Kein Netz, kein Service-Role-Key.
// workspace_id kommt nie aus dem Body. Die Funktion legt nur an, sie ändert und löscht nicht.

export const CONTACT_BATCH_MAX = 50;

/** Erste Phase in index.html: <option value="lead"> und normStatus-Fallback "lead". */
export const CONTACT_STATUS_DEFAULT = "lead";
export const CONTACT_STATUSES = ["lead", "erstgespraech", "angebot", "gewonnen", "verloren"] as const;

/** Schlüssel aus index.html QUELLEN und #c-quelle. Leer oder unbekannt wird sonstiges. */
export const CONTACT_QUELLEN = ["website", "ki-check", "empfehlung", "instagram", "google", "kaltakquise", "sonstiges"] as const;
export const CONTACT_QUELLE_DEFAULT = "sonstiges";

/** Alle Operationen 32.000 Zeichen, nur create_contacts 240.000. */
export const BODY_LIMIT = 32_000;
export const CONTACT_BODY_LIMIT = 240_000;

/** PostgREST-Filter: PLZ leer oder null, ohne die ganze Tabelle zu laden. */
export const EMPTY_PLZ_FILTER = 'plz.is.null,plz.eq.""';

export const CONTACT_FIELDS = [
  "firma", "person", "branche", "str", "plz", "ort", "tel", "email", "web", "status", "quelle", "ana", "notes",
] as const;

const LIMITS: Record<(typeof CONTACT_FIELDS)[number], number> = {
  firma: 200,
  person: 160,
  branche: 40,
  str: 200,
  plz: 16,
  ort: 120,
  tel: 40,
  email: 200,
  web: 300,
  status: 40,
  quelle: 80,
  ana: 2000,
  notes: 2000,
};

const LEGAL_FORMS = [
  "gmbh & co kg",
  "gmbh & co",
  "ug haftungsbeschränkt",
  "ug haftungsbeschrankt",
  "e kfm",
  "e kfr",
  "e k",
  "gmbh",
  "mbh",
  "gbr",
  "ohg",
  "inc",
  "ltd",
  "llc",
  "ag",
  "ug",
  "kg",
];

export type ContactKey = {
  id: string;
  firma: string | null;
  plz: string | null;
  email: string | null;
  web: string | null;
};

export type ContactRow = {
  firma: string;
  person: string | null;
  branche: string | null;
  str: string | null;
  plz: string | null;
  ort: string | null;
  tel: string | null;
  email: string | null;
  web: string | null;
  status: string;
  quelle: string;
  ana: string | null;
  notes: string | null;
};

export type ContactPlan =
  | { kind: "insert"; id: string; row: ContactRow }
  | { kind: "duplicate"; existing_id: string }
  | { kind: "error"; error: string };

function cleanText(value: unknown, max: number): { ok: true; value: string } | { ok: false } {
  if (value == null) return { ok: true, value: "" };
  if (typeof value === "number" && Number.isFinite(value)) return { ok: true, value: String(value).slice(0, max) };
  if (typeof value !== "string") return { ok: false };
  const stripped = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  return { ok: true, value: stripped.slice(0, max) };
}

export function normFirma(input: string): string {
  let t = input.trim().toLowerCase().replace(/[.,()/]/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < LEGAL_FORMS.length + 2; i++) {
    const next = LEGAL_FORMS.reduce((cur, form) => cur.endsWith(` ${form}`) ? cur.slice(0, -(form.length + 1)).trim() : cur, t);
    if (next === t) break;
    t = next;
  }
  return t;
}

export function normPlz(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "");
}

export function normEmail(input: string): string {
  const s = input.trim().toLowerCase();
  if (!s || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "";
  return s;
}

export function webDomain(input: string): string {
  let s = input.trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.split("/")[0]?.split("?")[0]?.split("#")[0] || "";
  const at = s.lastIndexOf("@");
  if (at >= 0) s = s.slice(at + 1);
  s = s.split(":")[0] || "";
  if (s.startsWith("www.")) s = s.slice(4);
  if (!s || !s.includes(".") || s.includes(" ")) return "";
  return s;
}

const QUELLE_BY_LOWER = new Map(CONTACT_QUELLEN.map((value) => [value.toLowerCase(), value]));

export function berlinDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function canonStatus(input: string): string {
  const value = input.trim().toLowerCase();
  if ((CONTACT_STATUSES as readonly string[]).includes(value)) return value;
  return CONTACT_STATUS_DEFAULT;
}

export function canonQuelle(input: string): { value: string; rejected: string | null } {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (!trimmed) return { value: CONTACT_QUELLE_DEFAULT, rejected: null };
  const hit = QUELLE_BY_LOWER.get(trimmed.toLowerCase());
  if (hit) return { value: hit, rejected: null };
  return { value: CONTACT_QUELLE_DEFAULT, rejected: trimmed };
}

function botNote(botName: string, day: string, rejected: string | null): string {
  const source = rejected ? ` (Quelle: ${rejected})` : "";
  return `[${day}] Angelegt von Bot ${botName}${source}`.slice(0, LIMITS.notes);
}

function mergeNotes(userNotes: string, line: string): string {
  if (!userNotes) return line;
  const room = LIMITS.notes - line.length - 1;
  if (room <= 0) return line;
  return `${userNotes.slice(0, room)}\n${line}`;
}

export function plzVariants(input: string): string[] {
  const trimmed = input.trim();
  const compact = trimmed.replace(/\s+/g, "");
  const out: string[] = [];
  const add = (value: string) => {
    if (value && !out.includes(value)) out.push(value);
  };
  add(trimmed);
  add(compact);
  if (/^\d{5}$/.test(compact)) add(`${compact.slice(0, 2)} ${compact.slice(2)}`);
  return out;
}

export type ContactLookup = {
  emails: string[];
  domains: string[];
  plz: string[];
  emptyPlz: boolean;
};

export function contactLookup(candidates: Array<{ firma: string; plz: string | null; email: string | null; web: string | null }>): ContactLookup {
  const emails = new Set<string>();
  const domains = new Set<string>();
  const plz = new Set<string>();
  let emptyPlz = false;
  for (const row of candidates) {
    const email = normEmail(row.email || "");
    if (email && !unsafeLookupValue(email)) emails.add(email);
    const domain = webDomain(row.web || "");
    if (domain && !unsafeLookupValue(domain)) domains.add(domain);
    if (!normFirma(row.firma || "")) continue;
    if (!normPlz(row.plz || "")) {
      emptyPlz = true;
      continue;
    }
    for (const variant of plzVariants(row.plz || "")) plz.add(variant);
  }
  return {
    emails: [...emails].sort(),
    domains: [...domains].sort(),
    plz: [...plz].sort(),
    emptyPlz,
  };
}

/** LIKE-Wildcards im Suchwert entschärfen. Die umgebenden % setzt der Aufrufer. */
export function likePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

const UNSAFE_FILTER = /[",()\\]/;

/** PostgREST zerlegt , ( ) und \ im or-Filter. Solche E-Mails und Domains sind hier ungültig. */
export function unsafeLookupValue(value: string): boolean {
  return UNSAFE_FILTER.test(value);
}

/** PostgREST-or-Filter. Anführungszeichen im Wert sind \", nicht "". */
export function orIlike(column: string, patterns: string[]): string {
  return patterns.map((pattern) => `${column}.ilike."${pattern.replace(/"/g, '\\"')}"`).join(",");
}

export function requestTooLarge(length: number, op: string): boolean {
  if (op === "create_contacts") return length > CONTACT_BODY_LIMIT;
  return length > BODY_LIMIT;
}

const workspaceLocks = new Map<string, Promise<void>>();

/** Serialisiert create_contacts pro Workspace in dieser Instanz. Ein Fehler reißt die Kette nicht ab. */
export function withWorkspaceLock<T>(workspaceId: string, task: () => Promise<T>): Promise<T> {
  const prev = workspaceLocks.get(workspaceId) ?? Promise.resolve();
  const run = prev.then(task, task);
  const tracked = run.then(() => undefined, () => undefined);
  workspaceLocks.set(workspaceId, tracked);
  tracked.then(() => {
    if (workspaceLocks.get(workspaceId) === tracked) workspaceLocks.delete(workspaceId);
  });
  return run;
}

export function duplicateId(candidate: { firma: string; plz: string | null; email: string | null; web: string | null }, existing: ContactKey[]): string | null {
  const email = normEmail(candidate.email || "");
  const domain = webDomain(candidate.web || "");
  const firma = normFirma(candidate.firma);
  const plz = normPlz(candidate.plz || "");
  if (email) {
    for (const row of existing) {
      if (normEmail(row.email || "") === email) return row.id;
    }
  }
  if (domain) {
    for (const row of existing) {
      if (webDomain(row.web || "") === domain) return row.id;
    }
  }
  if (firma) {
    for (const row of existing) {
      if (normFirma(row.firma || "") === firma && normPlz(row.plz || "") === plz) return row.id;
    }
  }
  return null;
}

export function prepareContact(raw: unknown, botName: string, day: string): { ok: true; row: ContactRow } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Kontakt muss ein Objekt sein." };
  const src = raw as Record<string, unknown>;
  const values: Record<string, string> = {};
  for (const key of CONTACT_FIELDS) {
    if (!(key in src)) {
      values[key] = "";
      continue;
    }
    const cleaned = cleanText(src[key], LIMITS[key]);
    if (!cleaned.ok) return { ok: false, error: `${key} ist kein Text.` };
    values[key] = cleaned.value;
  }
  if (!values.firma) return { ok: false, error: "Firma fehlt." };
  if (values.email && !normEmail(values.email)) return { ok: false, error: "E-Mail ungültig." };
  if (values.email && unsafeLookupValue(normEmail(values.email))) return { ok: false, error: "E-Mail ungültig." };
  const domain = webDomain(values.web);
  if (domain && unsafeLookupValue(domain)) return { ok: false, error: "Domain ungültig." };
  const status = canonStatus(values.status);
  const quelle = canonQuelle(values.quelle);
  const empty = (key: string) => values[key] || null;
  return {
    ok: true,
    row: {
      firma: values.firma,
      person: empty("person"),
      branche: empty("branche"),
      str: empty("str"),
      plz: empty("plz"),
      ort: empty("ort"),
      tel: empty("tel"),
      email: empty("email"),
      web: empty("web"),
      status,
      quelle: quelle.value,
      ana: empty("ana"),
      notes: mergeNotes(values.notes, botNote(botName, day, quelle.rejected)),
    },
  };
}

export function planContactBatch(items: unknown[], existing: ContactKey[], botName: string, newId: () => string, day: string): ContactPlan[] {
  const index = existing.map((row) => ({ ...row }));
  const plans: ContactPlan[] = [];
  for (const item of items) {
    const prepared = prepareContact(item, botName, day);
    if (!prepared.ok) {
      plans.push({ kind: "error", error: prepared.error });
      continue;
    }
    const hit = duplicateId(prepared.row, index);
    if (hit) {
      plans.push({ kind: "duplicate", existing_id: hit });
      continue;
    }
    const id = newId();
    plans.push({ kind: "insert", id, row: prepared.row });
    index.push({
      id,
      firma: prepared.row.firma,
      plz: prepared.row.plz,
      email: prepared.row.email,
      web: prepared.row.web,
    });
  }
  return plans;
}

export function contactInputs(op: string, body: Record<string, unknown>): { ok: true; items: unknown[] } | { ok: false; error: string } {
  if (op === "create_contact") {
    if (body.contact != null) {
      if (!body.contact || typeof body.contact !== "object" || Array.isArray(body.contact)) {
        return { ok: false, error: "contact muss ein Objekt sein." };
      }
      return { ok: true, items: [body.contact] };
    }
    if (CONTACT_FIELDS.some((key) => key in body)) return { ok: true, items: [body] };
    return { ok: false, error: "contact muss ein Objekt sein." };
  }
  if (op === "create_contacts") {
    if (!Array.isArray(body.contacts)) return { ok: false, error: "contacts muss eine Liste sein." };
    if (!body.contacts.length) return { ok: false, error: "Keine Kontakte." };
    if (body.contacts.length > CONTACT_BATCH_MAX) return { ok: false, error: "Höchstens 50 Kontakte." };
    return { ok: true, items: body.contacts };
  }
  return { ok: false, error: "Unbekannte Operation." };
}

export function contactBatchSummary(results: Array<Record<string, unknown>>): string {
  let created = 0;
  let duplicates = 0;
  let errors = 0;
  for (const row of results) {
    if (row.created === true) created += 1;
    else if (row.duplicate === true) duplicates += 1;
    else errors += 1;
  }
  return `Kontakte: ${created} angelegt, ${duplicates} Dubletten, ${errors} Fehler.`;
}

export function contactResult(plan: ContactPlan): Record<string, unknown> {
  if (plan.kind === "insert") return { created: true, id: plan.id };
  if (plan.kind === "duplicate") return { duplicate: true, existing_id: plan.existing_id };
  return { error: plan.error };
}
