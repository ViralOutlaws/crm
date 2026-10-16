// Supabase Edge Function "social-post": Ingest für den Social-Media-Redaktionsplan (z. B. durch Marky).
// Auth: Header x-webhook-secret; geprüft gegen Function-Secret SOCIAL_INGEST_SECRET oder SHA-256-Hash in public.integration_secrets (name='social-post').
// Doku: docs/social-ingest.md
import { createClient } from "npm:@supabase/supabase-js@2";

const WORKSPACE_ID = Deno.env.get("CRM_WORKSPACE_ID") ?? "566f2d4d-5b66-4ba8-b6a1-1edf413a1689";
const BUCKET = "social-assets";
const MAX_POSTS = 100;
const MAX_ASSET_BYTES = 50 * 1024 * 1024;

export const FORMATE = ["Beitrag", "Karussell", "Story", "Reel"];
export const SAEULEN = ["Webdesign", "KI", "Performance-Marketing", "Ratgeber", "Referenz", "Kim & Allgäu"];
export const STATUS = ["Idee", "Geplant", "Content fertig", "Erstellt", "Veröffentlicht"];

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const clip = (v: unknown, max: number): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\u0000/g, "").replace(/[<>]/g, "").trim();
  return s ? s.slice(0, max) : null;
};
const safeEqual = (a: string, b: string) => {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let r = 0;
  for (let i = 0; i < ea.length; i++) r |= ea[i] ^ eb[i];
  return r === 0;
};
const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, "0")).join("");

async function authorized(given: string) {
  const env = Deno.env.get("SOCIAL_INGEST_SECRET");
  if (env) return safeEqual(given, env);
  const { data } = await sb.from("integration_secrets").select("sha256").eq("name", "social-post").maybeSingle();
  return !!data?.sha256 && safeEqual(await sha256(given), data.sha256);
}

const EXT_ID = /^[A-Za-z0-9._-]{1,120}$/;
const FILE = /^[A-Za-z0-9._ ()-]{1,160}$/;

function normPost(p: Record<string, unknown>) {
  const external_id = clip(p.external_id ?? p.id, 120);
  if (!external_id || !EXT_ID.test(external_id)) throw new Error("external_id/id fehlt oder ungültig (A-Z a-z 0-9 . _ -)");
  const datum = clip(p.datum, 10);
  if (datum && !/^\d{4}-\d{2}-\d{2}$/.test(datum)) throw new Error(`${external_id}: datum muss YYYY-MM-DD sein`);
  const format = clip(p.format, 40);
  if (format && !FORMATE.includes(format)) throw new Error(`${external_id}: format muss eines von ${FORMATE.join(", ")} sein`);
  const saeule = clip(p.saeule ?? p.pillar, 60);
  if (saeule && !SAEULEN.includes(saeule)) throw new Error(`${external_id}: saeule muss eine von ${SAEULEN.join(", ")} sein`);
  const status = clip(p.status, 40) ?? "Idee";
  if (!STATUS.includes(status)) throw new Error(`${external_id}: status muss einer von ${STATUS.join(", ")} sein`);
  let hashtags: string[] = [];
  if (Array.isArray(p.hashtags)) hashtags = p.hashtags.map((h) => clip(h, 80)).filter(Boolean) as string[];
  else if (typeof p.hashtags === "string") hashtags = p.hashtags.split(/\s+/).map((h) => clip(h, 80)).filter(Boolean) as string[];
  const row: Record<string, unknown> = {
    workspace_id: WORKSPACE_ID,
    external_id,
    datum,
    uhrzeit: clip(p.uhrzeit, 60),
    format,
    format_detail: clip(p.format_detail, 200),
    saeule,
    thema: clip(p.thema, 300),
    hook: clip(p.hook, 1000),
    caption: clip(p.caption, 5000),
    hashtags: hashtags.slice(0, 40),
    visual_hinweise: clip(p.visual_hinweise, 5000),
    cta: clip(p.cta, 500),
    quelle: clip(p.quelle, 500),
    freigabe: clip(p.freigabe, 300),
    content_ordner: clip(p.content_ordner, 500),
    reel_skript: clip(p.reel_skript, 10000),
    status,
    updated_at: new Date().toISOString(),
  };
  return row;
}

async function getPost(external_id: string) {
  const { data, error } = await sb.from("social_media_posts").select("id, assets").eq("workspace_id", WORKSPACE_ID).eq("external_id", external_id).maybeSingle();
  if (error) throw new Error("db error");
  return data;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const given = req.headers.get("x-webhook-secret") ?? "";
  if (!given || !(await authorized(given))) return json({ error: "unauthorized" }, 401);

  let b: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 2_000_000) return json({ error: "payload too large (max 2 MB JSON; Dateien per asset-upload-url)" }, 413);
    b = JSON.parse(raw);
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  try {
    const action = clip((b as Record<string, unknown>).action, 40) ?? "upsert";

    if (action === "upsert") {
      const list = Array.isArray(b) ? b : Array.isArray(b.posts) ? (b.posts as unknown[]) : [b.post ?? b];
      if (!list.length || list.length > MAX_POSTS) return json({ error: `1–${MAX_POSTS} Posts pro Aufruf` }, 400);
      const rows = list.map((p) => normPost(p as Record<string, unknown>));
      const { data, error } = await sb.from("social_media_posts").upsert(rows, { onConflict: "workspace_id,external_id" }).select("id, external_id");
      if (error) return json({ error: "db error", detail: error.message }, 500);
      return json({ ok: true, upserted: data?.length ?? 0, posts: data });
    }

    if (action === "asset-upload-url") {
      const external_id = clip(b.external_id, 120);
      const filename = clip(b.filename, 160);
      const content_type = clip(b.content_type, 100) ?? "application/octet-stream";
      const size = Number(b.size) || null;
      const order = Number.isFinite(Number(b.order)) ? Number(b.order) : null;
      if (!external_id || !EXT_ID.test(external_id)) return json({ error: "external_id ungültig" }, 400);
      if (!filename || !FILE.test(filename)) return json({ error: "filename ungültig (A-Z a-z 0-9 . _ - Leerzeichen Klammern)" }, 400);
      if (!/^(image|video)\/[a-z0-9.+-]+$|^application\/pdf$/.test(content_type)) return json({ error: "content_type: nur image/*, video/*, application/pdf" }, 400);
      if (size && size > MAX_ASSET_BYTES) return json({ error: "Datei zu groß (max 50 MB)" }, 400);
      const post = await getPost(external_id);
      if (!post) return json({ error: "Post nicht gefunden – erst per upsert anlegen" }, 404);
      const path = `${WORKSPACE_ID}/${external_id}/${filename}`;
      const { data: up, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
      if (error || !up) return json({ error: "storage error", detail: error?.message }, 500);
      const assets = (Array.isArray(post.assets) ? post.assets : []).filter((a: { filename?: string }) => a.filename !== filename);
      const type = content_type.startsWith("video/") ? "video" : content_type.startsWith("image/") ? "image" : "file";
      assets.push({ order: order ?? assets.length + 1, filename, type, content_type, size, path });
      assets.sort((x: { order: number }, y: { order: number }) => x.order - y.order);
      const { error: e2 } = await sb.from("social_media_posts").update({ assets, updated_at: new Date().toISOString() }).eq("id", post.id);
      if (e2) return json({ error: "db error" }, 500);
      const upload_url = up.signedUrl.startsWith("http") ? up.signedUrl : `${Deno.env.get("SUPABASE_URL")}/storage/v1${up.signedUrl}`;
      return json({ ok: true, path, upload_url, method: "PUT", headers: { "Content-Type": content_type, "x-upsert": "true" }, expires_in_s: 7200 });
    }

    if (action === "asset-delete") {
      const external_id = clip(b.external_id, 120), filename = clip(b.filename, 160);
      if (!external_id || !filename) return json({ error: "external_id und filename nötig" }, 400);
      const post = await getPost(external_id);
      if (!post) return json({ error: "Post nicht gefunden" }, 404);
      await sb.storage.from(BUCKET).remove([`${WORKSPACE_ID}/${external_id}/${filename}`]);
      const assets = (post.assets || []).filter((a: { filename?: string }) => a.filename !== filename);
      await sb.from("social_media_posts").update({ assets, updated_at: new Date().toISOString() }).eq("id", post.id);
      return json({ ok: true });
    }

    if (action === "list") {
      const { data, error } = await sb.from("social_media_posts").select("external_id, datum, format, saeule, status, assets").eq("workspace_id", WORKSPACE_ID).order("datum");
      if (error) return json({ error: "db error" }, 500);
      return json({ ok: true, posts: (data || []).map((p) => ({ ...p, assets: (p.assets || []).length })) });
    }

    return json({ error: "unbekannte action (upsert | asset-upload-url | asset-delete | list)" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "fehler" }, 400);
  }
});
