// Reine Regeln für den Bot-Leitstand. Kein Service-Role-Key, kein Netzwerk.
// jarvis-dispatch, bot-api und die Tests benutzen dieselben Übergänge.

export const BOT_IDS = ["webby", "marky", "saley", "cashy", "developy"] as const;
export type BotId = typeof BOT_IDS[number];

export const RUN_STATUSES = ["queued", "sent", "in_arbeit", "erledigt", "blockiert", "fehler"] as const;
export type RunStatus = typeof RUN_STATUSES[number];

export const NOT_CONNECTED = "Bot noch nicht verbunden";

export const BOT_META: Record<BotId, { name: string; role: string; letter: string; focus: string }> = {
  webby: { name: "Webby", role: "Websites", letter: "W", focus: "Website / Tech" },
  marky: { name: "Marky", role: "Marketing / Social", letter: "M", focus: "Marketing / Social" },
  saley: { name: "Saley", role: "Vertrieb", letter: "S", focus: "Vertrieb / Leads" },
  cashy: { name: "Cashy", role: "Finanzen", letter: "C", focus: "Finanzen / Rechnungen" },
  developy: { name: "Developy", role: "Software", letter: "D", focus: "Software / Jarvis" },
};

const NEXT: Record<RunStatus, RunStatus[]> = {
  queued: ["sent", "in_arbeit", "fehler"],
  sent: ["in_arbeit", "erledigt", "blockiert", "fehler"],
  in_arbeit: ["erledigt", "blockiert", "fehler"],
  blockiert: ["in_arbeit", "erledigt", "fehler"],
  fehler: ["queued", "in_arbeit"],
  erledigt: [],
};

export const RATE_LIMIT = 60;
export const RATE_WINDOW_MS = 60_000;
export const INVALID_LIMIT = 20;
export const INVALID_WINDOW_MS = 60_000;
export const INVALID_MAP_CAP = 256;
export const VALID_MAP_CAP = 64;
export const GLOBAL_INVALID_LIMIT = 200;
export const GLOBAL_INVALID_KEY = "*";

export type TokenRow = {
  bot: string;
  workspace_id: string;
  token_hash: string;
  revoked_at: string | null;
};

export type RunScope = { bot: string; workspace_id: string };

export type BotEvent = { at: string; status: string; message: string };

export function isBotId(v: unknown): v is BotId {
  return typeof v === "string" && (BOT_IDS as readonly string[]).includes(v);
}

export function isRunStatus(v: unknown): v is RunStatus {
  return typeof v === "string" && (RUN_STATUSES as readonly string[]).includes(v);
}

export function canTransition(from: string, to: string): boolean {
  if (!isRunStatus(from) || !isRunStatus(to)) return false;
  if (from === to) return true;
  return NEXT[from].includes(to);
}

export function planStatusUpdate(current: string, next: string | null): { ok: true } | { ok: false; error: string } {
  if (!next) return { ok: true };
  if (!isRunStatus(next)) return { ok: false, error: "Status unbekannt." };
  if (!canTransition(current, next)) return { ok: false, error: `Wechsel von ${current} nach ${next} ist nicht erlaubt.` };
  return { ok: true };
}

export function bearerToken(header: string | null): string | null {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  if (m[1].length < 20 || m[1].length > 200) return null;
  if (/[\r\n]/.test(m[1])) return null;
  return m[1];
}

export async function sha256Hex(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function matchToken(hash: string, rows: TokenRow[]): { ok: true; bot: BotId; workspace_id: string } | { ok: false; reason: "missing" | "revoked" | "bot" } {
  const row = rows.find((r) => r.token_hash === hash);
  if (!row) return { ok: false, reason: "missing" };
  if (row.revoked_at) return { ok: false, reason: "revoked" };
  if (!isBotId(row.bot) || !row.workspace_id) return { ok: false, reason: "bot" };
  return { ok: true, bot: row.bot, workspace_id: row.workspace_id };
}

export function runInScope(auth: RunScope, run: RunScope): boolean {
  return auth.bot === run.bot && auth.workspace_id === run.workspace_id;
}

export function planMirror(
  auth: RunScope,
  run: RunScope & { status: string; aufgabe_id: string | null },
): { ok: true } | { ok: false; error: string } {
  if (!runInScope(auth, run)) return { ok: false, error: "Dieser Lauf gehört einem anderen Bot." };
  if (run.status !== "erledigt") return { ok: false, error: "Spiegeln geht erst bei Status erledigt." };
  if (!run.aufgabe_id) return { ok: false, error: "Keine Aufgabe verknüpft." };
  return { ok: true };
}

export function authorizeRunUpdate(
  auth: RunScope,
  run: RunScope & { status: string },
  next: string | null,
): { ok: true } | { ok: false; error: string } {
  if (!runInScope(auth, run)) return { ok: false, error: "Dieser Lauf gehört einem anderen Bot." };
  return planStatusUpdate(run.status, next);
}

export function rateAllow(hits: number[], now: number, limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS): { ok: boolean; hits: number[] } {
  const fresh = hits.filter((t) => now - t < windowMs);
  if (fresh.length >= limit) return { ok: false, hits: fresh };
  fresh.push(now);
  return { ok: true, hits: fresh };
}

export type HeaderSource = { get(name: string): string | null };

function parseIp(value: string | null | undefined): string | null {
  let raw = String(value ?? "").trim();
  if (!raw || raw.length > 64 || /[\s\r\n]/.test(raw)) return null;
  if (raw.startsWith("[") && raw.endsWith("]")) raw = raw.slice(1, -1);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(raw)) {
    if (!raw.split(".").every((part) => Number(part) <= 255)) return null;
    return raw;
  }
  if (!raw.includes(":") || !/^[0-9a-fA-F:.]+$/.test(raw)) return null;
  const halves = raw.split("::");
  if (halves.length > 2) return null;
  const groups = raw.split(":").filter((group) => group.length > 0);
  if (halves.length === 1 && groups.length !== 8) return null;
  if (groups.length > 8) return null;
  if (groups.some((group) => group.length > 4 && !group.includes("."))) return null;
  return raw.toLowerCase();
}

// Supabase Edge hängt hinter Cloudflare. Die API-Logs führen cf-connecting-ip
// und x-real-ip; Cloudflare setzt cf-connecting-ip und ersetzt einen vom Aufrufer
// gesetzten Wert. x-real-ip setzt das Gateway davor. Sb-Forwarded-For gilt nur
// für Auth mit eigenem Schalter, nicht für Edge Functions. Der erste Eintrag von
// x-forwarded-for ist vom Aufrufer. Nur der letzte Hop zählt, und nur wenn die
// Plattform-Header keine Adresse liefern. Sonst ein gemeinsamer Topf.
export function clientIpForLimit(headers: HeaderSource): string {
  const cf = parseIp(headers.get("cf-connecting-ip"));
  if (cf) return cf;
  const real = parseIp(headers.get("x-real-ip"));
  if (real) return real;
  const parts = String(headers.get("x-forwarded-for") || "").split(",");
  const last = parseIp(parts[parts.length - 1]);
  if (last) return last;
  return GLOBAL_INVALID_KEY;
}

export function sweepRateMap(map: Map<string, number[]>, now: number, windowMs: number): void {
  for (const [key, hits] of map) {
    const fresh = hits.filter((t) => now - t < windowMs);
    if (!fresh.length) map.delete(key);
    else if (fresh.length !== hits.length) map.set(key, fresh);
  }
}

function evictOldest(map: Map<string, number[]>, cap: number): void {
  while (map.size > cap) {
    let oldestKey = "";
    let oldest = Infinity;
    for (const [key, hits] of map) {
      const last = hits.length ? hits[hits.length - 1] : 0;
      if (last < oldest) {
        oldest = last;
        oldestKey = key;
      }
    }
    if (!oldestKey) break;
    map.delete(oldestKey);
  }
}

export function rateBlocked(map: Map<string, number[]>, key: string, now: number, limit: number, windowMs: number): boolean {
  const fresh = (map.get(key) || []).filter((t) => now - t < windowMs);
  if (!fresh.length) map.delete(key);
  else if (fresh.length !== (map.get(key) || []).length) map.set(key, fresh);
  return fresh.length >= limit;
}

export function admitRate(
  map: Map<string, number[]>,
  key: string,
  now: number,
  limit: number,
  windowMs: number,
  cap: number,
): boolean {
  sweepRateMap(map, now, windowMs);
  const fresh = map.get(key) || [];
  if (fresh.length >= limit) return false;
  if (!map.has(key) && map.size >= cap) evictOldest(map, cap - 1);
  fresh.push(now);
  map.set(key, fresh);
  evictOldest(map, cap);
  return map.has(key);
}

export type RateTables = { valid: Map<string, number[]>; invalid: Map<string, number[]> };

function rateMapCount(map: Map<string, number[]>): number {
  let total = 0;
  for (const hits of map.values()) total += hits.length;
  return total;
}

export function beginBotRequest(tables: RateTables, ip: string, now: number): { ok: true } | { ok: false } {
  sweepRateMap(tables.valid, now, RATE_WINDOW_MS);
  sweepRateMap(tables.invalid, now, INVALID_WINDOW_MS);
  if (rateMapCount(tables.invalid) >= GLOBAL_INVALID_LIMIT) return { ok: false };
  evictOldest(tables.invalid, INVALID_MAP_CAP);
  if (rateBlocked(tables.invalid, ip, now, INVALID_LIMIT, INVALID_WINDOW_MS)) return { ok: false };
  return { ok: true };
}

export function noteInvalidAttempt(tables: RateTables, ip: string, now: number): void {
  admitRate(tables.invalid, ip, now, INVALID_LIMIT, INVALID_WINDOW_MS, INVALID_MAP_CAP);
}

export function noteValidToken(tables: RateTables, hash: string, now: number): boolean {
  return admitRate(tables.valid, hash, now, RATE_LIMIT, RATE_WINDOW_MS, VALID_MAP_CAP);
}

export function aufgabeBelongsToWorkspace(
  row: { id?: string | null; workspace_id?: string | null } | null | undefined,
  workspaceId: string,
): boolean {
  if (!row?.id || row.workspace_id == null || !workspaceId) return false;
  return String(row.workspace_id) === workspaceId;
}

export function secretNames(bot: string): { url: string; key: string } {
  const u = bot.toUpperCase();
  return { url: `BOT_WEBHOOK_${u}_URL`, key: `BOT_WEBHOOK_${u}_KEY` };
}

export function webhookUrlAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.username || u.password) return false;
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return true;
    return false;
  } catch {
    return false;
  }
}

export function webhookHeaders(key: string, headerName?: string | null): Record<string, string> {
  if (!key || /[\r\n]/.test(key)) throw new Error("Webhook-Key ungültig.");
  const name = (headerName || "X-Webhook-Key").trim() || "X-Webhook-Key";
  if (!/^[A-Za-z0-9-]{1,64}$/.test(name)) throw new Error("Header-Name ungültig.");
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${key}`,
    [name]: key,
  };
}

export function webhookBody(run: {
  id: string;
  bot: string;
  title: string;
  instructions: string;
  aufgabe_id: string | null;
}, crmUrl: string, callbackUrl: string, ping = false): Record<string, unknown> {
  return {
    run_id: run.id,
    bot: run.bot,
    title: run.title,
    instructions: run.instructions,
    aufgabe_id: run.aufgabe_id,
    crm_url: crmUrl,
    callback_url: callbackUrl,
    ...(ping ? { ping: true } : {}),
  };
}

export function secretsReady(url: string | null, key: string | null): { post: true; url: string; key: string } | { post: false; status: "queued"; message: typeof NOT_CONNECTED } | { post: false; status: "fehler"; message: string } {
  if (!url || !key) return { post: false, status: "queued", message: NOT_CONNECTED };
  if (!webhookUrlAllowed(url)) return { post: false, status: "fehler", message: "Webhook-URL ist kein https." };
  return { post: true, url, key };
}

export function outcomeAfterPost(httpStatus: number): { status: "sent" | "fehler"; message: string } {
  if (httpStatus >= 200 && httpStatus < 300) return { status: "sent", message: "Webhook angenommen." };
  if (httpStatus >= 300 && httpStatus < 400) return { status: "fehler", message: "Webhook hat umgeleitet." };
  return { status: "fehler", message: `Webhook antwortete mit ${httpStatus}.` };
}

export function pushEvent(events: unknown, event: BotEvent): BotEvent[] {
  const list = Array.isArray(events)
    ? events.filter((item): item is BotEvent => {
      if (!item || typeof item !== "object") return false;
      const e = item as Record<string, unknown>;
      return typeof e.at === "string" && typeof e.status === "string" && typeof e.message === "string";
    })
    : [];
  list.push(event);
  return list.slice(-50);
}

export function aufgabeBeschreibung(bot: BotId, instructions: string): string {
  const b = BOT_META[bot];
  const line = `Zuständig: ${b.name} (${b.role}).`;
  const extra = instructions.trim();
  return extra ? `${line}\n${extra}` : line;
}

export function appendBotResult(beschreibung: string | null, bot: BotId, result: string, links: string[], day: string): string {
  const name = BOT_META[bot].name;
  const linkLine = links.length ? `\nLinks: ${links.join(", ")}` : "";
  const block = `[${day}] Bot-Ergebnis (${name}):\n${result.trim()}${linkLine}`;
  const base = (beschreibung || "").replace(/\s+$/, "");
  return base ? `${base}\n\n${block}` : block;
}

export function normLinks(v: unknown): string[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new Error("links muss eine Liste sein.");
  const out: string[] = [];
  for (const item of v.slice(0, 20)) {
    const s = String(item ?? "").trim();
    if (!s) continue;
    if (!/^https?:\/\//i.test(s) || s.length > 500 || /[\r\n]/.test(s)) throw new Error("Ein Link muss http oder https sein.");
    out.push(s);
  }
  return out;
}

export function leitstandPayload(runs: Array<Record<string, unknown>>) {
  const grouped: Record<string, Array<Record<string, unknown>>> = {};
  for (const id of BOT_IDS) grouped[id] = [];
  for (const run of runs) {
    const bot = String(run.bot || "");
    if (grouped[bot]) grouped[bot].push(run);
  }
  return {
    title: "Bot-Leitstand",
    meta: "Aufträge",
    crm: "aufgaben",
    wide: true,
    leitstand: true,
    spoken: "Fünf Bots. Webby macht Website und Tech, Marky Marketing, Saley Vertrieb und Leads, Cashy Finanzen und Rechnungen, Developy Software und Jarvis. Ein Auftrag geht erst nach deiner Bestätigung raus.",
    bots: BOT_IDS.map((id) => ({
      id,
      name: BOT_META[id].name,
      role: BOT_META[id].role,
      focus: BOT_META[id].focus,
      letter: BOT_META[id].letter,
      connection: connectionOf(grouped[id] as Array<{ status?: string; result?: string | null; events?: unknown }>),
      runs: grouped[id].slice(0, 5),
    })),
  };
}

export function connectionOf(runs: Array<{ status?: string; result?: string | null; events?: unknown }>): "verbunden" | "nicht verbunden" | "fehler" | "unbekannt" {
  if (!runs.length) return "unbekannt";
  const last = runs[0];
  const events = Array.isArray(last.events) ? last.events : [];
  const text = `${last.result || ""} ${events.map((e) => (e && typeof e === "object" ? String((e as { message?: string }).message || "") : "")).join(" ")}`;
  if (text.includes(NOT_CONNECTED)) return "nicht verbunden";
  if (last.status === "fehler") return "fehler";
  if (last.status === "sent" || last.status === "in_arbeit" || last.status === "erledigt" || last.status === "blockiert") return "verbunden";
  return "unbekannt";
}

export function publicError(e: unknown): string {
  const msg = e instanceof Error ? e.message : "Fehler";
  if (/service_role|SUPABASE_SERVICE_ROLE_KEY|\beyJ[A-Za-z0-9_-]{8,}/.test(msg)) return "Interner Fehler.";
  return msg.slice(0, 300);
}

export type DispatchEnv = {
  url: string | null;
  key: string | null;
  keyHeader: string | null;
  crmUrl: string;
  callbackUrl: string;
  now: string;
};

export async function performDispatch(opts: {
  bot: string;
  title: string;
  instructions: string;
  aufgabe_id: string | null;
  workspace_id: string;
  created_by: string | null;
  ping: boolean;
  env: DispatchEnv;
  insertRun: (row: Record<string, unknown>) => Promise<{ id: string }>;
  updateRun: (id: string, patch: Record<string, unknown>) => Promise<void>;
  post: (url: string, headers: Record<string, string>, body: unknown) => Promise<{ status: number }>;
}): Promise<{ run_id: string; status: RunStatus; message: string; connected: boolean; ping: boolean }> {
  if (!isBotId(opts.bot)) throw new Error("Bot muss Webby, Marky, Saley, Cashy oder Developy sein.");
  const title = opts.ping ? "Verbindungstest" : opts.title.trim().slice(0, 300);
  const instructions = opts.ping ? "ping" : opts.instructions.trim().slice(0, 4000);
  if (!title) throw new Error("Titel fehlt.");
  const ready = secretsReady(opts.env.url, opts.env.key);
  const opened: BotEvent = { at: opts.env.now, status: "queued", message: opts.ping ? "Verbindungstest." : "Auftrag angelegt." };
  const created = await opts.insertRun({
    workspace_id: opts.workspace_id,
    bot: opts.bot,
    aufgabe_id: opts.ping ? null : opts.aufgabe_id,
    title,
    instructions,
    status: "queued",
    result: null,
    links: [],
    created_by: opts.created_by,
    events: [opened],
  });
  if (!ready.post) {
    const message = ready.message;
    await opts.updateRun(created.id, {
      status: ready.status,
      result: message,
      events: pushEvent([opened], { at: opts.env.now, status: ready.status, message }),
    });
    return { run_id: created.id, status: ready.status, message, connected: false, ping: opts.ping };
  }
  let posted: { status: number };
  try {
    posted = await opts.post(
      ready.url,
      webhookHeaders(ready.key, opts.env.keyHeader),
      webhookBody({
        id: created.id,
        bot: opts.bot,
        title,
        instructions,
        aufgabe_id: opts.ping ? null : opts.aufgabe_id,
      }, opts.env.crmUrl, opts.env.callbackUrl, opts.ping),
    );
  } catch {
    const message = "Webhook nicht erreichbar.";
    await opts.updateRun(created.id, {
      status: "fehler",
      result: message,
      events: pushEvent([opened], { at: opts.env.now, status: "fehler", message }),
    });
    return { run_id: created.id, status: "fehler", message, connected: false, ping: opts.ping };
  }
  const done = outcomeAfterPost(posted.status);
  await opts.updateRun(created.id, {
    status: done.status,
    result: done.message,
    events: pushEvent([opened], { at: opts.env.now, status: done.status, message: done.message }),
  });
  return { run_id: created.id, status: done.status, message: done.message, connected: done.status === "sent", ping: opts.ping };
}

export function allowedOrigin(origin: string): boolean {
  if (origin === "https://crm.viraloutlaws.de") return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export function corsHeaders(origin: string | null, methods: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, prefer",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
