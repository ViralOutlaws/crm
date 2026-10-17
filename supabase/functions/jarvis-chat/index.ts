// Jarvis-Chat: prüft das Nutzer-JWT, liest und schreibt im CRM nur mit diesem JWT (RLS).
// Schreibwerkzeuge werden nicht ausgeführt, sondern als Bestätigung an die Oberfläche gegeben.
// Bestätigte Pläne prüft revalidate() erneut. Löschen, Mailversand und Bezahlt/Versendet gibt es nicht.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { customerFile, fuzzyFind, morningBriefing, openArea } from "./areas.ts";
import {
  anthropicTools,
  berlinToday,
  botFromText,
  isWriteTool,
  openPanelFor,
  planFromTool,
  revalidate,
  socialUpdateAllowed,
  sumNetto,
  systemBlocks,
  weekRange,
  type Ctx,
  type Plan,
} from "./logic.ts";

const encoder = new TextEncoder();

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (origin && !allowedOrigin(origin)) return json({ error: "Origin nicht erlaubt." }, 403, headers);
  if (req.method !== "POST") return json({ error: "Nur POST." }, 405, headers);

  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return json({ error: "Anfrage leer." }, 400, headers);
  }
  if (raw.length > 120_000) return json({ error: "Anfrage zu groß." }, 413, headers);

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("json");
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Ungültiges JSON." }, 400, headers);
  }

  const jwt = bearer(req.headers.get("authorization"));
  if (!jwt) return json({ error: "Anmeldung fehlt." }, 401, headers);

  let sb: SupabaseClient;
  try {
    sb = userClient(jwt);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Supabase nicht konfiguriert." }, 500, headers);
  }

  const auth = await sb.auth.getUser(jwt);
  if (auth.error || !auth.data.user) return json({ error: "Anmeldung ungültig oder abgelaufen." }, 401, headers);
  const user = auth.data.user;

  const profileRes = await sb.from("profiles").select("workspace_id, name").eq("id", user.id).maybeSingle();
  if (profileRes.error) return json({ error: "Profil nicht lesbar." }, 403, headers);
  const workspaceId = profileRes.data?.workspace_id ? String(profileRes.data.workspace_id) : null;
  const displayName = String(profileRes.data?.name || user.email || "Kim");
  const ctx: Ctx = { today: berlinToday() };

  try {
    if (body.op === "confirm") {
      if (!workspaceId) return json({ error: "Kein Workspace im Profil." }, 403, headers);
      const result = await executeConfirm(sb, workspaceId, user.id, body, ctx);
      return json(result, 200, headers);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Speichern fehlgeschlagen." }, 400, headers);
  }

  if (!Deno.env.get("ANTHROPIC_API_KEY")) {
    return json({ error: "Jarvis ist noch nicht konfiguriert (ANTHROPIC_API_KEY)." }, 500, headers);
  }

  let messages: Array<{ role: "user" | "assistant"; content: string }>;
  try {
    messages = sanitizeMessages(body.messages);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Nachrichten ungültig." }, 400, headers);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { /* client gone */ }
      };
      try {
        await runChat(sb, user.id, displayName, ctx, messages, send);
        send("done", { ok: true });
      } catch (e) {
        send("error", { message: e instanceof Error ? e.message : "Jarvis ist gerade nicht erreichbar." });
      } finally {
        try {
          controller.close();
        } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...headers,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
});

type Send = (event: string, data: unknown) => void;
type ChatMsg = { role: string; content: unknown };

async function runChat(
  sb: SupabaseClient,
  userId: string,
  name: string,
  ctx: Ctx,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  send: Send,
) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")!;
  const model = Deno.env.get("JARVIS_MODEL") || "claude-sonnet-5-5";
  const system = systemBlocks(ctx.today, name);
  const tools = anthropicTools();
  const messages: ChatMsg[] = history.map((m) => ({ role: m.role, content: m.content }));

  for (let round = 0; round < 4; round++) {
    const turn = await streamAnthropic(apiKey, model, system, messages, tools, (text) => send("delta", { text }));
    const toolUses = turn.content.filter((b) => b.type === "tool_use") as Array<{ type: "tool_use"; id: string; name: string; input: unknown }>;
    if (!toolUses.length || turn.stop !== "tool_use") return;

    messages.push({ role: "assistant", content: turn.content });
    const results: Array<Record<string, unknown>> = [];
    for (const tool of toolUses) {
      send("tool", { name: tool.name, phase: "start" });
      try {
        if (isWriteTool(tool.name)) {
          let input = tool.input;
          if (tool.name === "meeting_recap") {
            const prep = await prepareMeeting(sb, tool.input);
            if (prep.blocked) {
              if (prep.ui) send("ui", prep.ui);
              results.push({
                type: "tool_result",
                tool_use_id: tool.id,
                content: JSON.stringify(prep.forModel),
              });
              continue;
            }
            input = prep.input;
          }
          const plan = planFromTool(tool.name, input, ctx);
          send("confirm", plan);
          if (plan.bot) send("bot", { id: plan.bot, task: plan.summary, pending: true });
          results.push({
            type: "tool_result",
            tool_use_id: tool.id,
            content: JSON.stringify({
              status: "awaiting_confirmation",
              summary: plan.summary,
              lines: plan.lines,
              hinweis: "Noch NICHT gespeichert. Bitte Kim um Bestätigung. Keine Erfolgsmeldung.",
            }),
          });
        } else {
          const out = await runRead(sb, userId, tool.name, tool.input, ctx);
          if (out.ui) send("ui", out.ui);
          results.push({
            type: "tool_result",
            tool_use_id: tool.id,
            content: clipJson(out.forModel),
          });
        }
      } catch (e) {
        results.push({
          type: "tool_result",
          tool_use_id: tool.id,
          is_error: true,
          content: JSON.stringify({ error: e instanceof Error ? e.message : "Werkzeug fehlgeschlagen." }),
        });
      }
    }
    messages.push({ role: "user", content: results });
  }

  messages.push({
    role: "user",
    content: "Fasse das Ergebnis jetzt auf Deutsch zusammen, ohne weitere Werkzeuge. Erfinde nichts.",
  });
  await streamAnthropic(apiKey, model, system, messages, undefined, (text) => send("delta", { text }));
}

async function streamAnthropic(
  apiKey: string,
  model: string,
  system: unknown,
  messages: ChatMsg[],
  tools: unknown[] | undefined,
  onText: (text: string) => void,
): Promise<{ stop: string; content: Array<Record<string, unknown>> }> {
  const payload: Record<string, unknown> = {
    model,
    max_tokens: 1400,
    stream: true,
    system,
    messages,
  };
  if (tools) payload.tools = tools;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(55_000),
  });
  if (!res.ok || !res.body) {
    const t = await res.text();
    throw new Error(anthropicErr(res.status, t));
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const blocks: Array<{ type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: string } | undefined> = [];
  let stop = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      let j: Record<string, unknown>;
      try {
        j = JSON.parse(raw);
      } catch {
        continue;
      }
      if (j.type === "error") {
        const err = j.error as { message?: string } | undefined;
        throw new Error(err?.message || "Modellfehler");
      }
      if (j.type === "content_block_start") {
        const b = j.content_block as Record<string, unknown> | undefined;
        const index = Number(j.index);
        if (b?.type === "tool_use") blocks[index] = { type: "tool_use", id: String(b.id), name: String(b.name), input: "" };
        else blocks[index] = { type: "text", text: typeof b?.text === "string" ? b.text : "" };
      } else if (j.type === "content_block_delta") {
        const d = j.delta as Record<string, unknown> | undefined;
        const b = blocks[Number(j.index)];
        if (!b || !d) continue;
        if (d.type === "text_delta" && b.type === "text") {
          const text = String(d.text ?? "");
          b.text += text;
          if (text) onText(text);
        } else if (d.type === "input_json_delta" && b.type === "tool_use") {
          b.input += String(d.partial_json ?? "");
        }
      } else if (j.type === "message_delta") {
        const d = j.delta as { stop_reason?: string } | undefined;
        if (d?.stop_reason) stop = d.stop_reason;
      }
    }
  }

  const content = blocks.filter((b): b is NonNullable<typeof b> => !!b).map((b) => {
    if (b.type === "text") return { type: "text", text: b.text };
    let input: unknown = {};
    try {
      input = b.input ? JSON.parse(b.input) : {};
    } catch {
      input = {};
    }
    return { type: "tool_use", id: b.id, name: b.name, input };
  });
  return { stop, content };
}

async function executeConfirm(
  sb: SupabaseClient,
  workspaceId: string,
  userId: string,
  body: Record<string, unknown>,
  ctx: Ctx,
): Promise<Record<string, unknown>> {
  const plan = revalidate({ kind: body.kind, tool: body.tool, bot: body.bot, data: body.data }, ctx);
  if (plan.kind === "meeting") {
    const written = await writeMeeting(sb, workspaceId, plan, ctx);
    let warning: string | null = null;
    for (const entry of written.logs) {
      const w = await logRow(sb, workspaceId, userId, entry.table, entry.recordId, entry.action, entry.summary);
      if (w) warning = w;
    }
    return {
      ok: true,
      id: written.id,
      table: "contacts",
      action: "update",
      summary: plan.summary,
      lines: plan.lines,
      bot: plan.bot,
      panel: "customer",
      logged: written.logs.length,
      log_warning: warning,
    };
  }
  const id = await writePlan(sb, workspaceId, plan, ctx);
  const warning = await logAction(sb, workspaceId, userId, plan, id);
  return {
    ok: true,
    id,
    table: plan.table,
    action: plan.action,
    summary: plan.summary,
    lines: plan.lines,
    bot: plan.bot,
    panel: openPanelFor(plan.tool),
    log_warning: warning,
  };
}

async function writePlan(sb: SupabaseClient, ws: string, plan: Plan, ctx: Ctx): Promise<string> {
  const d = plan.data;
  if (plan.kind === "contact_insert") {
    const id = crypto.randomUUID();
    const notiz = d.neue_notiz ? [note(String(d.neue_notiz), ctx.today)] : [];
    const row = {
      id,
      workspace_id: ws,
      firma: d.firma,
      person: d.person ?? null,
      email: d.email ?? null,
      tel: d.tel ?? null,
      str: d.str ?? null,
      plz: d.plz ?? null,
      ort: d.ort ?? null,
      web: d.web ?? null,
      instagram: d.instagram ?? null,
      facebook: d.facebook ?? null,
      gbusiness: d.gbusiness ?? null,
      branche: d.branche ?? null,
      status: d.status ?? "lead",
      quelle: d.quelle ?? null,
      deal_wert: d.deal_wert ?? null,
      naechster_schritt: d.naechster_schritt ?? null,
      naechster_schritt_text: d.naechster_schritt_text ?? null,
      notes: d.notes ?? null,
      ana: d.ana ?? null,
      notizen: notiz,
      dokumente: [],
      checks: [],
      archiviert: false,
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from("contacts").insert(row);
    if (error) throw new Error(dbErr(error.message));
    return id;
  }
  if (plan.kind === "contact_update") {
    const id = String(d.id);
    const { data: existing, error: e1 } = await sb.from("contacts").select("id, notizen").eq("id", id).maybeSingle();
    if (e1) throw new Error(dbErr(e1.message));
    if (!existing) throw new Error("Kontakt nicht gefunden oder kein Zugriff.");
    const keys = [
      "firma", "person", "email", "tel", "str", "plz", "ort", "web", "instagram", "facebook",
      "gbusiness", "branche", "status", "quelle", "deal_wert", "naechster_schritt", "naechster_schritt_text",
      "notes", "ana",
    ];
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of keys) if (k in d) patch[k] = d[k];
    if (d.neue_notiz) {
      const prev = Array.isArray(existing.notizen) ? existing.notizen : [];
      patch.notizen = [...prev, note(String(d.neue_notiz), ctx.today)];
    }
    const { error } = await sb.from("contacts").update(patch).eq("id", id);
    if (error) throw new Error(dbErr(error.message));
    return id;
  }
  if (plan.kind === "aufgabe") {
    await assertContact(sb, d.kontakt_id as string | null);
    const id = crypto.randomUUID();
    const { error } = await sb.from("aufgaben").insert({
      id,
      workspace_id: ws,
      kontakt_id: d.kontakt_id ?? null,
      titel: d.titel,
      beschreibung: d.beschreibung || null,
      status: "todo",
      prioritaet: d.prioritaet || "normal",
      faellig: d.faellig ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(dbErr(error.message));
    return id;
  }
  if (plan.kind === "wiedervorlage") {
    await assertContact(sb, d.kontakt_id as string | null);
    const id = crypto.randomUUID();
    const { error } = await sb.from("wiedervorlagen").insert({
      id,
      workspace_id: ws,
      kontakt_id: d.kontakt_id ?? null,
      text: d.text,
      datum: d.datum,
      done: false,
    });
    if (error) throw new Error(dbErr(error.message));
    return id;
  }
  if (plan.kind === "kal_event") {
    await assertContact(sb, d.kontakt_id as string | null);
    const id = crypto.randomUUID();
    const { error } = await sb.from("kal_events").insert({
      id,
      workspace_id: ws,
      titel: d.titel,
      datum: d.datum,
      zeit: d.zeit ?? null,
      typ: d.typ || "termin",
      kontakt_id: d.kontakt_id ?? null,
      notiz: d.notiz ?? null,
    });
    if (error) throw new Error(dbErr(error.message));
    return id;
  }
  if (plan.kind === "angebot" || plan.kind === "rechnung") {
    await assertContact(sb, d.kunde_id as string | null);
    const id = crypto.randomUUID();
    const table = plan.kind === "angebot" ? "angebote" : "rechnungen";
    const nr = await nextNr(sb, table, plan.kind === "angebot" ? "A" : "R");
    const row: Record<string, unknown> = {
      id,
      workspace_id: ws,
      kunde_id: d.kunde_id ?? null,
      nr,
      betreff: d.betreff,
      datum: d.datum,
      status: "entwurf",
      positions: d.positions,
      notes: d.notes ?? null,
      archiviert: false,
      updated_at: new Date().toISOString(),
    };
    if (plan.kind === "angebot") row.valid_bis = d.valid_bis ?? null;
    else {
      row.faellig = d.faellig ?? null;
      row.r_typ = "normal";
      row.anzahl = 0;
      row.anztext = null;
    }
    const { error } = await sb.from(table).insert(row);
    if (error) throw new Error(dbErr(error.message));
    return id;
  }
  if (plan.kind === "social_insert" || plan.kind === "social_update") {
    return await writeSocial(sb, ws, plan, ctx);
  }
  if (plan.kind === "retainer") {
    await assertContact(sb, d.kunde_id as string | null);
    const id = crypto.randomUUID();
    const { error } = await sb.from("retainer").insert({
      id,
      workspace_id: ws,
      kunde_id: d.kunde_id ?? null,
      paket: d.paket,
      betrag: d.betrag,
      start_datum: d.start_datum ?? null,
      abrechnungstag: d.abrechnungstag ?? "1",
      next_datum: d.next_datum ?? null,
      status: d.status || "pausiert",
      leistungen: d.leistungen ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(dbErr(error.message));
    return id;
  }
  if (plan.kind === "ausgabe") {
    const id = crypto.randomUUID();
    const { error } = await sb.from("ausgaben").insert({
      id,
      workspace_id: ws,
      typ: d.typ || "ausgabe",
      datum: d.datum,
      beschreibung: d.beschreibung,
      kategorie: d.kategorie ?? null,
      netto: d.netto,
      mwst_pct: d.mwst_pct,
      mwst_betrag: d.mwst_betrag,
      brutto: d.brutto,
      notiz: d.notiz ?? null,
    });
    if (error) throw new Error(dbErr(error.message));
    return id;
  }
  if (plan.kind === "roi") {
    const id = crypto.randomUUID();
    const { error } = await sb.from("roi_daten").insert({
      id,
      workspace_id: ws,
      kunde_id: d.kunde_id ?? null,
      kanal: d.kanal,
      monat: d.monat,
      jahr: d.jahr,
      budget: d.budget,
      klicks: d.klicks,
      leads: d.leads,
      abschluesse: d.abschluesse,
      umsatz: d.umsatz,
      roas: d.roas,
      roi: d.roi,
      cpl: d.cpl,
      notiz: d.notiz ?? null,
    });
    if (error) throw new Error(dbErr(error.message));
    return id;
  }
  throw new Error("Aktion nicht erlaubt.");
}

async function writeMeeting(sb: SupabaseClient, ws: string, plan: Plan, ctx: Ctx) {
  const d = plan.data;
  const id = String(d.kontakt_id);
  const existing = await sb.from("contacts").select("id, notes, notizen").eq("id", id).maybeSingle();
  if (existing.error) throw new Error(dbErr(existing.error.message));
  if (!existing.data) throw new Error("Kontakt nicht gefunden oder kein Zugriff.");
  const prev = String(existing.data.notes || "").trim();
  const block = `[${ctx.today}] Gespräch:\n${d.neue_notiz}`;
  const notes = prev ? `${prev}\n\n${block}` : block;
  const timeline = Array.isArray(existing.data.notizen) ? existing.data.notizen : [];
  const { error } = await sb.from("contacts").update({
    notes,
    notizen: [...timeline, note(String(d.neue_notiz), ctx.today)],
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error(dbErr(error.message));
  const logs: Array<{ table: string; recordId: string; action: "insert" | "update"; summary: Record<string, unknown> }> = [{
    table: "contacts",
    recordId: id,
    action: "update",
    summary: { tool: "meeting_recap", kind: "meeting", lines: ["Notiz angehängt, bestehende Notizen bleiben"] },
  }];
  const tasks = Array.isArray(d.aufgaben) ? d.aufgaben as Array<Record<string, unknown>> : [];
  for (const task of tasks) {
    const tid = crypto.randomUUID();
    const ins = await sb.from("aufgaben").insert({
      id: tid,
      workspace_id: ws,
      kontakt_id: id,
      titel: task.titel,
      beschreibung: task.beschreibung || null,
      status: "todo",
      prioritaet: task.prioritaet || "normal",
      faellig: task.faellig ?? null,
      updated_at: new Date().toISOString(),
    });
    if (ins.error) throw new Error(dbErr(ins.error.message));
    logs.push({
      table: "aufgaben",
      recordId: tid,
      action: "insert",
      summary: { tool: "meeting_recap", kind: "aufgabe", lines: [String(task.titel || "")] },
    });
  }
  const wv = (d.wiedervorlage && typeof d.wiedervorlage === "object" ? d.wiedervorlage : {}) as Record<string, unknown>;
  const wid = crypto.randomUUID();
  const wvIns = await sb.from("wiedervorlagen").insert({
    id: wid,
    workspace_id: ws,
    kontakt_id: id,
    text: wv.text,
    datum: wv.datum,
    done: false,
  });
  if (wvIns.error) throw new Error(dbErr(wvIns.error.message));
  logs.push({
    table: "wiedervorlagen",
    recordId: wid,
    action: "insert",
    summary: { tool: "meeting_recap", kind: "wiedervorlage", lines: [String(wv.text || "")] },
  });
  return { id, logs };
}

async function prepareMeeting(sb: SupabaseClient, input: unknown): Promise<
  | { blocked: true; ui: { panel: string; data: unknown } | null; forModel: unknown }
  | { blocked: false; input: Record<string, unknown> }
> {
  const o = input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {};
  if (typeof o.kontakt_id === "string" && o.kontakt_id) return { blocked: false, input: o };
  const found = await fuzzyFind(sb, String(o.kunde || o.firma || o.query || ""));
  if (found.kind === "none") {
    return {
      blocked: true,
      ui: null,
      forModel: { status: "not_saved", hinweis: "Kein Kontakt gefunden. Nicht speichern und niemanden erfinden. Frag nach dem Namen." },
    };
  }
  if (found.kind === "many") {
    return {
      blocked: true,
      ui: {
        panel: "contacts",
        data: {
          title: "Mehrere Treffer",
          meta: "Bitte auswählen",
          crm: "contacts",
          wide: true,
          columns: [{ key: "firma", label: "Firma" }, { key: "person", label: "Person" }],
          rows: found.rows.map((r) => ({
            id: r.id,
            open: "customer",
            cells: { firma: r.firma || "", person: r.person || "" },
          })),
          kpis: [{ label: "Treffer", value: String(found.rows.length) }],
          note: "Mehrere Kontakte passen. Nicht raten.",
        },
      },
      forModel: {
        status: "not_saved",
        hinweis: "Mehrere Kontakte. Frag nach, welchen. Noch nichts gespeichert.",
        kandidaten: found.rows,
      },
    };
  }
  return { blocked: false, input: { ...o, kontakt_id: found.id, firma: o.firma || found.firma } };
}

async function writeSocial(sb: SupabaseClient, ws: string, plan: Plan, ctx: Ctx): Promise<string> {
  const d = plan.data;
  const keys = ["datum", "uhrzeit", "format", "format_detail", "saeule", "thema", "hook", "caption", "hashtags", "visual_hinweise", "cta"];
  if (plan.kind === "social_insert") {
    const external = typeof d.external_id === "string" && d.external_id
      ? d.external_id
      : `jarvis-${ctx.today}-${crypto.randomUUID().slice(0, 8)}`;
    const row: Record<string, unknown> = {
      workspace_id: ws,
      external_id: external,
      status: "Idee",
      updated_at: new Date().toISOString(),
    };
    for (const k of keys) if (k in d) row[k] = d[k];
    const { data, error } = await sb.from("social_media_posts").insert(row).select("id").single();
    if (error) throw new Error(dbErr(error.message));
    return String(data.id);
  }
  let q = sb.from("social_media_posts").select("id, status").limit(1);
  if (d.id) q = q.eq("id", String(d.id));
  else q = q.eq("external_id", String(d.external_id));
  const found = await q.maybeSingle();
  if (found.error) throw new Error(dbErr(found.error.message));
  if (!found.data) throw new Error("Post nicht gefunden oder kein Zugriff.");
  if (!socialUpdateAllowed(found.data.status)) throw new Error("Veröffentlichte Posts ändert Jarvis nicht.");
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of keys) if (k in d) patch[k] = d[k];
  const { error } = await sb.from("social_media_posts").update(patch).eq("id", found.data.id);
  if (error) throw new Error(dbErr(error.message));
  return String(found.data.id);
}

function logAction(sb: SupabaseClient, ws: string, userId: string, plan: Plan, recordId: string): Promise<string | null> {
  return logRow(sb, ws, userId, plan.table, recordId, plan.action, {
    tool: plan.tool,
    kind: plan.kind,
    lines: plan.lines.slice(0, 12),
    bot: plan.bot,
  });
}

async function logRow(
  sb: SupabaseClient,
  ws: string,
  userId: string,
  table: string,
  recordId: string,
  action: "insert" | "update",
  summary: Record<string, unknown>,
): Promise<string | null> {
  const { error } = await sb.from("jarvis_actions").insert({
    workspace_id: ws,
    user_id: userId,
    table_name: table,
    record_id: recordId,
    action,
    summary,
  });
  if (!error) return null;
  return "Gespeichert, aber das Protokoll jarvis_actions fehlt noch. Migration anwenden.";
}

function runRead(
  sb: SupabaseClient,
  userId: string,
  name: string,
  input: unknown,
  ctx: Ctx,
): Promise<{ forModel: unknown; ui: { panel: string; data: unknown } | null }> {
  const o = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  if (name === "search_contacts") return searchContacts(sb, o);
  if (name === "pipeline_summary") return pipeline(sb);
  if (name === "list_invoices") return invoices(sb, userId, o, ctx);
  if (name === "list_tasks_and_events") return agenda(sb, o, ctx);
  if (name === "list_social_posts") return posts(sb, o, ctx);
  if (name === "open_area") return openArea(sb, userId, o, ctx);
  if (name === "morning_briefing") return morningBriefing(sb, userId, ctx);
  if (name === "customer_file") return customerFile(sb, o, ctx);
  throw new Error("Unbekanntes Lesewerkzeug.");
}

async function searchContacts(sb: SupabaseClient, o: Record<string, unknown>) {
  const limit = Math.min(25, Math.max(1, Number(o.limit) || 12));
  let q = sb.from("contacts")
    .select("id, firma, person, email, tel, ort, branche, status, quelle, deal_wert, naechster_schritt, naechster_schritt_text, archiviert")
    .limit(limit);
  const query = likeSafe(o.query);
  if (query) q = q.or(`firma.ilike.%${query}%,person.ilike.%${query}%,email.ilike.%${query}%,ort.ilike.%${query}%`);
  const st = typeof o.status === "string" ? o.status.toLowerCase() : "";
  if (["lead", "erstgespraech", "angebot", "gewonnen", "verloren"].includes(st)) q = q.eq("status", st);
  const { data, error } = await q;
  if (error) throw new Error(dbErr(error.message));
  const rows = (data ?? []).filter((c) => !c.archiviert);
  const lanes = emptyLanes();
  let volume = 0;
  for (const c of rows) {
    const status = String(c.status || "lead");
    if (!lanes[status]) continue;
    const deal = c.deal_wert == null ? null : Number(c.deal_wert);
    if (deal && ["lead", "erstgespraech", "angebot"].includes(status)) volume += deal;
    lanes[status].push(card(c));
  }
  const counts = countLanes(lanes);
  const ui = {
    panel: "pipeline",
    data: { scope: "search", query: query || "", counts, volume_netto: round2(volume), lanes },
  };
  return {
    ui,
    forModel: {
      hinweis: rows.length ? "Suchergebnis, nicht die ganze Pipeline." : "Keine passenden Kontakte.",
      anzahl: rows.length,
      kontakte: rows.map((c) => ({
        id: c.id,
        firma: c.firma,
        person: c.person,
        ort: c.ort,
        status: c.status,
        quelle: c.quelle,
        deal_wert_netto: c.deal_wert,
        naechster_schritt: c.naechster_schritt,
        naechster_schritt_text: c.naechster_schritt_text,
      })),
    },
  };
}

async function pipeline(sb: SupabaseClient) {
  const { data, error } = await sb.from("contacts")
    .select("id, firma, person, ort, status, quelle, deal_wert, naechster_schritt, naechster_schritt_text, archiviert")
    .limit(500);
  if (error) throw new Error(dbErr(error.message));
  const rows = (data ?? []).filter((c) => !c.archiviert);
  const lanes = emptyLanes();
  let volume = 0;
  for (const c of rows) {
    const status = String(c.status || "lead");
    if (!lanes[status]) continue;
    const deal = c.deal_wert == null ? null : Number(c.deal_wert);
    if (deal && ["lead", "erstgespraech", "angebot"].includes(status)) volume += deal;
    if (lanes[status].length < 8) lanes[status].push(card(c));
  }
  const counts = countAll(rows);
  return {
    ui: { panel: "pipeline", data: { scope: "all", counts, volume_netto: round2(volume), lanes, truncated: rows.length >= 500 } },
    forModel: {
      hinweis: rows.length ? "Live aus dem CRM." : "Keine Kontakte im Workspace.",
      counts,
      volume_netto: round2(volume),
      truncated: rows.length >= 500,
      beispiele: Object.fromEntries(Object.entries(lanes).map(([k, v]) => [k, v.slice(0, 5)])),
    },
  };
}

async function invoices(sb: SupabaseClient, userId: string, o: Record<string, unknown>, ctx: Ctx) {
  const scope = o.scope === "overdue" || o.scope === "drafts" ? o.scope : "open";
  const { data, error } = await sb.from("rechnungen")
    .select("id, nr, kunde_id, betreff, datum, faellig, status, positions, archiviert")
    .limit(300);
  if (error) throw new Error(dbErr(error.message));
  const tax = await loadTax(sb, userId);
  const all = (data ?? []).filter((r) => !r.archiviert);
  const open = all.filter((r) => r.status === "offen-rg" || r.status === "ueberfaellig");
  const drafts = all.filter((r) => r.status === "entwurf");
  const mapped = await mapInvoices(sb, scope === "drafts" ? drafts : open, tax, ctx.today);
  const shown = scope === "overdue" ? mapped.filter((r) => r.overdue) : mapped;
  const sum_netto = round2(shown.reduce((s, r) => s + r.netto, 0));
  const sum_brutto = tax ? round2(shown.reduce((s, r) => s + (r.brutto ?? r.netto), 0)) : null;
  const payload = {
    scope,
    sum_netto,
    sum_brutto,
    mwst_known: !!tax,
    mwst_hinweis: tax ? (tax.ku ? "Kleinunternehmer, keine MwSt." : `MwSt. ${Math.round(tax.rate * 100)} %`) : "MwSt.-Satz unbekannt, Beträge sind netto.",
    overdue_count: mapped.filter((r) => r.overdue).length,
    draft_count: drafts.length,
    open_count: open.length,
    invoices: shown.slice(0, 40),
  };
  return {
    ui: { panel: "invoices", data: payload },
    forModel: {
      ...payload,
      hinweis: shown.length ? "Live aus dem CRM. Entwürfe sind keine offenen Forderungen." : "Keine passenden Rechnungen.",
      invoices: shown.slice(0, 20).map(({ nr, kunde, netto, brutto, faellig, status, overdue, betreff }) => ({
        nr, kunde, netto, brutto, faellig, status, overdue, betreff,
      })),
    },
  };
}

async function agenda(sb: SupabaseClient, o: Record<string, unknown>, ctx: Ctx) {
  const range = rangeFor(o, ctx.today);
  const [tasksRes, evRes, wvRes] = await Promise.all([
    sb.from("aufgaben").select("id, titel, beschreibung, status, prioritaet, faellig, kontakt_id").limit(300),
    sb.from("kal_events").select("id, titel, datum, zeit, typ, kontakt_id, notiz").gte("datum", range.from).lte("datum", range.to).limit(80),
    sb.from("wiedervorlagen").select("id, text, datum, done, kontakt_id").eq("done", false).gte("datum", range.from).lte("datum", range.to).limit(80),
  ]);
  if (tasksRes.error) throw new Error(dbErr(tasksRes.error.message));
  if (evRes.error) throw new Error(dbErr(evRes.error.message));
  if (wvRes.error) throw new Error(dbErr(wvRes.error.message));
  const tasks = (tasksRes.data ?? []).filter((t) => {
    if (!t.faellig || t.status === "done") return false;
    if (t.faellig >= range.from && t.faellig <= range.to) return true;
    return range.scope === "today" && t.faellig < ctx.today && (t.status === "todo" || t.status === "doing");
  }).slice(0, 40).map((t) => ({
    titel: t.titel,
    faellig: t.faellig,
    status: t.status,
    prioritaet: t.prioritaet,
    bot: botFromText(t.beschreibung),
    overdue: !!(t.faellig && t.faellig < ctx.today && t.status !== "done"),
  }));
  const events = (evRes.data ?? []).map((e) => ({
    zeit: e.zeit || "",
    titel: e.titel,
    typ: e.typ || "termin",
    notiz: clipStr(e.notiz, 240),
    datum: e.datum,
  })).sort((a, b) => String(a.zeit).localeCompare(String(b.zeit)));
  const reminders = (wvRes.data ?? []).map((w) => ({ text: w.text, datum: w.datum }));
  const payload = { date: ctx.today, from: range.from, to: range.to, scope: range.scope, events, tasks, reminders };
  const empty = !events.length && !tasks.length && !reminders.length;
  return {
    ui: { panel: "agenda", data: payload },
    forModel: { ...payload, hinweis: empty ? "Keine Termine oder Aufgaben in diesem Zeitraum." : "Live aus dem CRM." },
  };
}

async function posts(sb: SupabaseClient, o: Record<string, unknown>, ctx: Ctx) {
  const week = weekRange(ctx.today);
  const from = typeof o.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.from) ? o.from : week.from;
  const to = typeof o.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.to) ? o.to : week.to;
  const { data, error } = await sb.from("social_media_posts")
    .select("id, external_id, datum, uhrzeit, format, saeule, hook, caption, hashtags, status, thema")
    .gte("datum", from).lte("datum", to)
    .order("datum", { ascending: true })
    .limit(60);
  if (error) throw new Error(dbErr(error.message));
  const list = data ?? [];
  const postsView = list.map((p) => ({
    datum: p.datum,
    uhrzeit: p.uhrzeit,
    format: p.format,
    saeule: p.saeule,
    hook: p.hook,
    caption: clipStr(p.caption, 500),
    hashtags: p.hashtags ?? [],
    status: p.status,
    thema: p.thema,
  }));
  return {
    ui: { panel: "content_week", data: { from, to, posts: postsView } },
    forModel: {
      from,
      to,
      anzahl: list.length,
      hinweis: list.length ? "Live aus dem CRM. Status Idee ist der Entwurf." : "Keine Posts in diesem Zeitraum.",
      posts: postsView.map((p) => ({ ...p, caption: clipStr(p.caption, 220) })),
    },
  };
}

function emptyLanes(): Record<string, Array<Record<string, unknown>>> {
  return { lead: [], erstgespraech: [], angebot: [], gewonnen: [], verloren: [] };
}

function card(c: { firma?: string | null; person?: string | null; ort?: string | null; quelle?: string | null; deal_wert?: number | null; naechster_schritt?: string | null }) {
  return {
    firma: c.firma || c.person || "Ohne Namen",
    person: c.person || "",
    ort: c.ort || "",
    quelle: c.quelle || "",
    deal_wert: c.deal_wert == null ? null : Number(c.deal_wert),
    naechster_schritt: c.naechster_schritt || null,
  };
}

function countLanes(lanes: Record<string, unknown[]>): Record<string, number> {
  return Object.fromEntries(Object.entries(lanes).map(([k, v]) => [k, v.length]));
}

function countAll(rows: Array<{ status?: string | null }>): Record<string, number> {
  const counts: Record<string, number> = { lead: 0, erstgespraech: 0, angebot: 0, gewonnen: 0, verloren: 0 };
  for (const r of rows) {
    const s = String(r.status || "lead");
    if (s in counts) counts[s] += 1;
  }
  return counts;
}

async function mapInvoices(
  sb: SupabaseClient,
  rows: Array<{ nr?: string | null; kunde_id?: string | null; betreff?: string | null; faellig?: string | null; status?: string | null; positions?: unknown }>,
  tax: { rate: number; ku: boolean } | null,
  today: string,
) {
  const ids = rows.map((r) => r.kunde_id).filter((id): id is string => !!id);
  const names = await contactNames(sb, ids);
  return rows.map((r) => {
    const netto = nettoOf(r.positions);
    const overdue = r.status === "ueberfaellig" || (r.status === "offen-rg" && !!r.faellig && r.faellig < today);
    return {
      nr: r.nr || "ohne Nr.",
      kunde: (r.kunde_id && names.get(r.kunde_id)) || "Ohne Kunde",
      netto,
      brutto: tax ? round2(netto * (1 + tax.rate)) : null,
      faellig: r.faellig,
      status: r.status,
      overdue,
      betreff: r.betreff || "",
    };
  });
}

function nettoOf(positions: unknown): number {
  if (!Array.isArray(positions)) return 0;
  return sumNetto(positions.map((p) => {
    const o = p && typeof p === "object" ? p as { optional?: boolean; total?: number; qty?: number; price?: number } : {};
    const total = Number.isFinite(Number(o.total)) ? Number(o.total) : (Number(o.qty) || 0) * (Number(o.price) || 0);
    return { optional: !!o.optional, total };
  }));
}

async function contactNames(sb: SupabaseClient, ids: string[]) {
  const uniq = [...new Set(ids)];
  const map = new Map<string, string>();
  if (!uniq.length) return map;
  const { data, error } = await sb.from("contacts").select("id, firma, person").in("id", uniq);
  if (error) return map;
  for (const c of data ?? []) map.set(c.id, c.firma || c.person || "Ohne Namen");
  return map;
}

async function loadTax(sb: SupabaseClient, userId: string): Promise<{ rate: number; ku: boolean } | null> {
  const { data, error } = await sb.from("settings").select("data").eq("user_id", userId).maybeSingle();
  if (error || !data?.data) return null;
  try {
    const s = typeof data.data === "string" ? JSON.parse(data.data) : data.data;
    const ku = !!s.kleinunternehmer;
    const rate = ku ? 0 : (parseFloat(s.mwst ?? "19") || 19) / 100;
    return { rate, ku };
  } catch {
    return null;
  }
}

async function assertContact(sb: SupabaseClient, id: string | null) {
  if (!id) return;
  const { data, error } = await sb.from("contacts").select("id").eq("id", id).maybeSingle();
  if (error) throw new Error(dbErr(error.message));
  if (!data) throw new Error("Kontakt nicht gefunden oder kein Zugriff.");
}

async function nextNr(sb: SupabaseClient, table: "angebote" | "rechnungen", prefix: "A" | "R") {
  const { data, error } = await sb.from(table).select("nr").limit(2000);
  if (error) throw new Error("Nummernkreis nicht lesbar.");
  let max = 0;
  for (const r of data ?? []) {
    const n = parseInt(String(r.nr ?? "").replace(/\D/g, ""), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return prefix + String(max + 1).padStart(4, "0");
}

function note(text: string, today: string) {
  return { id: crypto.randomUUID(), typ: "notiz", text, datum: today, createdAt: new Date().toISOString() };
}

function rangeFor(o: Record<string, unknown>, today: string) {
  const iso = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
  const fromIn = iso(o.from);
  const toIn = iso(o.to);
  if (fromIn || toIn) {
    const from = fromIn || toIn;
    const to = toIn || fromIn;
    return { from, to: to < from ? from : to, scope: "range" };
  }
  if (o.scope === "week") {
    const w = weekRange(today);
    return { from: w.from, to: w.to, scope: "week" };
  }
  return { from: today, to: today, scope: "today" };
}

function likeSafe(v: unknown): string {
  return String(v ?? "").replace(/[%_\\*,().]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function stripNul(s: string): string {
  let out = "";
  for (const ch of s) if (ch.charCodeAt(0) !== 0) out += ch;
  return out;
}

function clipStr(v: unknown, max: number): string {
  return String(v ?? "").replace(/[<>]/g, "").slice(0, max);
}

function clipJson(v: unknown, max = 12000): string {
  const s = JSON.stringify(v);
  if (s.length <= max) return s;
  return JSON.stringify({ truncated: true, preview: s.slice(0, max) });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function dbErr(message: string): string {
  return `CRM-Abfrage fehlgeschlagen: ${message.replace(/\s+/g, " ").slice(0, 180)}`;
}

function anthropicErr(status: number, body: string): string {
  if (status === 401) return "Der Modellanbieter hat den Schlüssel abgelehnt.";
  if (status === 404) return "Das konfigurierte Modell (JARVIS_MODEL) ist nicht verfügbar.";
  let detail = "";
  try {
    const j = JSON.parse(body) as { error?: { message?: string } };
    detail = j.error?.message ? ` ${j.error.message.slice(0, 160)}` : "";
  } catch { /* raw */ }
  return `Das Sprachmodell antwortet gerade nicht (${status}).${detail}`;
}

function sanitizeMessages(input: unknown): Array<{ role: "user" | "assistant"; content: string }> {
  if (!Array.isArray(input)) throw new Error("messages fehlt.");
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of input.slice(-16)) {
    if (!m || typeof m !== "object") continue;
    const role = (m as { role?: string }).role;
    const content = (m as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    const text = stripNul(content).trim().slice(0, 8000);
    if (!text) continue;
    out.push({ role, content: text });
  }
  if (!out.length || out[out.length - 1].role !== "user") throw new Error("Die letzte Nachricht muss vom Nutzer kommen.");
  return out;
}

function bearer(header: string | null): string | null {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

function userClient(jwt: string): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) throw new Error("Supabase-Umgebung unvollständig (URL oder Anon-Key).");
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function allowedOrigin(origin: string): boolean {
  if (origin === "https://crm.viraloutlaws.de") return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function cors(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, prefer",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (origin && allowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
