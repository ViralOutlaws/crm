import {
  NOT_CONNECTED,
  appendBotResult,
  aufgabeBeschreibung,
  authorizeRunUpdate,
  bearerToken,
  canTransition,
  connectionOf,
  matchToken,
  normLinks,
  outcomeAfterPost,
  performDispatch,
  planMirror,
  publicError,
  rateAllow,
  runInScope,
  secretNames,
  sha256Hex,
  webhookBody,
  webhookHeaders,
  webhookUrlAllowed,
} from "./bot_leitstand.ts";

const auth = { bot: "webby", workspace_id: "11111111-1111-4111-8111-111111111111" };
const other = { bot: "marky", workspace_id: auth.workspace_id };
const foreign = { bot: "webby", workspace_id: "22222222-2222-4222-8222-222222222222" };

Deno.test("Token-Hash und Auth", async () => {
  const hash = await sha256Hex("abc");
  if (hash !== "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad") throw new Error(hash);
  if (bearerToken(null) !== null) throw new Error("leer");
  if (bearerToken("Bearer kurz") !== null) throw new Error("zu kurz");
  const token = "a".repeat(32);
  if (bearerToken(`Bearer ${token}`) !== token) throw new Error("bearer");
  const row = { bot: "webby", workspace_id: auth.workspace_id, token_hash: hash, revoked_at: null };
  const ok = matchToken(hash, [row]);
  if (!ok.ok || ok.bot !== "webby") throw new Error("match");
  const revoked = matchToken(hash, [{ ...row, revoked_at: "2026-10-17T00:00:00Z" }]);
  if (revoked.ok || revoked.reason !== "revoked") throw new Error("widerrufen");
  const missing = matchToken("f".repeat(64), [row]);
  if (missing.ok || missing.reason !== "missing") throw new Error("unbekannt");
  if (publicError(new Error("leak SUPABASE_SERVICE_ROLE_KEY abc")) !== "Interner Fehler.") throw new Error("key");
});

Deno.test("Scoping: fremder Bot und fremder Workspace", () => {
  const run = { bot: "webby", workspace_id: auth.workspace_id, status: "sent", aufgabe_id: "33333333-3333-4333-8333-333333333333" };
  if (!runInScope(auth, run)) throw new Error("eigener Lauf");
  if (runInScope(other, run) || runInScope(foreign, run)) throw new Error("fremd sichtbar");
  const denied = authorizeRunUpdate(other, run, "in_arbeit");
  if (denied.ok || !denied.error.includes("anderen Bot")) throw new Error(JSON.stringify(denied));
  const wrongWs = authorizeRunUpdate(foreign, run, "in_arbeit");
  if (wrongWs.ok) throw new Error("fremder Workspace");
  const mirror = planMirror(other, run);
  if (mirror.ok) throw new Error("Spiegel fremd");
  const own = planMirror(auth, run);
  if (own.ok || !own.error.includes("erledigt")) throw new Error(own.ok ? "ok" : own.error);
  const done = planMirror(auth, { ...run, status: "erledigt" });
  if (!done.ok) throw new Error(done.ok ? "" : done.error);
  const noTask = planMirror(auth, { ...run, status: "erledigt", aufgabe_id: null });
  if (noTask.ok) throw new Error("ohne Aufgabe");
});

Deno.test("Statuswechsel", () => {
  const ok: Array<[string, string]> = [
    ["queued", "sent"],
    ["queued", "in_arbeit"],
    ["queued", "fehler"],
    ["sent", "in_arbeit"],
    ["sent", "erledigt"],
    ["in_arbeit", "blockiert"],
    ["blockiert", "in_arbeit"],
    ["fehler", "queued"],
    ["sent", "sent"],
  ];
  for (const [from, to] of ok) {
    if (!canTransition(from, to)) throw new Error(`${from} -> ${to}`);
  }
  const bad: Array<[string, string]> = [
    ["queued", "erledigt"],
    ["erledigt", "in_arbeit"],
    ["erledigt", "queued"],
    ["in_arbeit", "queued"],
    ["sent", "queued"],
  ];
  for (const [from, to] of bad) {
    if (canTransition(from, to)) throw new Error(`erlaubt ${from} -> ${to}`);
  }
  const step = authorizeRunUpdate(auth, { ...auth, status: "queued" }, "erledigt");
  if (step.ok) throw new Error("queued erledigt");
  const forward = authorizeRunUpdate(auth, { ...auth, status: "sent" }, "in_arbeit");
  if (!forward.ok) throw new Error("sent in_arbeit");
});

Deno.test("Webhook: fehlendes Secret bleibt queued, Header und Body", async () => {
  if (secretNames("webby").url !== "BOT_WEBHOOK_WEBBY_URL") throw new Error("name");
  if (secretNames("webby").key !== "BOT_WEBHOOK_WEBBY_KEY") throw new Error("key");
  const headers = webhookHeaders("geheim", null);
  if (headers.Authorization !== "Bearer geheim" || headers["X-Webhook-Key"] !== "geheim") throw new Error("header");
  const custom = webhookHeaders("geheim", "X-Grok-Key");
  if (custom["X-Grok-Key"] !== "geheim" || custom.Authorization !== "Bearer geheim") throw new Error("custom");
  if (webhookUrlAllowed("http://example.com/hook")) throw new Error("http");
  if (!webhookUrlAllowed("https://example.com/hook")) throw new Error("https");
  const calls: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
  const posted = () => calls.length;
  const stored = new Map<string, Record<string, unknown>>();
  const env = {
    url: null as string | null,
    key: null as string | null,
    keyHeader: "X-Webhook-Key",
    crmUrl: "https://crm.viraloutlaws.de",
    callbackUrl: "https://example.supabase.co/functions/v1/bot-api",
    now: "2026-10-17T12:00:00.000Z",
  };
  const run = async () => performDispatch({
    bot: "webby",
    title: "Website für ein Yogastudio",
    instructions: "Landingpage, ruhig, mobil.",
    aufgabe_id: "33333333-3333-4333-8333-333333333333",
    workspace_id: auth.workspace_id,
    created_by: auth.workspace_id,
    ping: false,
    env,
    insertRun: async (row) => {
      const id = "44444444-4444-4444-8444-444444444444";
      stored.set(id, { ...row });
      return { id };
    },
    updateRun: async (id, patch) => {
      stored.set(id, { ...stored.get(id), ...patch });
    },
    post: async (url, hdrs, body) => {
      calls.push({ url, headers: hdrs, body });
      return { status: 200 };
    },
  });
  const queued = await run();
  if (queued.status !== "queued" || queued.message !== NOT_CONNECTED) throw new Error(JSON.stringify(queued));
  if (posted() !== 0) throw new Error("post trotz fehlendem Secret");
  if (stored.get(queued.run_id)?.status !== "queued") throw new Error("zeile");

  env.url = "https://bots.example/webby";
  env.key = "sender-key";
  const sent = await run();
  if (sent.status !== "sent" || !sent.connected) throw new Error(JSON.stringify(sent));
  if (posted() !== 1) throw new Error("kein post");
  const body = calls[0].body as Record<string, unknown>;
  for (const key of ["run_id", "bot", "title", "instructions", "aufgabe_id", "crm_url", "callback_url"]) {
    if (!(key in body)) throw new Error(`body ohne ${key}`);
  }
  if (body.bot !== "webby" || body.crm_url !== env.crmUrl || body.callback_url !== env.callbackUrl) throw new Error("body");
  if (calls[0].headers.Authorization !== "Bearer sender-key" || calls[0].headers["X-Webhook-Key"] !== "sender-key") {
    throw new Error("headers");
  }
  if (body.ping) throw new Error("kein ping");

  env.keyHeader = "X-Grok-Key";
  calls.splice(0, calls.length);
  await run();
  if (calls[0].headers["X-Grok-Key"] !== "sender-key") throw new Error("konfigurierbarer Header");

  const failed = await performDispatch({
    bot: "marky",
    title: "Reels",
    instructions: "",
    aufgabe_id: null,
    workspace_id: auth.workspace_id,
    created_by: null,
    ping: false,
    env: { ...env, url: "https://bots.example/marky", key: "k", keyHeader: null },
    insertRun: async (row) => {
      stored.set("m", { ...row });
      return { id: "55555555-5555-4555-8555-555555555555" };
    },
    updateRun: async (_id, patch) => {
      stored.set("m", { ...stored.get("m"), ...patch });
    },
    post: async () => ({ status: 500 }),
  });
  if (failed.status !== "fehler" || failed.connected) throw new Error(JSON.stringify(failed));
  if (outcomeAfterPost(302).status !== "fehler") throw new Error("redirect");

  calls.splice(0, calls.length);
  const ping = await performDispatch({
    bot: "cashy",
    title: "ignorieren",
    instructions: "ignorieren",
    aufgabe_id: "33333333-3333-4333-8333-333333333333",
    workspace_id: auth.workspace_id,
    created_by: null,
    ping: true,
    env: { ...env, url: "https://bots.example/cashy", key: "k", keyHeader: "X-Webhook-Key" },
    insertRun: async (row) => {
      if (row.aufgabe_id !== null || row.title !== "Verbindungstest") throw new Error("ping-zeile");
      return { id: "66666666-6666-4666-8666-666666666666" };
    },
    updateRun: async () => {},
    post: async (_url, _hdrs, body) => {
      calls.push({ url: "", headers: {}, body });
      return { status: 204 };
    },
  });
  if (!ping.connected || ping.status !== "sent") throw new Error(JSON.stringify(ping));
  const pingBody = calls[0].body as Record<string, unknown>;
  if (pingBody.ping !== true || pingBody.aufgabe_id !== null || pingBody.title !== "Verbindungstest") throw new Error("ping-body");
  const shaped = webhookBody({ id: "1", bot: "webby", title: "t", instructions: "i", aufgabe_id: null }, "https://crm.viraloutlaws.de", "https://cb", false);
  if (!("callback_url" in shaped) || !("crm_url" in shaped)) throw new Error("form");
});

Deno.test("Spiegel-Notiz hängt an und lässt die Zuständig-Zeile stehen", () => {
  const before = aufgabeBeschreibung("webby", "Header schmal.");
  if (!before.startsWith("Zuständig: Webby (Websites).")) throw new Error(before);
  const after = appendBotResult(before, "webby", "Seite ist online.", ["https://yoga.example"], "2026-10-17");
  if (!after.startsWith("Zuständig: Webby (Websites).")) throw new Error("zeile weg");
  if (!after.includes("[2026-10-17] Bot-Ergebnis (Webby):")) throw new Error("block");
  if (!after.includes("Seite ist online.") || !after.includes("Links: https://yoga.example")) throw new Error(after);
  let bad = false;
  try {
    normLinks(["javascript:alert(1)"]);
  } catch {
    bad = true;
  }
  if (!bad) throw new Error("script-link");
  if (normLinks(["https://ok.example"])[0] !== "https://ok.example") throw new Error("link");
});

Deno.test("Rate-Limit und Verbindung aus dem letzten Lauf", () => {
  let hits: number[] = [];
  for (let i = 0; i < 60; i++) {
    const step = rateAllow(hits, 1_000 + i);
    if (!step.ok) throw new Error("zu früh");
    hits = step.hits;
  }
  const blocked = rateAllow(hits, 1_030);
  if (blocked.ok) throw new Error("limit");
  const later = rateAllow(blocked.hits, 1_000 + 60_000);
  if (!later.ok) throw new Error("fenster");
  if (connectionOf([]) !== "unbekannt") throw new Error("leer");
  if (connectionOf([{ status: "queued", result: NOT_CONNECTED, events: [] }]) !== "nicht verbunden") throw new Error("offen");
  if (connectionOf([{ status: "sent", result: "Webhook angenommen.", events: [] }]) !== "verbunden") throw new Error("an");
  if (connectionOf([{ status: "fehler", result: "Webhook nicht erreichbar.", events: [] }]) !== "fehler") throw new Error("fehler");
});
