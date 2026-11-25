// Liest öffentliche Websites und das Impressum. Prüft das Nutzer-JWT selbst. Verschickt nichts.
import { cors, json, userClient } from "../_shared/edge_auth.ts";
import { loadGuard } from "../_shared/outreach_db.ts";
import {
  MAX_URLS,
  assertPublicHttpUrl,
  findImpressumUrl,
  outreachSkip,
  parseSearchLinks,
  preferredPerson,
  readCompany,
  searchQuery,
  splitUrls,
} from "../_shared/outreach.ts";

type Fetched = { ok: true; html: string; finalUrl: string } | { ok: false; error: string };

async function fetchPublic(raw: string, hops = 0): Promise<Fetched> {
  if (hops > 3) return { ok: false, error: "Zu viele Weiterleitungen" };
  const pub = assertPublicHttpUrl(raw);
  if (!pub.ok) return pub;
  let res: Response;
  try {
    res = await fetch(pub.url, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "ViralOutlawsCRM/outreach", "accept": "text/html,application/xhtml+xml" },
    });
  } catch {
    return { ok: false, error: "Website nicht erreichbar" };
  }
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (!loc) return { ok: false, error: "Weiterleitung ohne Ziel" };
    try {
      return await fetchPublic(new URL(loc, pub.url).toString(), hops + 1);
    } catch {
      return { ok: false, error: "Weiterleitung ungültig" };
    }
  }
  if (!res.ok) return { ok: false, error: `Website antwortet mit ${res.status}` };
  const type = res.headers.get("content-type") || "";
  if (type && !/text\/html|application\/xhtml|text\/plain/i.test(type)) return { ok: false, error: "Keine HTML-Seite" };
  const reader = res.body?.getReader();
  if (!reader) return { ok: false, error: "Leere Antwort" };
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const step = await reader.read();
    if (step.done) break;
    total += step.value.byteLength;
    if (total > 400_000) {
      await reader.cancel();
      return { ok: false, error: "Seite ist zu groß" };
    }
    chunks.push(step.value);
  }
  const html = new TextDecoder().decode(chunks.reduce((acc, c) => {
    const next = new Uint8Array(acc.length + c.length);
    next.set(acc);
    next.set(c, acc.length);
    return next;
  }, new Uint8Array()));
  return { ok: true, html, finalUrl: pub.url };
}

async function searchWeb(query: string): Promise<{ ok: true; urls: string[] } | { ok: false; error: string }> {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "ViralOutlawsCRM/outreach", "accept": "text/html" },
    });
    if (!res.ok) return { ok: false, error: "Die Suche hat nicht geantwortet. Bitte die URLs direkt einfügen." };
    const urls = parseSearchLinks(await res.text()).slice(0, MAX_URLS);
    if (!urls.length) return { ok: false, error: "Die Suche hat keine Firmenwebsites geliefert. Bitte die URLs direkt einfügen." };
    return { ok: true, urls };
  } catch {
    return { ok: false, error: "Die Suche ist nicht erreichbar. Bitte die URLs direkt einfügen." };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);
  try {
    const { sb, workspaceId } = await userClient(req);
    const body = await req.json().catch(() => ({}));
    const guess = body.guess === true;
    const branche = String(body.branche || "").slice(0, 80);
    const region = String(body.region || "").slice(0, 80);
    let urls = splitUrls(Array.isArray(body.urls) ? body.urls.join("\n") : String(body.urls || ""));
    let query = "";
    if (!urls.length && branche && region) {
      query = searchQuery(branche, region);
      const found = await searchWeb(query);
      if (!found.ok) return json({ ok: false, error: found.error, targets: [] });
      urls = found.urls;
    }
    if (!urls.length) return json({ error: "URL oder Branche und Region fehlen" }, 400);
    const limited = urls.slice(0, MAX_URLS);
    const known = await loadGuard(sb, workspaceId);
    const targets = [];
    for (const raw of limited) {
      const pub = assertPublicHttpUrl(raw);
      if (!pub.ok) {
        targets.push({ url: raw, status: "fehler", error: pub.error });
        continue;
      }
      try {
        const page = await fetchPublic(pub.url);
        if (!page.ok) throw new Error(page.error);
        let impressumHtml = "";
        let impressumUrl = "";
        if (/impressum/i.test(page.finalUrl)) {
          impressumHtml = page.html;
          impressumUrl = page.finalUrl;
        } else {
          const link = findImpressumUrl(page.html, page.finalUrl);
          if (link) {
            const imp = await fetchPublic(link);
            if (imp.ok) {
              impressumHtml = imp.html;
              impressumUrl = imp.finalUrl;
            }
          }
        }
        const read = readCompany({ pageHtml: page.html, pageUrl: page.finalUrl, impressumHtml, impressumUrl, guess });
        const best = preferredPerson(read.people) || read.people[0];
        const skip = best
          ? outreachSkip({ email: best.email, domain: read.domain, ...known })
          : "Kein Ansprechpartner und keine Adresse gefunden";
        const status = skip ? (best ? "uebersprungen" : "fehler") : "recherchiert";
        const inserted = await sb.from("outreach_targets").insert({
          workspace_id: workspaceId,
          source: query ? "search" : "url",
          input_url: raw,
          query: query || null,
          firma: read.firma || null,
          web: read.web,
          domain: read.domain || null,
          str: read.str || null,
          plz: read.plz || null,
          ort: read.ort || null,
          impressum_url: read.impressumUrl || null,
          excerpt: read.excerpt || null,
          status,
          skip_reason: skip,
          updated_at: new Date().toISOString(),
        }).select("id").single();
        if (inserted.error || !inserted.data) throw new Error(inserted.error?.message || "Ziel nicht gespeichert");
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
        if (status === "recherchiert" || status === "uebersprungen") {
          known.priorDomains.push(read.domain);
          if (best?.email) known.priorEmails.push(best.email.toLowerCase());
        }
        targets.push({
          id: inserted.data.id,
          firma: read.firma,
          web: read.web,
          domain: read.domain,
          status,
          skip_reason: skip,
          people: read.people,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Fehler";
        targets.push({ url: raw, status: "fehler", error: message.slice(0, 180) });
      }
    }
    return json({ ok: true, limited: urls.length > MAX_URLS, targets });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Fehler" }, 400);
  }
});
