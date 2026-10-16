// Supabase Edge Function: nimmt Anfragen der Website (viraloutlaws.de) entgegen und legt sie als Kontakt an.
// Server-zu-Server, gesichert über Header x-webhook-secret (= Secret CRM_WEBHOOK_SECRET).
import { createClient } from "npm:@supabase/supabase-js@2";

const WORKSPACE_ID = Deno.env.get("CRM_WORKSPACE_ID") ?? "566f2d4d-5b66-4ba8-b6a1-1edf413a1689";
const MERGE_WINDOW_MS = 24 * 60 * 60 * 1000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const clip = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  // Spitze Klammern entfernen: das CRM rendert Felder per innerHTML.
  const s = v.replace(/\u0000/g, "").replace(/[<>]/g, "").trim();
  return s ? s.slice(0, max) : null;
};

function safeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let r = 0;
  for (let i = 0; i < ea.length; i++) r |= ea[i] ^ eb[i];
  return r === 0;
}

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Secret: bevorzugt Function-Secret CRM_WEBHOOK_SECRET, sonst SHA-256-Hash aus public.integration_secrets (RLS, nur Service Role).
async function authorized(given: string) {
  const env = Deno.env.get("CRM_WEBHOOK_SECRET");
  if (env) return safeEqual(given, env);
  const { data } = await sb.from("integration_secrets").select("sha256").eq("name", "website-lead").maybeSingle();
  return !!data?.sha256 && safeEqual(await sha256(given), data.sha256);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const given = req.headers.get("x-webhook-secret") ?? "";
  if (!given || !(await authorized(given))) return json({ error: "unauthorized" }, 401);

  let b: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 30_000) return json({ error: "payload too large" }, 413);
    b = JSON.parse(raw);
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const source = clip(b.source, 40);
  if (!source || !/^website-[a-z0-9-]+$/.test(source)) return json({ error: "invalid source" }, 400);
  const name = clip(b.name, 120);
  const email = clip(b.email, 200)?.toLowerCase() ?? null;
  if (!name && !email) return json({ error: "name or email required" }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "invalid email" }, 400);

  const company = clip(b.company, 160);
  const phone = clip(b.phone, 60);
  const web = clip(b.web, 300);
  const branche = clip(b.branche, 120);
  const message = clip(b.message, 5000);
  const m = (b.meta && typeof b.meta === "object" ? b.meta : {}) as Record<string, unknown>;
  const meta: Record<string, string> = {};
  for (const k of ["page", "referrer", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "topic", "size", "contactPref", "check"]) {
    const v = clip(m[k], 500);
    if (v) meta[k] = v;
  }

  const now = new Date();
  const label = source === "website-ki-check" ? "Website-KI-Check" : "Kontaktformular";
  const notiz = {
    id: crypto.randomUUID(),
    typ: "email",
    text: `🌐 Anfrage über ${label} (viraloutlaws.de)${message ? `:\n${message}` : ""}`.slice(0, 6000),
    datum: now.toISOString().slice(0, 10),
    createdAt: now.toISOString(),
  };

  if (email) {
    const since = new Date(now.getTime() - MERGE_WINDOW_MS).toISOString();
    const { data: dup, error } = await sb
      .from("contacts")
      .select("id, notizen, tel, web")
      .eq("workspace_id", WORKSPACE_ID)
      .ilike("email", email.replace(/[%_\\]/g, "\\$&"))
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return json({ error: "db error" }, 500);
    if (dup && dup.length) {
      const c = dup[0];
      const notizen = Array.isArray(c.notizen) ? c.notizen : [];
      const { error: e2 } = await sb
        .from("contacts")
        .update({
          notizen: [...notizen, notiz],
          tel: c.tel || phone,
          web: c.web || web,
          updated_at: now.toISOString(),
        })
        .eq("id", c.id);
      if (e2) return json({ error: "db error" }, 500);
      return json({ ok: true, merged: true, id: c.id });
    }
  }

  const { data, error } = await sb
    .from("contacts")
    .insert({
      workspace_id: WORKSPACE_ID,
      firma: company || name || email!,
      person: name,
      email,
      tel: phone,
      web,
      branche,
      status: "offen",
      notes: message,
      notizen: [notiz],
      quelle: source,
      meta: Object.keys(meta).length ? meta : null,
      archiviert: false,
    })
    .select("id")
    .single();
  if (error) return json({ error: "db error" }, 500);
  return json({ ok: true, merged: false, id: data.id });
});
