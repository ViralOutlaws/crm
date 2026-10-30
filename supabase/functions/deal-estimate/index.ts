// Schätzt einen Deal-Wert. Prüft das Nutzer-JWT selbst. ANTHROPIC_API_KEY nur hier.
import { anthropicText, cors, json, userClient } from "../_shared/edge_auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);
  try {
    const { sb, workspaceId } = await userClient(req);
    const body = await req.json().catch(() => ({}));
    const contactId = String(body.contactId || "");
    const contact = await sb.from("contacts").select("id, firma, person, notes, ana, status, quelle").eq("id", contactId).maybeSingle();
    if (contact.error || !contact.data) return json({ error: "Kontakt fehlt" }, 404);
    const [wissen, pakete, angebote] = await Promise.all([
      sb.from("wissensbasis").select("section, content").eq("workspace_id", workspaceId),
      sb.from("pakete").select("name, preis, beschreibung").limit(40),
      sb.from("angebote").select("betreff, positions, status").eq("kunde_id", contactId).limit(8),
    ]);
    const c = contact.data;
    const prompt = [
      "Schätze einen netto Deal-Wert in Euro für eine Webdesign- und KI-Agentur.",
      "Erfinde keinen Preis, der nicht zu den Paketen oder alten Angeboten passt. Wenn unklar, nimm das nächste Paket und sag das.",
      "Antworte nur als JSON: {\"wert\":number,\"paket\":string,\"grund\":string}",
      "Wissensbasis: " + JSON.stringify(wissen.data || []).slice(0, 4000),
      "Pakete: " + JSON.stringify(pakete.data || []).slice(0, 4000),
      "Alte Angebote: " + JSON.stringify(angebote.data || []).slice(0, 3000),
      `Anfrage: ${c.firma} ${c.person || ""} ${c.notes || ""} ${c.ana || ""}`,
    ].join("\n");
    const raw = await anthropicText("Du antwortest nur mit JSON.", prompt, 400);
    let wert = 0, paket = "", grund = "Keine KI-Schätzung, bitte Wert setzen.";
    if (raw) {
      try {
        const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
        wert = Number(parsed.wert) || 0;
        paket = String(parsed.paket || "").slice(0, 160);
        grund = String(parsed.grund || "").slice(0, 400);
      } catch { /* Heuristik bleibt */ }
    }
    if (!wert) {
      const first = Array.isArray(pakete.data) ? pakete.data[0] as { name?: string; preis?: number } : null;
      wert = Number(first?.preis) || 0;
      paket = first?.name || "";
      grund = wert ? "Paketpreis aus der Wissensbasis, ohne KI." : grund;
    }
    await sb.from("contacts").update({
      ki_wert: wert || null,
      ki_paket: paket || null,
      ki_grund: grund,
      ki_override: false,
    }).eq("id", contactId);
    return json({ wert, paket, grund });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Fehler" }, 401);
  }
});
