// Supabase Edge Function "buffer-sync": holt geplante/veröffentlichte/fehlerhafte Instagram-Posts aus Buffer
// und spiegelt sie in public.social_media_posts (Upsert über workspace_id + external_id = Buffer-Post-ID).
// Aufruf: pg_cron alle 15 Min. (Job "buffer-sync") oder manuell.
// Auth: Header x-sync-secret == Function-Secret BUFFER_SYNC_SECRET, oder Authorization: Bearer <Service-Role-Key>.
// Body (optional): { "dry_run": true } liefert nur die geplanten Änderungen.
// Doku: docs/buffer-sync.md
import { createClient } from "npm:@supabase/supabase-js@2";
import { type BufferPost, buildPatch, isBufferRow, removedPatch, type Row } from "../_shared/buffer_sync.ts";

const WORKSPACE_ID = Deno.env.get("CRM_WORKSPACE_ID") ?? "566f2d4d-5b66-4ba8-b6a1-1edf413a1689";
const ORG_ID = Deno.env.get("BUFFER_ORG_ID") ?? "6af8e48cf0ed12641d594e71";
const CHANNEL_ID = Deno.env.get("BUFFER_CHANNEL_ID") ?? "6af8e4ed62b70b94b0345d48";
const STATUSES = ["scheduled", "sending", "sent", "error"];
const MAX_PAGES = 40;

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const safeEqual = (a: string, b: string) => {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  if (!ea.length || ea.length !== eb.length) return false;
  let r = 0;
  for (let i = 0; i < ea.length; i++) r |= ea[i] ^ eb[i];
  return r === 0;
};

function authorized(req: Request) {
  const secret = Deno.env.get("BUFFER_SYNC_SECRET") || "";
  const given = req.headers.get("x-sync-secret") || "";
  if (secret && given && safeEqual(given, secret)) return true;
  const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const auth = req.headers.get("authorization") || "";
  return !!srk && safeEqual(auth, `Bearer ${srk}`);
}

const QUERY = `query($after: String, $input: PostsInput!) {
  posts(first: 50, after: $after, input: $input) {
    edges { node {
      id status text dueAt sentAt updatedAt externalLink channelId
      assets { type mimeType source thumbnail }
      metadata { ... on InstagramPostMetadata { type } }
      error { message }
    } }
    pageInfo { hasNextPage endCursor }
  }
}`;

async function fetchBufferPosts(key: string): Promise<BufferPost[]> {
  const out: BufferPost[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res: Response = await fetch("https://api.buffer.com", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: QUERY,
        variables: { after, input: { organizationId: ORG_ID, filter: { channelIds: [CHANNEL_ID], status: STATUSES } } },
      }),
    });
    if (!res.ok) throw new Error(`Buffer HTTP ${res.status}`);
    // deno-lint-ignore no-explicit-any
    const body: any = await res.json();
    if (body.errors?.length) throw new Error(`Buffer: ${String(body.errors[0]?.message || "GraphQL-Fehler").slice(0, 200)}`);
    // deno-lint-ignore no-explicit-any
    const conn: any = body.data?.posts;
    if (!conn) throw new Error("Buffer: keine Daten");
    for (const e of conn.edges || []) if (e?.node?.id) out.push(e.node);
    if (!conn.pageInfo?.hasNextPage) return out;
    after = conn.pageInfo.endCursor;
  }
  throw new Error("Buffer: zu viele Seiten");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!authorized(req)) return json({ error: "unauthorized" }, 401);
  const key = Deno.env.get("BUFFER_API_KEY");
  if (!key) return json({ error: "BUFFER_API_KEY fehlt" }, 500);

  let dryRun = false;
  try {
    const raw = await req.text();
    if (raw) dryRun = JSON.parse(raw)?.dry_run === true;
  } catch { /* leerer/ungültiger Body = normaler Lauf */ }

  try {
    const posts = (await fetchBufferPosts(key)).filter((p) => !p.channelId || p.channelId === CHANNEL_ID);
    const { data: rows, error } = await sb.from("social_media_posts").select("*").eq("workspace_id", WORKSPACE_ID);
    if (error) throw new Error(`db: ${error.message}`);
    const byExt = new Map<string, Row>((rows || []).map((r: Row) => [String(r.external_id), r]));

    const changes: { external_id: string; action: string; fields: string[] }[] = [];
    let unchanged = 0, skipped = 0;
    const now = new Date().toISOString();

    for (const p of posts) {
      const existing = byExt.get(p.id) || null;
      if (existing && !isBufferRow(existing)) { skipped++; continue; } // manuelle Zeile nie anfassen
      const patch = buildPatch(p, existing, CHANNEL_ID);
      if (!patch) { unchanged++; continue; }
      changes.push({ external_id: p.id, action: existing ? "update" : "insert", fields: Object.keys(patch) });
      if (dryRun) continue;
      if (existing) {
        const { error: e } = await sb.from("social_media_posts").update({ ...patch, updated_at: now }).eq("id", existing.id!).eq("workspace_id", WORKSPACE_ID);
        if (e) throw new Error(`db update ${p.id}: ${e.message}`);
      } else {
        const { error: e } = await sb.from("social_media_posts")
          .upsert({ ...patch, workspace_id: WORKSPACE_ID, external_id: p.id, updated_at: now }, { onConflict: "workspace_id,external_id", ignoreDuplicates: true });
        if (e) throw new Error(`db insert ${p.id}: ${e.message}`);
      }
    }

    const seen = new Set(posts.map((p) => p.id));
    for (const r of rows || []) {
      const patch = removedPatch(r as Row, seen);
      if (!patch) continue;
      changes.push({ external_id: String(r.external_id), action: "removed", fields: ["meta"] });
      if (dryRun) continue;
      const { error: e } = await sb.from("social_media_posts").update({ ...patch, updated_at: now }).eq("id", r.id).eq("workspace_id", WORKSPACE_ID);
      if (e) throw new Error(`db removed ${r.external_id}: ${e.message}`);
    }

    return json({ ok: true, dry_run: dryRun, fetched: posts.length, unchanged, skipped, changed: changes.length, changes });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "fehler" }, 502);
  }
});
