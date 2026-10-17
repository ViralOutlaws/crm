// Jarvis-Stimme: prüft das Nutzer-JWT selbst und streamt MPEG von ElevenLabs.
// Der Schlüssel bleibt in ELEVENLABS_API_KEY. Die Oberfläche schickt nur {text}.
import { createClient } from "npm:@supabase/supabase-js@2";
import { allowedOrigin, prepareText, resolveModel, resolveVoice } from "./logic.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (origin && !allowedOrigin(origin)) return json({ error: "Origin nicht erlaubt." }, 403, headers);
  if (req.method !== "POST") return json({ error: "Nur POST." }, 405, headers);

  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return json({ error: "Anfrage leer." }, 400, headers);
  }
  if (raw.length > 12_000) return json({ error: "Anfrage zu groß." }, 413, headers);

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

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !anon) return json({ error: "Supabase-Umgebung unvollständig (URL oder Anon-Key)." }, 500, headers);

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const auth = await sb.auth.getUser(jwt);
  if (auth.error || !auth.data.user) return json({ error: "Anmeldung ungültig oder abgelaufen." }, 401, headers);

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) return json({ error: "Jarvis-Sprache ist noch nicht konfiguriert (ELEVENLABS_API_KEY)." }, 500, headers);

  let text: string;
  try {
    text = prepareText(body.text);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Text ungültig." }, 400, headers);
  }

  const voice = resolveVoice(Deno.env.get("ELEVENLABS_VOICE_ID"));
  const model = resolveModel(Deno.env.get("ELEVENLABS_MODEL"));
  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_44100_128`;

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: model,
        language_code: "de",
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return json({ error: "Sprachausgabe ist gerade nicht erreichbar." }, 502, headers);
  }

  if (!upstream.ok || !upstream.body) {
    try {
      await upstream.body?.cancel();
    } catch { /* ignore */ }
    return json({ error: "Sprachausgabe ist gerade nicht erreichbar." }, 502, headers);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
});

function bearer(header: string | null): string | null {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

function cors(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, prefer",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
