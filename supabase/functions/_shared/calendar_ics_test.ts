import { assertEquals } from "jsr:@std/assert@1";
import { buildCalendar, feedWindow, foldLine, hashEqual, icsText } from "./calendar_ics.ts";

const from = "2026-09-19";
const to = "2027-10-19";

Deno.test("Fenster ist heute minus 30 bis plus 365", () => {
  assertEquals(feedWindow("2026-10-19"), { from, to });
});

Deno.test("Text escapen und Zeilen falten", () => {
  assertEquals(icsText("A, B; C\\D\nE"), "A\\, B\\; C\\\\D\\nE");
  const long = "SUMMARY:" + "ä".repeat(40);
  const folded = foldLine(long);
  assertEquals(folded.includes("\r\n "), true);
  for (const line of folded.split("\r\n")) {
    assertEquals(new TextEncoder().encode(line).length <= 75, true);
  }
});

Deno.test("Hash-Vergleich prüft die ganze Länge", () => {
  assertEquals(hashEqual("ab", "ab"), true);
  assertEquals(hashEqual("ab", "ac"), false);
  assertEquals(hashEqual("ab", "abc"), false);
});

Deno.test("Aufgabe ganztägig, Termin mit Zeit und ohne, außerhalb des Fensters weg", () => {
  const ics = buildCalendar({
    now: new Date("2026-10-19T08:00:00Z"),
    from,
    to,
    tasks: [
      { id: "t1", titel: "Angebot, Café", beschreibung: "Zeile 1\nZeile 2", faellig: "2026-10-20", status: "todo" },
      { id: "t2", titel: "Erledigt", faellig: "2026-10-20", status: "done" },
      { id: "t3", titel: "Zu alt", faellig: "2026-01-01", status: "todo" },
    ],
    events: [
      { id: "e1", titel: "Erstgespräch", datum: "2026-10-21", zeit: "09:30", notiz: "Büro" },
      { id: "e2", titel: "Ganzer Tag", datum: "2026-10-22", zeit: null },
      { id: "e3", titel: "Spät", datum: "2026-10-23", zeit: "23:30" },
    ],
  });
  assertEquals(ics.includes("X-WR-CALNAME:Viral Outlaws CRM"), true);
  assertEquals(ics.includes("REFRESH-INTERVAL;VALUE=DURATION:PT15M"), true);
  assertEquals(ics.includes("X-PUBLISHED-TTL:PT15M"), true);
  assertEquals(ics.includes("UID:aufgabe-t1@crm.viraloutlaws.de"), true);
  assertEquals(ics.includes("DTSTART;VALUE=DATE:20261020"), true);
  assertEquals(ics.includes("DTEND;VALUE=DATE:20261021"), true);
  assertEquals(ics.includes("SUMMARY:Angebot\\, Café"), true);
  assertEquals(ics.includes("DESCRIPTION:Zeile 1\\nZeile 2"), true);
  assertEquals(ics.includes("Erledigt"), false);
  assertEquals(ics.includes("Zu alt"), false);
  assertEquals(ics.includes("DTSTART;TZID=Europe/Berlin:20261021T093000"), true);
  assertEquals(ics.includes("DTEND;TZID=Europe/Berlin:20261021T103000"), true);
  assertEquals(ics.includes("DTSTART;VALUE=DATE:20261022"), true);
  assertEquals(ics.includes("DTSTART;TZID=Europe/Berlin:20261023T233000"), true);
  assertEquals(ics.includes("DTEND;TZID=Europe/Berlin:20261024T003000"), true);
  assertEquals(ics.endsWith("\r\n"), true);
});
