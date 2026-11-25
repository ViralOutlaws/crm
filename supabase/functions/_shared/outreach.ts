// Reine Regeln für Outreach. Kein Netz, keine Secrets, kein Versand.
import { threadKey } from "./mail.ts";

export const MAX_URLS = 8;
export const DAILY_LIMIT_DEFAULT = 20;
export const GAP_MINUTES_DEFAULT = 5;

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

export function clampSettings(input: { daily_limit?: number; gap_minutes?: number; guess_emails?: boolean }) {
  const daily = Number(input.daily_limit);
  const gap = Number(input.gap_minutes);
  return {
    daily_limit: Math.min(100, Math.max(1, Number.isFinite(daily) && daily > 0 ? Math.round(daily) : DAILY_LIMIT_DEFAULT)),
    gap_minutes: Math.min(120, Math.max(1, Number.isFinite(gap) && gap > 0 ? Math.round(gap) : GAP_MINUTES_DEFAULT)),
    guess_emails: input.guess_emails === true,
  };
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

export function isOptOut(text: string): boolean {
  const s = String(text || "").toLowerCase();
  return /abmelden|austragen|unsubscribe|opt-?out|keine weiteren|nicht mehr (schreiben|kontaktieren|anrufen|melden)|bitte nicht mehr|kein interesse|keine werbung|aus dem verteiler|lösch(?:en|t) (?:meine|uns)|nehmen sie .{0,40}(?:raus|heraus)|widerspreche/.test(s);
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
export const MAIL_WORD_MAX = 140;

export type Observation = {
  kind: "aktualitaet" | "mobil" | "tempo" | "kontakt" | "buchung" | "seo" | "social" | "auftritt";
  text: string;
  source: string;
  tip: string;
};

export type PortfolioRef = {
  firma: string;
  branche?: string | null;
  ort?: string | null;
  web?: string | null;
  note?: string | null;
};

const KIND_MARK: Record<Observation["kind"], RegExp> = {
  aktualitaet: /jahreszahl|copyright|stand|impressum/i,
  mobil: /viewport/i,
  tempo: /defer|skript|srcset|bild/i,
  kontakt: /formular|telefon/i,
  buchung: /termin|buchen|abholung|reserv/i,
  seo: /meta description|h1|überschrift/i,
  social: /instagram|facebook|linkedin|profil/i,
  auftritt: /schrift|marquee|font-tag/i,
};

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
  if (out.some((o) => o.kind === item.kind && o.text === item.text)) return;
  if (out.length >= 3) return;
  out.push(item);
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
      });
    }
  }

  if (!/<meta[^>]+name=["']viewport["']/i.test(input.pageHtml || "")) {
    pushObs(out, {
      kind: "mobil",
      text: "Die Startseite hat kein viewport-Meta.",
      source: startUrl,
      tip: "Im Kopf ein viewport-Meta setzen, damit das Handy die Seite nicht auf Desktop-Breite verkleinert.",
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
    });
  }

  const photos = [...(input.pageHtml || "").matchAll(/<img\b([^>]*)>/gi)].filter((s) => /\.(jpe?g|png|webp)/i.test(s[1]) && !/srcset\s*=/i.test(s[1]));
  if (photos.length >= 4 && !out.some((o) => o.kind === "tempo")) {
    pushObs(out, {
      kind: "tempo",
      text: `${photos.length} Bilder auf der Startseite haben kein srcset.`,
      source: startUrl,
      tip: "Für die großen Bilder eine kleinere Variante fürs Handy hinterlegen.",
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
    });
  } else if (!formOnStart && !formElsewhere && hasTel) {
    pushObs(out, {
      kind: "kontakt",
      text: "Auf den gelesenen Seiten gibt es eine Telefonnummer und kein Formular.",
      source: startUrl,
      tip: "Unter die Telefonnummer ein Formular mit Name, Rückruf und Anliegen setzen, das eine Mail schickt.",
    });
  }

  const strong = () => out.some((o) => o.kind !== "buchung" && o.kind !== "social");
  if (strong() && !/termin|buchen|reservier|calendly|simplybook|treatwell/i.test(allText)) {
    pushObs(out, {
      kind: "buchung",
      text: "Auf den gelesenen Seiten steht kein Link mit Termin, Buchen oder Reservierung.",
      source: startUrl,
      tip: "Wenn Termine vorkommen, auf die Startseite einen Link Termin anfragen setzen, der das Formular öffnet.",
    });
  }

  if (!/<meta[^>]+name=["']description["'][^>]*content=["'][^"']{12,}/i.test(input.pageHtml || "")) {
    pushObs(out, {
      kind: "seo",
      text: "Die Startseite hat keine meta description.",
      source: startUrl,
      tip: "Eine meta description mit einem Satz schreiben: was der Betrieb macht und wo er sitzt.",
    });
  } else if (!/<h1\b/i.test(input.pageHtml || "")) {
    pushObs(out, {
      kind: "seo",
      text: "Die Startseite hat kein h1.",
      source: startUrl,
      tip: "Genau eine Überschrift h1 mit dem Gewerk und dem Ort setzen.",
    });
  }

  if (/<(font|marquee)\b/i.test(input.pageHtml || "")) {
    pushObs(out, {
      kind: "auftritt",
      text: "Die Startseite nutzt noch font- oder marquee-Tags.",
      source: startUrl,
      tip: "Diese Tags entfernen und die gleiche Aussage als normalen Text lassen.",
    });
  }

  if (strong() && !/instagram\.com|facebook\.com|linkedin\.com/i.test(pages) && out.length < 3) {
    pushObs(out, {
      kind: "social",
      text: "Auf den gelesenen Seiten liegt kein Link zu Instagram, Facebook oder LinkedIn.",
      source: startUrl,
      tip: "Falls ein Profil existiert, den Link in den Footer setzen. Sonst den Punkt lassen.",
    });
  }

  return out.slice(0, 3);
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

export function matchingReference(refs: PortfolioRef[], branche?: string | null): PortfolioRef | null {
  const want = tokens(String(branche || ""));
  if (!want.length) return null;
  const hit = (refs || []).find((r) => {
    const note = String(r.note || "").trim();
    if (note.length < 12 || !r.firma) return false;
    const bag = tokens(`${r.branche || ""} ${note}`);
    return want.some((w) => bag.includes(w));
  });
  return hit || null;
}

export function reviewMail(body: string, input: { observations: Observation[]; references?: PortfolioRef[] }): string[] {
  const issues: string[] = [];
  const text = String(body || "");
  const used = (input.observations || []).slice(0, 3);
  const bullets = text.split("\n").map((l) => l.trim()).filter((l) => /^[-–]/.test(l));
  const covered = used.filter((o) => KIND_MARK[o.kind]?.test(bullets.join("\n") || text));
  const actions = text.match(/setzen|ergänzen|laden|geben|öffnen|schickt|schreiben|entfernen|hinterlegen/gi) || [];
  const value = (bullets.length >= 2 && covered.length >= 2) || (covered.length >= 2 && actions.length >= 2);
  if (used.length < MIN_OBSERVATIONS || !value) issues.push(SUBSTANCE_LABEL);
  if (/!/.test(text)) issues.push("Ausrufezeichen");
  if (BANNED.test(text)) issues.push("Werbesprache");
  if (wordCount(text) > MAIL_WORD_MAX) issues.push("Länge");
  if (/\b(du|dein(?:e|en|em|er)?|dir|dich|euch|euer|eure)\b/i.test(text)) issues.push("Sie");
  if (!/\?/.test(text)) issues.push("Frage fehlt");
  if (!/viral outlaws/i.test(text) || !/\bKim\b/.test(text)) issues.push("Absender fehlt");
  if (!/abmelden/i.test(text)) issues.push("Abmeldung fehlt");
  const mentioned = /(?:^|\n)Bei ([A-ZÄÖÜ][\p{L}0-9&.'’\- ]{2,40}?)(?:\s+in|\s+\(|\s+war|,)/u.exec(text);
  if (mentioned) {
    const name = mentioned[1].trim().toLowerCase();
    const known = (input.references || []).some((r) => {
      const firma = String(r.firma || "").trim().toLowerCase();
      return firma && (name.includes(firma) || firma.includes(name));
    });
    if (!known) issues.push("Referenz nicht belegt");
  }
  return issues;
}

export function composePeerMail(input: {
  person: string;
  firma: string;
  observations: Observation[];
  references?: PortfolioRef[];
  branche?: string | null;
}): { subject: string; body: string; observations: Observation[] } | null {
  const used = (input.observations || []).slice(0, 3);
  if (used.length < MIN_OBSERVATIONS) return null;
  const first = String(input.person || "").split(/\s+/).filter(Boolean)[0] || "";
  const anrede = first ? `Guten Tag ${first},` : "Guten Tag,";
  const firma = input.firma || "der Website";
  const opening = used.slice(0, 2).map((o, i) => {
    const sentence = o.text.replace(/\.$/, "");
    return i === 0 ? sentence : sentence.charAt(0).toLowerCase() + sentence.slice(1);
  }).join(", und ");
  const bullets = used.map((o) => `- ${o.tip.replace(/\.$/, "")}.`);
  const ref = matchingReference(input.references || [], input.branche);
  const refLine = ref
    ? `Bei ${ref.firma}${ref.ort ? ` in ${ref.ort}` : ""} lag derselbe Punkt: ${String(ref.note).trim()}`
    : "";
  let body = [
    anrede,
    "",
    `auf der Seite von ${firma}: ${opening}.`,
    "",
    "Das lässt sich ändern, ohne die Seite neu zu bauen:",
    ...bullets,
    ...(refLine ? ["", refLine] : []),
    "",
    "Soll ich Ihnen das kurz zeigen?",
    "",
    "Wenn Sie keine weiteren Nachrichten möchten, antworten Sie kurz mit „Bitte abmelden“.",
    "",
    "Viele Grüße",
    "Kim",
    "Viral Outlaws",
  ].join("\n");
  if (refLine && wordCount(body) > MAIL_WORD_MAX) {
    body = body.replace(`\n\n${refLine}`, "");
  }
  const subject = `${firma}: ${used[0].text.replace(/\.$/, "")}`.slice(0, 140);
  return { subject, body, observations: used };
}

export function parseMailJson(raw: string | null): { subject: string; body: string } | null {
  if (!raw) return null;
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1));
    const subject = String(parsed.subject || "").replace(/!+/g, "").trim().slice(0, 180);
    const body = String(parsed.body || "").replace(/!+/g, "").trim().slice(0, 4000);
    if (!subject || !body) return null;
    return { subject, body };
  } catch {
    return null;
  }
}

export function finalizeMail(input: {
  person: string;
  firma: string;
  observations: Observation[];
  references?: PortfolioRef[];
  branche?: string | null;
  attempts?: { subject: string; body: string }[];
}): { ok: true; subject: string; body: string; observations: Observation[]; source: "ki" | "vorlage" } | { ok: false; reason: typeof SUBSTANCE_LABEL } {
  const used = (input.observations || []).slice(0, 3);
  if (used.length < MIN_OBSERVATIONS) return { ok: false, reason: SUBSTANCE_LABEL };
  const ctx = { observations: used, references: input.references || [] };
  for (const attempt of input.attempts || []) {
    if (attempt?.body && reviewMail(attempt.body, ctx).length === 0) {
      return { ok: true, subject: attempt.subject, body: attempt.body, observations: used, source: "ki" };
    }
  }
  const composed = composePeerMail(input);
  if (!composed || reviewMail(composed.body, ctx).length) return { ok: false, reason: SUBSTANCE_LABEL };
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
    "Schreibe eine kurze Mail auf Deutsch, als Fachkollege, nicht als Verkäufer.",
    "Siezen. Anrede: Guten Tag und der Vorname, wenn er bekannt ist.",
    "Höchstens 120 Wörter.",
    "Anfang: ein sachlicher Satz zu einer Beobachtung aus der Liste, mit der Seite.",
    "Dann zwei oder drei konkrete Punkte, die der Betrieb selbst umsetzen kann. Jeder Punkt nennt die Änderung. Die Mail muss auch ohne Antwort nützlich sein.",
    "Eine Referenz nur, wenn sie in der Liste steht und zum Gewerk passt. Sonst weglassen. Nichts erfinden, keine Zahlen, die nicht in den Beobachtungen stehen.",
    "Schlussfrage ohne Druck, zum Beispiel: Soll ich Ihnen das kurz zeigen?",
    "Keine Wörter wie innovativ, maßgeschneidert, revolutionär. Kein 'Ich hoffe, diese Mail erreicht Sie gut'. Keine Ausrufezeichen.",
    "Abschluss: Viele Grüße, Kim, Viral Outlaws, und der Satz mit „Bitte abmelden“.",
    "Antworte nur als JSON: {\"subject\":\"...\",\"body\":\"...\"}",
  ].join("\n");
}

export function draftUserPrompt(input: {
  wissen: { section: string; content: string }[];
  references: PortfolioRef[];
  firma: string;
  person: string;
  rolle: string;
  web: string;
  branche?: string | null;
  observations: Observation[];
}): string {
  const rules = input.wissen.map((w) => `${w.section}: ${w.content}`).join("\n").slice(0, 4000);
  const fit = matchingReference(input.references, input.branche);
  const refs = fit
    ? `Nur diese Referenz darf vorkommen, und nur wenn sie in den Satz passt: ${fit.firma}, ${fit.branche || ""}, ${fit.ort || ""}. Punkt: ${fit.note}`
    : "Keine passende Referenz. Keinen Kundennamen nennen.";
  const notes = input.observations.map((o, i) => `${i + 1}. ${o.text} Quelle: ${o.source}. Tipp: ${o.tip}`).join("\n");
  return [
    draftInstructions(),
    "Wissensbasis:",
    rules,
    refs,
    `Firma: ${input.firma}`,
    `Person: ${input.person} (${input.rolle})`,
    `Website: ${input.web}`,
    "Beobachtungen, nur diese:",
    notes,
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
