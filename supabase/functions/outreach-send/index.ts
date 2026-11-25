// Versendet nur freigegebene Outreach-Mails über die bestehende Mailbox. Höchstens eine pro Aufruf.
import { cors, json, userClient } from "../_shared/edge_auth.ts";
import { loadGuard, sentStats } from "../_shared/outreach_db.ts";
import { mailConfig, sendAndFile } from "../_shared/mail.ts";
import { threadKey } from "../_shared/mail.ts";
import {
  DAILY_LIMIT_DEFAULT,
  GAP_MINUTES_DEFAULT,
  contactSeed,
  outreachMessageId,
  outreachSkip,
  sendDecision,
  websiteDomain,
} from "../_shared/outreach.ts";

type Sb = { from: (table: string) => any };

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

    const cfg = mailConfig();
    if (!cfg) return json({ connected: false, message: "E-Mail noch nicht verbunden" });
    const from = cfg.user.includes("@") ? cfg.user : "";
    if (!from.includes("@")) return json({ error: "Absender fehlt. MAIL_USER als volle Adresse setzen." }, 400);

    const settings = await sb.from("outreach_settings").select("daily_limit, gap_minutes").eq("workspace_id", workspaceId).maybeSingle();
    const dailyLimit = Number(settings.data?.daily_limit || DAILY_LIMIT_DEFAULT);
    const gapMinutes = Number(settings.data?.gap_minutes || GAP_MINUTES_DEFAULT);
    let query = sb.from("outreach_drafts").select("id, target_id, person_id, contact_id, subject, body, status, email, email_art, guess_ok").eq("workspace_id", workspaceId);
    if (body.draftId) query = query.eq("id", String(body.draftId));
    else query = query.eq("status", "freigegeben").order("approved_at", { ascending: true }).limit(1);
    const picked = await query;
    if (picked.error) return json({ error: picked.error.message }, 400);
    const draft = Array.isArray(picked.data) ? picked.data[0] : picked.data;
    if (!draft) return json({ ok: true, sent: false, reason: "Nichts Freigegebenes wartet." });

    const target = draft.target_id
      ? await sb.from("outreach_targets").select("firma, domain, str, plz, ort, web, skip_reason").eq("id", draft.target_id).maybeSingle()
      : { data: null };
    const person = draft.person_id
      ? await sb.from("outreach_people").select("person").eq("id", draft.person_id).maybeSingle()
      : { data: null };
    const known = await loadGuard(sb, workspaceId);
    const domain = websiteDomain(String(target.data?.domain || target.data?.web || ""));
    const email = String(draft.email || "").toLowerCase();
    const siblings = await sb.from("outreach_drafts").select("id, status, target_id").eq("workspace_id", workspaceId).eq("target_id", draft.target_id).neq("id", draft.id).limit(20);
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
    const stats = await sentStats(sb, workspaceId);
    const decision = sendDecision({
      kind: "outreach",
      status: String(draft.status || ""),
      emailArt: String(draft.email_art || ""),
      guessOk: draft.guess_ok === true,
      skip,
      sentToday: stats.sentToday,
      dailyLimit,
      lastSentAt: stats.lastSentAt,
      now: Date.now(),
      gapMinutes,
    });
    if (!decision.ok) {
      await sb.from("outreach_drafts").update({ last_error: decision.reason, updated_at: new Date().toISOString() }).eq("id", draft.id);
      return json({ ok: false, sent: false, reason: decision.reason, draftId: draft.id });
    }

    const subject = String(draft.subject || "").slice(0, 180);
    const text = String(draft.body || "").slice(0, 8000);
    const to = [String(draft.email || "")].filter((e) => e.includes("@"));
    if (!to.length || !subject || !text) return json({ error: "Empfänger, Betreff oder Text fehlt" }, 400);
    const messageId = outreachMessageId(String(draft.id));
    let warning = "";
    try {
      warning = await sendAndFile(to, subject, text, from, { messageId });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Versand fehlgeschlagen";
      await sb.from("outreach_drafts").update({ last_error: message.slice(0, 180), updated_at: new Date().toISOString() }).eq("id", draft.id);
      if (message.includes("nicht verbunden")) return json({ connected: false, message: "E-Mail noch nicht verbunden" });
      return json({ error: message }, 400);
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
      external_id: `outreach:${draft.id}`,
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
      draft_id: draft.id,
      direction: "out",
      from_addr: from,
      to_addrs: to.join(", "),
      subject,
      body_text: text,
      message_id: messageId,
      created_at: now,
    });
    await sb.from("outreach_drafts").update({
      status: "gesendet",
      sent_at: now,
      message_id: messageId,
      contact_id: contact?.id || draft.contact_id || null,
      conversation_id: conv.data?.id || null,
      unread: false,
      last_error: warning || null,
      updated_at: now,
    }).eq("id", draft.id).eq("workspace_id", workspaceId);
    return json({
      ok: true,
      sent: true,
      draftId: draft.id,
      contactId: contact?.id || null,
      kundennummer: contact?.kundennummer || null,
      warning,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Fehler" }, 400);
  }
});
