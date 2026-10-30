// SMTP-Versand und IMAP APPEND in Gesendet. Prüft das Nutzer-JWT selbst. Nur wenn Kim sendet.
import { cors, json, userClient } from "../_shared/edge_auth.ts";
import { imapAppend, imapList, mailConfig, pickSentFolder, rfc822, smtpSend } from "../_shared/mail.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);
  try {
    const { sb, workspaceId } = await userClient(req);
    const body = await req.json().catch(() => ({}));
    const cfg = mailConfig();
    if (!cfg) return json({ connected: false, message: "E-Mail noch nicht verbunden" });
    const to = String(body.to || "").split(/[,;]/).map((s: string) => s.trim()).filter((s: string) => s.includes("@"));
    const subject = String(body.subject || "").slice(0, 300);
    const text = String(body.text || "").slice(0, 20000);
    if (!to.length || !subject || !text) return json({ error: "Empfänger, Betreff und Text fehlen" }, 400);
    const from = cfg.user.includes("@") ? cfg.user : String(body.from || "");
    if (!from.includes("@")) return json({ error: "Absender fehlt. MAIL_USER als volle Adresse setzen." }, 400);
    await smtpSend(to, subject, text, from);
    let sentWarning = "";
    try {
      const folders = await imapList();
      const sent = pickSentFolder(folders, cfg.sentFolder);
      if (sent) await imapAppend(sent, rfc822(from, to, subject, text, cfg.fromName));
      else sentWarning = "Gesendet-Ordner nicht erkannt. MAIL_SENT_FOLDER optional setzen.";
    } catch {
      sentWarning = "Die Mail ist raus, die Kopie in Gesendet hat nicht geklappt.";
    }
    const conversationId = String(body.conversationId || "");
    if (conversationId) {
      const now = new Date().toISOString();
      await sb.from("messages").insert({
        workspace_id: workspaceId,
        conversation_id: conversationId,
        direction: "out",
        from_addr: from,
        to_addrs: to.join(", "),
        subject,
        body_text: text,
        created_at: now,
      });
      const conv = await sb.from("conversations").select("contact_id, first_reply_at, first_inbound_at").eq("id", conversationId).maybeSingle();
      await sb.from("conversations").update({
        status: "beantwortet",
        draft_status: "sent",
        unread: false,
        first_reply_at: conv.data?.first_reply_at || now,
        updated_at: now,
      }).eq("id", conversationId);
      const contactId = conv.data?.contact_id;
      if (contactId) {
        const contact = await sb.from("contacts").select("status").eq("id", contactId).maybeSingle();
        if (contact.data?.status === "lead") {
          await sb.from("contacts").update({ status: "angebot", status_seit: now }).eq("id", contactId);
        }
      }
    }
    return json({ ok: true, warning: sentWarning });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Fehler";
    if (message.includes("nicht verbunden")) return json({ connected: false, message: "E-Mail noch nicht verbunden" });
    return json({ error: message }, 400);
  }
});
