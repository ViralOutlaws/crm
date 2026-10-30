// Entwurf einer Antwort. Prüft das Nutzer-JWT, außer beim internen Aufruf mit Service-Role.
// Versendet nie.
import { createClient } from "npm:@supabase/supabase-js@2";
import { anthropicText, cors, json, userClient } from "../_shared/edge_auth.ts";
import { shouldDraft } from "../_shared/mail.ts";

async function writeDraft(sb: { from: (table: string) => any }, workspaceId: string, conversationId: string) {
  const conv = await sb.from("conversations").select("*").eq("id", conversationId).maybeSingle();
  if (conv.error || !conv.data) throw new Error("Gespräch fehlt");
  const c = conv.data;
  const klass = String(c.klassifikation || "sonstiges");
  if (!shouldDraft(klass, !!c.contact_id) && klass !== "anfrage") {
    return { skipped: true, klassifikation: klass };
  }
  const [msgs, wissen, contact] = await Promise.all([
    sb.from("messages").select("direction, from_addr, body_text, created_at").eq("conversation_id", conversationId).order("created_at"),
    sb.from("wissensbasis").select("section, content").eq("workspace_id", workspaceId),
    c.contact_id ? sb.from("contacts").select("firma, person, email, notes").eq("id", c.contact_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const history = (msgs.data || []).map((m: { direction?: string; from_addr?: string; body_text?: string }) => `${m.direction} ${m.from_addr || ""}: ${m.body_text || ""}`).join("\n").slice(0, 12000);
  const rules = (wissen.data || []).map((w: { section?: string; content?: string }) => `${w.section}: ${w.content}`).join("\n");
  const system = "Du schreibst eine Antwort auf Deutsch im Ton von Kim, Viral Outlaws. Halte die Wissensbasis ein. Erfinde keine Preise, Termine oder Referenzen. Kein Zahlungslink. Nur der Text der Mail, ohne Betreff.";
  const user = `Regeln:\n${rules}\n\nKontakt: ${JSON.stringify(contact.data || {})}\n\nVerlauf:\n${history}`;
  const text = await anthropicText(system, user, 800);
  const draft = text?.trim() || "Guten Tag,\n\nvielen Dank für Ihre Nachricht. Ich schaue es mir an und melde mich.\n\nViele Grüße\nKim\nViral Outlaws";
  await sb.from("conversations").update({
    draft_body: draft,
    draft_status: "pending",
    updated_at: new Date().toISOString(),
  }).eq("id", conversationId);
  return { skipped: false, draft };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const conversationId = String(body.conversationId || "");
    if (!conversationId) return json({ error: "conversationId fehlt" }, 400);
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const internal = req.headers.get("x-internal-job") === "inbox-draft"
      && !!serviceKey
      && req.headers.get("authorization") === `Bearer ${serviceKey}`;
    if (internal) {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
      const ws = String(body.workspaceId || "");
      return json(await writeDraft(sb, ws, conversationId));
    }
    const { sb, workspaceId } = await userClient(req);
    return json(await writeDraft(sb, workspaceId, conversationId));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Fehler" }, 400);
  }
});
