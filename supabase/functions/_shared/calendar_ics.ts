// Reiner ICS-Aufbau für das iPhone-Abo. Kein Netz, kein Token.

export const CALENDAR_NAME = "Viral Outlaws CRM";
const PRODID = "-//Viral Outlaws//CRM//DE";

export type FeedTask = {
  id: string;
  titel: string;
  beschreibung?: string | null;
  faellig: string;
  status?: string | null;
};

export type FeedEvent = {
  id: string;
  titel: string;
  datum: string;
  zeit?: string | null;
  notiz?: string | null;
};

export function addIsoDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function berlinToday(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function feedWindow(today: string): { from: string; to: string } {
  return { from: addIsoDays(today, -30), to: addIsoDays(today, 365) };
}

export function hashEqual(a: string, b: string): boolean {
  const aa = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  const n = Math.max(aa.length, bb.length, 1);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < n; i++) diff |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\n|\r/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

export function foldLine(line: string): string {
  const enc = new TextEncoder();
  let out = "";
  let col = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (col + n > 75) {
      out += "\r\n ";
      col = 1;
    }
    out += ch;
    col += n;
  }
  return out;
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function compact(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "");
}

function clock(zeit: string): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(zeit.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}${m[2]}00`;
}

function plusHour(date: string, hhmmss: string): { date: string; time: string } {
  const h = Number(hhmmss.slice(0, 2));
  const m = Number(hhmmss.slice(2, 4));
  let total = h * 60 + m + 60;
  let day = date;
  if (total >= 24 * 60) {
    total -= 24 * 60;
    day = addIsoDays(date, 1);
  }
  return {
    date: day,
    time: `${String(Math.floor(total / 60)).padStart(2, "0")}${String(total % 60).padStart(2, "0")}00`,
  };
}

function inWindow(iso: string, from: string, to: string): boolean {
  const day = iso.slice(0, 10);
  return day >= from && day <= to;
}

const ZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Berlin",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

function vevent(lines: string[]): string {
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"].map(foldLine).join("\r\n");
}

export function buildCalendar(input: {
  now?: Date;
  from: string;
  to: string;
  tasks: FeedTask[];
  events: FeedEvent[];
}): string {
  const now = input.now ?? new Date();
  const dtstamp = stamp(now);
  const parts: string[] = [];
  const tasks = [...input.tasks].filter((t) => t.faellig && t.status !== "done" && inWindow(t.faellig, input.from, input.to));
  tasks.sort((a, b) => a.faellig.localeCompare(b.faellig) || a.titel.localeCompare(b.titel, "de"));
  for (const task of tasks) {
    const start = compact(task.faellig);
    const lines = [
      `UID:aufgabe-${task.id}@crm.viraloutlaws.de`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${compact(addIsoDays(task.faellig.slice(0, 10), 1))}`,
      `SUMMARY:${icsText(task.titel || "Aufgabe")}`,
    ];
    if (task.beschreibung) lines.push(`DESCRIPTION:${icsText(task.beschreibung)}`);
    parts.push(vevent(lines));
  }
  const events = [...input.events].filter((e) => e.datum && inWindow(e.datum, input.from, input.to));
  events.sort((a, b) => a.datum.localeCompare(b.datum) || String(a.zeit || "").localeCompare(String(b.zeit || "")));
  for (const event of events) {
    const day = event.datum.slice(0, 10);
    const time = event.zeit ? clock(event.zeit) : null;
    const lines = [
      `UID:termin-${event.id}@crm.viraloutlaws.de`,
      `DTSTAMP:${dtstamp}`,
    ];
    if (time) {
      const end = plusHour(day, time);
      lines.push(`DTSTART;TZID=Europe/Berlin:${compact(day)}T${time}`);
      lines.push(`DTEND;TZID=Europe/Berlin:${compact(end.date)}T${end.time}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compact(day)}`);
      lines.push(`DTEND;VALUE=DATE:${compact(addIsoDays(day, 1))}`);
    }
    lines.push(`SUMMARY:${icsText(event.titel || "Termin")}`);
    if (event.notiz) lines.push(`DESCRIPTION:${icsText(event.notiz)}`);
    parts.push(vevent(lines));
  }
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${CALENDAR_NAME}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
    ZONE,
    ...parts,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  return body;
}
