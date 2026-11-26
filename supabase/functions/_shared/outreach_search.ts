// Nachtlauf: Branchenprofile und kleine Gebiete. Eine Overpass-Abfrage deckt nie ganz Deutschland ab.
import { berlinClock } from "./outreach.ts";

export const PREP_FROM = 1;
export const PREP_UNTIL = 7;
export const PREP_TARGET = 50;
export const PREP_BATCH = 4;
export const PREP_BATCH_MAX = 6;
/** Treffer pro Abfrage. Eine geglückte Abfrage füllt den Vorrat für viele Läufe, falls Overpass später hakt. */
export const OVERPASS_OUT = 40;
/** Standard: nur das Allgäu. Weitere Regionen später über outreach_settings.active_regions. */
export const DEFAULT_REGIONS = ["allgaeu"];

export type SearchProfile = {
  id: string;
  name: string;
  tags: string[];
  region?: string;
  enabled: boolean;
  sort: number;
};

export type SearchArea = {
  id: string;
  name: string;
  state: string;
  south: number;
  west: number;
  north: number;
  east: number;
  sort: number;
  /** Regionsschlüssel, z. B. "allgaeu". Sonst das Bundesland klein ("be", "by"). */
  region?: string;
};

export type CoverageMark = { profileId: string; areaId: string; searchedAt: string };

const TAG = /^[a-z][a-z0-9_:-]{0,40}=[a-z0-9_:+-]{1,48}$/i;
const BANNED_TAG = /carpenter|joiner|cabinet|furniture|kitchen|parquet|schreiner|tischler|m[oö]ebel|moebe/i;

/** Schreinerei, Tischlerei und Möbel gehören nicht in die Standardsuche. */
export function cleanTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const raw of tags || []) {
    const tag = String(raw || "").trim().toLowerCase();
    if (!TAG.test(tag) || BANNED_TAG.test(tag) || out.includes(tag)) continue;
    out.push(tag);
    if (out.length >= 8) break;
  }
  return out;
}

export const DEFAULT_PROFILES: { name: string; tags: string[] }[] = [
  {
    name: "Ärzte und Praxen",
    tags: ["amenity=doctors", "amenity=dentist", "healthcare=physiotherapist", "amenity=clinic"],
  },
  {
    name: "Maschinenbau und Industrie",
    tags: ["craft=metal_construction", "office=engineer", "man_made=works"],
  },
  {
    name: "Handwerk",
    tags: ["craft=electrician", "craft=plumber", "craft=painter", "craft=roofer", "craft=hvac", "shop=car_repair", "craft=tiler", "craft=glaziery"],
  },
  {
    name: "Gastronomie",
    tags: ["amenity=restaurant", "amenity=cafe"],
  },
  {
    name: "Kanzleien und Beratung",
    tags: ["office=tax_advisor", "office=lawyer", "office=estate_agent"],
  },
  {
    name: "Salon und Fitness",
    tags: ["shop=hairdresser", "shop=beauty", "leisure=fitness_centre"],
  },
];

export function clampPrep(input: {
  prep_from?: number;
  prep_until?: number;
  prep_target?: number;
  prep_batch?: number;
  prep_on?: boolean;
}) {
  let from = Number(input.prep_from);
  let until = Number(input.prep_until);
  if (!Number.isFinite(from)) from = PREP_FROM;
  if (!Number.isFinite(until)) until = PREP_UNTIL;
  from = Math.min(23, Math.max(0, Math.round(from)));
  until = Math.min(24, Math.max(1, Math.round(until)));
  if (from >= until) {
    from = PREP_FROM;
    until = PREP_UNTIL;
  }
  const target = Number(input.prep_target);
  const batch = Number(input.prep_batch);
  return {
    prep_from: from,
    prep_until: until,
    prep_target: Math.min(200, Math.max(1, Number.isFinite(target) && target > 0 ? Math.round(target) : PREP_TARGET)),
    prep_batch: Math.min(PREP_BATCH_MAX, Math.max(1, Number.isFinite(batch) && batch > 0 ? Math.round(batch) : PREP_BATCH)),
    prep_on: input.prep_on !== false,
  };
}

/** Stunde von einschließlich, Stunde bis ausschließlich. Nachts, auch am Wochenende, damit die Entwürfe morgens liegen. */
export function withinPrepWindow(now: Date, input: { on?: boolean; from?: number; until?: number }): { ok: true } | { ok: false; reason: string } {
  if (input.on === false) return { ok: false, reason: "Nachtlauf ist aus." };
  const clock = berlinClock(now);
  const from = Number.isFinite(Number(input.from)) ? Number(input.from) : PREP_FROM;
  const until = Number.isFinite(Number(input.until)) ? Number(input.until) : PREP_UNTIL;
  if (clock.hour < from || clock.hour >= until) return { ok: false, reason: "Außerhalb der Nacht." };
  return { ok: true };
}

function foldPlace(value: string): string {
  return String(value || "").trim().toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

/** Deutschland heißt: durch die kleinen Gebiete rotieren. Ein Ortsname begrenzt die Abfrage auf passende Kästen. */
export function areasForRegion(areas: SearchArea[], region?: string | null): SearchArea[] {
  const raw = foldPlace(region || "");
  if (!raw || /^(deutschland|germany|bundesweit|de)$/.test(raw)) return areas;
  const slug = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return areas.filter((area) => foldPlace(area.name).includes(raw) || area.id.includes(slug));
}

/**
 * Nächste Zelle: erst unbesuchte Paare, Gebiet für Gebiet, darin die eingeschalteten Profile.
 * Sind alle besucht, das am längsten zurückliegende. So fängt die nächste Nacht nicht wieder bei Berlin an.
 */
export function nextSearchCell(profiles: SearchProfile[], areas: SearchArea[], coverage: CoverageMark[]): { profile: SearchProfile; area: SearchArea } | null {
  const enabled = [...profiles]
    .filter((p) => p.enabled && cleanTags(p.tags).length)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const ordered = [...areas].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  if (!enabled.length || !ordered.length) return null;
  const seen = new Map(coverage.map((c) => [`${c.profileId}|${c.areaId}`, c.searchedAt]));
  let oldest: { at: number; profile: SearchProfile; area: SearchArea } | null = null;
  for (const area of ordered) {
    for (const profile of enabled) {
      if (!areasForRegion([area], profile.region).length) continue;
      const at = seen.get(`${profile.id}|${area.id}`);
      if (!at) return { profile, area };
      const ms = Date.parse(at);
      if (!oldest || ms < oldest.at) oldest = { at: ms, profile, area };
    }
  }
  return oldest ? { profile: oldest.profile, area: oldest.area } : null;
}

export function overpassQuery(tags: string[], area: Pick<SearchArea, "south" | "west" | "north" | "east">): string {
  const clean = cleanTags(tags);
  if (!clean.length) return "";
  const lines: string[] = [];
  for (const tag of clean) {
    const [key, value] = tag.split("=");
    const box = `${area.south},${area.west},${area.north},${area.east}`;
    lines.push(`  node["${key}"="${value}"]["website"](${box});`);
    lines.push(`  node["${key}"="${value}"]["contact:website"](${box});`);
    lines.push(`  way["${key}"="${value}"]["website"](${box});`);
    lines.push(`  way["${key}"="${value}"]["contact:website"](${box});`);
  }
  return `[out:json][timeout:30];\n(\n${lines.join("\n")}\n);\nout center tags ${OVERPASS_OUT + 20};`;
}

const WOOD_NAME = /schreinerei|tischlerei|\bschreiner\b|\btischler\b|möbel|moebel|küchenstudio|kuechenstudio/i;
const WOOD_TAG = /carpenter|joiner|cabinet_maker|furniture|shop=kitchen|craft=parquet/i;
const SKIP_HOST = /(^|\.)(facebook|instagram|fb|linktr\.ee|google|yelp|tripadvisor|booking|lieferando|thefork|jameda|doctolib|tiktok|youtube)\./i;

export type OverpassHit = { url: string; name: string; osm: string; kind: string; plz: string };

const KIND_KEYS = ["healthcare", "amenity", "craft", "office", "shop", "leisure", "man_made"];

export function readOverpass(payload: unknown, limit = OVERPASS_OUT): OverpassHit[] {
  const elements = (payload && typeof payload === "object" && Array.isArray((payload as { elements?: unknown }).elements))
    ? (payload as { elements: { type?: string; id?: number; tags?: Record<string, string> }[] }).elements
    : [];
  const out: OverpassHit[] = [];
  const seen = new Set<string>();
  for (const el of elements) {
    const tags = el?.tags || {};
    const blob = Object.entries(tags).map(([k, v]) => `${k}=${v}`).join(" ");
    const name = String(tags.name || "").slice(0, 160);
    if (WOOD_NAME.test(`${name} ${blob}`) || WOOD_TAG.test(blob)) continue;
    const raw = String(tags.website || tags["contact:website"] || "").trim();
    if (!raw) continue;
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    let url: URL;
    try {
      url = new URL(withScheme.split(/\s/)[0]);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    if (SKIP_HOST.test(url.hostname)) continue;
    const key = url.hostname.toLowerCase().replace(/^www\./, "");
    if (seen.has(key)) continue;
    seen.add(key);
    const kindKey = KIND_KEYS.find((k) => tags[k]);
    out.push({
      url: url.toString(),
      name,
      osm: el?.type && el?.id ? `${el.type}/${el.id}` : "",
      kind: kindKey ? `${kindKey}=${tags[kindKey]}` : "",
      plz: String(tags["addr:postcode"] || "").trim(),
    });
    if (out.length >= limit) break;
  }
  return out;
}

function box(id: string, name: string, state: string, lat: number, lon: number, km: number, sort: number, region?: string): SearchArea {
  const dLat = km / 111;
  const dLon = km / (111 * Math.cos((lat * Math.PI) / 180));
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return { id, name, state, south: r(lat - dLat), west: r(lon - dLon), north: r(lat + dLat), east: r(lon + dLon), sort, region: region || state.toLowerCase() };
}

/** id, Name, Land, Breite, Länge, Kantenlänge in km. Großstädte in Bezirke geteilt, sonst ein Kasten um die Innenstadt. */
const PLACES: [string, string, string, number, number, number, string?][] = [
  ["berlin-mitte", "Berlin-Mitte", "BE", 52.52, 13.405, 3.5],
  ["berlin-friedrichshain", "Berlin-Friedrichshain", "BE", 52.515, 13.454, 3],
  ["berlin-kreuzberg", "Berlin-Kreuzberg", "BE", 52.499, 13.403, 3],
  ["berlin-pankow", "Berlin-Pankow", "BE", 52.569, 13.401, 4.5],
  ["berlin-charlottenburg", "Berlin-Charlottenburg", "BE", 52.516, 13.304, 3.5],
  ["berlin-wilmersdorf", "Berlin-Wilmersdorf", "BE", 52.487, 13.32, 3.2],
  ["berlin-spandau", "Berlin-Spandau", "BE", 52.535, 13.2, 4.5],
  ["berlin-steglitz", "Berlin-Steglitz", "BE", 52.456, 13.332, 3.5],
  ["berlin-tempelhof", "Berlin-Tempelhof", "BE", 52.467, 13.385, 3.2],
  ["berlin-neukoelln", "Berlin-Neukölln", "BE", 52.44, 13.445, 4],
  ["berlin-lichtenberg", "Berlin-Lichtenberg", "BE", 52.532, 13.51, 4],
  ["berlin-reinickendorf", "Berlin-Reinickendorf", "BE", 52.573, 13.33, 4.5],
  ["hh-mitte", "Hamburg-Mitte", "HH", 53.55, 10.0, 3.5],
  ["hh-altona", "Hamburg-Altona", "HH", 53.55, 9.935, 3.5],
  ["hh-eimsbuettel", "Hamburg-Eimsbüttel", "HH", 53.575, 9.96, 3.2],
  ["hh-nord", "Hamburg-Nord", "HH", 53.6, 10.0, 3.5],
  ["hh-wandsbek", "Hamburg-Wandsbek", "HH", 53.58, 10.09, 4],
  ["hh-harburg", "Hamburg-Harburg", "HH", 53.46, 9.98, 4],
  ["hh-bergedorf", "Hamburg-Bergedorf", "HH", 53.487, 10.21, 4],
  ["m-altstadt", "München-Altstadt", "BY", 48.137, 11.575, 2.8],
  ["m-schwabing", "München-Schwabing", "BY", 48.167, 11.582, 3],
  ["m-bogenhausen", "München-Bogenhausen", "BY", 48.148, 11.62, 3.2],
  ["m-sendling", "München-Sendling", "BY", 48.118, 11.545, 3],
  ["m-pasing", "München-Pasing", "BY", 48.148, 11.461, 3.5],
  ["m-giesing", "München-Giesing", "BY", 48.11, 11.59, 3.2],
  ["nuernberg", "Nürnberg", "BY", 49.4521, 11.0767, 6],
  ["augsburg", "Augsburg", "BY", 48.3705, 10.8978, 6],
  ["regensburg", "Regensburg", "BY", 49.0134, 12.1016, 5],
  ["wuerzburg", "Würzburg", "BY", 49.7913, 9.9534, 5],
  ["ingolstadt", "Ingolstadt", "BY", 48.7665, 11.4258, 5],
  ["erlangen", "Erlangen", "BY", 49.5897, 11.007, 5],
  ["bamberg", "Bamberg", "BY", 49.8988, 10.9028, 5],
  ["bayreuth", "Bayreuth", "BY", 49.9456, 11.5713, 5],
  ["landshut", "Landshut", "BY", 48.5371, 12.1516, 5],
  ["passau", "Passau", "BY", 48.5665, 13.4319, 5],
  ["rosenheim", "Rosenheim", "BY", 47.8564, 12.1289, 5],
  ["kempten", "Kempten", "BY", 47.7267, 10.3139, 5, "allgaeu"],
  ["memmingen", "Memmingen", "BY", 47.9874, 10.1813, 5, "allgaeu"],
  ["aschaffenburg", "Aschaffenburg", "BY", 49.977, 9.1521, 5],
  ["stuttgart", "Stuttgart", "BW", 48.7758, 9.1829, 5],
  ["karlsruhe", "Karlsruhe", "BW", 49.0069, 8.4037, 5],
  ["mannheim", "Mannheim", "BW", 49.4875, 8.466, 5],
  ["freiburg", "Freiburg", "BW", 47.999, 7.8421, 5],
  ["heidelberg", "Heidelberg", "BW", 49.3988, 8.6724, 4.5],
  ["ulm", "Ulm", "BW", 48.4011, 9.9876, 5],
  ["heilbronn", "Heilbronn", "BW", 49.1427, 9.2109, 5],
  ["pforzheim", "Pforzheim", "BW", 48.8922, 8.6946, 5],
  ["reutlingen", "Reutlingen", "BW", 48.4914, 9.2043, 5],
  ["konstanz", "Konstanz", "BW", 47.6779, 9.1732, 4.5],
  ["friedrichshafen", "Friedrichshafen", "BW", 47.6567, 9.4753, 5],
  ["ravensburg", "Ravensburg", "BW", 47.782, 9.6106, 5],
  ["koeln", "Köln", "NW", 50.9375, 6.9603, 5],
  ["duesseldorf", "Düsseldorf", "NW", 51.2277, 6.7735, 5],
  ["dortmund", "Dortmund", "NW", 51.5136, 7.4653, 5],
  ["essen", "Essen", "NW", 51.4556, 7.0116, 5],
  ["duisburg", "Duisburg", "NW", 51.4344, 6.7623, 5],
  ["bochum", "Bochum", "NW", 51.4818, 7.2162, 5],
  ["wuppertal", "Wuppertal", "NW", 51.2562, 7.1508, 5],
  ["bielefeld", "Bielefeld", "NW", 52.0302, 8.5325, 5],
  ["bonn", "Bonn", "NW", 50.7374, 7.0982, 5],
  ["muenster", "Münster", "NW", 51.9607, 7.6261, 5],
  ["aachen", "Aachen", "NW", 50.7753, 6.0839, 5],
  ["moenchengladbach", "Mönchengladbach", "NW", 51.1805, 6.4428, 5],
  ["krefeld", "Krefeld", "NW", 51.3388, 6.5853, 5],
  ["paderborn", "Paderborn", "NW", 51.7189, 8.7575, 5],
  ["siegen", "Siegen", "NW", 50.8748, 8.0243, 5],
  ["hagen", "Hagen", "NW", 51.3671, 7.4633, 5],
  ["frankfurt", "Frankfurt am Main", "HE", 50.1109, 8.6821, 5],
  ["wiesbaden", "Wiesbaden", "HE", 50.0782, 8.2398, 5],
  ["kassel", "Kassel", "HE", 51.3127, 9.4797, 5],
  ["darmstadt", "Darmstadt", "HE", 49.8728, 8.6512, 5],
  ["offenbach", "Offenbach", "HE", 50.0956, 8.7761, 4.5],
  ["fulda", "Fulda", "HE", 50.5558, 9.6808, 5],
  ["giessen", "Gießen", "HE", 50.5841, 8.6784, 5],
  ["hanau", "Hanau", "HE", 50.1328, 8.916, 5],
  ["hannover", "Hannover", "NI", 52.3759, 9.732, 5],
  ["braunschweig", "Braunschweig", "NI", 52.2689, 10.5268, 5],
  ["oldenburg", "Oldenburg", "NI", 53.1435, 8.2146, 5],
  ["osnabrueck", "Osnabrück", "NI", 52.2799, 8.0472, 5],
  ["wolfsburg", "Wolfsburg", "NI", 52.4227, 10.7865, 5],
  ["goettingen", "Göttingen", "NI", 51.5413, 9.9158, 5],
  ["hildesheim", "Hildesheim", "NI", 52.1508, 9.9512, 5],
  ["lueneburg", "Lüneburg", "NI", 53.2464, 10.4115, 5],
  ["emden", "Emden", "NI", 53.3675, 7.2064, 5],
  ["bremen", "Bremen", "HB", 53.0793, 8.8017, 5],
  ["bremerhaven", "Bremerhaven", "HB", 53.5396, 8.5809, 5],
  ["kiel", "Kiel", "SH", 54.3233, 10.1228, 5],
  ["luebeck", "Lübeck", "SH", 53.8655, 10.6866, 5],
  ["flensburg", "Flensburg", "SH", 54.7937, 9.4469, 5],
  ["neumuenster", "Neumünster", "SH", 54.0714, 9.9901, 5],
  ["rostock", "Rostock", "MV", 54.0924, 12.0991, 5],
  ["schwerin", "Schwerin", "MV", 53.6355, 11.4012, 5],
  ["stralsund", "Stralsund", "MV", 54.3091, 13.0818, 4.5],
  ["greifswald", "Greifswald", "MV", 54.0865, 13.3923, 4.5],
  ["neubrandenburg", "Neubrandenburg", "MV", 53.5574, 13.2611, 5],
  ["potsdam", "Potsdam", "BB", 52.3906, 13.0645, 5],
  ["cottbus", "Cottbus", "BB", 51.7563, 14.3329, 5],
  ["frankfurt-oder", "Frankfurt (Oder)", "BB", 52.3471, 14.5506, 5],
  ["brandenburg", "Brandenburg an der Havel", "BB", 52.4125, 12.5316, 5],
  ["eberswalde", "Eberswalde", "BB", 52.8336, 13.82, 4.5],
  ["leipzig", "Leipzig", "SN", 51.3397, 12.3731, 5],
  ["dresden", "Dresden", "SN", 51.0504, 13.7373, 5],
  ["chemnitz", "Chemnitz", "SN", 50.8278, 12.9214, 5],
  ["zwickau", "Zwickau", "SN", 50.718, 12.4942, 5],
  ["goerlitz", "Görlitz", "SN", 51.1528, 14.9688, 4.5],
  ["magdeburg", "Magdeburg", "ST", 52.1205, 11.6276, 5],
  ["halle", "Halle (Saale)", "ST", 51.4828, 11.9697, 5],
  ["dessau", "Dessau-Roßlau", "ST", 51.8306, 12.2428, 5],
  ["erfurt", "Erfurt", "TH", 50.9848, 11.0299, 5],
  ["jena", "Jena", "TH", 50.9271, 11.5892, 4.5],
  ["gera", "Gera", "TH", 50.8803, 12.0822, 5],
  ["weimar", "Weimar", "TH", 50.9795, 11.3235, 4],
  ["eisenach", "Eisenach", "TH", 50.9746, 10.3246, 4.5],
  ["mainz", "Mainz", "RP", 49.9929, 8.2473, 5],
  ["koblenz", "Koblenz", "RP", 50.3569, 7.589, 5],
  ["trier", "Trier", "RP", 49.7499, 6.6371, 5],
  ["ludwigshafen", "Ludwigshafen", "RP", 49.4774, 8.4452, 5],
  ["kaiserslautern", "Kaiserslautern", "RP", 49.4401, 7.7491, 5],
  ["saarbruecken", "Saarbrücken", "SL", 49.2402, 6.9969, 5],
  ["neunkirchen-saar", "Neunkirchen", "SL", 49.3447, 7.1806, 4.5],
  ["homburg", "Homburg", "SL", 49.3264, 7.3387, 4.5],
  ["voelklingen", "Völklingen", "SL", 49.2516, 6.8589, 4.5],
  // Allgäu: Städte und die vier Landkreise Unter-, Ost-, Ober- und Westallgäu.
  ["kaufbeuren", "Kaufbeuren", "BY", 47.88, 10.6225, 5, "allgaeu"],
  ["fuessen", "Füssen", "BY", 47.5713, 10.7011, 5, "allgaeu"],
  ["sonthofen", "Sonthofen", "BY", 47.515, 10.2817, 5, "allgaeu"],
  ["lindau", "Lindau (Bodensee)", "BY", 47.546, 9.684, 5, "allgaeu"],
  ["mindelheim", "Mindelheim", "BY", 48.0458, 10.49, 5, "allgaeu"],
  ["bad-woerishofen", "Bad Wörishofen", "BY", 48.0058, 10.5967, 4, "allgaeu"],
  ["ottobeuren", "Ottobeuren", "BY", 47.9414, 10.2994, 4, "allgaeu"],
  ["bad-groenenbach", "Bad Grönenbach", "BY", 47.874, 10.223, 4, "allgaeu"],
  ["babenhausen-schwaben", "Babenhausen", "BY", 48.144, 10.253, 4, "allgaeu"],
  ["tuerkheim", "Türkheim", "BY", 48.0636, 10.6411, 4, "allgaeu"],
  ["marktoberdorf", "Marktoberdorf", "BY", 47.7786, 10.6172, 5, "allgaeu"],
  ["buchloe", "Buchloe", "BY", 48.0333, 10.7167, 4, "allgaeu"],
  ["pfronten", "Pfronten", "BY", 47.5833, 10.55, 4, "allgaeu"],
  ["oberguenzburg", "Obergünzburg", "BY", 47.8453, 10.4183, 4, "allgaeu"],
  ["immenstadt", "Immenstadt im Allgäu", "BY", 47.56, 10.22, 4, "allgaeu"],
  ["oberstdorf", "Oberstdorf", "BY", 47.4097, 10.2792, 4, "allgaeu"],
  ["kempten-land", "Waltenhofen und Dietmannsried", "BY", 47.73, 10.27, 7, "allgaeu"],
  ["sulzberg-durach", "Durach und Sulzberg", "BY", 47.69, 10.35, 4, "allgaeu"],
  ["lindenberg", "Lindenberg im Allgäu", "BY", 47.603, 9.89, 4, "allgaeu"],
  ["lindau-land", "Wasserburg und Bodolz", "BY", 47.57, 9.63, 4, "allgaeu"],
  ["wangen-allgaeu", "Wangen im Allgäu", "BW", 47.6858, 9.8336, 5, "allgaeu"],
  ["isny", "Isny im Allgäu", "BW", 47.693, 10.04, 4, "allgaeu"],
  ["leutkirch", "Leutkirch im Allgäu", "BW", 47.826, 10.022, 4, "allgaeu"],
];

export const SEARCH_AREAS: SearchArea[] = PLACES.map((p, sort) => box(p[0], p[1], p[2], p[3], p[4], p[5], sort, p[6]));

/** Nur Gebiete der aktiven Regionen. Leere Liste heißt: alle Gebiete (für später, bundesweit). */
export function activeAreas<T extends { region?: string | null; state?: string }>(areas: T[], regions?: string[] | null): T[] {
  const want = (regions || []).map((r) => String(r || "").trim().toLowerCase()).filter(Boolean);
  if (!want.length) return areas;
  return areas.filter((a) => want.includes(String(a.region || a.state || "").toLowerCase()));
}

/** PLZ-Bereiche je Region. Eine Firma, deren Impressum woanders liegt, wird nicht angeschrieben. */
export const REGION_PLZ: Record<string, RegExp> = {
  allgaeu: /^(87\d{3}|881[3-9]\d|882(3\d|[6-9]\d)|883[01]\d|8680\d|8682\d|86833|8684\d)$/,
};

export const REGION_LABEL: Record<string, string> = { allgaeu: "Allgäu" };

/** true, wenn die PLZ in einer der aktiven Regionen liegt. Ohne bekannte PLZ-Regel: true. */
export function plzInRegions(plz: string | null | undefined, regions?: string[] | null): boolean {
  const want = (regions || []).map((r) => String(r || "").toLowerCase()).filter(Boolean);
  if (!want.length) return true;
  const rules = want.map((r) => REGION_PLZ[r]).filter(Boolean);
  if (!rules.length) return true;
  const code = String(plz || "").trim();
  if (!/^\d{5}$/.test(code)) return false;
  return rules.some((re) => re.test(code));
}

export function areaIsSmall(area: Pick<SearchArea, "south" | "west" | "north" | "east">): boolean {
  return area.north > area.south && area.east > area.west && area.north - area.south < 0.2 && area.east - area.west < 0.25;
}
