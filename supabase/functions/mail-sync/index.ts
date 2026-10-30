// Holt IMAP, spiegelt Ordner, verschiebt und legt Ordner an. Prüft das Nutzer-JWT selbst.
import { cors, json, userClient } from "../_shared/edge_auth.ts";
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
  parentPath,
  threadKey,
} from "../_shared/mail.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);
  try {
    const { sb, workspaceId } = await userClient(req);
    const body = await req.json().catch(() => ({}));
    const op = String(body.op || "sync");
    if (!mailConfig()) return json({ connected: false, message: "E-Mail noch nicht verbunden" });

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
          const got = await storeMail(sb, workspaceId, path, mail, external);
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

async function storeMail(sb: { from: (table: string) => any }, workspaceId: string, folder: string, mail: { uid: number; flags: string; header: string; text: string }, external: string) {
  const from = headerValue(mail.header, "from");
  const to = headerValue(mail.header, "to");
  const cc = headerValue(mail.header, "cc");
  const subject = headerValue(mail.header, "subject") || "(ohne Betreff)";
  const email = (from.match(/<([^>]+)>/)?.[1] || from).trim().toLowerCase();
  const match = await matchContact(sb, workspaceId, [email, to, cc].join(" "), mail.text);
  const klass = classifyHeuristic(`${subject}\n${mail.text}`, match.certain);
  const { data: conv } = await sb.from("conversations").insert({
    workspace_id: workspaceId,
    channel: "email",
    subject,
    contact_id: match.certain ? match.id : null,
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
  if (klass === "anfrage" && !match.id) {
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
