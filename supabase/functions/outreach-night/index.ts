// Nachtlauf: ein kleines Gebiet, eine Branche, dann Entwürfe. Verschickt nichts.
// Cron: Header x-outreach-cron == OUTREACH_CRON_SECRET. Der Wert steht nicht im Repo.
import { createClient } from "npm:@supabase/supabase-js@2";
import { anthropicText, cors, json, userClient } from "../_shared/edge_auth.ts";
import { researchPage } from "../_shared/outreach_fetch.ts";
import { loadGuard } from "../_shared/outreach_db.ts";
import {
  MIN_OBSERVATIONS,
  assertPublicHttpUrl,
  draftUserPrompt,
  finalizeMail,
  observeSite,
  outreachSkip,
  parseMailJson,
  preferredPerson,
  readCompany,
  SUBSTANCE_LABEL,
  websiteDomain,
  type EmailArt,
  type Observation,
  type PortfolioRef,
} from "../_shared/outreach.ts";
import {
  DEFAULT_PROFILES,
  OVERPASS_OUT,
  SEARCH_AREAS,
  clampPrep,
  cleanTags,
  nextSearchCell,
  overpassQuery,
  readOverpass,
  withinPrepWindow,
  type SearchArea,
  type SearchProfile,
} from "../_shared/outreach_search.ts";

const WORKSPACE_ID = Deno.env.get("CRM_WORKSPACE_ID") || "566f2d4d-5b66-4ba8-b6a1-1edf413a1689";

type Sb = { from: (table: string) => any };

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

async function overpass(query: string): Promise<{ ok: true; urls: { url: string; name: string }[] } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      signal: AbortSignal.timeout(22000),
      headers: {
        "user-agent": "ViralOutlawsCRM/outreach",
        "content-type": "application/x-www-form-urlencoded",
        "accept": "application/json",
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (res.status === 429 || res.status === 504) return { ok: false, error: "Overpass ist gerade belegt. Der nächste Lauf versucht dasselbe Gebiet erneut." };
    if (!res.ok) return { ok: false, error: `Overpass antwortet mit ${res.status}` };
    return { ok: true, urls: readOverpass(await res.json()) };
  } catch {
    return { ok: false, error: "Overpass ist nicht erreichbar. Der nächste Lauf versucht dasselbe Gebiet erneut." };
  }
}

async function ensureAreas(sb: Sb) {
  const rows = SEARCH_AREAS.map((a) => ({ ...a }));
  for (let i = 0; i < rows.length; i += 40) {
    const part = await sb.from("outreach_areas").upsert(rows.slice(i, i + 40));
    if (part.error) throw new Error(part.error.message || "Gebiete nicht gespeichert");
  }
}

async function ensureProfiles(sb: Sb, workspaceId: string) {
  const have = await sb.from("outreach_profiles").select("id").eq("workspace_id", workspaceId).limit(1);
  if (have.error) throw new Error(have.error.message || "Profile nicht lesbar");
  if (have.data?.length) return;
  const ins = await sb.from("outreach_profiles").insert(DEFAULT_PROFILES.map((p, sort) => ({
    workspace_id: workspaceId,
    name: p.name,
    tags: cleanTags(p.tags),
    region: "Deutschland",
    enabled: true,
    sort,
  })));
  if (ins.error) throw new Error(ins.error.message || "Profile nicht angelegt");
}

async function ingestOne(sb: Sb, workspaceId: string, raw: string, meta: { branche: string; query: string; guess: boolean }) {
  const pub = assertPublicHttpUrl(raw);
  if (!pub.ok) return { ok: false as const, error: pub.error };
  const page = await researchPage(pub.url);
  if (!page.ok) return { ok: false as const, error: page.error };
  const read = readCompany({
    pageHtml: page.pageHtml,
    pageUrl: page.pageUrl,
    impressumHtml: page.impressumHtml,
    impressumUrl: page.impressumUrl,
    guess: meta.guess,
  });
  const observations = observeSite({
    pageHtml: page.pageHtml,
    pageUrl: page.pageUrl,
    impressumHtml: page.impressumHtml,
    impressumUrl: page.impressumUrl,
    contactHtml: page.contactHtml,
    contactUrl: page.contactUrl,
  });
  const known = await loadGuard(sb, workspaceId);
  const best = preferredPerson(read.people) || read.people[0];
  let skip = best
    ? outreachSkip({ email: best.email, domain: read.domain, ...known })
    : "Kein Ansprechpartner und keine Adresse gefunden";
  let status = skip ? (best ? "uebersprungen" : "fehler") : "recherchiert";
  if (!skip && observations.length < MIN_OBSERVATIONS) {
    skip = SUBSTANCE_LABEL;
    status = "duenn";
  }
  const inserted = await sb.from("outreach_targets").insert({
    workspace_id: workspaceId,
    source: "overpass",
    input_url: raw,
    query: meta.query,
    firma: read.firma || null,
    web: read.web,
    domain: read.domain || null,
    str: read.str || null,
    plz: read.plz || null,
    ort: read.ort || null,
    impressum_url: read.impressumUrl || null,
    excerpt: read.excerpt || null,
    branche: meta.branche || null,
    observations,
    status,
    skip_reason: skip,
    updated_at: new Date().toISOString(),
  }).select("id").single();
  if (inserted.error || !inserted.data) return { ok: false as const, error: inserted.error?.message || "Ziel nicht gespeichert" };
  if (read.people.length) {
    await sb.from("outreach_people").insert(read.people.map((p) => ({
      workspace_id: workspaceId,
      target_id: inserted.data.id,
      person: p.person || null,
      rolle: p.rolle || null,
      email: p.email,
      email_art: p.emailArt,
      hinweis: p.hinweis,
      adresse: p.adresse || null,
    })));
  }
  return { ok: true as const, targetId: String(inserted.data.id), status };
}

async function draftTargets(sb: Sb, workspaceId: string, targetIds: string[]) {
  if (!targetIds.length) return [];
  const people = await sb.from("outreach_people").select("id, target_id, person, rolle, email, email_art").eq("workspace_id", workspaceId).in("target_id", targetIds).limit(20);
  if (people.error) throw new Error(people.error.message || "Personen nicht lesbar");
  const known = await loadGuard(sb, workspaceId);
  const [wissen, refs] = await Promise.all([
    sb.from("wissensbasis").select("section, content").eq("workspace_id", workspaceId),
    sb.from("contacts").select("firma, branche, ort, web, notes, status, archiviert").eq("workspace_id", workspaceId).eq("status", "gewonnen").limit(8),
  ]);
  const references: PortfolioRef[] = (refs.data || []).filter((c: { archiviert?: boolean }) => !c.archiviert).map((c: { firma?: string; branche?: string; ort?: string; web?: string; notes?: string }) => ({
    firma: String(c.firma || ""),
    branche: c.branche || "",
    ort: c.ort || "",
    web: c.web || "",
    note: /@|\d{5,}|iban|€/i.test(String(c.notes || "")) ? "" : String(c.notes || "").replace(/\s+/g, " ").trim().slice(0, 160),
  }));
  const rank: Record<string, number> = { veroeffentlicht: 0, generisch: 1, vermutet: 2 };
  const list = [...(people.data || [])].sort((a: { email_art?: string }, b: { email_art?: string }) => (rank[String(a.email_art)] ?? 9) - (rank[String(b.email_art)] ?? 9));
  const drafted = new Set<string>();
  const created = [];
  for (const person of list) {
    const art = String(person.email_art || "generisch") as EmailArt;
    if (art === "vermutet" || drafted.has(String(person.target_id))) continue;
    const target = await sb.from("outreach_targets").select("id, firma, web, domain, status, skip_reason, observations, branche").eq("id", person.target_id).maybeSingle();
    const row = target.data;
    if (!row || row.status !== "recherchiert" || row.skip_reason) continue;
    const existing = await sb.from("outreach_drafts").select("id").eq("workspace_id", workspaceId).eq("target_id", row.id).limit(1);
    if (existing.data?.[0]) continue;
    const skip = outreachSkip({
      email: String(person.email || ""),
      domain: String(row.domain || ""),
      blocklist: known.blocklist,
      crm: known.crm,
      priorEmails: known.priorEmails,
      priorDomains: known.priorDomains.filter((d) => websiteDomain(d) !== websiteDomain(String(row.domain || ""))),
      rejectedEmails: known.rejectedEmails,
    });
    if (skip) continue;
    const observations = (Array.isArray(row.observations) ? row.observations : []) as Observation[];
    if (observations.length < MIN_OBSERVATIONS) continue;
    let mail = finalizeMail({
      person: String(person.person || ""),
      firma: String(row.firma || ""),
      observations,
      references,
      branche: row.branche,
      attempts: [],
    });
    if (!mail.ok) {
      const prompt = draftUserPrompt({
        wissen: wissen.data || [],
        references,
        firma: String(row.firma || ""),
        person: String(person.person || ""),
        rolle: String(person.rolle || ""),
        web: String(row.web || ""),
        branche: row.branche,
        observations,
      });
      const first = parseMailJson(await anthropicText("Du schreibst nur den JSON-Entwurf. Du versendest nichts.", prompt, 900));
      if (first) {
        mail = finalizeMail({
          person: String(person.person || ""),
          firma: String(row.firma || ""),
          observations,
          references,
          branche: row.branche,
          attempts: [first],
        });
      }
    }
    if (!mail.ok) {
      await sb.from("outreach_targets").update({ status: "duenn", skip_reason: SUBSTANCE_LABEL, updated_at: new Date().toISOString() }).eq("id", row.id);
      continue;
    }
    const inserted = await sb.from("outreach_drafts").insert({
      workspace_id: workspaceId,
      target_id: row.id,
      person_id: person.id,
      subject: mail.subject,
      body: mail.body,
      observations: mail.observations,
      status: "entwurf",
      email: String(person.email || "").toLowerCase(),
      email_art: art,
      guess_ok: false,
      unread: false,
      updated_at: new Date().toISOString(),
    }).select("id").single();
    if (inserted.error || !inserted.data) continue;
    drafted.add(String(row.id));
    known.priorEmails.push(String(person.email || "").toLowerCase());
    created.push(inserted.data.id);
  }
  return created;
}

async function runPrep(sb: Sb, workspaceId: string, manual: boolean) {
  await sb.from("outreach_settings").upsert({
    workspace_id: workspaceId,
    prep_from: 1,
    prep_until: 7,
    prep_target: 50,
    prep_batch: 3,
    prep_on: true,
  }, { onConflict: "workspace_id", ignoreDuplicates: true });
  const settings = await sb.from("outreach_settings").select("prep_from, prep_until, prep_target, prep_batch, prep_on, guess_emails").eq("workspace_id", workspaceId).maybeSingle();
  if (settings.error) return { error: settings.error.message || "Einstellungen nicht lesbar" };
  const prep = clampPrep(settings.data || {});
  if (!manual) {
    const open = withinPrepWindow(new Date(), { on: prep.prep_on, from: prep.prep_from, until: prep.prep_until });
    if (!open.ok) return { ok: true, skipped: open.reason, queue: null, target: prep.prep_target };
  }
  const waiting = await sb.from("outreach_drafts").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "entwurf");
  const queue = waiting.count || 0;
  if (queue >= prep.prep_target) return { ok: true, skipped: "Ziel erreicht", queue, target: prep.prep_target };

  const cutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const locked = await sb.from("outreach_settings").update({ prep_running_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .or(`prep_running_at.is.null,prep_running_at.lt.${cutoff}`)
    .select("workspace_id");
  if (locked.error) return { error: locked.error.message || "Lauf nicht gesperrt" };
  if (!locked.data?.length) return { ok: true, skipped: "Ein Lauf ist schon unterwegs.", queue, target: prep.prep_target };

  try {
    await ensureAreas(sb);
    await ensureProfiles(sb, workspaceId);
    const [profilesRes, areasRes] = await Promise.all([
      sb.from("outreach_profiles").select("id, name, tags, region, enabled, sort").eq("workspace_id", workspaceId).order("sort"),
      sb.from("outreach_areas").select("id, name, state, south, west, north, east, sort").order("sort"),
    ]);
    if (profilesRes.error) throw new Error(profilesRes.error.message);
    if (areasRes.error) throw new Error(areasRes.error.message);
    const profiles = (profilesRes.data || []) as SearchProfile[];
    const areas = (areasRes.data || []) as SearchArea[];

    let pool = await sb.from("outreach_pool").select("id, url, profile_id, area_id").eq("workspace_id", workspaceId).order("created_at").limit(prep.prep_batch);
    if (pool.error) throw new Error(pool.error.message);
    let profileName = "";
    let areaName = "";
    let queried = false;

    if (!pool.data?.length) {
      const coverage = await sb.from("outreach_coverage").select("profile_id, area_id, searched_at").eq("workspace_id", workspaceId).limit(5000);
      if (coverage.error) throw new Error(coverage.error.message);
      const cell = nextSearchCell(
        profiles.map((p) => ({ ...p, tags: p.tags || [], region: p.region || "Deutschland", enabled: p.enabled !== false, sort: Number(p.sort) || 0 })),
        areas,
        (coverage.data || []).map((c: { profile_id: string; area_id: string; searched_at: string }) => ({
          profileId: c.profile_id,
          areaId: c.area_id,
          searchedAt: c.searched_at,
        })),
      );
      if (!cell) return { ok: true, skipped: "Kein Profil ist eingeschaltet.", queue, target: prep.prep_target };
      profileName = cell.profile.name;
      areaName = cell.area.name;
      const query = overpassQuery(cell.profile.tags, cell.area);
      const found = await overpass(query);
      queried = true;
      if (!found.ok) return { ok: false, error: found.error, profile: profileName, area: areaName, queue, target: prep.prep_target };
      const marked = await sb.from("outreach_coverage").upsert({
        workspace_id: workspaceId,
        profile_id: cell.profile.id,
        area_id: cell.area.id,
        searched_at: new Date().toISOString(),
        hits: found.urls.length,
      }, { onConflict: "workspace_id,profile_id,area_id" });
      if (marked.error) throw new Error(marked.error.message);
      const known = await loadGuard(sb, workspaceId);
      const existing = await sb.from("outreach_targets").select("domain").eq("workspace_id", workspaceId).limit(1000);
      const taken = new Set<string>([
        ...known.priorDomains.map((d) => websiteDomain(d)),
        ...known.crm.map((c) => c.domain),
        ...(existing.data || []).map((t: { domain?: string }) => websiteDomain(String(t.domain || ""))),
      ].filter(Boolean));
      const fresh = found.urls.filter((u) => {
        const domain = websiteDomain(u.url);
        return domain && !taken.has(domain);
      }).slice(0, OVERPASS_OUT);
      if (fresh.length) {
        const saved = await sb.from("outreach_pool").upsert(fresh.map((u) => ({
          workspace_id: workspaceId,
          url: u.url,
          name: u.name || null,
          profile_id: cell.profile.id,
          area_id: cell.area.id,
        })), { onConflict: "workspace_id,url", ignoreDuplicates: true });
        if (saved.error) throw new Error(saved.error.message);
      }
      pool = await sb.from("outreach_pool").select("id, url, profile_id, area_id").eq("workspace_id", workspaceId).order("created_at").limit(prep.prep_batch);
      if (pool.error) throw new Error(pool.error.message);
    }

    const batch = pool.data || [];
    const researched: string[] = [];
    const errors: string[] = [];
    const guess = settings.data?.guess_emails === true;
    for (const item of batch) {
      const profile = profiles.find((p) => p.id === item.profile_id);
      const area = areas.find((a) => a.id === item.area_id);
      if (!profileName) profileName = profile?.name || "";
      if (!areaName) areaName = area?.name || "";
      try {
        const stored = await ingestOne(sb, workspaceId, String(item.url), {
          branche: profile?.name || profileName,
          query: [profile?.name || profileName, area?.name || areaName].filter(Boolean).join(" · "),
          guess,
        });
        if (stored.ok && stored.status === "recherchiert") researched.push(stored.targetId);
        else if (!stored.ok) errors.push(stored.error);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "Fehler");
      }
      await sb.from("outreach_pool").delete().eq("id", item.id);
    }
    const created = await draftTargets(sb, workspaceId, researched);
    const after = await sb.from("outreach_drafts").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "entwurf");
    return {
      ok: true,
      profile: profileName,
      area: areaName,
      queried,
      read: batch.length,
      drafted: created.length,
      errors: errors.slice(0, 3),
      queue: after.count || queue,
      target: prep.prep_target,
    };
  } finally {
    await sb.from("outreach_settings").update({ prep_running_at: null }).eq("workspace_id", workspaceId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);
  try {
    if (cronAuthorized(req)) {
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      const url = Deno.env.get("SUPABASE_URL") || "";
      if (!key || !url) return json({ error: "Nachtlauf ist serverseitig nicht eingerichtet" }, 500);
      const sb = createClient(url, key, { auth: { persistSession: false } });
      const result = await runPrep(sb, WORKSPACE_ID, false);
      return json(result, result.error ? 400 : 200);
    }
    const { sb, workspaceId } = await userClient(req);
    const body = await req.json().catch(() => ({}));
    if (String(body.op || "run") !== "run") return json({ error: "Unbekannte Operation" }, 400);
    const result = await runPrep(sb, workspaceId, true);
    return json(result, result.error ? 400 : 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Fehler" }, 400);
  }
});
