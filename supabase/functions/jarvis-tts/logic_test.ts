import { allowedOrigin, DEFAULT_MODEL, DEFAULT_SPEED, DEFAULT_VOICE, FAST_MODEL, MAX_TEXT, prepareContext, prepareText, resolveModel, resolveSpeed, resolveVoice } from "./logic.ts";

function eq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
}

Deno.test("Origin wie jarvis-chat", () => {
  eq(allowedOrigin("https://crm.viraloutlaws.de"), true, "crm");
  eq(allowedOrigin("http://localhost:8765"), true, "localhost");
  eq(allowedOrigin("http://127.0.0.1:54321"), true, "loopback");
  eq(allowedOrigin("https://127.0.0.1"), true, "https loopback");
  eq(allowedOrigin("https://evil.example"), false, "fremd");
  eq(allowedOrigin("https://crm.viraloutlaws.de.evil"), false, "suffix");
});

Deno.test("Modell: Standard, Flash, sonst Standard", () => {
  eq(resolveModel(undefined), DEFAULT_MODEL, "default");
  eq(resolveModel(""), DEFAULT_MODEL, "leer");
  eq(resolveModel(FAST_MODEL), FAST_MODEL, "flash");
  eq(resolveModel("eleven_turbo_v2"), DEFAULT_MODEL, "fremd");
});

Deno.test("Stimme aus der Umgebung, sonst der Standard", () => {
  eq(resolveVoice(undefined), DEFAULT_VOICE, "default");
  eq(resolveVoice("amAPTcyESqCO9CgYuf64"), DEFAULT_VOICE, "gleich");
  eq(resolveVoice("AbCdEfGhIj1234567890"), "AbCdEfGhIj1234567890", "eigene");
  eq(resolveVoice("../etc"), DEFAULT_VOICE, "pfad");
  eq(resolveVoice("kurz"), DEFAULT_VOICE, "kurz");
});

Deno.test("Tempo wird auf 0.7 bis 1.2 geklemmt", () => {
  eq(resolveSpeed(undefined), DEFAULT_SPEED, "default");
  eq(DEFAULT_SPEED, 1.2, "standard");
  eq(resolveSpeed(""), DEFAULT_SPEED, "leer");
  eq(resolveSpeed("1.15"), 1.15, "punkt");
  eq(resolveSpeed("1,15"), 1.15, "komma");
  eq(resolveSpeed("0.7"), 0.7, "min");
  eq(resolveSpeed("1.2"), 1.2, "max");
  eq(resolveSpeed("0.69"), 0.7, "zu langsam");
  eq(resolveSpeed("1.21"), 1.2, "zu schnell");
  eq(resolveSpeed("schnell"), DEFAULT_SPEED, "text");
});

Deno.test("Text wird geprüft und leer abgelehnt", () => {
  eq(prepareText("  Hallo Kim.  "), "Hallo Kim.", "trim");
  eq(prepareText("Zeile\u0000 zwei"), "Zeile zwei", "nul");
  let missing = false;
  try { prepareText(""); } catch { missing = true; }
  if (!missing) throw new Error("leer");
  let blank = false;
  try { prepareText("   "); } catch { blank = true; }
  if (!blank) throw new Error("whitespace");
  let type = false;
  try { prepareText(12); } catch { type = true; }
  if (!type) throw new Error("zahl");
  let long = false;
  try { prepareText("a".repeat(MAX_TEXT + 1)); } catch { long = true; }
  if (!long) throw new Error("zu lang");
  eq([...prepareText("ä".repeat(MAX_TEXT))].length, MAX_TEXT, "grenze");
});

Deno.test("Kontext für den Übergang ist optional und gekürzt", () => {
  eq(prepareContext(undefined), "", "fehlt");
  eq(prepareContext(""), "", "leer");
  eq(prepareContext("  Hallo.  "), "Hallo.", "trim");
  eq(prepareContext("a".repeat(800)).length, 500, "grenze");
  eq(prepareContext(12), "", "zahl");
});
