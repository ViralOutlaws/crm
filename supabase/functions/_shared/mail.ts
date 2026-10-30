// IMAP/SMTP für United Domains und andere Postfächer. Zugangsdaten nur aus Secrets.

export const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "gmx.de", "gmx.net", "gmx.at", "web.de",
  "t-online.de", "outlook.com", "hotmail.com", "live.com", "icloud.com",
  "me.com", "mac.com", "yahoo.com", "yahoo.de",
]);

const SENT_NAMES = ["sent", "gesendet", "sent messages", "sent items", "gesendete elemente", "inbox.sent", "inbox.gesendet"];
const ROLE_NAMES: Record<string, string[]> = {
  inbox: ["inbox"],
  sent: SENT_NAMES,
  drafts: ["drafts", "entwürfe", "entwuerfe", "draft"],
  spam: ["spam", "junk", "junk-e-mail"],
  trash: ["trash", "papierkorb", "deleted", "deleted items", "deleted messages", "gelöscht"],
  archive: ["archive", "archiv"],
};

export type ListedFolder = { path: string; name: string; delimiter: string; flags: string[]; role: string };

export function mailConfig() {
  const user = Deno.env.get("MAIL_USER") || "";
  const pass = Deno.env.get("MAIL_PASS") || "";
  if (!user || !pass) return null;
  return {
    imapHost: Deno.env.get("MAIL_IMAP_HOST") || "imaps.udag.de",
    imapPort: Number(Deno.env.get("MAIL_IMAP_PORT") || 993),
    smtpHost: Deno.env.get("MAIL_SMTP_HOST") || "smtps.udag.de",
    smtpPort: Number(Deno.env.get("MAIL_SMTP_PORT") || 465),
    user,
    pass,
    fromName: Deno.env.get("MAIL_FROM_NAME") || "Viral Outlaws",
    sentFolder: Deno.env.get("MAIL_SENT_FOLDER") || "",
  };
}

export function domainOf(email: string): string {
  const at = String(email || "").toLowerCase().split("@")[1] || "";
  return at.replace(/[>\s].*$/, "").trim();
}

export function isFreemail(email: string): boolean {
  return FREEMAIL.has(domainOf(email));
}

export function folderRole(path: string, flags: string[]): string {
  const flag = flags.map((f) => f.toLowerCase());
  if (flag.includes("\\inbox")) return "inbox";
  if (flag.includes("\\sent")) return "sent";
  if (flag.includes("\\drafts")) return "drafts";
  if (flag.includes("\\junk")) return "spam";
  if (flag.includes("\\trash")) return "trash";
  if (flag.includes("\\archive")) return "archive";
  const name = path.toLowerCase().replace(/^\//, "");
  const leaf = name.split(/[./]/).pop() || name;
  for (const [role, names] of Object.entries(ROLE_NAMES)) {
    if (names.includes(name) || names.includes(leaf)) return role;
  }
  return "other";
}

export function parseListLine(line: string): ListedFolder | null {
  const m = /^\* LIST \(([^)]*)\) "([^"]*)" (?:"([^"]+)"|(\S+))\s*$/i.exec(line.trim());
  if (!m) return null;
  const flags = m[1].split(/\s+/).filter(Boolean);
  const delimiter = m[2] || "/";
  const path = m[3] || m[4];
  const name = path.split(delimiter).filter(Boolean).pop() || path;
  return { path, name, delimiter, flags, role: folderRole(path, flags) };
}

export function parentPath(path: string, delimiter: string): string | null {
  const parts = path.split(delimiter).filter(Boolean);
  if (parts.length < 2) return null;
  return parts.slice(0, -1).join(delimiter);
}

export function pickSentFolder(folders: ListedFolder[], override = ""): string | null {
  if (override && folders.some((f) => f.path === override)) return override;
  const flagged = folders.find((f) => f.role === "sent");
  return flagged?.path || null;
}

export function threadKey(subject: string): string {
  let s = String(subject || "").toLowerCase().replace(/\s+/g, " ").trim();
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(/^(re|aw|wg|fwd|fw)\s*:\s*/i, "");
  }
  return s.slice(0, 180);
}

export function sanitizeHtml(html: string, loadImages = false): string {
  let s = String(html || "");
  s = s.replace(/<\s*(script|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  s = s.replace(/<\s*(script|iframe|object|embed|link|meta)[^>]*\/?\s*>/gi, "");
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(/javascript:/gi, "");
  if (!loadImages) {
    s = s.replace(/(<img\b[^>]*?)\ssrc\s*=\s*("([^"]*)"|'([^']*)')/gi, (_a, pre, _q, d, e) => {
      const url = d || e || "";
      if (url.startsWith("data:")) return `${pre} src="${url}"`;
      return `${pre} data-remote-src="${url.replace(/"/g, "")}"`;
    });
  }
  return s;
}

export function classifyHeuristic(text: string, knownContact: boolean): string {
  const s = text.toLowerCase();
  if (/unsubscribe|abmelden|newsletter|no-reply|noreply/.test(s)) return "newsletter";
  if (/spam|gewinnspiel/.test(s)) return "sonstiges";
  if (/rechnung|invoice|beleg|quittung/.test(s)) return "rechnung";
  if (knownContact) return "kunde";
  if (/angebot|anfrage|interesse|website|projekt|zusammenarbeit/.test(s)) return "anfrage";
  return "sonstiges";
}

export function shouldDraft(klassifikation: string, knownContact: boolean): boolean {
  if (klassifikation === "newsletter" || klassifikation === "spam") return false;
  return klassifikation === "anfrage" || knownContact;
}

function quote(s: string): string {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function imapLiteral(bytes: Uint8Array): string {
  return `{${bytes.length}}`;
}

type Sock = { read: () => Promise<string>; write: (s: string) => Promise<void>; close: () => void };

async function openTls(host: string, port: number): Promise<Sock & { take: (n: number) => Promise<string> }> {
  const conn = await Deno.connectTls({ hostname: host, port });
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buf = "";
  const pull = async () => {
    const chunk = new Uint8Array(16384);
    const n = await conn.read(chunk);
    if (n === null) return false;
    buf += dec.decode(chunk.subarray(0, n));
    return true;
  };
  return {
    async take(n: number) {
      while (buf.length < n) {
        if (!await pull()) break;
      }
      const out = buf.slice(0, n);
      buf = buf.slice(n);
      return out;
    },
    async read() {
      while (!buf.includes("\r\n")) {
        if (!await pull()) break;
      }
      const i = buf.indexOf("\r\n");
      const line = i >= 0 ? buf.slice(0, i) : buf;
      buf = i >= 0 ? buf.slice(i + 2) : "";
      return line;
    },
    async write(s: string) {
      await conn.write(enc.encode(s));
    },
    close() {
      try { conn.close(); } catch { /* ignore */ }
    },
  };
}

async function readUntilTag(sock: Sock, tag: string): Promise<string[]> {
  const lines: string[] = [];
  for (;;) {
    const line = await sock.read();
    lines.push(line);
    if (line.startsWith(tag + " ")) return lines;
    if (!line) throw new Error("IMAP Verbindung zu");
  }
}

export async function withImap<T>(fn: (run: (cmd: string) => Promise<string[]>, sock: Sock) => Promise<T>): Promise<T> {
  const cfg = mailConfig();
  if (!cfg) throw new Error("E-Mail noch nicht verbunden");
  const sock = await openTls(cfg.imapHost, cfg.imapPort);
  try {
    await sock.read();
    let n = 0;
    const run = async (cmd: string) => {
      const tag = "a" + (++n);
      await sock.write(`${tag} ${cmd}\r\n`);
      const lines = await readUntilTag(sock, tag);
      const last = lines[lines.length - 1] || "";
      if (!last.includes(" OK")) throw new Error(last.slice(0, 180) || "IMAP Fehler");
      return lines;
    };
    await run(`LOGIN ${quote(cfg.user)} ${quote(cfg.pass)}`);
    const out = await fn(run, sock);
    try { await run("LOGOUT"); } catch { /* ignore */ }
    return out;
  } finally {
    sock.close();
  }
}

export type FetchedMail = { uid: number; flags: string; header: string; text: string };

async function readFetch(sock: Sock & { take: (n: number) => Promise<string> }, tag: string): Promise<string[]> {
  const lines: string[] = [];
  for (;;) {
    let line = await sock.read();
    const lit = /\{(\d+)\}\s*$/.exec(line);
    if (lit) {
      const body = await sock.take(Number(lit[1]));
      const tail = await sock.read();
      line = line + body + tail;
    }
    lines.push(line);
    if (line.startsWith(tag + " ")) return lines;
    if (!line) throw new Error("IMAP Verbindung zu");
  }
}

function imapSince(days: number): string {
  const d = new Date(Date.now() - days * 86400000);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(d.getUTCDate()).padStart(2, "0")}-${months[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

export function pickRecentUids(uids: number[], limit: number, spec: { afterUid?: number; beforeUid?: number } = {}): number[] {
  const cap = Math.max(0, Math.floor(limit));
  const after = spec.afterUid || 0;
  const before = spec.beforeUid || 0;
  let pool = [...new Set(uids.filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
  if (after > 0) pool = pool.filter((u) => u > after);
  if (before > 0) pool = pool.filter((u) => u < before);
  if (pool.length <= cap) return pool;
  if (after > 0 && !before) return pool.slice(0, cap);
  return pool.slice(-cap);
}

export function searchUids(lines: string[]): number[] {
  return (lines.find((l) => l.startsWith("* SEARCH")) || "")
    .replace("* SEARCH", "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

export async function imapFetchNew(folder: string, spec: number | { afterUid?: number; beforeUid?: number; limit?: number; deadline?: number } = {}): Promise<FetchedMail[]> {
  const cfg = mailConfig();
  if (!cfg) throw new Error("E-Mail noch nicht verbunden");
  const opts = typeof spec === "number" ? { afterUid: spec, limit: spec > 0 ? 80 : 200 } : spec;
  const limit = opts.limit ?? (opts.afterUid ? 80 : 200);
  const sock = await openTls(cfg.imapHost, cfg.imapPort);
  try {
    await sock.read();
    let n = 0;
    const run = async (cmd: string) => {
      const tag = "b" + (++n);
      await sock.write(`${tag} ${cmd}\r\n`);
      return await readFetch(sock, tag);
    };
    const login = await run(`LOGIN ${quote(cfg.user)} ${quote(cfg.pass)}`);
    if (!(login[login.length - 1] || "").includes(" OK")) throw new Error("IMAP Login fehlgeschlagen");
    const sel = await run(`SELECT ${quote(folder)}`);
    if (!(sel[sel.length - 1] || "").includes(" OK")) throw new Error("Ordner nicht lesbar");
    const afterUid = opts.afterUid || 0;
    const beforeUid = opts.beforeUid || 0;
    const query = afterUid > 0
      ? `UID SEARCH UID ${afterUid + 1}:*`
      : beforeUid > 0
      ? `UID SEARCH UID 1:${beforeUid - 1}`
      : "UID SEARCH ALL";
    let found = await run(query);
    if (afterUid === 0 && beforeUid === 0 && !(found[found.length - 1] || "").includes(" OK")) {
      found = await run(`UID SEARCH SINCE ${imapSince(90)}`);
    }
    const uids = pickRecentUids(searchUids(found), limit, { afterUid, beforeUid });
    const out: FetchedMail[] = [];
    for (const uid of uids) {
      if (opts.deadline && Date.now() > opts.deadline) break;
      const lines = await run(`UID FETCH ${uid} (FLAGS BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE)] BODY.PEEK[TEXT]<0.8000>)`);
      const blob = lines.join("\n");
      const header = /BODY\[HEADER[^\]]*\]\s*([\s\S]*?)(?=BODY\[TEXT\]|b\d+ OK|\* \d+ FETCH|$)/i.exec(blob)?.[1] || blob;
      const text = /BODY\[TEXT\](?:<\d+>)?\s*([\s\S]*?)(?=b\d+ OK|\)$)/i.exec(blob)?.[1] || "";
      const flags = /FLAGS \(([^)]*)\)/.exec(blob)?.[1] || "";
      out.push({ uid, flags, header: header.slice(0, 8000), text: text.slice(0, 8000) });
    }
    try { await run("LOGOUT"); } catch { /* ignore */ }
    return out;
  } finally {
    sock.close();
  }
}

export function headerValue(header: string, name: string): string {
  const re = new RegExp(`^${name}:\\s*(.*)$`, "im");
  return (re.exec(header)?.[1] || "").trim();
}

export async function imapList(): Promise<ListedFolder[]> {
  return await withImap(async (run) => {
    const lines = await run(`LIST "" "*"`);
    return lines.map(parseListLine).filter((x): x is ListedFolder => !!x);
  });
}

export async function imapMove(from: string, uid: number, to: string): Promise<"move" | "copy"> {
  return await withImap(async (run) => {
    await run(`SELECT ${quote(from)}`);
    try {
      await run(`UID MOVE ${uid} ${quote(to)}`);
      return "move";
    } catch {
      await run(`UID COPY ${uid} ${quote(to)}`);
      await run(`UID STORE ${uid} +FLAGS (\\Deleted)`);
      await run("EXPUNGE");
      return "copy";
    }
  });
}

export async function imapCreate(path: string) {
  await withImap(async (run) => { await run(`CREATE ${quote(path)}`); });
}
export async function imapRename(from: string, to: string) {
  await withImap(async (run) => { await run(`RENAME ${quote(from)} ${quote(to)}`); });
}
export async function imapDeleteFolder(path: string) {
  await withImap(async (run) => { await run(`DELETE ${quote(path)}`); });
}

export async function imapAppend(folder: string, raw: string) {
  const bytes = new TextEncoder().encode(raw);
  await withImap(async (run, sock) => {
    const tag = "ap1";
    await sock.write(`${tag} APPEND ${quote(folder)} (\\Seen) ${imapLiteral(bytes)}\r\n`);
    const cont = await sock.read();
    if (!cont.startsWith("+")) throw new Error("APPEND abgelehnt");
    await sock.write(raw + "\r\n");
    const lines = await readUntilTag(sock, tag);
    if (!(lines[lines.length - 1] || "").includes(" OK")) throw new Error("APPEND fehlgeschlagen");
  });
}

export async function smtpSend(to: string[], subject: string, text: string, from: string): Promise<void> {
  const cfg = mailConfig();
  if (!cfg) throw new Error("E-Mail noch nicht verbunden");
  const conn = await Deno.connectTls({ hostname: cfg.smtpHost, port: cfg.smtpPort });
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buf = "";
  const read = async () => {
    while (!buf.includes("\r\n")) {
      const chunk = new Uint8Array(4096);
      const n = await conn.read(chunk);
      if (n === null) break;
      buf += dec.decode(chunk.subarray(0, n));
    }
    const i = buf.indexOf("\r\n");
    const line = buf.slice(0, i);
    buf = buf.slice(i + 2);
    return line;
  };
  const write = async (s: string) => { await conn.write(enc.encode(s + "\r\n")); };
  const expect = async (code: string) => {
    const line = await read();
    if (!line.startsWith(code)) throw new Error(line.slice(0, 160));
  };
  try {
    await expect("220");
    await write(`EHLO viraloutlaws.de`);
    let line = await read();
    while (line.startsWith("250-")) line = await read();
    const b64 = (s: string) => btoa(s);
    await write("AUTH LOGIN");
    await expect("334");
    await write(b64(cfg.user));
    await expect("334");
    await write(b64(cfg.pass));
    await expect("235");
    await write(`MAIL FROM:<${from}>`);
    await expect("250");
    for (const rcpt of to) {
      await write(`RCPT TO:<${rcpt}>`);
      await expect("250");
    }
    await write("DATA");
    await expect("354");
    const raw = [
      `From: ${cfg.fromName} <${from}>`,
      `To: ${to.join(", ")}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      text.replace(/^\./gm, ".."),
      ".",
    ].join("\r\n");
    await conn.write(enc.encode(raw + "\r\n"));
    await expect("250");
    await write("QUIT");
  } finally {
    try { conn.close(); } catch { /* ignore */ }
  }
}

export function rfc822(from: string, to: string[], subject: string, text: string, fromName: string): string {
  return [
    `From: ${fromName} <${from}>`,
    `To: ${to.join(", ")}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    text,
  ].join("\r\n");
}
