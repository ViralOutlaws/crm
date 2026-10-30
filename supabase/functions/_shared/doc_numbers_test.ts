import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  assertRaisedNext,
  canonicalKunde,
  docFileStem,
  docSubjectLine,
  formatDoc,
  formatKunde,
  isLegacyDocNr,
  isNewSchemeNr,
  parseNewDocNr,
} from "./doc_numbers.ts";

Deno.test("Kundennummer ist KD- und fünf Stellen ab 10001", () => {
  assertEquals(formatKunde(10001), "KD-10001");
  assertEquals(formatKunde(42), "KD-00042");
  assertEquals(canonicalKunde("kd10001"), "KD-10001");
  assertEquals(canonicalKunde("KD-10001"), "KD-10001");
  assertEquals(canonicalKunde("KD 10002"), "KD-10002");
  assertEquals(canonicalKunde("Atelier"), null);
});

Deno.test("Belegnummern nach Art und Jahr, Altnummern bleiben erkennbar", () => {
  assertEquals(formatDoc("rechnung", 2026, 1001), "RE-2026-1001");
  assertEquals(formatDoc("angebot", 2026, 1004), "AN-2026-1004");
  assertEquals(formatDoc("gutschrift", 2026, 1001), "GS-2026-1001");
  assertEquals(parseNewDocNr("RE-2026-1001")?.seq, 1001);
  assertEquals(parseNewDocNr("R007"), null);
  assertEquals(isLegacyDocNr("R007"), true);
  assertEquals(isLegacyDocNr("A0012"), true);
  assertEquals(isLegacyDocNr("RE-2026-1001"), false);
  assertEquals(isLegacyDocNr("R0001"), true);
  assertEquals(isNewSchemeNr("R0001"), false);
  assertEquals(isNewSchemeNr("RE-2026-1001"), true);
});

Deno.test("Startwert nur über der letzten vergebenen Nummer", () => {
  assertRaisedNext(1000, 1001);
  assertRaisedNext(1005, 1100);
  assertThrows(() => assertRaisedNext(1005, 1005));
  assertThrows(() => assertRaisedNext(1005, 1001));
  assertThrows(() => assertRaisedNext(1000, 1000));
});

Deno.test("Titel, Betreff und Dateiname", () => {
  assertEquals(docSubjectLine("Rechnung", "RE-2026-1001", "Website-Relaunch"), "Rechnung RE-2026-1001 – Website-Relaunch");
  assertEquals(docSubjectLine("Angebot", "AN-2026-1001", ""), "Angebot AN-2026-1001");
  assertEquals(docFileStem("rechnung", "RE-2026-1001", "Atelier Lumen"), "Rechnung_RE-2026-1001_Atelier_Lumen");
  assertEquals(docFileStem("angebot", "AN-2026-1001", "Nordbahn Digital"), "Angebot_AN-2026-1001_Nordbahn_Digital");
  assertEquals(docFileStem("gutschrift", "GS-2026-1001", "Müller & Söhne"), "Gutschrift_GS-2026-1001_Muller_Sohne");
});
