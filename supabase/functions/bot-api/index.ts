// bot-api: Auth über den Bot-Token (SHA-256 in bot_tokens), nicht über das Nutzer-JWT.
// Die Service-Role bleibt in dieser Funktion. Sie wird nie gelesen oder zurückgegeben.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  type BotId,
  RATE_LIMIT,
  RATE_WINDOW_MS,
  allowedOrigin,
  appendBotResult,
  authorizeRunUpdate,
  bearerToken,
  corsHeaders,
  isRunStatus,
  matchToken,
  normLinks,
  planMirror,
  publicError,
  pushEvent,
  rateAllow,
  sha256Hex,
} from "../_shared/bot_leitstand.ts";

const hits = new Map<string, number[]>();

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin, "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (origin && !allowedOrigin(origin)) return json({ error: "Origin nicht erlaubt." }, 403, headers);
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Nur GET oder POST." }, 405, headers);

  const token = bearerToken(req.headers.get("authorization"));
  if (!token) return json({ error: "Token ungültig." }, 401, headers);

  let admin: SupabaseClient;
  try {
    admin = serviceClient();
  } catch (e) {
    return json({ error: publicError(e) }, 500, headers);
  }

  let hash = "";
  try {
    hash = await sha256Hex(token);
  } catch {
    return json({ error: "Token ungültig." }, 401, headers);
  }
  const now = Date.now();
  const gate = rateAllow(hits.get(hash) || [], now, RATE_LIMIT, RATE_WINDOW_MS);
  hits.set(hash, gate.hits);
  if (!gate.ok) return json({ error: "Zu viele Anfragen. Kurz warten." }, 429, headers);

  const tokenRes = await admin.from("bot_tokens").select("bot, workspace_id, token_hash, revoked_at").eq("token_hash", hash).maybeSingle();
  if (tokenRes.error) return json({ error: "Token nicht prüfbar." }, 500, headers);
  const matched = matchToken(hash, tokenRes.data ? [tokenRes.data] : []);
  if (!matched.ok) return json({ error: "Token ungültig." }, 401, headers);
  const scope = { bot: matched.bot, workspace_id: matched.workspace_id };

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const runId = url.searchParams.get("run_id");
      if (runId) return json(await getRun(admin, scope, runId), 200, headers);
      return json(await listRuns(admin, scope), 200, headers);
    }

    let raw = "";
    try {
      raw = await req.text();
    } catch {
      return json({ error: "Anfrage leer." }, 400, headers);
    }
    if (raw.length > 32_000) return json({ error: "Anfrage zu groß." }, 413, headers);
    let body: Record<string, unknown>;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("json");
      body = parsed as Record<string, unknown>;
    } catch {
      return json({ error: "Ungültiges JSON." }, 400, headers);
    }
    const op = String(body.op || "update");
    if (op === "list") return json(await listRuns(admin, scope), 200, headers);
    if (op === "get") return json(await getRun(admin, scope, String(body.run_id || "")), 200, headers);
    if (op === "update") return json(await updateRun(admin, scope, body), 200, headers);
    if (op === "mirror") return json(await mirrorRun(admin, scope, String(body.run_id || "")), 200, headers);
    return json({ error: "Unbekannte Operation." }, 400, headers);
  } catch (e) {
    const msg = publicError(e);
    const status = /nicht gefunden/i.test(msg) ? 404 : /nicht erlaubt|erst bei Status|gehört einem anderen/i.test(msg) ? 409 : 400;
    return json({ error: msg }, status, headers);
  }
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = "id, workspace_id, bot, aufgabe_id, title, instructions, status, result, links, created_at, updated_at, events";

function assertId(id: string): string {
  if (!UUID.test(id)) throw new Error("Lauf nicht gefunden.");
  return id;
}

async function listRuns(admin: SupabaseClient, scope: { bot: BotId; workspace_id: string }) {
  const { data, error } = await admin.from("bot_runs").select(COLS)
    .eq("bot", scope.bot)
    .eq("workspace_id", scope.workspace_id)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw new Error("Läufe nicht lesbar.");
  return { ok: true, bot: scope.bot, runs: (data || []).map(publicRun) };
}

async function getRun(admin: SupabaseClient, scope: { bot: BotId; workspace_id: string }, runId: string) {
  const id = assertId(runId);
  const row = await loadOwn(admin, scope, id);
  return { ok: true, run: publicRun(row) };
}

async function loadOwn(admin: SupabaseClient, scope: { bot: BotId; workspace_id: string }, id: string) {
  const { data, error } = await admin.from("bot_runs").select(COLS)
    .eq("id", id)
    .eq("bot", scope.bot)
    .eq("workspace_id", scope.workspace_id)
    .maybeSingle();
  if (error) throw new Error("Lauf nicht lesbar.");
  if (!data) throw new Error("Lauf nicht gefunden.");
  return data;
}

async function updateRun(admin: SupabaseClient, scope: { bot: BotId; workspace_id: string }, body: Record<string, unknown>) {
  const id = assertId(String(body.run_id || ""));
  const row = await loadOwn(admin, scope, id);
  const next = body.status == null || body.status === "" ? null : String(body.status);
  const gate = authorizeRunUpdate(scope, { bot: String(row.bot), workspace_id: String(row.workspace_id), status: String(row.status) }, next);
  if (!gate.ok) throw new Error(gate.error);
  if (next && !isRunStatus(next)) throw new Error("Status unbekannt.");
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (next) patch.status = next;
  if (body.result !== undefined) {
    if (body.result !== null && typeof body.result !== "string") throw new Error("Ergebnis muss Text sein.");
    patch.result = body.result == null ? null : String(body.result).slice(0, 8000);
  }
  if (body.links !== undefined) patch.links = normLinks(body.links);
  const note = body.event == null ? "" : String(body.event).replace(/[<>\u0000]/g, "").trim().slice(0, 500);
  if (note || next) {
    patch.events = pushEvent(row.events, {
      at: new Date().toISOString(),
      status: next || String(row.status),
      message: note || `Status ${next}.`,
    });
  }
  if (Object.keys(patch).length === 1) throw new Error("Nichts zu ändern.");
  const { error } = await admin.from("bot_runs").update(patch)
    .eq("id", id)
    .eq("bot", scope.bot)
    .eq("workspace_id", scope.workspace_id);
  if (error) throw new Error("Lauf nicht aktualisiert.");
  const fresh = await loadOwn(admin, scope, id);
  return { ok: true, run: publicRun(fresh) };
}

async function mirrorRun(admin: SupabaseClient, scope: { bot: BotId; workspace_id: string }, runId: string) {
  const id = assertId(runId);
  const row = await loadOwn(admin, scope, id);
  const gate = planMirror(scope, {
    bot: String(row.bot),
    workspace_id: String(row.workspace_id),
    status: String(row.status),
    aufgabe_id: row.aufgabe_id ? String(row.aufgabe_id) : null,
  });
  if (!gate.ok) throw new Error(gate.error);
  const aufgabeId = String(row.aufgabe_id);
  const task = await admin.from("aufgaben").select("id, beschreibung, workspace_id").eq("id", aufgabeId).eq("workspace_id", scope.workspace_id).maybeSingle();
  if (task.error || !task.data) throw new Error("Aufgabe nicht gefunden.");
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const links = normLinks(row.links);
  const beschreibung = appendBotResult(task.data.beschreibung ? String(task.data.beschreibung) : null, scope.bot, String(row.result || ""), links, day);
  const upd = await admin.from("aufgaben").update({
    status: "done",
    beschreibung,
    updated_at: new Date().toISOString(),
  }).eq("id", aufgabeId).eq("workspace_id", scope.workspace_id);
  if (upd.error) throw new Error("Aufgabe nicht aktualisiert.");
  const events = pushEvent(row.events, { at: new Date().toISOString(), status: "erledigt", message: "An Aufgabe gespiegelt." });
  await admin.from("bot_runs").update({ events, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("bot", scope.bot)
    .eq("workspace_id", scope.workspace_id);
  return { ok: true, aufgabe_id: aufgabeId, status: "done" };
}

function publicRun(row: Record<string, unknown>) {
  return {
    id: row.id,
    bot: row.bot,
    aufgabe_id: row.aufgabe_id,
    title: row.title,
    instructions: row.instructions,
    status: row.status,
    result: row.result,
    links: row.links,
    created_at: row.created_at,
    updated_at: row.updated_at,
    events: row.events,
  };
}

function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Dienst nicht konfiguriert.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
