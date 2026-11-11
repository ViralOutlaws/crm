// Reine Regeln für log_call, list_calls und set_do_not_call.
// Kein Netz und kein Service-Role-Key. workspace_id kommt nie aus dem Body.

export const CALL_RESULTS = [
  "Termin",
  "Rückruf",
  "Kein Interesse",
  "Mailbox/nicht erreicht",
  "Sperre",
] as const;

export type CallResult = (typeof CALL_RESULTS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;

const LIMITS = {
  firma: 200,
  person: 160,
  tel: 40,
  email: 200,
  note: 4000,
  objection: 200,
  next_step: 400,
  befund: 1000,
  slot: 80,
} as const;

export type LeadFields = {
  firma: string;
  person: string | null;
  tel: string | null;
  email: string | null;
  note: string | null;
};

export type CallFields = {
  result: CallResult;
  objection: string | null;
  note: string | null;
  nextStep: string | null;
  nextDate: string | null;
  befund: string | null;
  slot1: string | null;
  slot2: string | null;
  zeit: string | null;
};

export type CallPlan = {
  ok: true;
  contactId: string | null;
  leadId: string | null;
  newLead: LeadFields | null;
  call: CallFields;
  sperre: boolean;
  wiedervorlage: { datum: string } | null;
  termin: { datum: string; zeit: string | null; notiz: string | null } | null;
};

export type OpenLead = {
  id: string;
  firma: string | null;
  person: string | null;
  tel: string | null;
  converted_contact_id?: string | null;
};

type Fail = { ok: false; error: string };

function text(value: unknown, max: number, label: string): { ok: true; value: string } | Fail {
  if (value == null || value === "") return { ok: true, value: "" };
  if (typeof value !== "string") return { ok: false, error: `${label} ist kein Text.` };
  const clean = value.replace(/\u0000/g, "").trim();
  if (clean.length > max) return { ok: false, error: `${label} ist zu lang.` };
  return { ok: true, value: clean };
}

function optional(value: unknown, max: number, label: string): { ok: true; value: string | null } | Fail {
  const parsed = text(value, max, label);
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value || null };
}

export function validDate(value: string): boolean {
  const m = DATE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(Date.UTC(y, month - 1, day));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

export function clampAttemptMax(value: unknown): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (n === 3 || n === 4 || n === 5) return n;
  return 5;
}

export function attemptLabel(count: number, max: unknown): string {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return `Versuch ${n} von ${clampAttemptMax(max)}`;
}

export function normTel(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("0049")) digits = "0" + digits.slice(4);
  else if (digits.startsWith("49") && digits.length > 10) digits = "0" + digits.slice(2);
  return digits;
}

export function sameTel(a: string, b: string): boolean {
  const x = normTel(a);
  const y = normTel(b);
  if (x.length < 6 || y.length < 6) return false;
  return x === y || (x.length >= 8 && y.length >= 8 && x.slice(-8) === y.slice(-8));
}

export function normName(input: string): string {
  return input.trim().toLocaleLowerCase("de-DE").replace(/\s+/g, " ");
}

/** Offener Lead mit derselben Nummer, sonst Firma und Person. Kein Kontakt. */
export function matchOpenLead(candidate: LeadFields, leads: OpenLead[]): string | null {
  const open = leads.filter((row) => !row.converted_contact_id);
  if (candidate.tel) {
    for (const row of open) {
      if (row.tel && sameTel(candidate.tel, row.tel)) return row.id;
    }
  }
  const firma = normName(candidate.firma);
  const person = normName(candidate.person || "");
  if (!candidate.tel && firma) {
    for (const row of open) {
      if (normName(row.firma || "") === firma && normName(row.person || "") === person) return row.id;
    }
  }
  return null;
}

export function wiedervorlageText(firma: string, person: string | null): string {
  const who = person ? `${firma} · ${person}` : firma;
  return `Rückruf: ${who}`.slice(0, 400);
}

export function terminTitel(firma: string): string {
  return `Entwurf zeigen: ${firma}`.slice(0, 200);
}

export function defaultNextStep(result: CallResult): string {
  if (result === "Termin") return "Entwurf zeigen";
  if (result === "Rückruf") return "Rückruf";
  if (result === "Mailbox/nicht erreicht") return "Erneut anrufen";
  if (result === "Sperre") return "Nicht mehr anrufen";
  return "Kein Interesse";
}

function uuidOrNull(value: unknown, label: string): { ok: true; value: string | null } | Fail {
  if (value == null || value === "") return { ok: true, value: null };
  if (typeof value !== "string" || !UUID.test(value)) return { ok: false, error: `${label} ungültig.` };
  return { ok: true, value: value };
}

export function planCall(body: Record<string, unknown>): CallPlan | Fail {
  const contact = uuidOrNull(body.contact_id, "Kontakt");
  if (!contact.ok) return contact;
  const lead = uuidOrNull(body.lead_id, "Lead");
  if (!lead.ok) return lead;
  if (contact.value && lead.value) return { ok: false, error: "Entweder Kontakt oder Lead." };

  const resultRaw = text(body.result, 80, "Ergebnis");
  if (!resultRaw.ok) return resultRaw;
  if (!CALL_RESULTS.includes(resultRaw.value as CallResult)) return { ok: false, error: "Ergebnis unbekannt." };
  const result = resultRaw.value as CallResult;

  const objection = optional(body.objection, LIMITS.objection, "Einwand");
  if (!objection.ok) return objection;
  const note = optional(body.note, LIMITS.note, "Notiz");
  if (!note.ok) return note;
  const befund = optional(body.befund, LIMITS.befund, "Befund");
  if (!befund.ok) return befund;
  const slot1 = optional(body.slot1, LIMITS.slot, "Slot 1");
  if (!slot1.ok) return slot1;
  const slot2 = optional(body.slot2, LIMITS.slot, "Slot 2");
  if (!slot2.ok) return slot2;
  const nextStepRaw = optional(body.next_step, LIMITS.next_step, "Nächster Schritt");
  if (!nextStepRaw.ok) return nextStepRaw;
  const zeitRaw = optional(body.zeit, 5, "Uhrzeit");
  if (!zeitRaw.ok) return zeitRaw;
  if (zeitRaw.value && !ZEIT.test(zeitRaw.value)) return { ok: false, error: "Uhrzeit ungültig." };

  const dateRaw = optional(body.next_date, 10, "Datum");
  if (!dateRaw.ok) return dateRaw;
  if (dateRaw.value && !validDate(dateRaw.value)) return { ok: false, error: "Datum ungültig." };
  if ((result === "Termin" || result === "Rückruf") && !dateRaw.value) {
    return { ok: false, error: result === "Termin" ? "Für einen Termin brauchen Sie ein Datum." : "Für einen Rückruf brauchen Sie ein Datum." };
  }

  let newLead: LeadFields | null = null;
  if (!contact.value && !lead.value) {
    const src = body.lead;
    if (!src || typeof src !== "object" || Array.isArray(src)) return { ok: false, error: "Lead fehlt." };
    const leadBody = src as Record<string, unknown>;
    if ("workspace_id" in leadBody || "id" in leadBody || "contact_id" in leadBody) {
      return { ok: false, error: "Lead enthält ein fremdes Feld." };
    }
    const firma = text(leadBody.firma, LIMITS.firma, "Firma");
    if (!firma.ok) return firma;
    if (!firma.value) return { ok: false, error: "Firma fehlt." };
    const person = optional(leadBody.person, LIMITS.person, "Ansprechpartner");
    if (!person.ok) return person;
    const tel = optional(leadBody.tel, LIMITS.tel, "Telefon");
    if (!tel.ok) return tel;
    const email = optional(leadBody.email, LIMITS.email, "E-Mail");
    if (!email.ok) return email;
    if (email.value && !email.value.includes("@")) return { ok: false, error: "E-Mail ungültig." };
    const leadNote = optional(leadBody.note, LIMITS.note, "Notiz");
    if (!leadNote.ok) return leadNote;
    newLead = { firma: firma.value, person: person.value, tel: tel.value, email: email.value, note: leadNote.value };
  } else if (body.lead != null) {
    return { ok: false, error: "Entweder Kontakt oder Lead." };
  }

  return {
    ok: true,
    contactId: contact.value,
    leadId: lead.value,
    newLead,
    call: {
      result,
      objection: objection.value,
      note: note.value,
      nextStep: nextStepRaw.value || defaultNextStep(result),
      nextDate: dateRaw.value,
      befund: befund.value,
      slot1: slot1.value,
      slot2: slot2.value,
      zeit: zeitRaw.value,
    },
    sperre: result === "Sperre",
    wiedervorlage: result === "Rückruf" && dateRaw.value ? { datum: dateRaw.value } : null,
    termin: result === "Termin" && dateRaw.value
      ? { datum: dateRaw.value, zeit: zeitRaw.value, notiz: befund.value }
      : null,
  };
}

export function planList(body: Record<string, unknown>): { ok: true; contactId: string | null; leadId: string | null; limit: number; openLeads: boolean } | Fail {
  const contact = uuidOrNull(body.contact_id, "Kontakt");
  if (!contact.ok) return contact;
  const lead = uuidOrNull(body.lead_id, "Lead");
  if (!lead.ok) return lead;
  let limit = 50;
  if (body.limit != null && body.limit !== "") {
    if (typeof body.limit !== "number" || !Number.isInteger(body.limit)) return { ok: false, error: "Limit ungültig." };
    if (body.limit < 1 || body.limit > 100) return { ok: false, error: "Limit ungültig." };
    limit = body.limit;
  }
  if (body.open_leads != null && typeof body.open_leads !== "boolean") return { ok: false, error: "open_leads ungültig." };
  return { ok: true, contactId: contact.value, leadId: lead.value, limit, openLeads: body.open_leads === true };
}

export function planDoNotCall(body: Record<string, unknown>): { ok: true; contactId: string | null; leadId: string | null; on: boolean } | Fail {
  const contact = uuidOrNull(body.contact_id, "Kontakt");
  if (!contact.ok) return contact;
  const lead = uuidOrNull(body.lead_id, "Lead");
  if (!lead.ok) return lead;
  if (!!contact.value === !!lead.value) return { ok: false, error: "Entweder Kontakt oder Lead." };
  if (typeof body.do_not_call !== "boolean") return { ok: false, error: "do_not_call fehlt." };
  return { ok: true, contactId: contact.value, leadId: lead.value, on: body.do_not_call };
}

export function ilikeExact(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
