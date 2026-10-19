// Kalender-Abo fürs iPhone. Auth ist der geheime Token in ?t=, nicht das Nutzer-JWT.
// Die Service-Role bleibt hier und liest nur den Workspace des Tokens.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sha256Hex } from "../_shared/bot_leitstand.ts";
import { berlinToday, buildCalendar, feedWindow, hashEqual, type FeedEvent, type FeedTask } from "../_shared/calendar_ics.ts";

const WINDOW_MS = 60_000;
const LIMIT = 30;
const hits = new Map<string, number[]>();
const DUMMY_HASH = "0".repeat(64);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "GET") return text("Nur GET.", 405);

  const now = Date.now();
  const ip = clientIp(req.headers);
  if (!allow(`ip:${ip}`, now)) return text("Zu viele Anfragen.", 429);

  const token = new URL(req.url).searchParams.get("t") || "";
  if (token.length < 20 || token.length > 200 || /[\r\n]/.test(token)) return text("Token ungültig.", 401);

  let admin: SupabaseClient;
  try {
    admin = serviceClient();
  } catch (e) {
    return text(e instanceof Error ? e.message : "Dienst nicht konfiguriert.", 500);
  }

  let hash = "";
  try {
    hash = await sha256Hex(token);
  } catch {
    return text("Token ungültig.", 401);
  }

  const tokenRes = await admin.from("calendar_feed_tokens").select("workspace_id, token_hash, revoked_at").eq("token_hash", hash).maybeSingle();
  if (tokenRes.error) return text("Token nicht prüfbar.", 500);
  const row = tokenRes.data;
  const stored = row && !row.revoked_at ? String(row.token_hash) : DUMMY_HASH;
  if (!row || row.revoked_at || !row.workspace_id || !hashEqual(hash, stored)) return text("Token ungültig.", 401);
  if (!allow(`tok:${hash}`, now)) return text("Zu viele Anfragen.", 429);

  const today = berlinToday();
  const range = feedWindow(today);
  const workspaceId = String(row.workspace_id);
  const [tasksRes, evRes] = await Promise.all([
    admin.from("aufgaben").select("id, titel, beschreibung, faellig, status").eq("workspace_id", workspaceId).neq("status", "done").gte("faellig", range.from).lte("faellig", range.to).limit(2000),
    admin.from("kal_events").select("id, titel, datum, zeit, notiz").eq("workspace_id", workspaceId).gte("datum", range.from).lte("datum", range.to).limit(2000),
  ]);
  if (tasksRes.error || evRes.error) return text("Kalender nicht lesbar.", 500);

  const tasks: FeedTask[] = (tasksRes.data || []).map((t) => ({
    id: String(t.id),
    titel: String(t.titel || "Aufgabe"),
    beschreibung: t.beschreibung == null ? null : String(t.beschreibung),
    faellig: String(t.faellig || ""),
    status: t.status == null ? null : String(t.status),
  }));
  const events: FeedEvent[] = (evRes.data || []).map((e) => ({
    id: String(e.id),
    titel: String(e.titel || "Termin"),
    datum: String(e.datum || ""),
    zeit: e.zeit == null ? null : String(e.zeit),
    notiz: e.notiz == null ? null : String(e.notiz),
  }));
  const body = buildCalendar({ from: range.from, to: range.to, tasks, events });
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=\"viral-outlaws.ics\"",
      "Cache-Control": "private, max-age=900",
    },
  });
});

function allow(key: string, now: number): boolean {
  const prev = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (prev.length >= LIMIT) {
    hits.set(key, prev);
    return false;
  }
  prev.push(now);
  hits.set(key, prev);
  if (hits.size > 500) {
    const first = hits.keys().next().value;
    if (first) hits.delete(first);
  }
  return true;
}

function clientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = headers.get("x-forwarded-for") || "";
  const last = fwd.split(",").map((p) => p.trim()).filter(Boolean).pop();
  return last || "*";
}

function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Dienst nicht konfiguriert.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function text(body: string, status: number): Response {
  const headers: Record<string, string> = { "Content-Type": "text/plain; charset=utf-8" };
  if (status === 429) headers["Retry-After"] = "60";
  return new Response(body, { status, headers });
}
