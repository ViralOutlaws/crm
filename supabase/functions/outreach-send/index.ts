// Versendet nur freigegebene Outreach-Mails über die bestehende Mailbox. Höchstens eine pro Aufruf.
// Cron: Header x-outreach-cron == OUTREACH_CRON_SECRET. Der Wert steht nicht im Repo.
import { createClient } from "npm:@supabase/supabase-js@2";
import { cors, json, userClient } from "../_shared/edge_auth.ts";
import { loadGuard, loadSignature } from "../_shared/outreach_db.ts";
import { mailConfig, sendAndFile, threadKey } from "../_shared/mail.ts";
import { contactSeed, outreachMessageId, outreachSkip, websiteDomain, withSignature } from "../_shared/outreach.ts";

const WORKSPACE_ID = Deno.env.get("CRM_WORKSPACE_ID") || "566f2d4d-5b66-4ba8-b6a1-1edf413a1689";
const PERMANENT = new Set(["Abgemeldet", "Bestandskunde", "Schon im CRM", "Schon angeschrieben", "Bewusst abgelehnt"]);

type Sb = { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };

function safeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (!ea.length || ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

function cronAuthorized(req: Request) {
  const secret = Deno.env.get("OUTREACH_CRON_SECRET") || "";
  const given = req.headers.get("x-outreach-cron") || "";
  return !!secret && !!given && safeEqual(given, secret);
}

async function release(sb: Sb, id: string, token: string, reason: string, reject: boolean) {
  const patch: Record<string, unknown> = {
    sending_at: null,
    sending_token: null,
    last_error: reason.slice(0, 180),
    updated_at: new Date().toISOString(),
  };
  if (reject) patch.status = "abgelehnt";
  await sb.from("outreach_drafts").update(patch).eq("id", id).eq("sending_token", token);
}

async function sendApproved(sb: Sb, workspaceId: string) {
  const cfg = mailConfig();
  if (!cfg) return { connected: false, message: "E-Mail noch nicht verbunden" };
  const from = cfg.user.includes("@") ? cfg.user : "";
  if (!from.includes("@")) return { error: "Absender fehlt. MAIL_USER als volle Adresse setzen." };

  const claimed = await sb.rpc("claim_outreach_draft", { p_ws: workspaceId });
  if (claimed.error) return { error: claimed.error.message || "Freigabe nicht lesbar" };
  const gate = claimed.data || {};
  if (!gate.ok) return { ok: false, sent: false, reason: gate.reason || "Nichts Freigegebenes wartet." };
  const draft = gate.draft || {};
  const token = String(gate.token || "");
  const draftId = String(draft.id || "");
  if (!draftId || !token) return { ok: false, sent: false, reason: "Keine Mail übernommen." };

  const target = draft.target_id
    ? await sb.from("outreach_targets").select("firma, domain, str, plz, ort, web, skip_reason").eq("id", draft.target_id).maybeSingle()
    : { data: null };
  const person = draft.person_id
    ? await sb.from("outreach_people").select("person").eq("id", draft.person_id).maybeSingle()
    : { data: null };
  const known = await loadGuard(sb, workspaceId);
  const domain = websiteDomain(String(target.data?.domain || target.data?.web || ""));
  const email = String(draft.email || "").toLowerCase();
  const siblings = await sb.from("outreach_drafts").select("id, status").eq("workspace_id", workspaceId).eq("target_id", draft.target_id).neq("id", draftId).limit(20);
  const already = (siblings.data || []).some((s: { status?: string }) => ["gesendet", "antwort", "abgemeldet"].includes(String(s.status)));
  const skip = already
    ? "Schon angeschrieben"
    : (target.data?.skip_reason || outreachSkip({
      email,
      domain,
      blocklist: known.blocklist,
      crm: known.crm,
      priorEmails: [],
      priorDomains: [],
      rejectedEmails: known.rejectedEmails,
    }));
  if (skip) {
    await release(sb, draftId, token, skip, PERMANENT.has(skip));
    return { ok: false, sent: false, reason: skip, draftId };
  }

  const subject = String(draft.subject || "").slice(0, 180);
  // Volle Geschäftssignatur (Name, Adresse, Kontakt, Impressum) kommt erst hier dazu.
  const text = withSignature(String(draft.body || "").slice(0, 7000), await loadSignature(sb, workspaceId));
  const to = [email].filter((e) => e.includes("@"));
  if (!to.length || !subject || !text) {
    await release(sb, draftId, token, "Empfänger, Betreff oder Text fehlt", false);
    return { error: "Empfänger, Betreff oder Text fehlt" };
  }
  const messageId = outreachMessageId(draftId);
  let warning = "";
  try {
    warning = await sendAndFile(to, subject, text, from, { messageId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Versand fehlgeschlagen";
    await release(sb, draftId, token, message, false);
    if (message.includes("nicht verbunden")) return { connected: false, message: "E-Mail noch nicht verbunden" };
    return { error: message };
  }

  const now = new Date().toISOString();
  let contact: { id: string; kundennummer: string | null } | null = null;
  try {
    contact = await ensureContact(sb, workspaceId, { ...draft, person: person.data?.person || "" }, target.data);
  } catch (e) {
    warning = [warning, e instanceof Error ? e.message : "Kontakt nicht angelegt"].filter(Boolean).join(" ");
  }
  const conv = await sb.from("conversations").insert({
    workspace_id: workspaceId,
    channel: "email",
    subject,
    contact_id: contact?.id || null,
    status: "beantwortet",
    klassifikation: "sonstiges",
    folder_role: "sent",
    thread_key: threadKey(subject),
    unread: false,
    draft_status: "sent",
    first_reply_at: now,
    external_id: `outreach:${draftId}`,
  }).select("id").single();
  if (conv.data?.id) {
    await sb.from("messages").insert({
      workspace_id: workspaceId,
      conversation_id: conv.data.id,
      direction: "out",
      from_addr: from,
      to_addrs: to.join(", "),
      subject,
      body_text: text,
      created_at: now,
    });
  }
  await sb.from("outreach_messages").insert({
    workspace_id: workspaceId,
    draft_id: draftId,
    direction: "out",
    from_addr: from,
    to_addrs: to.join(", "),
    subject,
    body_text: text,
    message_id: messageId,
    created_at: now,
  });
  const finished = await sb.from("outreach_drafts").update({
    status: "gesendet",
    sent_at: now,
    message_id: messageId,
    contact_id: contact?.id || draft.contact_id || null,
    conversation_id: conv.data?.id || null,
    unread: false,
    last_error: warning || null,
    sending_at: null,
    sending_token: null,
    updated_at: now,
  }).eq("id", draftId).eq("sending_token", token).select("id");
  if (!finished.data?.length) {
    return { ok: false, sent: true, warning: "Die Mail ist raus, der Status wurde inzwischen von einem anderen Lauf gesetzt." };
  }
  return { ok: true, sent: true, draftId, contactId: contact?.id || null, kundennummer: contact?.kundennummer || null, warning };
}

async function ensureContact(sb: Sb, workspaceId: string, draft: Record<string, unknown>, target: Record<string, unknown> | null) {
  if (draft.contact_id) {
    const existing = await sb.from("contacts").select("id, kundennummer").eq("id", draft.contact_id).maybeSingle();
    if (existing.data?.id) return existing.data as { id: string; kundennummer: string | null };
  }
  const email = String(draft.email || "");
  const found = await sb.from("contacts").select("id, kundennummer").eq("workspace_id", workspaceId).ilike("email", email).limit(1);
  if (found.data?.[0]) return found.data[0] as { id: string; kundennummer: string | null };
  const seed = contactSeed({
    firma: String(target?.firma || ""),
    person: String(draft.person || ""),
    email,
    str: String(target?.str || ""),
    plz: String(target?.plz || ""),
    ort: String(target?.ort || ""),
    web: String(target?.web || ""),
  });
  const inserted = await sb.from("contacts").insert({ ...seed, workspace_id: workspaceId }).select("id, kundennummer").single();
  if (inserted.error || !inserted.data) throw new Error(inserted.error?.message || "Kontakt nicht angelegt");
  return inserted.data as { id: string; kundennummer: string | null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);
  try {
    if (cronAuthorized(req)) {
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      const url = Deno.env.get("SUPABASE_URL") || "";
      if (!key || !url) return json({ error: "Versand ist serverseitig nicht eingerichtet" }, 500);
      const sb = createClient(url, key, { auth: { persistSession: false } });
      const body = await req.json().catch(() => ({}));
      if (String(body.op || "send") !== "send") return json({ error: "Der Cron sendet nur freigegebene Mails" }, 400);
      const result = await sendApproved(sb, WORKSPACE_ID);
      const status = result.error ? 400 : 200;
      return json(result, status);
    }
    const { sb, workspaceId } = await userClient(req);
    const body = await req.json().catch(() => ({}));
    const op = String(body.op || "send");
    if (op === "contact") {
      const draftId = String(body.draftId || "");
      const draft = await sb.from("outreach_drafts").select("id, contact_id, email, target_id, person_id").eq("id", draftId).eq("workspace_id", workspaceId).maybeSingle();
      if (!draft.data) return json({ error: "Entwurf fehlt" }, 404);
      const person = draft.data.person_id
        ? await sb.from("outreach_people").select("person").eq("id", draft.data.person_id).maybeSingle()
        : { data: null };
      const target = draft.data.target_id
        ? await sb.from("outreach_targets").select("firma, str, plz, ort, web").eq("id", draft.data.target_id).maybeSingle()
        : { data: null };
      const contact = await ensureContact(sb, workspaceId, { ...draft.data, person: person.data?.person || "" }, target.data);
      await sb.from("outreach_drafts").update({ contact_id: contact.id, updated_at: new Date().toISOString() }).eq("id", draftId);
      return json({ ok: true, contactId: contact.id, kundennummer: contact.kundennummer, sent: false });
    }
    if (op !== "send") return json({ error: "Unbekannte Operation" }, 400);
    const result = await sendApproved(sb, workspaceId);
    const status = result.error ? 400 : 200;
    return json(result, status);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Fehler" }, 400);
  }
});
