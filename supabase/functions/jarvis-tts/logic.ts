// Reine Hilfen für jarvis-tts. Kein Netz, kein Schlüssel.

export const DEFAULT_MODEL = "eleven_multilingual_v2";
export const FAST_MODEL = "eleven_flash_v2_5";
export const DEFAULT_VOICE = "amAPTcyESqCO9CgYuf64";
export const DEFAULT_SPEED = 1.2;
export const MIN_SPEED = 0.7;
export const MAX_SPEED = 1.2;
export const MAX_TEXT = 1500;

const MODELS = new Set([DEFAULT_MODEL, FAST_MODEL]);

export function allowedOrigin(origin: string): boolean {
  if (origin === "https://crm.viraloutlaws.de") return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export function resolveModel(raw: string | undefined): string {
  const v = String(raw ?? "").trim();
  return MODELS.has(v) ? v : DEFAULT_MODEL;
}

export function resolveVoice(raw: string | undefined): string {
  const v = String(raw ?? "").trim();
  return /^[A-Za-z0-9]{10,40}$/.test(v) ? v : DEFAULT_VOICE;
}

export function resolveSpeed(raw: string | undefined): number {
  const v = String(raw ?? "").trim().replace(",", ".");
  if (!v) return DEFAULT_SPEED;
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_SPEED;
  const clamped = Math.min(MAX_SPEED, Math.max(MIN_SPEED, n));
  return Math.round(clamped * 100) / 100;
}

export function prepareText(input: unknown, max = MAX_TEXT): string {
  if (typeof input !== "string") throw new Error("Text fehlt.");
  let text = "";
  for (const ch of input) {
    const c = ch.charCodeAt(0);
    if (c === 0 || (c < 32 && c !== 9 && c !== 10 && c !== 13)) continue;
    text += ch;
  }
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new Error("Text fehlt.");
  if ([...text].length > max) throw new Error("Text ist zu lang.");
  return text;
}
