// Holt IMAP, spiegelt Ordner, verschiebt und legt Ordner an. Prüft das Nutzer-JWT selbst.
import { createClient } from "npm:@supabase/supabase-js@2";
import { cors, json, userClient } from "../_shared/edge_auth.ts";
import { isAutoReply, mailBodyText, mimeHeader } from "../_shared/mime.ts";
import {
  classifyHeuristic,
  headerValue,
  imapCreate,
  imapDeleteFolder,
  imapFetchNew,
  imapList,
  imapMove,
  imapRename,
  isFreemail,
  mailConfig,
  mailFingerprint,
  parentPath,
  threadKey,
} from "../_shared/mail.ts";
import { referencedIds, replyPlan, type OutreachThread } from "../_shared/outreach.ts";

const WORKSPACE_ID = Deno.env.get("CRM_WORKSPACE_ID") || "566f2d4d-5b66-4ba8-b6a1-1edf413a1689";

function safeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (!ea.length || ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

// Cron: Header x-outreach-cron == OUTREACH_CRON_SECRET. Darf nur Outreach-Antworten abholen.
function cronAuthorized(req: Request) {
  const secret = Deno.env.get("OUTREACH_CRON_SECRET") || "";
  const given = req.headers.get("x-outreach-cron") || "";
  return !!secret && !!given && safeEqual(given, secret);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);
  try {
    if (cronAuthorized(req)) {
      const body = await req.json().catch(() => ({}));
      if (String(body.op || "outreach") !== "outreach") return json({ error: "Der Cron holt nur Outreach-Antworten" }, 400);
      if (!mailConfig()) return json({ connected: false, message: "E-Mail noch nicht verbunden" });
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
      return json(await syncOutreachReplies(sb, WORKSPACE_ID, Number(body.sinceDays) || 0, body.allFolders === true));
    }
    const { sb, workspaceId } = await userClient(req);
    const body = await req.json().catch(() => ({}));
    const op = String(body.op || "sync");
    if (!mailConfig()) return json({ connected: false, message: "E-Mail noch nicht verbunden" });
    if (op === "outreach") return json(await syncOutreachReplies(sb, workspaceId, 0));

    if (op === "mkdir") {
      await imapCreate(String(body.path || ""));
      return json({ ok: true });
    }
    if (op === "rename") {
      await imapRename(String(body.from || ""), String(body.to || ""));
      return json({ ok: true });
    }
    if (op === "deleteFolder") {
      if (body.confirm !== true) return json({ error: "Löschen braucht eine Bestätigung" }, 400);
      await imapDeleteFolder(String(body.path || ""));
      return json({ ok: true });
    }
    if (op === "move") {
      const how = await imapMove(String(body.from || "INBOX"), Number(body.uid), String(body.to || ""));
      if (body.conversationId) {
        await sb.from("conversations").update({ folder_path: body.to, updated_at: new Date().toISOString() }).eq("id", body.conversationId);
      }
      return json({ ok: true, how });
    }
    if (op === "flags") {
      return json({ ok: true, note: "Gelesen wird beim nächsten Sync als \\Seen geschrieben." });
    }

    const listed = await imapList();
    const selectable = listed.filter((f) => !f.flags.some((flag) => flag.toLowerCase() === "\\noselect"));
    for (const f of listed) {
      await sb.from("mail_folders").upsert({
        workspace_id: workspaceId,
        imap_path: f.path,
        parent_path: parentPath(f.path, f.delimiter),
        name: f.name,
        delimiter: f.delimiter,
        role: f.role,
      }, { onConflict: "workspace_id,imap_path" });
    }
    const inbox = selectable.find((f) => f.role === "inbox")?.path || "INBOX";
    const older = body.older === true;
    const only = older ? String(body.folder || inbox) : "";
    const order = only ? [only] : [inbox, ...selectable.map((f) => f.path).filter((p) => p !== inbox)];
    const deadline = Date.now() + 45000;
    const seenRows = await sb.from("conversations").select("external_id").eq("workspace_id", workspaceId).not("external_id", "is", null);
    const seen = new Set((seenRows.data || []).map((row: { external_id?: string }) => row.external_id).filter(Boolean));
    // Fehlende Tabelle darf den Sync nicht stoppen. Ohne sie kann eine gelöschte Mail wiederkommen.
    const suppressedRows = await sb.from("mail_suppressions").select("fingerprint").eq("workspace_id", workspaceId).limit(2000);
    const suppressed = new Set<string>((suppressedRows.error ? [] : (suppressedRows.data || [])).map((row: { fingerprint?: string }) => row.fingerprint || "").filter(Boolean));
    const outreachRows = await sb.from("outreach_drafts").select("id, email, subject, message_id, status, contact_id").eq("workspace_id", workspaceId).in("status", ["gesendet", "antwort", "abgemeldet"]).limit(500);
    const outreachThreads: OutreachThread[] = outreachRows.error ? [] : (outreachRows.data || []).map((row: { id: string; email?: string; subject?: string; message_id?: string; status?: string; contact_id?: string | null }) => ({
      id: row.id,
      email: String(row.email || ""),
      subject: String(row.subject || ""),
      messageId: String(row.message_id || ""),
      status: String(row.status || ""),
      contactId: row.contact_id || null,
    }));
    // Outreach-Empfänger (gesendet oder aus alten Listen) werden nie automatisch zum CRM-Kontakt.
    const contactedRows = await sb.from("outreach_contacted").select("email, domain").eq("workspace_id", workspaceId).limit(10000);
    const outreachParties = {
      emails: new Set<string>([
        ...(contactedRows.error ? [] : (contactedRows.data || [])).map((r: { email?: string }) => String(r.email || "").toLowerCase()),
        ...outreachThreads.map((t) => t.email.toLowerCase()),
      ].filter(Boolean)),
      domains: new Set<string>((contactedRows.error ? [] : (contactedRows.data || [])).map((r: { domain?: string }) => String(r.domain || "").toLowerCase()).filter(Boolean)),
    };
    let imported = 0;
    let partial = false;
    for (const path of order) {
      if (Date.now() > deadline) { partial = true; break; }
      const limit = path === inbox ? 200 : 50;
      const known = await sb.from("mail_folders").select("last_uid").eq("workspace_id", workspaceId).eq("imap_path", path).maybeSingle();
      const lastUid = Number(known.data?.last_uid || 0);
      let spec: { afterUid?: number; beforeUid?: number; limit: number; deadline: number } = { limit, deadline };
      if (older) {
        const min = await sb.from("messages").select("imap_uid").eq("workspace_id", workspaceId).eq("imap_folder", path).order("imap_uid", { ascending: true }).limit(1);
        const beforeUid = Number(min.data?.[0]?.imap_uid || 0);
        if (!beforeUid) continue;
        spec = { beforeUid, limit, deadline };
      } else if (lastUid > 0) {
        spec = { afterUid: lastUid, limit, deadline };
      }
      let mails: { uid: number; flags: string; header: string; text: string }[] = [];
      try {
        mails = await imapFetchNew(path, spec);
      } catch (e) {
        const message = e instanceof Error ? e.message : "";
        if (/nicht verbunden|Login|Anmeldung/.test(message)) throw e;
        partial = true;
        continue;
      }
      let maxUid = lastUid;
      for (const mail of mails) {
        if (Date.now() > deadline) { partial = true; break; }
        const external = `${path}:${mail.uid}`;
        if (seen.has(external)) {
          maxUid = Math.max(maxUid, mail.uid);
          continue;
        }
        try {
          const got = await storeMail(sb, workspaceId, path, mail, external, suppressed, outreachThreads, outreachParties);
          if (got) { seen.add(external); imported++; }
          maxUid = Math.max(maxUid, mail.uid);
        } catch { /* eine Mail darf den Sync nicht abbrechen */ }
      }
      if (!older && maxUid > lastUid) {
        await sb.from("mail_folders").update({ last_uid: maxUid }).eq("workspace_id", workspaceId).eq("imap_path", path);
      }
    }
    const folderNames = listed.map((f) => f.name);
    const message = partial ? "Ein Teil der Ordner ist geladen. Aktualisieren holt den Rest." : undefined;
    return json({ connected: true, folders: listed.length, folderNames, imported, partial, message });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Fehler";
    if (message.includes("nicht verbunden")) return json({ connected: false, message: "E-Mail noch nicht verbunden" });
    return json({ error: message }, 400);
  }
});

async function storeMail(sb: { from: (table: string) => any }, workspaceId: string, folder: string, mail: { uid: number; flags: string; header: string; text: string }, external: string, suppressed: Set<string>, outreachThreads: OutreachThread[] = [], outreachParties: { emails: Set<string>; domains: Set<string> } = { emails: new Set(), domains: new Set() }) {
  const from = headerValue(mail.header, "from");
  const to = headerValue(mail.header, "to");
  const cc = headerValue(mail.header, "cc");
  const subject = mimeHeader(mail.header, "subject") || "(ohne Betreff)";
  if (suppressed.has(mailFingerprint(from, subject, mail.text))) return false;
  const email = (from.match(/<([^>]+)>/)?.[1] || from).trim().toLowerCase();
  const readable = mailBodyText(mail.header, mail.text);
  const plan = replyPlan({ fromEmail: email, subject, text: readable, header: mail.header, drafts: outreachThreads, auto: isAutoReply(mail.header, subject) });
  const match = await matchContact(sb, workspaceId, [email, to, cc].join(" "), mail.text);
  const klass = classifyHeuristic(`${subject}\n${mail.text}`, match.certain || !!plan?.contactId);
  const { data: conv } = await sb.from("conversations").insert({
    workspace_id: workspaceId,
    channel: "email",
    subject,
    contact_id: plan?.contactId || (match.certain ? match.id : null),
    suggested_contact_id: match.certain ? null : match.id,
    status: "neu",
    klassifikation: klass,
    folder_path: folder,
    folder_role: folder.toLowerCase() === "inbox" ? "inbox" : "other",
    thread_key: threadKey(subject),
    unread: !/\\Seen/i.test(mail.flags),
    first_inbound_at: new Date().toISOString(),
    external_id: external,
  }).select("id").single();
  if (!conv) return false;
  await sb.from("messages").insert({
    workspace_id: workspaceId,
    conversation_id: conv.id,
    direction: "in",
    from_addr: from,
    to_addrs: to,
    cc_addrs: cc,
    subject,
    body_text: mail.text.slice(0, 8000),
    body_html: "",
    imap_uid: mail.uid,
    imap_folder: folder,
  });
  if (plan) {
    try {
      await recordReply(sb, workspaceId, plan, { from, to, subject, text: readable, header: mail.header, uid: mail.uid, folder }, conv.id);
      const linked = outreachThreads.find((t) => t.id === plan.draftId);
      if (linked) linked.status = plan.nextStatus;
    } catch { /* Zuordnung darf den Sync nicht stoppen */ }
  }
  const senderDomain = (email.split("@")[1] || "").replace(/^www\./, "");
  const fromOutreach = outreachParties.emails.has(email) || (!!senderDomain && outreachParties.domains.has(senderDomain));
  // Antworten auf Outreach legen keinen Kontakt an. Den legt Kim im Outreach-Modul per „Als Kontakt übernehmen“ an.
  if (!plan && !fromOutreach && klass === "anfrage" && !match.id) {
    const created = await sb.from("contacts").insert({
      workspace_id: workspaceId,
      firma: email || subject.slice(0, 80),
      email,
      status: "lead",
      quelle: "email",
      status_seit: new Date().toISOString(),
    }).select("id").single();
    if (created.data?.id) await sb.from("conversations").update({ contact_id: created.data.id }).eq("id", conv.id);
  }
  return true;
}

async function matchContact(sb: { from: (table: string) => any }, workspaceId: string, blob: string, body: string) {
  const emails = [...blob.toLowerCase().matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g)].map((m) => m[0]);
  for (const email of emails) {
    const exact = await sb.from("contacts").select("id").eq("workspace_id", workspaceId).ilike("email", email).limit(1);
    if (exact.data?.[0]) return { id: exact.data[0].id, certain: true };
    const extra = await sb.from("contact_emails").select("contact_id").eq("workspace_id", workspaceId).ilike("email", email).limit(1);
    if (extra.data?.[0]) return { id: extra.data[0].contact_id, certain: true };
  }
  for (const email of emails) {
    const domain = email.split("@")[1] || "";
    if (!domain || isFreemail(email)) continue;
    const rows = await sb.from("contacts").select("id, email, web").eq("workspace_id", workspaceId).limit(400);
    const hit = (rows.data || []).find((c: { email?: string; web?: string; id: string }) => String(c.email || "").endsWith("@" + domain) || String(c.web || "").includes(domain));
    if (hit) return { id: hit.id, certain: false };
  }
  const nums = body.match(/\b(?:AN|RE|R|A)-?\d{3,}\b/gi) || [];
  if (nums.length) {
    const offer = await sb.from("angebote").select("kunde_id, nr").eq("workspace_id", workspaceId).in("nr", nums).limit(1);
    if (offer.data?.[0]?.kunde_id) return { id: offer.data[0].kunde_id, certain: false };
  }
  return { id: null as string | null, certain: false };
}

type ReplyPlan = NonNullable<ReturnType<typeof replyPlan>>;
type Db = { from: (table: string) => any };

/** Antwort im Outreach-Postfach ablegen. Doppelt (gleicher Ordner + UID) wird übersprungen. Legt keinen Kontakt an. */
async function recordReply(sb: Db, workspaceId: string, plan: ReplyPlan, mail: { from: string; to: string; subject: string; text: string; header: string; uid: number; folder: string }, conversationId: string | null = null) {
  const dup = await sb.from("outreach_messages").select("id").eq("workspace_id", workspaceId).eq("imap_folder", mail.folder).eq("imap_uid", mail.uid).limit(1);
  if (dup.data?.length) return false;
  // Dieselbe Mail nach dem Verschieben (z. B. in den Papierkorb) hat eine neue UID: über die Message-ID erkennen.
  const msgId = mimeHeader(mail.header, "message-id");
  if (msgId) {
    const same = await sb.from("outreach_messages").select("id").eq("workspace_id", workspaceId).eq("message_id", msgId).limit(1);
    if (same.data?.length) return false;
  }
  const dateRaw = mimeHeader(mail.header, "date");
  const date = dateRaw ? new Date(dateRaw) : new Date();
  const at = Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 3600000 ? new Date() : date;
  const ins = await sb.from("outreach_messages").insert({
    workspace_id: workspaceId,
    draft_id: plan.draftId,
    direction: "in",
    from_addr: mail.from,
    to_addrs: mail.to,
    subject: mail.subject,
    body_text: mail.text.slice(0, 8000),
    message_id: mimeHeader(mail.header, "message-id") || null,
    in_reply_to: referencedIds(mail.header)[0] || null,
    auto: plan.auto,
    imap_uid: mail.uid,
    imap_folder: mail.folder,
    created_at: at.toISOString(),
  });
  if (ins.error) throw new Error(ins.error.message);
  const patch: Record<string, unknown> = { unread: true, updated_at: new Date().toISOString() };
  if (!plan.auto) patch.status = plan.nextStatus;
  if (conversationId) patch.conversation_id = conversationId;
  await sb.from("outreach_drafts").update(patch).eq("id", plan.draftId).eq("workspace_id", workspaceId);
  if (plan.blockEmail && !plan.auto) {
    await sb.from("outreach_blocklist").upsert({
      workspace_id: workspaceId,
      kind: "email",
      value: plan.blockEmail,
      reason: "abgemeldet",
    }, { onConflict: "workspace_id,kind,value" });
  }
  return true;
}

/**
 * Holt nur Antworten auf Outreach-Mails (Posteingang und Spam) und legt sie im Outreach-Postfach ab.
 * Andere Mails werden gelesen (ohne \\Seen zu setzen), aber nirgends gespeichert. Kein Kontakt, keine Auto-Antwort.
 */
async function syncOutreachReplies(sb: Db, workspaceId: string, sinceDays: number, allFolders = false) {
  const rows = await sb.from("outreach_drafts").select("id, email, subject, message_id, status, contact_id").eq("workspace_id", workspaceId).in("status", ["gesendet", "antwort", "abgemeldet"]).limit(2000);
  const threads: OutreachThread[] = (rows.data || []).map((r: { id: string; email?: string; subject?: string; message_id?: string; status?: string; contact_id?: string | null }) => ({
    id: r.id,
    email: String(r.email || ""),
    subject: String(r.subject || ""),
    messageId: String(r.message_id || ""),
    status: String(r.status || ""),
    contactId: r.contact_id || null,
  }));
  if (!threads.length) return { ok: true, checked: 0, stored: 0 };
  const folders = await sb.from("mail_folders").select("imap_path, role").eq("workspace_id", workspaceId);
  // Normal: Posteingang und Spam. Nachholen (allFolders): alle Ordner außer Gesendet/Entwürfe, nur lesen.
  const paths = ["INBOX", ...((folders.data || []) as { imap_path: string; role?: string }[])
    .filter((f) => allFolders
      ? !/(^|\.)(sent|drafts|entwürfe|gesendet)/i.test(f.imap_path) && f.role !== "sent" && f.role !== "drafts"
      : f.role === "junk" || f.role === "trash" || /(^|\.)(junk|spam|trash|deleted messages|papierkorb|gelöschte elemente)$/i.test(f.imap_path))
    .map((f) => f.imap_path)];
  const deadline = Date.now() + 40000;
  let checked = 0;
  let stored = 0;
  const found: { draftId: string; auto: boolean; from: string }[] = [];
  const errors: string[] = [];
  const perFolder: Record<string, number> = {};
  for (const path of [...new Set(paths)]) {
    if (Date.now() > deadline) break;
    const cur = await sb.from("outreach_mail_cursor").select("last_uid").eq("workspace_id", workspaceId).eq("imap_path", path).maybeSingle();
    const lastUid = Number(cur.data?.last_uid || 0);
    const spec = lastUid > 0 && !sinceDays && !allFolders
      ? { afterUid: lastUid, limit: 150, deadline }
      : { sinceDays: sinceDays || 3, limit: 300, deadline };
    let mails: { uid: number; flags: string; header: string; text: string }[] = [];
    try {
      mails = await imapFetchNew(path, spec);
    } catch (e) {
      errors.push(`${path}: ${e instanceof Error ? e.message : "Fehler"}`.slice(0, 160));
      continue;
    }
    perFolder[path] = mails.length;
    let maxUid = lastUid;
    for (const mail of mails) {
      checked++;
      maxUid = Math.max(maxUid, mail.uid);
      const from = mimeHeader(mail.header, "from");
      const email = (from.match(/<([^>]+)>/)?.[1] || from).trim().toLowerCase();
      const subject = mimeHeader(mail.header, "subject") || "(ohne Betreff)";
      const text = mailBodyText(mail.header, mail.text);
      const plan = replyPlan({ fromEmail: email, subject, text, header: mail.header, drafts: threads, auto: isAutoReply(mail.header, subject) });
      if (!plan) continue;
      try {
        if (await recordReply(sb, workspaceId, plan, { from, to: mimeHeader(mail.header, "to"), subject, text, header: mail.header, uid: mail.uid, folder: path })) {
          stored++;
          found.push({ draftId: plan.draftId, auto: plan.auto, from: email });
          const t = threads.find((x) => x.id === plan.draftId);
          if (t && !plan.auto) t.status = plan.nextStatus;
        }
      } catch { /* eine Mail darf den Abruf nicht stoppen */ }
    }
    if (allFolders && path !== "INBOX" && !/(^|\.)(junk|spam|trash|deleted messages|papierkorb|gelöschte elemente)$/i.test(path)) continue;
    await sb.from("outreach_mail_cursor").upsert({ workspace_id: workspaceId, imap_path: path, last_uid: maxUid, checked_at: new Date().toISOString() }, { onConflict: "workspace_id,imap_path" });
  }
  return { ok: true, checked, stored, found, perFolder, errors };
}
