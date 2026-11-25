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
    "Schreibe eine kurze Akquise-Mail auf Deutsch.",
    "Sieze. Anrede: Guten Tag und der Vorname, wenn er bekannt ist.",
    "Betreff und Text, kurz und konkret, bezogen auf die Website. Kein Werbeton.",
    "Keine Preise, keine erfundenen Referenzen, keine Termine, keine Rankings.",
    "Nenne Kim und Viral Outlaws als Absender.",
    "Schliesse mit dem Satz, dass eine kurze Antwort mit „Bitte abmelden“ genügt, wenn keine weiteren Nachrichten gewünscht sind.",
    "Antworte nur als JSON: {\"subject\":\"...\",\"body\":\"...\"}",
  ].join("\n");
}

export function draftUserPrompt(input: {
  wissen: { section: string; content: string }[];
  references: { firma: string; branche?: string | null; ort?: string | null; web?: string | null }[];
  firma: string;
  person: string;
  rolle: string;
  web: string;
  excerpt: string;
}): string {
  const rules = input.wissen.map((w) => `${w.section}: ${w.content}`).join("\n").slice(0, 4000);
  const refs = input.references.length
    ? input.references.map((r) => [r.firma, r.branche, r.ort, r.web].filter(Boolean).join(", ")).join("\n")
    : "Keine Referenz hinterlegt. Erfinde keine.";
  return [
    draftInstructions(),
    "Wissensbasis:",
    rules,
    "Referenzen, nur diese nennen:",
    refs,
    `Firma: ${input.firma}`,
    `Person: ${input.person} (${input.rolle})`,
    `Website: ${input.web}`,
    "Auszug der Website:",
    input.excerpt.slice(0, 1200),
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
