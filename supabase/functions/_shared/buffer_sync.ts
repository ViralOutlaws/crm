// Reine Mapping-Logik für den Buffer -> CRM Sync (ohne Netzwerk/DB), damit sie testbar ist.
// Buffer besitzt: status, datum, uhrzeit, caption, hashtags, format, quelle, meta.buffer_* (+ due_at, sent_at,
// external_link, instagram_type). Alles andere (saeule, freigabe, reel_skript, visual_hinweise, cta, thema, hook,
// Assets mit Storage-Pfad) gehört dem CRM und wird nur beim Anlegen vorbelegt.

export type BufferAsset = { type?: string | null; mimeType?: string | null; source?: string | null; thumbnail?: string | null };
export type BufferPost = {
  id: string;
  status: string;
  text?: string | null;
  dueAt?: string | null;
  sentAt?: string | null;
  updatedAt?: string | null;
  externalLink?: string | null;
  channelId?: string | null;
  assets?: BufferAsset[] | null;
  metadata?: { type?: string | null } | null;
  error?: { message?: string | null } | null;
};
export type Row = Record<string, unknown> & { id?: string; meta?: Record<string, unknown> | null; assets?: unknown };

export const BUFFER_ID = /^[0-9a-f]{24}$/;
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export function isBufferRow(r: Row): boolean {
  const ext = String(r.external_id ?? "");
  return BUFFER_ID.test(ext) || (r.meta as Record<string, unknown> | null)?.source === "buffer";
}

export function berlinParts(iso: string) {
  const d = new Date(iso);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  const wd = WEEKDAYS[["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday)];
  return { datum: `${p.year}-${p.month}-${p.day}`, uhrzeit: `${p.hour}:${p.minute}`, wd, de: `${p.day}.${p.month}.${p.year}` };
}

export function crmStatus(s: string) {
  return s === "sent" ? "Veröffentlicht" : "Geplant"; // scheduled, sending, error -> Geplant
}

export function crmFormat(p: BufferPost) {
  const t = (p.metadata?.type || "").toLowerCase();
  if (t === "reel") return "Reel";
  if (t === "story") return "Story";
  const media = (p.assets || []).filter((a) => a.type === "image" || a.type === "video").length;
  return media > 1 ? "Karussell" : "Beitrag";
}

export function hashtags(text: string) {
  return [...text.matchAll(/#[\p{L}\p{N}_]+/gu)].map((m) => m[0]).slice(0, 40);
}

const AUTO_DETAIL = /^(Reel|Story|Beitrag|Karussell)( \(\d+ Slides\))? – (Buffer geplant|veröffentlicht auf Instagram|Buffer-Fehler)/;

export function formatDetail(p: BufferPost, format: string) {
  const when = p.sentAt || p.dueAt;
  if (p.status === "sent") {
    const n = (p.assets || []).length;
    return `${format === "Karussell" ? `Karussell (${n} Slides)` : format} – veröffentlicht auf Instagram`;
  }
  if (p.status === "error") return `${format} – Buffer-Fehler beim Veröffentlichen`;
  if (!when) return `${format} – Buffer geplant`;
  const b = berlinParts(when);
  return `${format} – Buffer geplant, ${b.wd} ${b.de} ${b.uhrzeit} Europe/Berlin`;
}

function firstLine(text: string, max: number) {
  const l = text.split("\n").map((s) => s.trim()).find(Boolean) || "";
  return l ? l.slice(0, max) : null;
}

function basename(url: string) {
  try {
    const b = new URL(url).pathname.split("/").pop() || "";
    return /^[A-Za-z0-9._ ()-]{1,80}\.[a-z0-9]{2,5}$/i.test(b) ? b : "";
  } catch {
    return "";
  }
}

function extFor(mime: string | null | undefined, type: string) {
  const m = (mime || "").split("/")[1];
  return m ? (m === "jpeg" ? "jpg" : m.replace(/[^a-z0-9]/g, "")) : type === "video" ? "mp4" : "jpg";
}

export function bufferAssets(p: BufferPost, existing: unknown) {
  const old = Array.isArray(existing) ? (existing as Record<string, unknown>[]) : [];
  const list = (p.assets || []).filter((a) => a.source);
  return list.map((a, i) => {
    const prev = old.find((o) => o.url === a.source);
    const type = a.type === "video" ? "video" : a.type === "image" ? "image" : "file";
    const filename = (prev?.filename as string) ||
      basename(a.source!) && !/cdninstagram|backfill/.test(a.source!) && basename(a.source!) ||
      (list.length > 1 ? `slide_${String(i + 1).padStart(2, "0")}.${extFor(a.mimeType, type)}` : `${p.id}.${extFor(a.mimeType, type)}`);
    const out: Record<string, unknown> = { url: a.source, type, order: i + 1, filename };
    if (a.thumbnail) out.thumbnail = a.thumbnail;
    if (a.mimeType) out.content_type = a.mimeType;
    return out;
  });
}

/** Vom Sync gespeichertes Vorschaubild (Storage), zählt nicht als CRM-Datei. */
export const isThumbAsset = (a: unknown) => !!a && typeof a === "object" && (a as Record<string, unknown>).role === "thumbnail";

/** true, wenn Kim eigene Dateien (Storage-Pfad) hochgeladen hat; das Sync-Vorschaubild zählt nicht. */
export function hasStorageAssets(assets: unknown) {
  return Array.isArray(assets) &&
    assets.some((a) => a && typeof a === "object" && (a as Record<string, unknown>).path && !isThumbAsset(a));
}

/** Quelle für das Vorschaubild: Buffer-Thumbnail des ersten Mediums, sonst das Bild selbst. */
export function thumbSource(p: BufferPost): string | null {
  const a = (p.assets || []).find((x) => x.thumbnail || (x.type === "image" && x.source));
  return a ? (a.thumbnail || a.source || null) : null;
}

export const thumbPath = (workspaceId: string, bufferId: string) => `${workspaceId}/buffer/${bufferId}/thumb.jpg`;

export function currentThumb(assets: unknown): Record<string, unknown> | null {
  return Array.isArray(assets) ? (assets.find(isThumbAsset) as Record<string, unknown>) || null : null;
}

/** Ersetzt/ergänzt genau einen Vorschaubild-Eintrag, alle anderen Assets bleiben unverändert. */
export function withThumb(assets: unknown, thumb: Record<string, unknown>) {
  const rest = Array.isArray(assets) ? assets.filter((a) => !isThumbAsset(a)) : [];
  return [thumb, ...rest];
}

export function stableEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
  }
  return v ?? null;
}

/** Liefert die zu schreibenden Felder (Patch) oder null, wenn sich nichts ändert. */
export function buildPatch(p: BufferPost, existing: Row | null, channelId: string): Record<string, unknown> | null {
  const text = p.text || "";
  const when = p.sentAt || p.dueAt;
  const b = when ? berlinParts(when) : null;
  const format = crmFormat(p);
  const oldMeta = (existing?.meta || {}) as Record<string, unknown>;
  const meta: Record<string, unknown> = {
    ...oldMeta,
    source: "buffer",
    buffer_post_id: p.id,
    buffer_channel_id: p.channelId || channelId,
    buffer_status: p.status,
    due_at: p.dueAt ?? null,
    sent_at: p.sentAt ?? null,
    external_link: p.externalLink ?? null,
    instagram_type: p.metadata?.type ?? null,
  };
  if (p.status === "error") meta.buffer_error = p.error?.message || "Fehler beim Veröffentlichen";
  else delete meta.buffer_error;

  const patch: Record<string, unknown> = {
    status: crmStatus(p.status),
    datum: b?.datum ?? existing?.datum ?? null,
    uhrzeit: b?.uhrzeit ?? existing?.uhrzeit ?? null,
    caption: text.slice(0, 5000) || null,
    hashtags: hashtags(text),
    format,
    quelle: p.status === "sent" && p.externalLink ? p.externalLink : "Buffer",
  };

  const detail = existing?.format_detail as string | null | undefined;
  if (!existing || !detail || AUTO_DETAIL.test(detail) && !detail.includes(";")) patch.format_detail = formatDetail(p, format);

  // Assets: CRM-Dateien (Storage-Pfad) bleiben unangetastet, sonst Buffer-Medien spiegeln.
  if (!hasStorageAssets(existing?.assets)) {
    const assets = bufferAssets(p, existing?.assets);
    const thumb = currentThumb(existing?.assets);
    patch.assets = thumb ? withThumb(assets, thumb) : assets;
    meta.media_urls = assets.map((a) => a.url);
    if ("thumbnail" in oldMeta && assets[0]?.thumbnail) meta.thumbnail = assets[0].thumbnail;
  }
  patch.meta = meta;

  if (!existing) {
    return {
      ...patch,
      thema: firstLine(text, 120),
      hook: firstLine(text, 1000),
    };
  }
  if (!existing.thema) patch.thema = firstLine(text, 120);
  if (!existing.hook) patch.hook = firstLine(text, 1000);

  const changed = Object.fromEntries(Object.entries(patch).filter(([k, v]) => !stableEqual(v, existing[k])));
  return Object.keys(changed).length ? changed : null;
}

/** Geplante Buffer-Zeilen, die Buffer nicht mehr liefert -> meta.buffer_status='removed' (nicht löschen). */
export function removedPatch(r: Row, seen: Set<string>): Record<string, unknown> | null {
  if (!isBufferRow(r) || seen.has(String(r.external_id)) || r.status !== "Geplant") return null;
  const meta = (r.meta || {}) as Record<string, unknown>;
  if (meta.buffer_status === "removed") return null;
  return { meta: { ...meta, buffer_status: "removed", buffer_removed_at: new Date().toISOString() } };
}
