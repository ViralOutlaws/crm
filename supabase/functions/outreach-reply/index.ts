// Antwort im Outreach-Postfach. Ein KI-Entwurf verschickt nichts. Senden nur mit confirm.
import { anthropicText, cors, json, userClient } from "../_shared/edge_auth.ts";
import { loadSignature, sentStats } from "../_shared/outreach_db.ts";
import { mailConfig, sendAndFile } from "../_shared/mail.ts";
import { DAILY_LIMIT_DEFAULT, GAP_MINUTES_DEFAULT, outreachMessageId, sendDecision, withSignature } from "../_shared/outreach.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);
  try {
    const { sb, workspaceId } = await userClient(req);
    const body = await req.json().catch(() => ({}));
    const draftId = String(body.draftId || "");
    const op = String(body.op || "draft");
    const draft = await sb.from("outreach_drafts").select("id, status, email, subject, message_id, body, reply_body").eq("id", draftId).eq("workspace_id", workspaceId).maybeSingle();
    if (!draft.data) return json({ error: "Gespräch fehlt" }, 404);
    const row = draft.data;
    if (row.status === "abgemeldet") return json({ error: "Diese Adresse ist abgemeldet. Es geht nichts mehr raus." }, 400);
    if (row.status !== "gesendet" && row.status !== "antwort") {
      return json({ error: "Eine Antwort gibt es nur auf eine bereits gesendete Outreach-Mail." }, 400);
    }

    if (op === "draft") {
      const [msgs, wissen] = await Promise.all([
        sb.from("outreach_messages").select("direction, from_addr, body_text, created_at").eq("draft_id", draftId).order("created_at"),
        sb.from("wissensbasis").select("section, content").eq("workspace_id", workspaceId),
      ]);
      const history = (msgs.data || []).map((m: { direction?: string; from_addr?: string; body_text?: string }) => `${m.direction} ${m.from_addr || ""}: ${m.body_text || ""}`).join("\n").slice(0, 8000);
      const rules = (wissen.data || []).map((w: { section?: string; content?: string }) => `${w.section}: ${w.content}`).join("\n").slice(0, 4000);
      const system = "Du schreibst eine kurze Antwort auf Deutsch für Kim, Viral Outlaws. Halte die Wissensbasis ein. Erfinde keine Preise, Termine oder Referenzen. Nur der Mailtext, ohne Betreff. Du versendest nichts.";
      const user = `Regeln:\n${rules}\n\nBisheriges Gespräch:\n${history}\n\nUnsere erste Mail:\n${row.body || ""}`;
      const text = (await anthropicText(system, user, 700))?.trim()
        || "Guten Tag,\n\nvielen Dank für Ihre Nachricht. Ich schaue es mir an und melde mich.\n\nViele Grüße\nKim";
      await sb.from("outreach_drafts").update({ reply_body: text, updated_at: new Date().toISOString() }).eq("id", draftId);
      return json({ ok: true, sent: false, text });
    }

    if (op !== "send") return json({ error: "Unbekannte Operation" }, 400);
    if (body.confirm !== true) return json({ error: "Senden braucht eine Bestätigung." }, 400);
    const typed = String(body.text || "").trim().slice(0, 7000);
    if (!typed) return json({ error: "Text fehlt" }, 400);
    const text = withSignature(typed, await loadSignature(sb, workspaceId));
    const cfg = mailConfig();
    if (!cfg) return json({ connected: false, message: "E-Mail noch nicht verbunden" });
    const from = cfg.user.includes("@") ? cfg.user : "";
    if (!from.includes("@")) return json({ error: "Absender fehlt. MAIL_USER als volle Adresse setzen." }, 400);
    const settings = await sb.from("outreach_settings").select("daily_limit, gap_minutes").eq("workspace_id", workspaceId).maybeSingle();
    const stats = await sentStats(sb, workspaceId);
    const decision = sendDecision({
      kind: "reply",
      status: String(row.status),
      emailArt: "veroeffentlicht",
      guessOk: true,
      skip: null,
      sentToday: stats.sentToday,
      dailyLimit: Number(settings.data?.daily_limit || DAILY_LIMIT_DEFAULT),
      lastSentAt: stats.lastSentAt,
      now: Date.now(),
      gapMinutes: Number(settings.data?.gap_minutes || GAP_MINUTES_DEFAULT),
    });
    if (!decision.ok) return json({ ok: false, sent: false, reason: decision.reason });

    const subject = /^aw:|^re:|^wg:/i.test(String(row.subject || "")) ? String(row.subject) : `AW: ${row.subject || ""}`;
    const messageId = outreachMessageId(String(row.id));
    const prior = String(row.message_id || "");
    const warning = await sendAndFile([String(row.email)], subject.slice(0, 180), text, from, {
      messageId,
      inReplyTo: prior || undefined,
      references: prior || undefined,
    });
    const now = new Date().toISOString();
    await sb.from("outreach_messages").insert({
      workspace_id: workspaceId,
      draft_id: row.id,
      direction: "out",
      from_addr: from,
      to_addrs: row.email,
      subject: subject.slice(0, 180),
      body_text: text,
      message_id: messageId,
      in_reply_to: prior || null,
      created_at: now,
    });
    await sb.from("outreach_drafts").update({
      reply_body: text,
      unread: false,
      last_error: warning || null,
      updated_at: now,
    }).eq("id", row.id).eq("workspace_id", workspaceId);
    return json({ ok: true, sent: true, warning });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Fehler";
    if (message.includes("nicht verbunden")) return json({ connected: false, message: "E-Mail noch nicht verbunden" });
    return json({ error: message }, 400);
  }
});
