// Schreibt Entwürfe. Prüft das Nutzer-JWT selbst. Verschickt nichts.
import { anthropicText, cors, json, userClient } from "../_shared/edge_auth.ts";
import { loadGuard } from "../_shared/outreach_db.ts";
import {
  draftUserPrompt,
  fallbackMail,
  outreachSkip,
  parseAiMail,
  websiteDomain,
  type EmailArt,
} from "../_shared/outreach.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);
  try {
    const { sb, workspaceId } = await userClient(req);
    const body = await req.json().catch(() => ({}));
    const allowGuess = body.allowGuess === true;
    const personIds = Array.isArray(body.personIds) ? body.personIds.map((id: unknown) => String(id)) : [];
    let peopleQuery = sb.from("outreach_people").select("id, target_id, person, rolle, email, email_art, hinweis").eq("workspace_id", workspaceId);
    if (personIds.length) peopleQuery = peopleQuery.in("id", personIds.slice(0, 20));
    else peopleQuery = peopleQuery.limit(20);
    const people = await peopleQuery;
    if (people.error) return json({ error: people.error.message }, 400);
    const known = await loadGuard(sb, workspaceId);
    const [wissen, refs] = await Promise.all([
      sb.from("wissensbasis").select("section, content").eq("workspace_id", workspaceId),
      sb.from("contacts").select("firma, branche, ort, web, status, archiviert").eq("workspace_id", workspaceId).eq("status", "gewonnen").limit(8),
    ]);
    const references = (refs.data || []).filter((c: { archiviert?: boolean }) => !c.archiviert).map((c: { firma?: string; branche?: string; ort?: string; web?: string }) => ({
      firma: String(c.firma || ""),
      branche: c.branche || "",
      ort: c.ort || "",
      web: c.web || "",
    }));
    const created = [];
    const skipped = [];
    const draftedTargets = new Set<string>();
    const rank: Record<string, number> = { veroeffentlicht: 0, generisch: 1, vermutet: 2 };
    const list = [...(people.data || [])].sort((a: { email_art?: string }, b: { email_art?: string }) => (rank[String(a.email_art)] ?? 9) - (rank[String(b.email_art)] ?? 9));
    for (const person of list) {
      const art = String(person.email_art || "generisch") as EmailArt;
      if (art === "vermutet" && !allowGuess) {
        skipped.push({ id: person.id, reason: "Vermutete Adresse wird nicht automatisch entworfen." });
        continue;
      }
      const target = await sb.from("outreach_targets").select("id, firma, web, domain, excerpt, status, skip_reason").eq("id", person.target_id).maybeSingle();
      const row = target.data;
      if (!row) {
        skipped.push({ id: person.id, reason: "Ziel fehlt" });
        continue;
      }
      if (row.skip_reason || row.status === "uebersprungen") {
        skipped.push({ id: person.id, reason: row.skip_reason || "Übersprungen" });
        continue;
      }
      if (draftedTargets.has(String(row.id))) {
        skipped.push({ id: person.id, reason: "Für diese Firma gibt es schon einen Entwurf." });
        continue;
      }
      const existing = await sb.from("outreach_drafts").select("id").eq("workspace_id", workspaceId).eq("target_id", row.id).limit(1);
      if (existing.data?.[0]) {
        skipped.push({ id: person.id, reason: "Schon ein Entwurf" });
        continue;
      }
      const skip = outreachSkip({
        email: String(person.email || ""),
        domain: String(row.domain || ""),
        blocklist: known.blocklist,
        crm: known.crm,
        priorEmails: known.priorEmails,
        priorDomains: known.priorDomains.filter((d) => websiteDomain(d) !== websiteDomain(String(row.domain || ""))),
        rejectedEmails: known.rejectedEmails,
      });
      if (skip) {
        skipped.push({ id: person.id, reason: skip });
        continue;
      }
      const fallback = fallbackMail({
        person: String(person.person || ""),
        firma: String(row.firma || ""),
        web: String(row.web || ""),
        excerpt: String(row.excerpt || ""),
      });
      const prompt = draftUserPrompt({
        wissen: wissen.data || [],
        references,
        firma: String(row.firma || ""),
        person: String(person.person || ""),
        rolle: String(person.rolle || ""),
        web: String(row.web || ""),
        excerpt: String(row.excerpt || ""),
      });
      const raw = await anthropicText(
        "Du schreibst nur den JSON-Entwurf. Du versendest nichts.",
        prompt,
        900,
      );
      const mail = parseAiMail(raw, fallback);
      const inserted = await sb.from("outreach_drafts").insert({
        workspace_id: workspaceId,
        target_id: row.id,
        person_id: person.id,
        subject: mail.subject,
        body: mail.body,
        status: "entwurf",
        email: String(person.email || "").toLowerCase(),
        email_art: art,
        guess_ok: false,
        unread: false,
        updated_at: new Date().toISOString(),
      }).select("id, subject, status, email, email_art").single();
      if (inserted.error || !inserted.data) {
        skipped.push({ id: person.id, reason: inserted.error?.message || "Entwurf nicht gespeichert" });
        continue;
      }
      known.priorEmails.push(String(person.email || "").toLowerCase());
      draftedTargets.add(String(row.id));
      created.push({ ...inserted.data, source: mail.source });
    }
    return json({ ok: true, created, skipped });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Fehler" }, 400);
  }
});
