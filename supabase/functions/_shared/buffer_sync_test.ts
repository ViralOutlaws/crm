import { assertEquals } from "jsr:@std/assert@1";
import { berlinParts, buildPatch, type BufferPost, crmFormat, removedPatch } from "./buffer_sync.ts";

const CH = "6af8e4ed62b70b94b0345d48";
const reel: BufferPost = {
  id: "6af8e5d9b9a106584c73c08e", status: "scheduled", channelId: CH,
  text: "So verliert ein Betrieb eine Anfrage.\n\nText #memmingen #allgäu",
  dueAt: "2026-11-16T16:30:00.000Z", sentAt: null, externalLink: null,
  assets: [{ type: "video", mimeType: "video/mp4", source: "https://viraloutlaws.github.io/vo-media/reel3-anfrageweg.mp4", thumbnail: "https://images.buffer.com/t" }],
  metadata: { type: "reel" },
};

Deno.test("Berlin-Zeit inkl. Sommer-/Winterzeit", () => {
  assertEquals(berlinParts("2026-10-19T16:30:28.000Z").uhrzeit, "18:30");
  assertEquals(berlinParts("2026-11-16T16:30:00.000Z"), { datum: "2026-11-16", uhrzeit: "17:30", wd: "Mo", de: "16.11.2026" });
  assertEquals(berlinParts("2026-11-16T23:30:00.000Z").datum, "2026-11-17");
});

Deno.test("Format-Mapping", () => {
  assertEquals(crmFormat(reel), "Reel");
  assertEquals(crmFormat({ ...reel, metadata: { type: "story" } }), "Story");
  assertEquals(crmFormat({ ...reel, metadata: { type: "post" } }), "Beitrag");
  assertEquals(crmFormat({ ...reel, metadata: { type: "post" }, assets: [reel.assets![0], reel.assets![0]] }), "Karussell");
});

Deno.test("Neuer geplanter Post", () => {
  const p = buildPatch(reel, null, CH)!;
  assertEquals(p.status, "Geplant");
  assertEquals(p.datum, "2026-11-16");
  assertEquals(p.uhrzeit, "17:30");
  assertEquals(p.format, "Reel");
  assertEquals(p.format_detail, "Reel – Buffer geplant, Mo 16.11.2026 17:30 Europe/Berlin");
  assertEquals(p.hashtags, ["#memmingen", "#allgäu"]);
  assertEquals(p.quelle, "Buffer");
  assertEquals(p.thema, "So verliert ein Betrieb eine Anfrage.");
  assertEquals((p.assets as unknown[]).length, 1);
  assertEquals((p.meta as Record<string, unknown>).buffer_status, "scheduled");
});

Deno.test("Veröffentlicht: Buffer-Felder neu, CRM-Felder bleiben, keine Änderung = null", () => {
  const existing = { id: "x", external_id: reel.id, saeule: "KI", freigabe: "ok", thema: "Reel 3", hook: "Hook", cta: "c", format_detail: "Reel – Buffer geplant, Mo 16.11.2026 17:30 Europe/Berlin", ...buildPatch(reel, null, CH)! };
  existing.thema = "Reel 3";
  const sent = { ...reel, status: "sent", sentAt: "2026-11-16T16:30:05.000Z", externalLink: "https://www.instagram.com/reel/ABC/" };
  const p = buildPatch(sent, existing, CH)!;
  assertEquals(p.status, "Veröffentlicht");
  assertEquals(p.quelle, "https://www.instagram.com/reel/ABC/");
  assertEquals(p.format_detail, "Reel – veröffentlicht auf Instagram");
  assertEquals("saeule" in p || "freigabe" in p || "thema" in p || "cta" in p, false);
  assertEquals(buildPatch(sent, { ...existing, ...p }, CH), null);
});

Deno.test("Fehler bleibt Geplant, Storage-Assets bleiben", () => {
  const stored = [{ path: "ws/x/a.mp4", filename: "a.mp4", type: "video", order: 1 }];
  const existing = { id: "x", external_id: reel.id, assets: stored, format_detail: "Reel – manuell; lokale Dateien", meta: { source: "buffer" } };
  const p = buildPatch({ ...reel, status: "error", error: { message: "IG down" } }, existing, CH)!;
  assertEquals(p.status, "Geplant");
  assertEquals("assets" in p, false);
  assertEquals("format_detail" in p, false);
  assertEquals((p.meta as Record<string, unknown>).buffer_status, "error");
  assertEquals((p.meta as Record<string, unknown>).buffer_error, "IG down");
});

Deno.test("Entfernt: nur geplante Buffer-Zeilen, manuelle nie", () => {
  const seen = new Set<string>();
  assertEquals((removedPatch({ external_id: reel.id, status: "Geplant", meta: { buffer_status: "scheduled" } }, seen)!.meta as Record<string, unknown>).buffer_status, "removed");
  assertEquals(removedPatch({ external_id: reel.id, status: "Veröffentlicht", meta: {} }, seen), null);
  assertEquals(removedPatch({ external_id: "manuell-1", status: "Geplant", meta: {} }, seen), null);
  assertEquals(removedPatch({ external_id: reel.id, status: "Geplant", meta: {} }, new Set([reel.id])), null);
});
