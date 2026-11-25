// Öffentliche HTML-Seiten. Keine internen Adressen, keine unbegrenzte Größe.
import { assertPublicHttpUrl, findContactUrl, findImpressumUrl } from "./outreach.ts";

type Fetched = { ok: true; html: string; finalUrl: string } | { ok: false; error: string };

export async function fetchPublic(raw: string, hops = 0): Promise<Fetched> {
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

export async function researchPage(raw: string): Promise<
  | { ok: false; url: string; error: string }
  | {
    ok: true;
    pageHtml: string;
    pageUrl: string;
    impressumHtml: string;
    impressumUrl: string;
    contactHtml: string;
    contactUrl: string;
  }
> {
  const page = await fetchPublic(raw);
  if (!page.ok) return { ok: false, url: raw, error: page.error };
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
  let contactHtml = "";
  let contactUrl = "";
  const contactLink = findContactUrl(page.html, page.finalUrl);
  if (contactLink && contactLink !== impressumUrl) {
    const contact = await fetchPublic(contactLink);
    if (contact.ok) {
      contactHtml = contact.html;
      contactUrl = contact.finalUrl;
    }
  }
  return { ok: true, pageHtml: page.html, pageUrl: page.finalUrl, impressumHtml, impressumUrl, contactHtml, contactUrl };
}
