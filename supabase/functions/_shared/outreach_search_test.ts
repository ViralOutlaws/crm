import { assertEquals } from "jsr:@std/assert";
import { clampGap, GAP_CHOICES } from "./outreach.ts";
import {
  DEFAULT_PROFILES,
  SEARCH_AREAS,
  areaIsSmall,
  areasForRegion,
  clampPrep,
  cleanTags,
  nextSearchCell,
  overpassQuery,
  readOverpass,
  activeAreas,
  plzInRegions,
  withinPrepWindow,
  type SearchArea,
  type SearchProfile,
} from "./outreach_search.ts";

Deno.test("Standardprofile sind anschaltbar und ohne Schreinerei oder Möbel", () => {
  const names = DEFAULT_PROFILES.map((p) => p.name);
  assertEquals(names.includes("Ärzte und Praxen"), true);
  assertEquals(names.includes("Maschinenbau und Industrie"), true);
  assertEquals(names.includes("Handwerk"), true);
  assertEquals(names.includes("Gastronomie"), true);
  assertEquals(names.includes("Kanzleien und Beratung"), true);
  assertEquals(names.includes("Salon und Fitness"), true);
  const tags = DEFAULT_PROFILES.flatMap((p) => p.tags);
  assertEquals(tags.some((t) => /doctor|dentist|physiotherapist/.test(t)), true);
  assertEquals(tags.some((t) => /electrician|plumber|painter|roofer|car_repair/.test(t)), true);
  assertEquals(tags.some((t) => /tax_advisor|lawyer|estate_agent|hairdresser|fitness_centre|restaurant/.test(t)), true);
  assertEquals(DEFAULT_PROFILES.every((p) => cleanTags(p.tags).join() === p.tags.join()), true);
  assertEquals(cleanTags(["craft=carpenter", "shop=furniture", "amenity=doctors", "schreiner=ja", "craft=joiner"]), ["amenity=doctors"]);
});

Deno.test("Gebiete bleiben klein und decken die Länder ab, ohne ganz Deutschland", () => {
  const states = new Set(SEARCH_AREAS.map((a) => a.state));
  for (const code of ["BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV", "NI", "NW", "RP", "SL", "SN", "ST", "SH", "TH"]) {
    assertEquals(states.has(code), true);
  }
  assertEquals(new Set(SEARCH_AREAS.map((a) => a.id)).size, SEARCH_AREAS.length);
  assertEquals(SEARCH_AREAS.every(areaIsSmall), true);
  const germany = { south: 47.2, west: 5.8, north: 55.1, east: 15.1 };
  assertEquals(areaIsSmall(germany), false);
});

Deno.test("Overpass-Abfrage ist ein Bezirk, mit Timeout und Website-Filter", () => {
  const area = SEARCH_AREAS.find((a) => a.id === "berlin-mitte")!;
  const query = overpassQuery(["amenity=doctors", "craft=carpenter", "amenity=dentist"], area);
  assertEquals(query.includes("[timeout:30]"), true);
  assertEquals(query.includes(`(${area.south},${area.west},${area.north},${area.east})`), true);
  assertEquals(query.includes('["website"]'), true);
  assertEquals(query.includes("amenity"), true);
  assertEquals(query.includes("carpenter"), false);
  assertEquals(query.includes("47.2,5.8,55.1,15.1"), false);
  assertEquals(overpassQuery([], area), "");
});

Deno.test("Overpass-Treffer ohne Website, Social und Schreinerei fallen weg", () => {
  const rows = readOverpass({
    elements: [
      { tags: { name: "Praxis Nord", website: "https://praxis.example.test/team" } },
      { tags: { name: "Praxis Nord Zweig", "contact:website": "www.praxis.example.test" } },
      { tags: { name: "Nur Karte", amenity: "doctors" } },
      { tags: { name: "Schreinerei Holm", website: "https://holm.example.test" } },
      { tags: { name: "Möbel Meier", website: "https://meier.example.test", shop: "furniture" } },
      { tags: { name: "Facebook Praxis", website: "https://facebook.com/praxis" } },
      { tags: { name: "Elektrik Süd", website: "elektrik.example.test" } },
    ],
  });
  assertEquals(rows.map((r) => r.name), ["Praxis Nord", "Elektrik Süd"]);
  assertEquals(rows[0].url.includes("praxis.example.test"), true);
});

Deno.test("Die Nacht merkt sich Gebiete und fängt nicht jede Nacht vorn an", () => {
  const profiles: SearchProfile[] = [
    { id: "p1", name: "Ärzte", tags: ["amenity=doctors"], enabled: true, sort: 0 },
    { id: "p2", name: "Handwerk", tags: ["craft=electrician"], enabled: true, sort: 1 },
    { id: "aus", name: "Aus", tags: ["amenity=cafe"], enabled: false, sort: 2 },
  ];
  const areas = SEARCH_AREAS.slice(0, 2) as SearchArea[];
  assertEquals(nextSearchCell(profiles, areas, [])?.area.id, areas[0].id);
  assertEquals(nextSearchCell(profiles, areas, [])?.profile.id, "p1");
  const once = nextSearchCell(profiles, areas, [{ profileId: "p1", areaId: areas[0].id, searchedAt: "2026-11-25T00:10:00.000Z" }]);
  assertEquals(once?.profile.id, "p2");
  assertEquals(once?.area.id, areas[0].id);
  const nextTown = nextSearchCell(profiles, areas, [
    { profileId: "p1", areaId: areas[0].id, searchedAt: "2026-11-25T00:10:00.000Z" },
    { profileId: "p2", areaId: areas[0].id, searchedAt: "2026-11-25T00:25:00.000Z" },
  ]);
  assertEquals(nextTown?.area.id, areas[1].id);
  assertEquals(nextTown?.profile.id, "p1");
  const oldest = nextSearchCell(profiles, areas, [
    { profileId: "p1", areaId: areas[0].id, searchedAt: "2026-11-20T00:10:00.000Z" },
    { profileId: "p2", areaId: areas[0].id, searchedAt: "2026-11-25T00:25:00.000Z" },
    { profileId: "p1", areaId: areas[1].id, searchedAt: "2026-11-25T00:40:00.000Z" },
    { profileId: "p2", areaId: areas[1].id, searchedAt: "2026-11-25T00:55:00.000Z" },
  ]);
  assertEquals(oldest?.profile.id, "p1");
  assertEquals(oldest?.area.id, areas[0].id);
  assertEquals(nextSearchCell([{ ...profiles[2], enabled: false, tags: ["craft=carpenter"] }], areas, []), null);
  const city = nextSearchCell(
    [{ id: "mu", name: "Ärzte", tags: ["amenity=doctors"], region: "München", enabled: true, sort: 0 }],
    SEARCH_AREAS,
    [],
  );
  assertEquals(city?.area.name.startsWith("München"), true);
  assertEquals(areasForRegion(SEARCH_AREAS, "Deutschland").length, SEARCH_AREAS.length);
  assertEquals(areasForRegion(SEARCH_AREAS, "Berlin").every((a) => a.name.startsWith("Berlin")), true);
  assertEquals(areasForRegion(SEARCH_AREAS, "Nirgendwo").length, 0);
});

Deno.test("Abstand ist 1, 2, 3 oder 5 Minuten, Standard 2", () => {
  assertEquals(clampGap(Number.NaN), 2);
  assertEquals(clampGap(2), 2);
  assertEquals(clampGap(1), 1);
  assertEquals(clampGap(4), 3);
  assertEquals(clampGap(90), 5);
  assertEquals(GAP_CHOICES.join(), "1,2,3,5");
});

Deno.test("Nachtlauf ist 01:00 bis 07:00 Berlin, das Ziel ist 50", () => {
  const open = { on: true, from: 1, until: 7 };
  assertEquals(withinPrepWindow(new Date("2026-11-25T00:00:00.000Z"), open).ok, true);
  assertEquals(withinPrepWindow(new Date("2026-11-24T23:59:00.000Z"), open).ok, false);
  assertEquals(withinPrepWindow(new Date("2026-11-25T05:59:00.000Z"), open).ok, true);
  assertEquals(withinPrepWindow(new Date("2026-11-25T06:00:00.000Z"), open).ok, false);
  assertEquals(withinPrepWindow(new Date("2026-11-28T02:00:00.000Z"), open).ok, true);
  assertEquals(withinPrepWindow(new Date("2026-11-25T02:00:00.000Z"), { ...open, on: false }).ok, false);
  const prep = clampPrep({ prep_from: 9, prep_until: 3, prep_target: 0, prep_batch: 99, prep_on: true });
  assertEquals(prep.prep_from, 1);
  assertEquals(prep.prep_until, 7);
  assertEquals(prep.prep_target, 50);
  assertEquals(prep.prep_batch, 6);
  assertEquals(clampPrep({ prep_from: 2, prep_until: 6, prep_target: 40, prep_batch: 2, prep_on: false }).prep_on, false);
});

Deno.test("Nur das Allgäu ist aktiv, Berlin bleibt gespeichert", () => {
  const allg = activeAreas(SEARCH_AREAS, ["allgaeu"]);
  const ids = allg.map((a) => a.id);
  for (const id of ["memmingen", "kempten", "kaufbeuren", "fuessen", "sonthofen", "lindau", "mindelheim", "marktoberdorf", "immenstadt", "lindenberg"]) {
    assertEquals(ids.includes(id), true, id);
  }
  assertEquals(ids.includes("berlin-mitte"), false);
  assertEquals(SEARCH_AREAS.some((a) => a.id === "berlin-mitte"), true);
  assertEquals(activeAreas(SEARCH_AREAS, []).length, SEARCH_AREAS.length);
  assertEquals(plzInRegions("87700", ["allgaeu"]), true);
  assertEquals(plzInRegions("88131", ["allgaeu"]), true);
  assertEquals(plzInRegions("86825", ["allgaeu"]), true);
  assertEquals(plzInRegions("10117", ["allgaeu"]), false);
  assertEquals(plzInRegions("63796", ["allgaeu"]), false);
  assertEquals(plzInRegions("88250", ["allgaeu"]), false);
  assertEquals(plzInRegions("", ["allgaeu"]), false);
});

Deno.test("Overpass liefert OSM-ID, Merkmal und PLZ", () => {
  const rows = readOverpass({ elements: [{ type: "node", id: 42, tags: { name: "Praxis", amenity: "dentist", website: "praxis.example.test", "addr:postcode": "87700" } }] });
  assertEquals(rows[0].osm, "node/42");
  assertEquals(rows[0].kind, "amenity=dentist");
  assertEquals(rows[0].plz, "87700");
});
