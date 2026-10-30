// Formate für Kunden- und Belegnummern. Die laufende, lückenarme Vergabe
// macht die Datenbank (next_doc_number / Trigger). Hier nur die reine Form.

export const DOC_SEQ_START = 1001;
export const KUNDE_START = 10001;

export type DocKind = "rechnung" | "angebot" | "gutschrift";

const PREFIX: Record<DocKind, string> = {
  rechnung: "RE",
  angebot: "AN",
  gutschrift: "GS",
};

export function formatKunde(n: number): string {
  return `KD-${String(n).padStart(5, "0")}`;
}

export function formatDoc(kind: DocKind, year: number, seq: number): string {
  return `${PREFIX[kind]}-${year}-${String(seq).padStart(4, "0")}`;
}

/** KD-10001, kd10001 oder „KD 10001“ werden zur gespeicherten Form. */
export function canonicalKunde(raw: string): string | null {
  const m = String(raw ?? "").trim().match(/^kd[-\s]?(\d{1,6})$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 1 || n > 99999) return null;
  return formatKunde(n);
}

export function parseNewDocNr(nr: string): { prefix: string; year: number; seq: number } | null {
  const m = /^(RE|AN|GS)-(\d{4})-(\d+)$/.exec(String(nr ?? "").trim());
  if (!m) return null;
  return { prefix: m[1], year: Number(m[2]), seq: Number(m[3]) };
}

/** Altnummern wie R007 oder A0012. Die bleiben, sie werden nicht umgeschrieben. */
export function isLegacyDocNr(nr: string): boolean {
  return /^[AR]\d+$/.test(String(nr ?? "").trim());
}

/** Neues Schema. Altnummern wie R0001 liegen absichtlich außerhalb. */
export function isNewSchemeNr(nr: string): boolean {
  return /^(RE|AN|GS)-\d{4}-\d+$/.test(String(nr ?? "").trim());
}

/**
 * Nächster Startwert darf nur über der zuletzt vergebenen Nummer liegen.
 * lastUsed 1000 bedeutet: noch nichts vergeben, 1001 ist erlaubt.
 */
export function assertRaisedNext(lastUsed: number, next: number): void {
  if (!Number.isInteger(next) || next < DOC_SEQ_START) {
    throw new Error(`Die nächste Nummer muss mindestens ${DOC_SEQ_START} sein.`);
  }
  if (next <= lastUsed) {
    throw new Error(`Die nächste Nummer muss über ${lastUsed} liegen.`);
  }
}

export function docKindLabel(kind: DocKind, rTyp?: string | null): string {
  if (kind === "angebot") return "Angebot";
  if (kind === "gutschrift" || rTyp === "gutschrift") return "Gutschrift";
  if (rTyp === "anzahlung") return "Anzahlungsrechnung";
  if (rTyp === "schluss") return "Schlussrechnung";
  return "Rechnung";
}

export function docFileKind(kind: DocKind): string {
  if (kind === "angebot") return "Angebot";
  if (kind === "gutschrift") return "Gutschrift";
  return "Rechnung";
}

export function docHeading(label: string, nr: string): string {
  return `${label} ${nr}`.trim();
}

export function docSubjectLine(label: string, nr: string, project: string): string {
  const head = docHeading(label, nr);
  const p = String(project ?? "").trim();
  return p ? `${head} – ${p}` : head;
}

export function sanitizeFirmaFile(firma: string): string {
  const t = String(firma ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return t || "Kunde";
}

/** Ohne .pdf: der Browser hängt die Endung beim Drucken an. */
export function docFileStem(kind: DocKind, nr: string, firma: string): string {
  const safeNr = String(nr ?? "ohne").replace(/[^A-Za-z0-9-]+/g, "") || "ohne";
  return `${docFileKind(kind)}_${safeNr}_${sanitizeFirmaFile(firma)}`;
}
