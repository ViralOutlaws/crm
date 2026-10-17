// jarvis-dispatch: prüft das Nutzer-JWT selbst und legt einen Bot-Lauf an.
// Danach POST an den Webhook des Bots. Secrets bleiben in der Funktionsumgebung.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  BOT_META,
  type BotId,
  allowedOrigin,
  aufgabeBeschreibung,
  corsHeaders,
  isBotId,
  performDispatch,
  publicError,
  secretNames,
} from "../_shared/bot_leitstand.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin, "POST, OPTIONS");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (origin && !allowedOrigin(origin)) return json({ error: "Origin nicht erlaubt." }, 403, headers);
  if (req.method !== "POST") return json({ error: "Nur POST." }, 405, headers);

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

  const jwt = bearer(req.headers.get("authorization"));
  if (!jwt) return json({ error: "Anmeldung fehlt." }, 401, headers);

  let sb: SupabaseClient;
  try {
    sb = userClient(jwt);
  } catch (e) {
    return json({ error: publicError(e) }, 500, headers);
  }

  const auth = await sb.auth.getUser(jwt);
  if (auth.error || !auth.data.user) return json({ error: "Anmeldung ungültig oder abgelaufen." }, 401, headers);
  const user = auth.data.user;
  const profileRes = await sb.from("profiles").select("workspace_id").eq("id", user.id).maybeSingle();
  if (profileRes.error || !profileRes.data?.workspace_id) return json({ error: "Kein Workspace im Profil." }, 403, headers);
  const workspaceId = String(profileRes.data.workspace_id);

  try {
    const ping = body.op === "ping" || body.ping === true;
    const bot = String(body.bot ?? "").toLowerCase().trim();
    if (!isBotId(bot)) return json({ error: "Bot muss Webby, Marky, Saley, Cashy oder Developy sein." }, 400, headers);
    const title = clip(body.title ?? body.auftrag, 300) || "";
    const instructions = clip(body.instructions ?? body.details, 4000) || "";
    const aufgabeIn = clip(body.aufgabe_id, 80);
    const aufgabeId = aufgabeIn && UUID.test(aufgabeIn) ? aufgabeIn : null;
    const kontaktIn = clip(body.kontakt_id, 80);
    const kontaktId = kontaktIn && UUID.test(kontaktIn) ? kontaktIn : null;
    const createAufgabe = !ping && !aufgabeId && body.create_aufgabe !== false;
    if (!ping && !title) return json({ error: "Titel fehlt." }, 400, headers);

    let linked = aufgabeId;
    let logWarning: string | null = null;
    if (createAufgabe) {
      linked = crypto.randomUUID();
      const beschreibung = aufgabeBeschreibung(bot, instructions);
      const { error } = await sb.from("aufgaben").insert({
        id: linked,
        workspace_id: workspaceId,
        kontakt_id: kontaktId,
        titel: title,
        beschreibung,
        status: "todo",
        prioritaet: "normal",
        faellig: null,
        updated_at: new Date().toISOString(),
      });
      if (error) return json({ error: "Aufgabe nicht angelegt." }, 400, headers);
      const log = await sb.from("jarvis_actions").insert({
        workspace_id: workspaceId,
        user_id: user.id,
        table_name: "aufgaben",
        record_id: linked,
        action: "insert",
        summary: { tool: "dispatch_to_bot", after: { id: linked, titel: title, beschreibung, status: "todo" } },
      });
      if (log.error) logWarning = "Gespeichert, aber das Protokoll jarvis_actions fehlt noch oder akzeptiert die Zeile nicht.";
    }

    const names = secretNames(bot);
    const result = await performDispatch({
      bot,
      title,
      instructions,
      aufgabe_id: linked,
      workspace_id: workspaceId,
      created_by: user.id,
      ping,
      env: {
        url: Deno.env.get(names.url) || null,
        key: Deno.env.get(names.key) || null,
        keyHeader: Deno.env.get("BOT_WEBHOOK_KEY_HEADER") || null,
        crmUrl: (Deno.env.get("CRM_URL") || "https://crm.viraloutlaws.de").replace(/\/$/, ""),
        callbackUrl: `${(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "")}/functions/v1/bot-api`,
        now: new Date().toISOString(),
      },
      insertRun: async (row) => {
        const { data, error } = await sb.from("bot_runs").insert(row).select("id").single();
        if (error || !data?.id) throw new Error("Lauf nicht angelegt.");
        return { id: String(data.id) };
      },
      updateRun: async (id, patch) => {
        const { error } = await sb.from("bot_runs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
        if (error) throw new Error("Lauf nicht aktualisiert.");
      },
      post: async (url, hdrs, payload) => {
        const res = await fetch(url, {
          method: "POST",
          headers: hdrs,
          body: JSON.stringify(payload),
          redirect: "manual",
          signal: AbortSignal.timeout(12_000),
        });
        return { status: res.status };
      },
    });

    return json({
      ok: true,
      run_id: result.run_id,
      aufgabe_id: linked,
      bot,
      status: result.status,
      connected: result.connected,
      ping: result.ping,
      message: result.message,
      summary: ping ? `Verbindungstest ${BOT_META[bot as BotId].name}` : `Auftrag an ${BOT_META[bot as BotId].name}`,
      log_warning: logWarning,
    }, 200, headers);
  } catch (e) {
    return json({ error: publicError(e) }, 400, headers);
  }
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clip(v: unknown, max: number): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).replace(/[<>\u0000]/g, "").trim();
  return s ? s.slice(0, max) : null;
}

function bearer(header: string | null): string | null {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

function userClient(jwt: string): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) throw new Error("Supabase-Umgebung unvollständig.");
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
