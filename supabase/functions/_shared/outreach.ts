// Reine Regeln für Outreach. Kein Netz, keine Secrets, kein Versand.
import { threadKey } from "./mail.ts";

export const MAX_URLS = 8;
export const DAILY_LIMIT_DEFAULT = 50;
export const GAP_MINUTES_DEFAULT = 2;
export const GAP_CHOICES = [1, 2, 3, 5];

export const DRAFT_STATUSES = ["entwurf", "freigegeben", "gesendet", "antwort", "abgemeldet", "abgelehnt"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];
export type EmailArt = "veroeffentlicht" | "generisch" | "vermutet";

const GENERIC_LOCALS = new Set([
  "info", "kontakt", "contact", "office", "mail", "hello", "hallo", "service", "post",
  "anfrage", "team", "support", "buchhaltung", "rechnung", "rechnungen", "bewerbung",
  "jobs", "karriere", "presse", "marketing", "vertrieb", "sales", "webmaster", "admin",
  "datenschutz", "privacy", "zentrale", "empfang", "sekretariat", "buero", "büro",
]);

const SKIP_SEARCH_HOST = /(^|\.)(duckduckgo\.com|google\.[a-z.]+|bing\.com|facebook\.com|instagram\.com|linkedin\.com|xing\.com|youtube\.com|wikipedia\.org|gelbeseiten\.de|dasoertliche\.de)$/i;

export type FoundPerson = {
  person: string;
  rolle: string;
  email: string;
  emailArt: EmailArt;
  hinweis: string;
  adresse: string;
};

export type KnownParty = { email: string; domain: string; customer: boolean };

export type OutreachThread = {
  id: string;
  email: string;
  subject: string;
  messageId: string;
  status: string;
  contactId?: string | null;
};

export function clampGap(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return GAP_MINUTES_DEFAULT;
  const rounded = Math.round(value);
  if (GAP_CHOICES.includes(rounded)) return rounded;
  return GAP_CHOICES.reduce((best, choice) => Math.abs(choice - rounded) < Math.abs(best - rounded) ? choice : best, GAP_MINUTES_DEFAULT);
}

export const SEND_HOUR_FROM = 8;
export const SEND_HOUR_TO = 18;
export const SEND_WEEKDAYS = [1, 2, 3, 4, 5];

export function clampSettings(input: { daily_limit?: number; gap_minutes?: number; guess_emails?: boolean; hour_from?: number; hour_to?: number; weekdays?: number[]; paused?: boolean }) {
  const daily = Number(input.daily_limit);
  const gap = clampGap(Number(input.gap_minutes));
  let hourFrom = Number(input.hour_from);
  let hourTo = Number(input.hour_to);
  if (!Number.isFinite(hourFrom)) hourFrom = SEND_HOUR_FROM;
  if (!Number.isFinite(hourTo)) hourTo = SEND_HOUR_TO;
  hourFrom = Math.min(23, Math.max(0, Math.round(hourFrom)));
  hourTo = Math.min(24, Math.max(1, Math.round(hourTo)));
  if (hourFrom >= hourTo) {
    hourFrom = SEND_HOUR_FROM;
    hourTo = SEND_HOUR_TO;
  }
  const days = (Array.isArray(input.weekdays) ? input.weekdays : SEND_WEEKDAYS)
    .map((n) => Number(n))
    .filter((n) => n >= 1 && n <= 7);
  return {
    daily_limit: Math.min(100, Math.max(1, Number.isFinite(daily) && daily > 0 ? Math.round(daily) : DAILY_LIMIT_DEFAULT)),
    gap_minutes: gap,
    guess_emails: input.guess_emails === true,
    paused: input.paused === true,
    hour_from: hourFrom,
    hour_to: hourTo,
    weekdays: days.length ? [...new Set(days)].sort((a, b) => a - b) : [...SEND_WEEKDAYS],
  };
}

const BERLIN_DOW: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function berlinClock(now: Date): { hour: number; isodow: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const weekday = parts.find((p) => p.type === "weekday")?.value || "";
  return { hour, isodow: BERLIN_DOW[weekday] || 0 };
}

/** Stunde von einschließlich, Stunde bis ausschließlich. Wochentage 1 = Montag … 7 = Sonntag. */
export function withinSendWindow(now: Date, input: { paused?: boolean; hourFrom?: number; hourTo?: number; weekdays?: number[] }): { ok: true } | { ok: false; reason: string } {
  if (input.paused) return { ok: false, reason: "Versand pausiert." };
  const clock = berlinClock(now);
  const days = input.weekdays?.length ? input.weekdays : SEND_WEEKDAYS;
  const from = Number.isFinite(Number(input.hourFrom)) ? Number(input.hourFrom) : SEND_HOUR_FROM;
  const to = Number.isFinite(Number(input.hourTo)) ? Number(input.hourTo) : SEND_HOUR_TO;
  if (!days.includes(clock.isodow)) return { ok: false, reason: "Außerhalb der Versandtage." };
  if (clock.hour < from || clock.hour >= to) return { ok: false, reason: "Außerhalb der Versandzeit." };
  return { ok: true };
}

export function splitUrls(raw: string): string[] {
  const seen: string[] = [];
  for (const part of String(raw || "").split(/[\s,;]+/)) {
    const s = part.trim();
    if (!/^https?:\/\//i.test(s) || seen.includes(s)) continue;
    seen.push(s);
  }
  return seen;
}

export function searchQuery(branche: string, region: string): string {
  return `${String(branche || "").trim()} ${String(region || "").trim()} Impressum`.replace(/\s+/g, " ").trim();
}

export function websiteDomain(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    return u.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return s.toLowerCase().replace(/^www\./, "").split("/")[0].replace(/\.$/, "");
  }
}

function ipv4Blocked(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const n = m.slice(1).map(Number);
  if (n.some((x) => x > 255)) return true;
  const [a, b] = n;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/** Öffentliche http(s)-URL. Interne Netze und Zugangsdaten bleiben draußen. */
export function assertPublicHttpUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let u: URL;
  try {
    u = new URL(String(raw || "").trim());
  } catch {
    return { ok: false, error: "Keine gültige URL" };
  }
  if (u.username || u.password) return { ok: false, error: "URL mit Zugangsdaten ist gesperrt" };
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, error: "Nur http und https" };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.includes(":")) {
    return { ok: false, error: "Interne Adresse ist gesperrt" };
  }
  if (ipv4Blocked(host)) return { ok: false, error: "Interne Adresse ist gesperrt" };
  u.hash = "";
  return { ok: true, url: u.toString() };
}

export function htmlToText(html: string): string {
  let s = String(html || "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|li|tr|h\d|address)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
  s = s.replace(/&quot;/gi, '"').replace(/&#(\d+);/g, (_a, n) => String.fromCharCode(Number(n)));
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ");
  return s.trim();
}

export function findImpressumUrl(html: string, base: string): string | null {
  const hits: string[] = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, " ");
    if (/impressum/i.test(href) || /impressum/i.test(text)) hits.push(href);
  }
  if (!hits.length) {
    const loose = /href\s*=\s*["']([^"']*impressum[^"']*)["']/i.exec(html);
    if (loose) hits.push(loose[1]);
  }
  for (const href of hits) {
    try {
      const pub = assertPublicHttpUrl(new URL(href, base).toString());
      if (pub.ok) return pub.url;
    } catch { /* relativ und ungültig */ }
  }
  return null;
}

export function extractEmails(text: string): string[] {
  const found = String(text || "").toLowerCase().match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/g) || [];
  const out: string[] = [];
  for (const raw of found) {
    const clean = raw.replace(/\.+$/, "");
    if (/\.(png|jpe?g|webp|gif|svg|css|js)$/.test(clean)) continue;
    if (!out.includes(clean)) out.push(clean);
  }
  return out;
}

export function emailLocal(email: string): string {
  return String(email || "").toLowerCase().split("@")[0]?.split("+")[0] || "";
}

export function isGenericEmail(email: string): boolean {
  const local = emailLocal(email);
  if (GENERIC_LOCALS.has(local)) return true;
  return /^(info|kontakt|contact|office|mail|post|hello|hallo)\d*$/.test(local);
}

export function fold(s: string): string {
  return String(s || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

export function emailMatchesPerson(email: string, person: string): boolean {
  const local = fold(emailLocal(email));
  const parts = String(person || "").split(/\s+/).filter((p) => p && !/^(von|van|de|der|und)$/i.test(p));
  if (parts.length < 2 || local.length < 3) return false;
  const last = fold(parts[parts.length - 1]);
  if (last.length < 3) return false;
  return local.includes(last);
}

export function guessEmail(person: string, domain: string): { email: string; pattern: string } | null {
  const host = websiteDomain(domain);
  const parts = String(person || "").split(/\s+/).filter((p) => p && !/^(von|van|de|der|und)$/i.test(p));
  if (parts.length < 2 || !host || host.includes("@")) return null;
  const first = fold(parts[0]);
  const last = fold(parts[parts.length - 1]);
  if (first.length < 2 || last.length < 2) return null;
  return { email: `${first}.${last}@${host}`, pattern: "vorname.nachname" };
}

function roleRank(role: string): number {
  const s = role.toLowerCase();
  if (s.includes("geschäftsführer")) return 0;
  if (s.includes("inhaber")) return 1;
  if (s.includes("vertret")) return 2;
  return 3;
}

function cleanName(raw: string): string {
  return String(raw || "")
    .replace(/[\r\n].*$/, "")
    .replace(/\s+(und|der|die|das|tel\.?|telefon|e-?mail|email|mail|fax|ust|umsatzsteuer|kontakt|adresse)\b[\s\S]*$/i, "")
    .replace(/[,;:].*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractPeople(text: string): { person: string; rolle: string }[] {
  const out: { person: string; rolle: string }[] = [];
  const seen = new Set<string>();
  const push = (person: string, rolle: string) => {
    const name = cleanName(person);
    if (!name || name.split(/\s+/).length < 2 || name.length > 80) return;
    const key = fold(name);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ person: name, rolle: rolle.trim() });
  };
  const roleFirst = /(?:gesellschafter[-\s]?geschäftsführer(?:in)?|geschäftsführer(?:in)?|inhaber(?:in)?|vertreten durch(?:\s+den\s+geschäftsführer(?:in)?)?|vertretungsberechtigt(?:e[rs]?)?)\s*[:\-]?\s*([A-ZÄÖÜ][\p{L}'’\-]+(?:\s+(?:von|van|de|der|und)?\s*[A-ZÄÖÜ][\p{L}'’\-]+){0,3})/giu;
  let m: RegExpExecArray | null;
  while ((m = roleFirst.exec(text))) {
    const label = m[0].split(/[:\-]/)[0].replace(/\s+/g, " ").trim();
    push(m[1], /vertreten|vertretungs/i.test(label) ? "Vertreten durch" : label);
  }
  const nameFirst = /([A-ZÄÖÜ][\p{L}'’\-]+(?:\s+[A-ZÄÖÜ][\p{L}'’\-]+){1,2})\s*[,(]\s*(Geschäftsführer(?:in)?|Inhaber(?:in)?)/gu;
  while ((m = nameFirst.exec(text))) push(m[1], m[2]);
  return out.sort((a, b) => roleRank(a.rolle) - roleRank(b.rolle));
}

export function extractAddress(text: string): { str: string; plz: string; ort: string; line: string } | null {
  const lines = String(text || "").split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const hit = /^(\d{5})\s+([A-ZÄÖÜ][\p{L}\- ]{1,40})$/u.exec(lines[i]);
    if (!hit) continue;
    const prev = i > 0 ? lines[i - 1] : "";
    const str = /straße|str\.|weg|platz|allee|ring|gasse|\d/i.test(prev) && !/gmbh|ag\b|kg\b|ug\b|ohg|gbr/i.test(prev) ? prev : "";
    const ort = hit[2].trim();
    return { str: str.slice(0, 160), plz: hit[1], ort: ort.slice(0, 80), line: [str, `${hit[1]} ${ort}`].filter(Boolean).join(", ") };
  }
  return null;
}

export function extractCompany(html: string, text: string, host: string): string {
  const title = htmlToText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "");
  const og = /property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1]
    || /content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i.exec(html)?.[1]
    || "";
  const legal = /([A-ZÄÖÜ0-9][\p{L}0-9&'’.\- ]{1,70}?\s(?:GmbH\s*&\s*Co\.\s*KG|GmbH|UG(?:\s*\(haftungsbeschränkt\))?|AG|e\.\s?K\.|KG|OHG|GbR))/u.exec(text);
  const fromTitle = title.split(/\s[\|\-–—]\s/).map((s) => s.trim()).find((s) => s && !/^(impressum|kontakt|home|startseite)$/i.test(s)) || "";
  const name = (legal?.[1] || og || fromTitle || host).replace(/\s+/g, " ").trim();
  return name.slice(0, 160);
}

export function readCompany(input: {
  pageHtml: string;
  pageUrl: string;
  impressumHtml?: string;
  impressumUrl?: string;
  guess: boolean;
}): {
  firma: string;
  domain: string;
  web: string;
  str: string;
  plz: string;
  ort: string;
  impressumUrl: string;
  excerpt: string;
  people: FoundPerson[];
} {
  const html = input.impressumHtml || input.pageHtml || "";
  const text = htmlToText(html);
  const domain = websiteDomain(input.pageUrl);
  const address = extractAddress(text);
  const people = extractPeople(text);
  const emails = extractEmails(text);
  const primary = people[0] || { person: "", rolle: "" };
  const adresse = address?.line || "";
  const found: FoundPerson[] = [];
  const personal = emails.find((e) => primary.person && emailMatchesPerson(e, primary.person) && !isGenericEmail(e));
  const generic = emails.find((e) => isGenericEmail(e));
  if (personal) {
    found.push({
      person: primary.person,
      rolle: primary.rolle,
      email: personal,
      emailArt: "veroeffentlicht",
      hinweis: "Persönliche Adresse auf der Website",
      adresse,
    });
  }
  if (generic && generic !== personal) {
    found.push({
      person: primary.person,
      rolle: primary.rolle,
      email: generic,
      emailArt: "generisch",
      hinweis: "Nur eine allgemeine Adresse veröffentlicht",
      adresse,
    });
  }
  if (!personal && !generic && emails[0]) {
    const art: EmailArt = isGenericEmail(emails[0]) ? "generisch" : "veroeffentlicht";
    found.push({
      person: primary.person,
      rolle: primary.rolle,
      email: emails[0],
      emailArt: art,
      hinweis: art === "generisch" ? "Nur eine allgemeine Adresse veröffentlicht" : "Auf der Website veröffentlicht",
      adresse,
    });
  }
  if (input.guess && primary.person) {
    const guessed = guessEmail(primary.person, domain);
    if (guessed && !found.some((p) => p.email === guessed.email)) {
      found.push({
        person: primary.person,
        rolle: primary.rolle,
        email: guessed.email,
        emailArt: "vermutet",
        hinweis: `Vermutet (${guessed.pattern}), nicht geprüft`,
        adresse,
      });
    }
  }
  return {
    firma: extractCompany(input.pageHtml || html, text, domain),
    domain,
    web: input.pageUrl,
    str: address?.str || "",
    plz: address?.plz || "",
    ort: address?.ort || "",
    impressumUrl: input.impressumUrl || "",
    excerpt: text.slice(0, 1200),
    people: found,
  };
}

export function preferredPerson(people: FoundPerson[]): FoundPerson | null {
  return people.find((p) => p.emailArt === "veroeffentlicht") || people.find((p) => p.emailArt === "generisch") || null;
}

export function parseSearchLinks(html: string): string[] {
  const out: string[] = [];
  const re = /uddg=([^&"']+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let raw = "";
    try {
      raw = decodeURIComponent(m[1]);
    } catch {
      continue;
    }
    const pub = assertPublicHttpUrl(raw);
    if (!pub.ok) continue;
    let host = "";
    try {
      host = new URL(pub.url).hostname;
    } catch {
      continue;
    }
    if (SKIP_SEARCH_HOST.test(host)) continue;
    if (!out.includes(pub.url)) out.push(pub.url);
  }
  return out;
}

export function outreachSkip(input: {
  email: string;
  domain: string;
  blocklist: string[];
  crm: KnownParty[];
  priorEmails: string[];
  priorDomains: string[];
  rejectedEmails: string[];
}): string | null {
  const email = String(input.email || "").toLowerCase();
  const domain = websiteDomain(input.domain);
  if (email && input.blocklist.some((e) => e.toLowerCase() === email)) return "Abgemeldet";
  if (email && input.rejectedEmails.some((e) => e.toLowerCase() === email)) return "Bewusst abgelehnt";
  const byEmail = email ? input.crm.find((c) => c.email.toLowerCase() === email) : undefined;
  if (byEmail?.customer) return "Bestandskunde";
  if (byEmail) return "Schon im CRM";
  const byDomain = domain ? input.crm.find((c) => c.domain && websiteDomain(c.domain) === domain) : undefined;
  if (byDomain?.customer) return "Bestandskunde";
  if (byDomain) return "Schon im CRM";
  if (email && input.priorEmails.some((e) => e.toLowerCase() === email)) return "Schon angeschrieben";
  if (domain && input.priorDomains.some((d) => websiteDomain(d) === domain)) return "Schon angeschrieben";
  return null;
}

export function sendDecision(input: {
  kind?: "outreach" | "reply";
  status: string;
  emailArt: string;
  guessOk: boolean;
  skip: string | null;
  sentToday: number;
  dailyLimit: number;
  lastSentAt: number | null;
  now: number;
  gapMinutes: number;
}): { ok: true } | { ok: false; reason: string } {
  if (input.status === "abgemeldet" || input.skip === "Abgemeldet") return { ok: false, reason: "Diese Adresse ist abgemeldet." };
  if (input.skip) return { ok: false, reason: input.skip };
  if (input.kind === "reply") {
    if (input.status !== "gesendet" && input.status !== "antwort") {
      return { ok: false, reason: "Eine Antwort geht nur in einem bestehenden Gespräch raus." };
    }
  } else {
    if (input.status !== "freigegeben") return { ok: false, reason: "Nur eine freigegebene Mail darf raus." };
    if (input.emailArt === "vermutet" && !input.guessOk) {
      return { ok: false, reason: "Eine vermutete Adresse braucht eine ausdrückliche Freigabe." };
    }
  }
  const limit = input.dailyLimit > 0 ? input.dailyLimit : DAILY_LIMIT_DEFAULT;
  if (input.sentToday >= limit) return { ok: false, reason: "Tageslimit erreicht." };
  const gap = Math.max(0, input.gapMinutes) * 60_000;
  if (input.lastSentAt != null && input.now - input.lastSentAt < gap) {
    const wait = Math.ceil((gap - (input.now - input.lastSentAt)) / 1000);
    return { ok: false, reason: `Abstand nicht erreicht. Noch ${wait} Sekunden.` };
  }
  return { ok: true };
}

/** Nur der neue Teil einer Antwort: ohne zitierte Zeilen und ohne den Verlauf darunter. */
export function replyOwnText(text: string): string {
  const lines = String(text || "").split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*(?:am .{4,120}schrieb|on .{4,120}wrote|-{2,}\s*(?:original|ursprüngliche)|von:\s|from:\s)/i.test(line)) break;
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join("\n");
}

export function isOptOut(text: string): boolean {
  const s = replyOwnText(text).toLowerCase().replace(/falls das kein thema für sie ist[^.]*\./g, " ");
  return /abmelden|austragen|unsubscribe|opt-?out|keine weiteren|nicht mehr (schreiben|kontaktieren|anrufen|melden)|bitte nicht mehr|kein interesse|kein thema|keine werbung|aus dem verteiler|lösch(?:en|t) (?:meine|uns)|nehmen sie .{0,40}(?:raus|heraus)|widerspreche/.test(s);
}

export function normalizeMessageId(raw: string): string {
  return String(raw || "").trim().replace(/^<|>$/g, "").toLowerCase();
}

export function referencedIds(header: string): string[] {
  const unfolded = String(header || "").replace(/\r?\n[ \t]+/g, " ");
  const blob = [
    /in-reply-to:\s*(.*)/i.exec(unfolded)?.[1] || "",
    /references:\s*(.*)/i.exec(unfolded)?.[1] || "",
  ].join(" ");
  return (blob.match(/<?[^\s<>]+@[^>\s]+>?/g) || []).map(normalizeMessageId);
}

export function replyPlan(input: {
  fromEmail: string;
  subject: string;
  text: string;
  header: string;
  drafts: OutreachThread[];
}): { draftId: string; contactId: string | null; nextStatus: "antwort" | "abgemeldet"; blockEmail: string | null; unread: true } | null {
  const open = input.drafts.filter((d) => d.status === "gesendet" || d.status === "antwort" || d.status === "abgemeldet");
  const refs = referencedIds(input.header);
  let hit = open.find((d) => d.messageId && refs.includes(normalizeMessageId(d.messageId)));
  if (!hit) {
    const from = String(input.fromEmail || "").toLowerCase();
    const key = threadKey(input.subject);
    hit = open.find((d) => d.email.toLowerCase() === from && key.length > 0 && threadKey(d.subject) === key);
  }
  if (!hit) return null;
  const opt = isOptOut(input.text) || hit.status === "abgemeldet";
  return {
    draftId: hit.id,
    contactId: hit.contactId || null,
    nextStatus: opt ? "abgemeldet" : "antwort",
    blockEmail: opt ? hit.email.toLowerCase() : null,
    unread: true,
  };
}

export function outreachMessageId(draftId: string, now = Date.now()): string {
  const id = String(draftId || "").replace(/[^a-z0-9-]/gi, "").slice(0, 80) || "draft";
  return `<outreach.${id}.${now}@viraloutlaws.de>`;
}

export const MIN_OBSERVATIONS = 2;
export const SUBSTANCE_LABEL = "zu wenig Substanz";
export const MAIL_WORD_MAX = 130;

export type Observation = {
  kind: "aktualitaet" | "mobil" | "tempo" | "kontakt" | "buchung" | "seo" | "social" | "auftritt";
  text: string;
  source: string;
  tip: string;
  impact: string;
  wert: string;
};

const IMPACT_RANK: Record<Observation["kind"], number> = {
  kontakt: 0,
  buchung: 1,
  mobil: 2,
  tempo: 3,
  social: 4,
  seo: 5,
  auftritt: 6,
  aktualitaet: 8,
};

export type PortfolioRef = {
  firma: string;
  branche?: string | null;
  ort?: string | null;
  web?: string | null;
  note?: string | null;
};

const KIND_MARK: Record<Observation["kind"], RegExp> = {
  aktualitaet: /gepflegt|impressum/i,
  mobil: /handy|winzig|bildschirm/i,
  tempo: /warten|lädt|langsam/i,
  kontakt: /anfrag|telefon|formular|abends/i,
  buchung: /termin|buchen|reservier/i,
  seo: /suche|google|überschrift/i,
  social: /bewertung|profil|vertrauen/i,
  auftritt: /eindruck|lesen/i,
};

const JARGON = /viewport|\bdefer\b|\basync\b|\bh1\b|meta description|srcset/i;
const TEMPLATE_LINE = /das lässt sich ändern, ohne die seite neu zu bauen/i;

const BANNED = /innovativ|maßgeschneidert|massgeschneidert|revolutionär|revolutionaer|ich hoffe, diese mail|einmalig|state of the art|nicht zögern|nicht zoeegern|letzte chance|garantiert|unschlagbar|weltklasse/i;

export function findContactUrl(html: string, base: string): string | null {
  const hits: string[] = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, " ");
    if (/impressum/i.test(href) || /impressum/i.test(text)) continue;
    if (/kontakt|contact/i.test(href) || /kontakt|contact/i.test(text)) hits.push(href);
  }
  for (const href of hits) {
    try {
      const pub = assertPublicHttpUrl(new URL(href, base).toString());
      if (pub.ok) return pub.url;
    } catch { /* ungültig */ }
  }
  return null;
}

function pushObs(out: Observation[], item: Observation) {
  if (out.some((o) => o.kind === item.kind)) return;
  out.push(item);
}

export function rankObservations(list: Observation[]): Observation[] {
  const ranked = [...list].sort((a, b) => (IMPACT_RANK[a.kind] ?? 9) - (IMPACT_RANK[b.kind] ?? 9));
  const strong = ranked.filter((o) => o.kind !== "aktualitaet");
  return (strong.length >= MIN_OBSERVATIONS ? strong : ranked).slice(0, 3);
}

export function observeSite(input: {
  pageHtml: string;
  pageUrl: string;
  impressumHtml?: string;
  impressumUrl?: string;
  contactHtml?: string;
  contactUrl?: string;
  year?: number;
}): Observation[] {
  const year = input.year || new Date().getFullYear();
  const startUrl = input.pageUrl;
  const impUrl = input.impressumUrl || startUrl;
  const contactUrl = input.contactUrl || "";
  const startText = htmlToText(input.pageHtml || "");
  const impText = htmlToText(input.impressumHtml || "");
  const contactText = htmlToText(input.contactHtml || "");
  const allText = [startText, impText, contactText].filter(Boolean).join("\n");
  const out: Observation[] = [];

  const stamp = /(?:©|\(c\)|copyright|stand|aktualisiert|letzte änderung)[^\d]{0,24}((?:19|20)\d{2})/i.exec(impText || startText);
  if (stamp) {
    const found = Number(stamp[1]);
    if (found <= year - 2) {
      pushObs(out, {
        kind: "aktualitaet",
        text: `Im Impressum steht als Stand das Jahr ${found}.`,
        source: impText ? impUrl : startUrl,
        tip: `Die Jahreszahl auf ${year} setzen, sobald der Text dazu stimmt.`,
        impact: "Die Seite wirkt nicht gepflegt.",
        wert: "Den Stand im Impressum anfassen, wenn der Rest der Seite stimmt.",
      });
    }
  }

  if (!/<meta[^>]+name=["']viewport["']/i.test(input.pageHtml || "")) {
    pushObs(out, {
      kind: "mobil",
      text: "Die Startseite hat kein viewport-Meta.",
      source: startUrl,
      tip: "Im Kopf ein viewport-Meta setzen, damit das Handy die Seite nicht auf Desktop-Breite verkleinert.",
      impact: "Auf dem Handy wird die Seite winzig dargestellt. Viele Besucher springen da ab.",
      wert: "Die Seite auf die Breite des Handys einstellen, damit der erste Blick lesbar ist.",
    });
  }

  const head = /<head[\s\S]*?<\/head>/i.exec(input.pageHtml || "")?.[0] || "";
  const blocking = [...head.matchAll(/<script\b([^>]*)>/gi)].filter((s) => !/\b(defer|async|type\s*=\s*["']module["'])/i.test(s[1]));
  if (blocking.length >= 2) {
    pushObs(out, {
      kind: "tempo",
      text: `Im Kopf der Startseite liegen ${blocking.length} Skripte ohne defer oder async.`,
      source: startUrl,
      tip: "Diese Skripte mit defer laden, damit der Text vor den Skripten da ist.",
      impact: "Besucher warten, bevor der Text auf der Seite da ist.",
      wert: "Die schweren Dateien nach hinten schieben, damit der Text sofort lesbar ist.",
    });
  }

  const photos = [...(input.pageHtml || "").matchAll(/<img\b([^>]*)>/gi)].filter((s) => /\.(jpe?g|png|webp)/i.test(s[1]) && !/srcset\s*=/i.test(s[1]));
  if (photos.length >= 4 && !out.some((o) => o.kind === "tempo")) {
    pushObs(out, {
      kind: "tempo",
      text: `${photos.length} Bilder auf der Startseite haben kein srcset.`,
      source: startUrl,
      tip: "Für die großen Bilder eine kleinere Variante fürs Handy hinterlegen.",
      impact: "Auf dem Handy werden große Fotos geladen. Das dauert, und Leute warten nicht.",
      wert: "Fürs Handy kleinere Fotos ausliefern, damit die Seite nicht hängt.",
    });
  }

  const pages = [input.pageHtml || "", input.impressumHtml || "", input.contactHtml || ""].join("\n");
  const formOnStart = /<form\b/i.test(input.pageHtml || "");
  const formElsewhere = /<form\b/i.test(input.contactHtml || "") || /<form\b/i.test(input.impressumHtml || "");
  const hasTel = /href=["']tel:/i.test(pages) || /\b0\d{2,4}[\s/.-]?\d/.test(allText);
  if (!formOnStart && formElsewhere && contactUrl) {
    pushObs(out, {
      kind: "kontakt",
      text: "Ein Formular liegt erst auf der Kontaktseite, nicht im ersten Blick der Startseite.",
      source: contactUrl,
      tip: "Den Link zum Formular neben die Telefonnummer in den ersten Bildschirm auf dem Handy setzen.",
      impact: "Wer anfragen will, muss die Kontaktseite erst suchen.",
      wert: "Telefon und den Weg zur Anfrage in den ersten Blick auf dem Handy legen.",
    });
  } else if (!formOnStart && !formElsewhere && hasTel) {
    pushObs(out, {
      kind: "kontakt",
      text: "Auf den gelesenen Seiten gibt es eine Telefonnummer und kein Formular.",
      source: startUrl,
      tip: "Unter die Telefonnummer ein Formular mit Name, Rückruf und Anliegen setzen, das eine Mail schickt.",
      impact: "Wer abends anfragen will, findet nur eine Telefonnummer.",
      wert: "Ein kurzes Formular mit Name und Anliegen fängt die Anfrage auf, auch wenn niemand rangeht.",
    });
  }

  const strong = () => out.some((o) => o.kind !== "buchung" && o.kind !== "social");
  if (strong() && !/termin|buchen|reservier|calendly|simplybook|treatwell/i.test(allText)) {
    pushObs(out, {
      kind: "buchung",
      text: "Auf den gelesenen Seiten steht kein Link mit Termin, Buchen oder Reservierung.",
      source: startUrl,
      tip: "Wenn Termine vorkommen, auf die Startseite einen Weg Termin anfragen setzen.",
      impact: "Einen Termin kann man auf der Seite nicht hinterlegen.",
      wert: "Einen sichtbaren Weg 'Termin anfragen' auf die Startseite setzen.",
    });
  }

  if (!/<meta[^>]+name=["']description["'][^>]*content=["'][^"']{12,}/i.test(input.pageHtml || "")) {
    pushObs(out, {
      kind: "seo",
      text: "Die Startseite hat keine meta description.",
      source: startUrl,
      tip: "Eine meta description mit einem Satz schreiben: was der Betrieb macht und wo er sitzt.",
      impact: "In der Google-Suche fehlt ein Satz, was der Betrieb macht und wo er sitzt.",
      wert: "Diesen einen Satz hinterlegen, damit die Suche nicht nur den Seitentitel zeigt.",
    });
  } else if (!/<h1\b/i.test(input.pageHtml || "")) {
    pushObs(out, {
      kind: "seo",
      text: "Die Startseite hat kein h1.",
      source: startUrl,
      tip: "Genau eine Überschrift mit dem Gewerk und dem Ort setzen.",
      impact: "Auf der Startseite fehlt eine klare Überschrift, was Sie anbieten.",
      wert: "Eine Überschrift mit Gewerk und Ort, damit Besucher in wenigen Sekunden wissen, wo sie sind.",
    });
  }

  if (/<(font|marquee)\b/i.test(input.pageHtml || "")) {
    pushObs(out, {
      kind: "auftritt",
      text: "Die Startseite nutzt noch font- oder marquee-Tags.",
      source: startUrl,
      tip: "Diese Tags entfernen und die gleiche Aussage als normalen Text lassen.",
      impact: "Der erste Eindruck der Seite wirkt aus einer anderen Zeit.",
      wert: "Den laufenden Text als normalen Absatz setzen, ohne Laufschrift.",
    });
  }

  if (strong() && !/instagram\.com|facebook\.com|linkedin\.com/i.test(pages) && out.length < 3) {
    pushObs(out, {
      kind: "social",
      text: "Auf den gelesenen Seiten liegt kein Link zu Instagram, Facebook oder LinkedIn.",
      source: startUrl,
      tip: "Falls Bewertungen oder ein Profil existieren, den Link in den Fuß der Seite setzen.",
      impact: "Vor dem Anruf sieht man keine Bewertungen und keinen Weg zu einem Profil.",
      wert: "Einen Link zu den Bewertungen in den Fuß der Seite setzen, falls es welche gibt.",
    });
  }

  return rankObservations(out);
}

export function wordCount(text: string): number {
  const parts = String(text || "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
  return parts.length;
}

function tokens(s: string): string[] {
  return String(s || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 5);
}

function carpentryName(value: string): boolean {
  return /schrein|tischler|möbel|moebel/.test(value.toLowerCase());
}

export function matchingReference(refs: PortfolioRef[], branche?: string | null): PortfolioRef | null {
  const want = tokens(String(branche || ""));
  if (!want.length) return null;
  const hit = (refs || []).find((r) => {
    const note = String(r.note || "").trim();
    if (note.length < 12 || !r.firma) return false;
    const bag = tokens(`${r.branche || ""} ${note} ${r.firma}`);
    if (!want.some((w) => bag.includes(w))) return false;
    const blob = `${r.firma} ${r.branche || ""} ${branche || ""}`;
    if (carpentryName(blob) && !/schreinerei wagner/i.test(r.firma)) return false;
    return true;
  });
  return hit || null;
}

export function mailGreeting(person: string, rolle?: string | null): string {
  const parts = String(person || "").split(/\s+/).filter((p) => p && !/^(von|van|de|der|und)$/i.test(p));
  const last = parts[parts.length - 1] || "";
  const full = parts.join(" ");
  const role = String(rolle || "").toLowerCase();
  const female = /führerin|fuehrerin|inhaberin|vorsitzende/.test(role);
  const male = !female && /führer|fuhrer|inhaber|vorsitzender/.test(role);
  if (female && last) return `Guten Tag Frau ${last},`;
  if (male && last) return `Guten Tag Herr ${last},`;
  if (parts.length >= 2) return `Guten Tag ${full},`;
  return "Guten Tag,";
}

function greetingOk(text: string): boolean {
  const line = String(text || "").split("\n").map((s) => s.trim()).find(Boolean) || "";
  if (/^Guten Tag Frau [\p{L}'’\-]+,/u.test(line)) return true;
  if (/^Guten Tag Herr [\p{L}'’\-]+,/u.test(line)) return true;
  if (/^Guten Tag [\p{L}'’\-]+ [\p{L}'’\-]+,/u.test(line)) return true;
  if (line === "Guten Tag,") return true;
  return false;
}

/** Sie-Befehle und konkrete Handgriffe. Die Diagnose darf rein, die Anleitung nicht. */
export function hasInstruction(text: string): boolean {
  const s = String(text || "");
  if (/\b(?:stellen|setzt|setzen|lege|legen|hinterlegen|schieben|entfernen|ersetzen|einbauen|verlinken|einfügen|einfuegen|ändern|aendern|einstellen)\s+sie\b/i.test(s)) return true;
  if (/\bsie\s+(?:stellen|setzen|legen|hinterlegen|schieben|entfernen|ersetzen|ändern|aendern|einstellen)\b/i.test(s)) return true;
  if (/\bbitte\b[^.?\n]{0,50}\b(?:stellen|setzen|legen|hinterlegen|einstellen|einbauen|ändern|aendern)\b/i.test(s)) return true;
  return false;
}

// ---- Mail-Aufbau (Stand 25.11.2026) ----
// Betreff = konkrete Beobachtung. Einstieg = ehrlicher Anlass aus der Recherche + optional ein belegtes Kompliment.
// Problem aus Sicht der Kunden des Betriebs, keine Anleitung. Brücke + Vorstellung. Terminfrage. Opt-out. P.S. als Haken.

export const MAIL_WORDS_MIN = 95;
export const MAIL_WORDS_MAX_TOTAL = 145;
export const MAIL_WORDS_TARGET_MAX = 140;

export type BranchVoice = {
  key: "praxis" | "industrie" | "gastro" | "kanzlei" | "immobilien" | "salon" | "handwerk" | "allgemein";
  label: string;
  kunden: string;
  ziel: string;
  akt: string;
  woanders: string;
  wegZu: string;
  wir: string;
  betriebNom: string;
  betriebAkk: string;
};

export function branchVoice(branche?: string | null, query?: string | null): BranchVoice {
  const s = `${branche || ""} ${query || ""}`.toLowerCase();
  if (/zahn|dentist/.test(s)) return { key: "praxis", label: "Zahnarztpraxen", kunden: "Patienten", ziel: "Terminanfragen", akt: "einen Termin anfragen", woanders: "fragen bei der nächsten Praxis an", wegZu: "zur Terminanfrage", wir: "Praxen moderne Websites und KI-Lösungen", betriebNom: "Ihre Praxis", betriebAkk: "Ihre Praxis" };
  if (/physio/.test(s)) return { key: "praxis", label: "Physiotherapie-Praxen", kunden: "Patienten", ziel: "Terminanfragen", akt: "einen Termin anfragen", woanders: "fragen bei der nächsten Praxis an", wegZu: "zur Terminanfrage", wir: "Praxen moderne Websites und KI-Lösungen", betriebNom: "Ihre Praxis", betriebAkk: "Ihre Praxis" };
  if (/ärzt|aerzt|arzt|praxis|praxen|klinik|doctor|clinic|heilprakt/.test(s)) return { key: "praxis", label: "Arztpraxen", kunden: "Patienten", ziel: "Terminanfragen", akt: "einen Termin anfragen", woanders: "fragen bei der nächsten Praxis an", wegZu: "zur Terminanfrage", wir: "Praxen moderne Websites und KI-Lösungen", betriebNom: "Ihre Praxis", betriebAkk: "Ihre Praxis" };
  if (/maschinen|industrie|metall|engineer|fertigung|anlagenbau|man_made=works/.test(s)) return { key: "industrie", label: "Maschinenbau-Unternehmen", kunden: "Einkäufer", ziel: "Projektanfragen", akt: "eine Anfrage stellen", woanders: "schreiben dem nächsten Anbieter", wegZu: "zur Projektanfrage", wir: "Industriebetrieben moderne Websites und KI-Lösungen", betriebNom: "Ihr Unternehmen", betriebAkk: "Ihr Unternehmen" };
  if (/gastro|restaurant|café|cafe|gasthof|gasthaus|bistro|wirtshaus/.test(s)) return { key: "gastro", label: "Restaurants", kunden: "Gäste", ziel: "Reservierungen", akt: "einen Tisch reservieren", woanders: "reservieren beim nächsten Restaurant", wegZu: "zur Reservierung", wir: "Restaurants moderne Websites", betriebNom: "Ihr Restaurant", betriebAkk: "Ihr Restaurant" };
  if (/immobil|makler|estate/.test(s)) return { key: "immobilien", label: "Immobilienbüros", kunden: "Interessenten", ziel: "Anfragen", akt: "eine Anfrage stellen", woanders: "melden sich beim nächsten Makler", wegZu: "zur Anfrage", wir: "Immobilienbüros moderne Websites und KI-Lösungen", betriebNom: "Ihr Büro", betriebAkk: "Ihr Büro" };
  if (/kanzlei|steuer|anwalt|rechts|beratung|lawyer|tax/.test(s)) return { key: "kanzlei", label: "Kanzleien", kunden: "Mandanten", ziel: "Mandatsanfragen", akt: "ein Erstgespräch anfragen", woanders: "melden sich bei der nächsten Kanzlei", wegZu: "zum Erstgespräch", wir: "Kanzleien moderne Websites und KI-Lösungen", betriebNom: "Ihre Kanzlei", betriebAkk: "Ihre Kanzlei" };
  if (/salon|friseur|kosmetik|beauty|fitness|studio|hairdresser/.test(s)) return { key: "salon", label: "Salons und Studios", kunden: "Kunden", ziel: "Terminbuchungen", akt: "einen Termin buchen", woanders: "buchen beim nächsten Studio", wegZu: "zur Terminbuchung", wir: "Salons und Studios moderne Websites", betriebNom: "Ihr Studio", betriebAkk: "Ihr Studio" };
  if (/handwerk|elektr|sanitär|sanitaer|heizung|maler|dach|kfz|werkstatt|fliesen|glas|plumber|electrician|roofer|painter|car_repair|tiler|hvac/.test(s)) return { key: "handwerk", label: "Handwerksbetrieben", kunden: "Kunden", ziel: "Aufträge", akt: "einen Auftrag anfragen", woanders: "fragen beim nächsten Betrieb an", wegZu: "zur Anfrage", wir: "Handwerksbetrieben moderne, mobile Websites", betriebNom: "Ihr Betrieb", betriebAkk: "Ihren Betrieb" };
  return { key: "allgemein", label: "Betrieben", kunden: "Kunden", ziel: "Anfragen", akt: "etwas anfragen", woanders: "fragen beim nächsten Anbieter an", wegZu: "zur Anfrage", wir: "kleinen und mittleren Betrieben moderne Websites und KI-Lösungen", betriebNom: "Ihr Betrieb", betriebAkk: "Ihren Betrieb" };
}

/** Wo gesucht wurde: Gebiet aus dem Nachtlauf ("Profil · Gebiet"), sonst der Ort aus dem Impressum. */
export function anlassOrt(query?: string | null, ort?: string | null): string {
  const q = String(query || "");
  const area = q.includes("·") ? q.split("·").pop()!.trim() : "";
  const place = (area && !/^deutschland$/i.test(area) ? area : "") || String(ort || "").trim();
  return place.replace(/\s+/g, " ").slice(0, 60);
}

/** Der ehrliche Anlass. Kein "zufällig". */
export function anlassSatz(input: { branche?: string | null; query?: string | null; ort?: string | null }): string {
  const voice = branchVoice(input.branche, input.query);
  const ort = anlassOrt(input.query, input.ort);
  return `bei einer Recherche nach ${voice.label}${ort ? ` in ${ort}` : ""} bin ich auf Ihre Website gestoßen.`;
}

function yearOf(o: Observation): string {
  return /((?:19|20)\d{2})/.exec(o.text)?.[1] || "";
}

function siteName(web?: string | null, domain?: string | null): string {
  return websiteDomain(String(domain || web || "")) || "Ihre Website";
}

/** Szene aus Sicht der Kunden des Betriebs plus was es kostet. Zwei Sätze, keine Anleitung. */
export function sceneFor(o: Observation, v: BranchVoice): string {
  switch (o.kind) {
    case "kontakt":
      return /formular erst/i.test(o.text)
        ? `Wer bei Ihnen ${v.akt} möchte, muss das Formular erst auf der Kontaktseite suchen. Gerade auf dem Handy geben viele ${v.kunden} vorher auf.`
        : `Wer abends ${v.akt} möchte, findet auf Ihrer Seite nur eine Telefonnummer. Viele ${v.kunden} warten dann nicht bis zum nächsten Morgen, sondern ${v.woanders}.`;
    case "buchung":
      return `Wer bei Ihnen ${v.akt} möchte, findet auf der Seite keinen direkten Weg ${v.wegZu}. Viele ${v.kunden} gehen dann dorthin, wo das mit zwei Klicks klappt.`;
    case "mobil":
      return `Wer Ihre Seite auf dem Handy öffnet, sieht sie stark verkleinert und muss erst zoomen. Genau an dieser Stelle springen viele ${v.kunden} ab, bevor sie sich überhaupt melden.`;
    case "tempo":
      return /srcset|bilder/i.test(o.text)
        ? `Ihre Startseite lädt große Fotos auch auf dem Handy in voller Größe. Wer unterwegs sucht, wartet das oft nicht ab und klickt zurück zur Suche.`
        : `Ihre Startseite lädt vor dem eigentlichen Text erst mehrere Skripte. Wer unterwegs am Handy sucht, wartet das oft nicht ab und klickt zurück zur Suche.`;
    case "seo":
      return /\bh1\b/i.test(o.text)
        ? `Auf Ihrer Startseite fehlt eine klare Überschrift, was Sie anbieten. Wer in den ersten Sekunden nicht sieht, dass er richtig ist, sucht weiter.`
        : `In der Google-Suche steht unter Ihrer Seite kein eigener Satz, was ${v.betriebNom} anbietet und wo. Wer Sie noch nicht kennt, klickt dann eher auf den Eintrag darüber.`;
    case "social":
      return `Vor dem ersten Kontakt möchten viele ${v.kunden} sehen, was andere über Sie sagen. Auf Ihrer Seite führt kein Weg zu Bewertungen oder einem Profil, und dieses Vertrauen fehlt dann.`;
    case "auftritt":
      return `Teile Ihrer Startseite sind noch mit sehr alter Web-Technik gebaut. Der erste Eindruck wirkt dadurch älter, als ${v.betriebNom} ist.`;
    case "aktualitaet":
      return `Im Impressum steht als Stand noch ${yearOf(o)}. Für ${v.kunden} wirkt das schnell so, als würde die Seite nicht mehr gepflegt.`;
  }
}

/** Zweite Beobachtung im Problem-Absatz, ein Satz mit Folge. */
export function alsoFor(o: Observation, v: BranchVoice): string {
  switch (o.kind) {
    case "kontakt":
      return /formular erst/i.test(o.text)
        ? "Dazu kommt: Das Anfrageformular liegt versteckt auf der Kontaktseite, und auf dem Handy findet es kaum jemand."
        : "Dazu kommt: Außer der Telefonnummer gibt es keinen Weg für eine Anfrage, und was nach Feierabend kommt, geht verloren.";
    case "buchung":
      return `Dazu kommt: Einen direkten Weg ${v.wegZu} gibt es nicht, und wer ihn nicht findet, geht woanders hin.`;
    case "mobil":
      return "Dazu kommt: Auf dem Handy wird Ihre Startseite stark verkleinert angezeigt, und wer erst zoomen muss, springt oft ab.";
    case "tempo":
      return /srcset|bilder/i.test(o.text)
        ? "Dazu kommt: Große Fotos werden auch aufs Handy in voller Größe geladen, und unterwegs wartet darauf kaum jemand."
        : "Dazu kommt: Die Startseite lädt vor dem Text erst mehrere Skripte, und unterwegs am Handy wartet darauf kaum jemand.";
    case "seo":
      return /\bh1\b/i.test(o.text)
        ? "Dazu kommt: Auf der Startseite fehlt eine klare Überschrift, was Sie anbieten, und wer das nicht sofort sieht, sucht weiter."
        : "Dazu kommt: In der Google-Suche fehlt unter Ihrer Seite ein eigener Satz, was Sie anbieten, und so klicken Suchende eher woanders.";
    case "social":
      return "Dazu kommt: Ein Weg zu Bewertungen fehlt, und gerade die geben vor dem ersten Kontakt Sicherheit.";
    case "auftritt":
      return "Dazu kommt: Teile der Startseite sind mit sehr alter Technik gebaut, und das prägt den ersten Eindruck.";
    case "aktualitaet":
      return `Dazu kommt: Im Impressum steht als Stand noch ${yearOf(o)}, und das wirkt schnell ungepflegt.`;
  }
}

/** Kleine Beobachtung für das P.S., ohne Folge und ohne Anleitung. */
export function postscriptFor(o: Observation, v: BranchVoice): string {
  switch (o.kind) {
    case "kontakt":
      return /formular erst/i.test(o.text)
        ? "P.S. Ihr Anfrageformular liegt erst auf der Kontaktseite, nicht auf der Startseite."
        : "P.S. Auf den Seiten, die ich mir angesehen habe, gibt es kein Anfrageformular, nur die Telefonnummer.";
    case "buchung":
      return `P.S. Einen direkten Weg ${v.wegZu} habe ich auf der Seite nicht gefunden.`;
    case "mobil":
      return "P.S. Auf dem Handy wird Ihre Startseite stark verkleinert angezeigt.";
    case "tempo":
      return /srcset|bilder/i.test(o.text)
        ? "P.S. Auf der Startseite werden große Fotos auch aufs Handy in voller Größe geladen."
        : "P.S. Ihre Startseite lädt vor dem Text erst mehrere Skripte.";
    case "seo":
      return /\bh1\b/i.test(o.text)
        ? "P.S. Auf der Startseite fehlt eine Überschrift, die sagt, was Sie anbieten."
        : "P.S. In der Google-Suche fehlt unter Ihrer Seite ein eigener Beschreibungssatz.";
    case "social":
      return "P.S. Einen Link zu Bewertungen oder einem Profil habe ich auf der Seite nicht gefunden.";
    case "auftritt":
      return "P.S. Teile der Startseite nutzen noch sehr alte Web-Technik.";
    case "aktualitaet":
      return `P.S. Im Impressum steht als Stand noch das Jahr ${yearOf(o)}.`;
  }
}

export function subjectFor(o: Observation, v: BranchVoice, site: string): string {
  switch (o.kind) {
    case "kontakt":
      return /formular erst/i.test(o.text) ? `Der Weg zur Anfrage auf ${site}` : `Anfragen nach Feierabend auf ${site}`;
    case "buchung":
      return v.key === "gastro" ? `Reservierungen über ${site}` : v.key === "praxis" || v.key === "salon" ? `Terminanfragen über ${site}` : `Anfragen über ${site}`;
    case "mobil":
      return `${site} auf dem Handy`;
    case "tempo":
      return `${site} unterwegs am Handy`;
    case "seo":
      return /\bh1\b/i.test(o.text) ? `Die Startseite von ${site}` : `${site} in der Google-Suche`;
    case "social":
      return `Bewertungen auf ${site}`;
    case "auftritt":
      return `Der erste Eindruck von ${site}`;
    case "aktualitaet":
      return `${site} mit Stand ${yearOf(o)}`;
  }
}

export const MAIL_BRIDGE = "Genau solche Stellen sind mein Job.";
export const MAIL_OPTOUT = "Falls das kein Thema für Sie ist, genügt eine kurze Antwort, dann melde ich mich nicht mehr.";
export const MAIL_SIGNATURE = ["Viele Grüße", "Kim", "Viral Outlaws"];

export function introFor(v: BranchVoice, ref?: PortfolioRef | null): string {
  const refLine = ref
    ? `Für ${ref.firma}${ref.ort ? ` in ${ref.ort}` : ""} haben wir das bereits umgesetzt, weitere Beispiele finden Sie auf viraloutlaws.de.`
    : "Beispiele finden Sie auf viraloutlaws.de.";
  return `${MAIL_BRIDGE} Ich bin Kim Lukas Tobler von Viral Outlaws, wir bauen ${v.wir}, damit aus Besuchern ${v.ziel} werden. ${refLine}`;
}

export function ctaFor(v: BranchVoice): string {
  return `Ich würde Ihnen gern unverbindlich zeigen, wie das für ${v.betriebAkk} aussehen könnte, in 15 Minuten online oder bei Ihnen vor Ort. Passt Ihnen ein kurzer Termin in den nächsten Tagen?`;
}

/** Text ohne Gruß und Signatur. */
export function mailCore(body: string): string {
  return String(body || "").replace(/\n\s*Viele Grüße\s*\n\s*Kim[^\n]*\n\s*Viral Outlaws[^\n]*/i, "\n");
}

/** Wortzahl des Fließtexts: ohne Anrede, Signatur und P.S. */
export function mailWords(body: string): number {
  const core = mailCore(body).replace(/\n\s*P\.\s?S\.[\s\S]*$/i, "");
  const lines = core.split("\n");
  const first = lines.findIndex((l) => l.trim());
  if (first >= 0 && /^Guten Tag\b/.test(lines[first].trim())) lines.splice(first, 1);
  return wordCount(lines.join("\n"));
}

function norm(s: string): string {
  return String(s || "").toLowerCase().replace(/[„“"'’‚‘]/g, "").replace(/\s+/g, " ").trim();
}

export type MailContext = {
  person: string;
  rolle?: string | null;
  firma: string;
  web?: string | null;
  domain?: string | null;
  branche?: string | null;
  query?: string | null;
  ort?: string | null;
  pageText?: string | null;
  observations: Observation[];
  references?: PortfolioRef[];
};

export function reviewMail(body: string, input: { observations: Observation[]; references?: PortfolioRef[]; anlass?: string; beleg?: string; pageText?: string | null }): string[] {
  const issues: string[] = [];
  const text = String(body || "");
  const core = mailCore(text);
  const used = rankObservations(input.observations || []);
  const covered = used.filter((o) => KIND_MARK[o.kind]?.test(text));
  const value = /anfrage|telefon|handy|termin|suche|bewertung|warten|abspring|springen|verloren|woanders|reservier|zoomen|klickt/i.test(text);
  if (used.length < MIN_OBSERVATIONS || covered.length < 1 || !value) issues.push(SUBSTANCE_LABEL);
  if (/!/.test(text)) issues.push("Ausrufezeichen");
  if (BANNED.test(text)) issues.push("Werbesprache");
  if (JARGON.test(text) || TEMPLATE_LINE.test(text)) issues.push("Fachsprache");
  if (hasInstruction(text)) issues.push("Anleitung");
  if (!greetingOk(text)) issues.push("Anrede");
  const words = mailWords(text);
  if (words > MAIL_WORDS_MAX_TOTAL || words < MAIL_WORDS_MIN) issues.push("Länge");
  if (/\b(du|dein(?:e|en|em|er)?|dir|dich|euch|euer|eure)\b/i.test(text)) issues.push("Sie");
  if (/zufällig|zufaellig/i.test(text)) issues.push("Anlass");
  if (input.anlass && !norm(text).includes(norm(input.anlass))) issues.push("Anlass");
  if (!/recherche/i.test(text)) issues.push("Anlass");
  if (!/genau solche stellen sind mein job/i.test(text)) issues.push("Brücke");
  if (!/Kim Lukas Tobler/.test(text) || !/viral outlaws/i.test(text)) issues.push("Vorstellung");
  if (!/15 minuten/i.test(text) || !/vor ort/i.test(text) || !/termin[^?]*\?/i.test(text)) issues.push("Terminfrage");
  if (/entwurf|alternativ|schicke ich ihnen|sende ich ihnen/i.test(text)) issues.push("Ausweichoption oder Entwurf");
  if (!/melde ich mich nicht mehr/i.test(text)) issues.push("Abmeldung fehlt");
  if (/€|\beuro\b|preis|kostet nur|digitalbonus|förder|foerder|nebenjob|möbelhaus|moebelhaus/i.test(text)) issues.push("No-Go");
  if (/möbel|moebel|schreiner|tischler/i.test(text.replace(/Schreinerei Wagner/g, ""))) issues.push("No-Go");
  if (!/\bKim\b/.test(text)) issues.push("Absender fehlt");
  if (input.beleg) {
    if (!input.pageText || !norm(input.pageText).includes(norm(input.beleg))) issues.push("Kompliment nicht belegt");
  } else if (input.anlass) {
    const para = core.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)[1] || "";
    const sentences = para.split(/(?<=[.?])\s+/).filter((s) => s.trim().length > 3);
    if (sentences.length > 1) issues.push("Kompliment nicht belegt");
  }
  const mentioned = /(?:^|\s)(?:Bei|Für) ([A-ZÄÖÜ][\p{L}0-9&.'’\- ]{2,40}?)(?:\s+in\s|\s+\(|\s+war|\s+haben|,)/u.exec(text);
  if (mentioned) {
    const name = mentioned[1].trim().toLowerCase();
    const known = (input.references || []).some((r) => {
      const firma = String(r.firma || "").trim().toLowerCase();
      return firma && (name.includes(firma) || firma.includes(name));
    });
    if (!known && !/^(ihre|ihr|ihren|besucher|kunden|patienten|gäste|einkäufer|mandanten)\b/i.test(name)) issues.push("Referenz nicht belegt");
  }
  return issues;
}

function overlaps(a: Observation, b: Observation): boolean {
  const pair = [a.kind, b.kind].sort().join("+");
  return pair === "buchung+kontakt";
}

export function composePeerMail(input: MailContext): { subject: string; body: string; observations: Observation[] } | null {
  const ranked = rankObservations(input.observations || []);
  if (ranked.length < MIN_OBSERVATIONS) return null;
  const v = branchVoice(input.branche, input.query);
  const site = siteName(input.web, input.domain);
  const lead = ranked[0];
  const rest = ranked.slice(1);
  const fresh = rest.filter((o) => !overlaps(lead, o));
  const ps = fresh[fresh.length - 1] || rest[rest.length - 1] || null;
  const extra = fresh.find((o) => o !== ps) || null;
  const ref = matchingReference(input.references || [], input.branche);
  const build = (withExtra: boolean) => [
    mailGreeting(input.person, input.rolle),
    "",
    anlassSatz(input),
    "",
    [sceneFor(lead, v), ...(withExtra && extra ? [alsoFor(extra, v)] : [])].join(" "),
    "",
    introFor(v, ref),
    "",
    ctaFor(v),
    "",
    MAIL_OPTOUT,
    "",
    ...MAIL_SIGNATURE,
    ...(ps ? ["", postscriptFor(ps, v)] : []),
  ].join("\n");
  let body = build(true);
  if (mailWords(body) > MAIL_WORDS_TARGET_MAX) body = build(false);
  const used = [lead, ...(body.includes("Dazu kommt:") && extra ? [extra] : []), ...(ps ? [ps] : [])];
  return { subject: subjectFor(lead, v, site), body, observations: used };
}

export function parseMailJson(raw: string | null): { subject: string; body: string; beleg: string } | null {
  if (!raw) return null;
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1));
    const subject = String(parsed.subject || "").replace(/!+/g, "").trim().slice(0, 180);
    const body = String(parsed.body || "").replace(/!+/g, "").trim().slice(0, 4000);
    const beleg = String(parsed.beleg || "").trim().slice(0, 300);
    if (!subject || !body) return null;
    return { subject, body, beleg };
  } catch {
    return null;
  }
}

export function finalizeMail(input: MailContext & {
  attempts?: { subject: string; body: string; beleg?: string }[];
}): { ok: true; subject: string; body: string; observations: Observation[]; source: "ki" | "vorlage" } | { ok: false; reason: typeof SUBSTANCE_LABEL } {
  const used = rankObservations(input.observations || []);
  if (used.length < MIN_OBSERVATIONS) return { ok: false, reason: SUBSTANCE_LABEL };
  const anlass = anlassSatz(input);
  for (const attempt of input.attempts || []) {
    if (!attempt?.body) continue;
    const issues = reviewMail(attempt.body, { observations: used, references: input.references || [], anlass, beleg: attempt.beleg || "", pageText: input.pageText });
    if (issues.length === 0) return { ok: true, subject: attempt.subject, body: attempt.body, observations: used, source: "ki" };
  }
  const composed = composePeerMail(input);
  if (!composed || reviewMail(composed.body, { observations: used, references: input.references || [], anlass }).length) return { ok: false, reason: SUBSTANCE_LABEL };
  return { ok: true, subject: composed.subject, body: composed.body, observations: composed.observations, source: "vorlage" };
}

export function fallbackMail(input: { person: string; firma: string; web: string; excerpt: string }): { subject: string; body: string } {
  const first = String(input.person || "").split(/\s+/).filter(Boolean)[0] || "";
  const anrede = first ? `Guten Tag ${first},` : "Guten Tag,";
  const site = String(input.web || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const observe = String(input.excerpt || "").split("\n").map((s) => s.trim()).find((s) => s.length > 40 && !/impressum|geschäftsführer|inhaber|telefon|e-mail/i.test(s));
  const line = observe
    ? `Auf ${site || input.firma} steht unter anderem: „${observe.slice(0, 140)}“.`
    : `Ich habe mir ${site || input.firma} angesehen.`;
  const firma = input.firma || "Ihre Website";
  return {
    subject: `${firma}: eine Frage zur Website`.slice(0, 140),
    body: [
      anrede,
      "",
      "ich bin Kim von Viral Outlaws. Wir bauen Websites und setzen KI für kleine Betriebe um, damit Anfragen und Abläufe nicht an der Website hängen bleiben.",
      "",
      line,
      "Wenn dort etwas unklar bleibt oder Anfragen von Hand beantwortet werden, lässt sich das oft mit einer klareren Seite oder einem kleinen Ablauf ändern.",
      "",
      "Wenn das gerade nicht passt, genügt eine kurze Antwort.",
      "",
      "Wenn Sie keine weiteren Nachrichten möchten, antworten Sie kurz mit „Bitte abmelden“.",
      "",
      "Viele Grüße",
      "Kim",
      "Viral Outlaws",
      "Webdesign und KI für kleine Betriebe",
    ].join("\n"),
  };
}

export function draftInstructions(): string {
  return [
    "Schreibe eine Erstmail auf Deutsch von Kim Lukas Tobler (Viral Outlaws) an einen Betrieb. Sie soll im Gedächtnis bleiben: persönlich, auf Augenhöhe, kein Werbeton. Der Empfänger soll den Bedarf selbst erkennen, Kim steht als die Lösung da, ohne zu verraten, wie man es selbst behebt.",
    "Siezen. Ich-Form für Kim. 110 bis 140 Wörter Fließtext, ohne Anrede, Signatur und P.S. gezählt. Echte Absätze, keine Aufzählung, kein Markdown.",
    "Aufbau, genau in dieser Reihenfolge:",
    "1. Anrede genau wie unten vorgegeben.",
    "2. Einstieg: der vorgegebene Anlass-Satz wörtlich. Danach höchstens EIN Satz mit einem echten, belegbaren Kompliment zum Betrieb (Leistung, Spezialisierung, Referenz), nur aus dem Seitentext unten. Gibt der Seitentext nichts Konkretes her, lass das Kompliment weg. Nie erfinden, nie übertreiben.",
    "3. Problem aus Sicht der Kunden des Betriebs als kurze Szene, z. B. 'Wer abends einen Termin anfragen möchte, findet bei Ihnen nur eine Telefonnummer und fragt dann bei der nächsten Praxis an.' Dazu höchstens eine zweite Beobachtung und was sie kostet. Nur Beobachtungen aus der Liste unten. Keine Lösungsschritte, kein 'Stellen Sie', 'Setzen Sie', 'Legen Sie', kein Belehren.",
    "4. Brücke und Vorstellung, zwei Sätze: 'Genau solche Stellen sind mein Job. Ich bin Kim Lukas Tobler von Viral Outlaws, wir bauen [Branche wie unten], damit aus Besuchern [Ziel wie unten] werden.' Danach die erlaubte Referenz, wenn eine vorgegeben ist, sonst 'Beispiele finden Sie auf viraloutlaws.de.'",
    "5. Terminfrage direkt, ohne Ausweichoption: 'Ich würde Ihnen gern unverbindlich zeigen, wie das für [Betrieb] aussehen könnte, in 15 Minuten online oder bei Ihnen vor Ort. Passt Ihnen ein kurzer Termin in den nächsten Tagen?' Nicht behaupten, es gebe schon einen Entwurf. Das Wort Entwurf kommt nicht vor.",
    "6. Opt-out wörtlich: 'Falls das kein Thema für Sie ist, genügt eine kurze Antwort, dann melde ich mich nicht mehr.'",
    "7. Danach genau diese Signatur in drei Zeilen: Viele Grüße / Kim / Viral Outlaws.",
    "8. Nach der Signatur ein P.S. mit einer zweiten, kleinen Beobachtung aus der Liste, die im Text noch nicht vorkam, als Wiedererkennungs-Haken. Ohne Folge, ohne Anleitung. Gibt es keine weitere, kein P.S.",
    "Betreff: greift die konkrete Beobachtung auf, persönlich und neugierig, z. B. 'praxis-muster.de mit Stand 2018' oder 'Anfragen nach Feierabend auf musterwerk.de'. Kein Werbe-Betreff.",
    "No-Gos: keine Preise, kein 'garantiert', keine erfundenen Zahlen oder Referenzen, kein Digitalbonus, keine Fachwörter wie viewport, defer, h1 oder meta description, keine Ausrufezeichen, kein 'zufällig', nie Möbel oder Schreinerei (außer der vorgegebenen Referenz Schreinerei Wagner), nie Kims Nebenjob.",
    "Antworte nur als JSON: {\"subject\":\"...\",\"body\":\"...\",\"beleg\":\"...\"}. In beleg steht die wörtliche Stelle aus dem Seitentext, auf die sich das Kompliment stützt (höchstens 120 Zeichen, exakt kopiert). Ohne Kompliment bleibt beleg leer.",
  ].join("\n");
}

export function draftUserPrompt(input: {
  wissen: { section: string; content: string }[];
  references: PortfolioRef[];
  firma: string;
  person: string;
  rolle: string;
  web: string;
  domain?: string | null;
  branche?: string | null;
  query?: string | null;
  ort?: string | null;
  pageText?: string | null;
  observations: Observation[];
}): string {
  const rules = input.wissen.map((w) => `${w.section}: ${w.content}`).join("\n").slice(0, 3000);
  const v = branchVoice(input.branche, input.query);
  const fit = matchingReference(input.references, input.branche);
  const refs = fit
    ? `Erlaubte Referenz, nur diese: ${fit.firma}${fit.ort ? ` in ${fit.ort}` : ""}. Punkt: ${fit.note}`
    : "Keine passende Referenz. Keinen Kundennamen nennen, stattdessen 'Beispiele finden Sie auf viraloutlaws.de.'";
  const ranked = rankObservations(input.observations);
  const notes = ranked.map((o, i) => `${i + 1}. ${o.impact} (Befund: ${o.text} Quelle: ${o.source})`).join("\n");
  const page = String(input.pageText || "").replace(/\s+/g, " ").trim().slice(0, 1500);
  return [
    draftInstructions(),
    "Wissensbasis:",
    rules,
    refs,
    `Anrede genau so: ${mailGreeting(input.person, input.rolle)}`,
    `Anlass-Satz wörtlich: ${anlassSatz(input)}`,
    `Branche für die Vorstellung: ${v.wir}. Ziel: ${v.ziel}. Kunden des Betriebs: ${v.kunden}. Betrieb in der Terminfrage: ${v.betriebAkk}.`,
    `Firma: ${input.firma}`,
    `Person: ${input.person} (${input.rolle})`,
    `Website: ${siteName(input.web, input.domain)}`,
    "Geprüfte Beobachtungen, der erste Punkt ist der Hebel:",
    notes,
    `Seitentext der Startseite (nur hieraus darf das Kompliment stammen):\n${page || "(kein Text gelesen, also kein Kompliment)"}`,
  ].join("\n\n");
}

export function parseAiMail(raw: string | null, fallback: { subject: string; body: string }): { subject: string; body: string; source: "ki" | "vorlage" } {
  if (!raw) return { ...fallback, source: "vorlage" };
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return { ...fallback, source: "vorlage" };
    const parsed = JSON.parse(raw.slice(start, end + 1));
    let subject = String(parsed.subject || "").replace(/!{2,}/g, "").trim().slice(0, 180);
    let body = String(parsed.body || "").trim().slice(0, 6000);
    if (!subject || !body) return { ...fallback, source: "vorlage" };
    if (!/abmelden|keine weiteren/i.test(body)) {
      body += "\n\nWenn Sie keine weiteren Nachrichten möchten, antworten Sie kurz mit „Bitte abmelden“.";
    }
    if (!/viral outlaws/i.test(body)) body += "\n\nKim\nViral Outlaws";
    return { subject, body, source: "ki" };
  } catch {
    return { ...fallback, source: "vorlage" };
  }
}

export function contactSeed(input: { firma: string; person: string; email: string; str: string; plz: string; ort: string; web: string }) {
  return {
    firma: (input.firma || input.email).slice(0, 200),
    person: input.person ? input.person.slice(0, 160) : null,
    email: input.email.slice(0, 200),
    str: input.str || null,
    plz: input.plz || null,
    ort: input.ort || null,
    web: input.web || null,
    status: "lead",
    quelle: "kaltakquise",
    status_seit: new Date().toISOString(),
  };
}

export function sameBerlinDay(a: Date, b: Date): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(a) === fmt.format(b);
}
