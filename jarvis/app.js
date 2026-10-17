import {
  HANDSFREE_KEY,
  createUtterance,
  handsFreeHint,
  handsFreePref,
  handsFreeSupport,
  isStopCommand,
  prefAfterGrant,
} from "./listen.js";
import { createElevenLabsSpeech } from "./speech.js";
import {
  AREAS,
  BOTS,
  SUPABASE_KEY,
  berlinToday,
  crmHref,
  demoBriefing,
  demoCustomer,
  demoFind,
  demoMeeting,
  demoSide,
  demoView,
  esc,
  eur,
  fnUrl,
  getSupabase,
  ttsUrl,
  loadArea,
  loadBriefing,
  loadCustomer,
  loadSide,
} from "./data.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const DEMO = params.has("demo");
const INSTANT = params.has("instant");
const speech = createElevenLabsSpeech({
  enabled: () => !DEMO && !!(session && session.access_token),
  apikey: SUPABASE_KEY,
  url: ttsUrl,
  token: async () => {
    if (sb) {
      try {
        const got = await sb.auth.getSession();
        if (got.data.session) session = got.data.session;
      } catch { /* behalte die letzte Sitzung */ }
    }
    return session?.access_token || "";
  },
});
if (INSTANT) {
  speech.setMuted(true);
  $("#mute").classList.add("off");
  $("#muteWave").style.display = "none";
}
addEventListener("pointerdown", () => speech.unlock(), { once: true });
addEventListener("pointerdown", (e) => {
  if (!handsPending) return;
  if (e.target?.closest?.("#hands")) return;
  handsPending = false;
  armHandsFree();
});

const S = { mode: "idle", amp: 0, target: 0, mic: 0, speakEnd: 0, impulse: 0, listening: false };
let speakToken = 0;
let sb = null;
let userId = null;
let session = null;
let history = [];
let currentArea = null;
let currentFilter = null;
const botTimers = {};

const has = (q, ...w) => w.some((x) => q.includes(x));

function setMode(m, sub) {
  S.mode = m;
  const map = {
    idle: ["BEREIT", "WIE KANN ICH HELFEN?", "Bereit"],
    speak: ["SPRICHT", "AUSGABE AKTIV", "Spricht"],
    listen: ["HÖRT ZU", "SPRECHEN SIE JETZT", "Hört zu"],
    think: ["ANALYSIERE", "VERARBEITE ANFRAGE", "Denkt"],
  }[m];
  $("#coreState").textContent = map[0];
  $("#coreSub").textContent = sub || map[1];
  $("#hState").textContent = map[2];
  const wrap = $("#coreWrap");
  if (wrap) wrap.dataset.mode = m;
  document.body.dataset.phase = m;
  if (typeof paintListen === "function") paintListen();
}

function tickClock() {
  const d = new Date();
  $("#clock").innerHTML = `${d.toLocaleDateString("de-DE", { weekday: "long" })}<b>${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</b>`;
}

function renderSide(data) {
  const d = data || (DEMO ? demoSide() : { today: [], counts: {}, volume: 0, invoices: [], live: true });
  $("#todayDate").textContent = new Date().toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  const items = (d.today || []).slice().sort((a, b) => String(a.t).localeCompare(String(b.t)));
  $("#todayList").innerHTML = items.length ? items.map((e) => e.type === "ev"
    ? `<div class="row"><span class="time">${esc(e.t)}</span><div><span>${esc(e.x)}</span></div></div>`
    : `<div class="row"><span class="chk"></span><div><span>${esc(e.x)}</span><div class="sub">${esc(e.t)}</div></div>${e.prio ? '<span class="prio">PRIO</span>' : ""}</div>`).join("")
    : `<div class="empty">${DEMO ? "Keine Beispieltermine." : "Heute nichts geladen."}</div>`;
  const keys = [["lead", "Lead"], ["erstgespraech", "Erstgespr."], ["angebot", "Angebot"], ["gewonnen", "Gewonnen"]];
  const counts = d.counts || {};
  const mx = Math.max(1, ...keys.map(([k]) => counts[k] || 0));
  $("#pipeMini").innerHTML = keys.map(([k, label]) => `<div class="stage ${k === "gewonnen" ? "win" : ""}"><b>${counts[k] || 0}</b><span>${label}</span><i style="width:${((counts[k] || 0) / mx) * 100}%"></i></div>`).join("");
  $("#pipeVol").textContent = eur(d.volume || 0);
  $("#pipeTag").textContent = DEMO ? "Beispiel" : "Live";
  $("#invTag").textContent = DEMO ? "Beispiel" : "Live";
  const invoices = d.invoices || [];
  $("#invMini").innerHTML = invoices.length ? invoices.map((i) => `<div class="inv ${i.over ? "over" : ""}"><div>${esc(i.k)}<span class="nr">${esc(i.nr)}</span></div><div class="amt">${eur(i.b)}<small>${i.over ? "überfällig" : "offen"}</small></div></div>`).join("") : `<div class="empty">${DEMO ? "Keine offenen Beispielrechnungen." : "Keine offenen Rechnungen."}</div>`;
  $("#invSum").textContent = eur(invoices.reduce((s, i) => s + (Number(i.b) || 0), 0));
  $("#botList").innerHTML = BOTS.map((b) => `<div class="bot idle" id="bot-${b.id}"><div class="av">${b.letter}</div><div><div class="nm">${b.name}</div><div class="rl">${esc(b.role)}</div></div><span class="st">Bereit</span></div>`).join("");
  $("#footMode").textContent = DEMO ? "◆ Beispieldaten · keine Verbindung zum CRM" : "◆ Live · Daten unter deiner Anmeldung";
  const mode = $("#hMode");
  if (mode) mode.textContent = DEMO ? "Demo" : "Live";
  $("#footMode").classList.toggle("proto", DEMO);
  $("#logout").hidden = DEMO;
  $("#crmLinkStat").textContent = DEMO ? "Demo" : "Bereit";
}

function toast(title, txt, ic) {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<div class="ic">${esc(ic || "J")}</div><div><b>${esc(title)}</b><span>${esc(txt)}</span></div>`;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function activateBot(id, task) {
  const b = BOTS.find((x) => x.id === id);
  const el = $("#bot-" + id);
  if (!el || !b) return;
  el.classList.remove("idle");
  el.classList.add("active");
  el.querySelector(".st").textContent = "Aktiv";
  toast("Auftrag an " + b.name, task, b.letter);
  const n = document.querySelectorAll(".bot.active").length;
  $("#botCount").textContent = n ? `${n} aktiv` : "5 / 5";
  clearTimeout(botTimers[id]);
  botTimers[id] = setTimeout(() => {
    el.classList.remove("active");
    el.classList.add("idle");
    el.querySelector(".st").textContent = "Bereit";
    const left = document.querySelectorAll(".bot.active").length;
    $("#botCount").textContent = left ? `${left} aktiv` : "5 / 5";
  }, 9000);
}

function userMsg(t) {
  const el = document.createElement("div");
  el.className = "msg u";
  el.textContent = t;
  $("#log").appendChild(el);
  $("#log").scrollTop = 1e9;
}

function typeWrite(text, tok) {
  const el = document.createElement("div");
  el.className = "msg j";
  $("#log").appendChild(el);
  const sp = document.createElement("span");
  el.append(sp);
  if (INSTANT) {
    sp.textContent = text;
    $("#log").scrollTop = 1e9;
    return Promise.resolve();
  }
  const c = document.createElement("span");
  c.className = "caret";
  el.append(c);
  return new Promise((res) => {
    let i = 0;
    const step = () => {
      if (tok !== speakToken) {
        sp.textContent = text;
        c.remove();
        return res();
      }
      i += 2;
      sp.textContent = text.slice(0, i);
      if (i % 6 === 0) S.impulse = Math.max(S.impulse, 0.6);
      $("#log").scrollTop = 1e9;
      if (i < text.length) setTimeout(step, 16);
      else {
        c.remove();
        res();
      }
    };
    step();
  });
}

function endSpeak() {
  if (S.mode !== "speak") return;
  finishReply(speakEpoch);
}

async function say(text) {
  const cut = speechCut;
  const gen = beginReply();
  speakEpoch = gen;
  const tok = ++speakToken;
  if (cut !== speechCut) {
    finishReply(gen);
    return;
  }
  setMode("speak");
  S.speakEnd = performance.now() + Math.max(1200, String(text).length * 55);
  speech.speak(text, {
    onboundary() { S.impulse = 1; },
    onend() { if (tok === speakToken) S.speakEnd = 0; },
    onfallback() { toast("Stimme", "ElevenLabs nicht erreichbar. Ich nutze die Browserstimme.", "i"); },
  });
  await typeWrite(text, tok);
}

/* ---------- Holo ---------- */
const holoLayer = $("#holoLayer");

function holoCount() {
  $("#hHolo").textContent = String(holoLayer.querySelectorAll(".holo:not(.closing)").length);
}

function openView(view, areaId) {
  toggleMenu(false);
  currentArea = areaId || view.crm || currentArea;
  [...holoLayer.querySelectorAll(".holo")].forEach((h) => closeEl(h, true));
  const el = document.createElement("section");
  el.className = "holo" + (view.wide ? " wide" : "");
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", view.title || "Panel");
  const crm = view.crm ? `<a href="${esc(crmHref(view.crm))}">Im CRM öffnen</a>` : "";
  el.innerHTML = `<div class="beam"></div><span class="corner a"></span><span class="corner b"></span>
    <div class="hh"><span class="gl" data-t="${esc(view.title || "")}">${esc(view.title || "Panel")}</span><span class="meta">${esc(view.meta || "")}</span><button class="x" type="button" aria-label="Schließen">✕</button></div>
    <div class="hb">${renderBody(view)}</div>
    <div class="hf">${crm}<span class="crmlink">${DEMO ? "Beispieldaten" : "Live"}</span></div>`;
  el.querySelector(".x").onclick = () => closeHolo();
  el.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.onclick = () => openArea(currentArea, JSON.parse(btn.getAttribute("data-filter")));
  });
  el.querySelectorAll("tr.click, .lc.click").forEach((row) => {
    row.onclick = () => { if (row.dataset.id) openCustomer(row.dataset.id); };
  });
  holoLayer.appendChild(el);
  holoLayer.classList.add("has");
  holoCount();
  return el;
}

function renderBody(view) {
  const spoken = view.spoken || view.note ? `<p class="spoken">${esc(view.spoken || view.note)}</p>` : "";
  const kpis = kpiHtml(view.kpis);
  const filters = (view.filters || []).map((f) => `<button type="button" data-filter="${esc(JSON.stringify(f.filter))}">${esc(f.label)}</button>`).join("");
  const bar = filters ? `<div class="filters">${filters}</div>` : "";
  if (view.customer) return spoken + kpis + dossierHtml(view.customer);
  if (view.lanes) return spoken + kpis + boardHtml(view);
  if (view.posts) return spoken + kpis + bar + postsHtml(view.posts);
  if (view.agenda) return spoken + kpis + agendaHtml(view.agenda);
  return spoken + kpis + bar + tableHtml(view);
}

function kpiHtml(kpis) {
  if (!kpis?.length) return "";
  return `<div class="kpis">${kpis.map((k) => `<div class="kpi ${esc(k.tone || "")}"><span>${esc(k.label)}</span><b>${esc(k.value)}</b></div>`).join("")}</div>`;
}

function tableHtml(view) {
  const cols = view.columns || [];
  const rows = view.rows || [];
  if (!rows.length) return `<div class="empty">${view.note && !view.spoken ? esc(view.note) : "Keine Einträge."}</div>`;
  const head = cols.map((c) => `<th class="${c.align === "r" ? "r" : ""}">${esc(c.label)}</th>`).join("") + "<th></th>";
  const body = rows.map((r) => {
    const tds = cols.map((c) => `<td class="${c.align === "r" ? "r mono" : ""}">${esc(r.cells?.[c.key] ?? "")}</td>`).join("");
    const badge = r.badge ? `<td><span class="badge ${esc(r.badge.tone || "e")}">${esc(r.badge.text)}</span></td>` : "<td></td>";
    const click = r.open === "customer" && r.id ? ` class="click" data-id="${esc(r.id)}"` : "";
    return `<tr${click}>${tds}${badge}</tr>`;
  }).join("");
  return `<table class="ht"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function boardHtml(view) {
  const labels = { lead: "Lead", erstgespraech: "Erstgespräch", angebot: "Angebot", gewonnen: "Gewonnen", verloren: "Verloren" };
  return `<div class="board">${Object.entries(view.lanes).map(([k, arr]) => `<div class="lane"><h4>${labels[k] || k}<small>${view.counts?.[k] ?? arr.length}</small></h4><div class="cards">${arr.map((l) => `<div class="lc click" data-id="${esc(l.id || "")}"><b>${esc(l.firma)}</b><span>${esc(l.ort || "")}</span><br><span class="src">◆ ${esc(l.quelle || "—")}${l.deal_wert ? " · " + esc(eur(l.deal_wert)) : ""}</span></div>`).join("") || `<div class="lc"><span>Leer</span></div>`}</div></div>`).join("")}</div>`;
}

function postsHtml(posts) {
  if (!posts.length) return `<div class="empty">Keine Posts in diesem Zeitraum.</div>`;
  return `<div class="posts week">${posts.map((p) => {
    const img = p.thumbs?.[0]?.url ? `<img alt="" src="${esc(p.thumbs[0].url)}">` : "";
    const tags = Array.isArray(p.hashtags) ? p.hashtags.join(" ") : (p.hashtags || "");
    return `<article class="pc"><div class="thumb" style="--g:${p.gradient || "linear-gradient(140deg,#1a1408,#fdad00 140%)"}">${img}<span class="fmt">${esc(p.format || "")}</span><span class="hook">${esc(p.hook || p.thema || "")}</span></div>
      <div class="pcb"><div class="pday"><span>${esc(p.datum || "")} · ${esc(p.uhrzeit || "")}</span><span class="badge ${p.status === "Veröffentlicht" ? "f" : p.status === "Idee" ? "e" : "w"}">${esc(p.status || "")}</span></div><div class="cap">${esc(p.caption || "")}</div><div class="hs">${esc(tags)}</div></div></article>`;
  }).join("")}</div>`;
}

function agendaHtml(a) {
  const events = (a.events || []).map((e) => `<div class="ev"><span class="t">${esc(e.zeit || e.datum || "")}</span><b>${esc(e.titel)}</b><span>${esc(e.typ || "")}</span></div>`).join("") || `<div class="empty">Keine Termine.</div>`;
  const block = (title, rows) => `<h5 style="font-family:'Bebas Neue';letter-spacing:.12em;color:var(--gold);font-weight:400;margin:8px 0">${esc(title)}</h5>` + (rows.length
    ? `<table class="ht"><tbody>${rows.map((r) => `<tr><td>${esc(r.left)}</td><td class="r"><span class="badge ${esc(r.tone || "e")}">${esc(r.right)}</span></td></tr>`).join("")}</tbody></table>`
    : `<div class="empty">Nichts fällig.</div>`);
  const tasks = (a.tasks || []).map((t) => ({ left: t.titel, right: t.overdue ? "Überfällig" : (t.faellig || "Offen"), tone: t.overdue ? "o" : "w" }));
  const reminders = (a.reminders || []).map((t) => ({ left: t.text, right: t.datum || "", tone: "w" }));
  const invoices = (a.invoices || []).map((t) => ({ left: `${t.nr || ""} ${t.kunde || ""}`.trim(), right: eur(t.netto), tone: "o" }));
  const steps = (a.nextSteps || []).map((t) => ({ left: t.firma, right: t.datum || "", tone: "w" }));
  return `<div class="agenda"><div class="tl">${events}</div><div>${block("Aufgaben", tasks)}${block("Wiedervorlagen", reminders)}${block("Überfällige Rechnungen", invoices)}${block("Nächste Schritte", steps)}</div></div>`;
}

function dossierHtml(c) {
  const list = (title, rows) => `<h5>${esc(title)}</h5>` + (rows.length ? `<table class="ht"><tbody>${rows.map((r) => `<tr><td>${esc(r.a)}</td><td>${esc(r.b)}</td><td class="r mono">${esc(r.c || "")}</td></tr>`).join("")}</tbody></table>` : `<div class="empty">Keine.</div>`);
  return `<div class="dossier"><div>
      <div class="kv"><span>Firma</span><b>${esc(c.firma)}</b><span>Person</span><b>${esc(c.person)}</b><span>Phase</span><b>${esc(c.status)}</b><span>Quelle</span><b>${esc(c.quelle)}</b><span>Ort</span><b>${esc(c.ort)}</b><span>E-Mail</span><b>${esc(c.email)}</b><span>Deal</span><b>${c.deal_wert ? esc(eur(c.deal_wert)) : "—"}</b><span>Nächster Schritt</span><b>${esc(c.naechster_schritt || "—")} ${esc(c.naechster_schritt_text || "")}</b></div>
      <h5>Notizen</h5><div class="noteblock">${esc(c.notes || "Keine internen Notizen.")}</div>
      ${(c.notizen || []).map((n) => `<div class="row"><span class="time">${esc(n.datum)}</span><div>${esc(n.text)}</div></div>`).join("")}
    </div><div>
      ${list("Angebote", (c.angebote || []).map((a) => ({ a: a.nr, b: a.betreff, c: eur(a.netto) })))}
      ${list("Rechnungen", (c.rechnungen || []).map((a) => ({ a: a.nr, b: a.status, c: eur(a.netto) })))}
      ${list("Aufgaben", (c.aufgaben || []).map((a) => ({ a: a.titel, b: a.bot || a.status, c: a.faellig || "" })))}
      ${list("Termine", (c.termine || []).map((a) => ({ a: a.datum, b: a.titel, c: a.zeit || "" })))}
    </div></div>`;
}

function closeEl(h, instant) {
  if (!h || h.classList.contains("closing")) return;
  h.classList.add("closing");
  setTimeout(() => {
    h.remove();
    if (!holoLayer.querySelector(".holo")) holoLayer.classList.remove("has");
    holoCount();
  }, instant ? 180 : 450);
}

function closeHolo() {
  const hs = [...holoLayer.querySelectorAll(".holo:not(.closing)")];
  hs.forEach((h) => closeEl(h));
  return hs.length;
}

holoLayer.addEventListener("click", (e) => { if (e.target === holoLayer) closeHolo(); });

function showConfirm(plan) {
  const danger = !!plan.danger;
  const el = document.createElement("article");
  el.className = danger ? "confirm danger" : "confirm";
  const yes = danger ? "Endgültig löschen" : "Bestätigen";
  el.innerHTML = `<h4>${esc(plan.summary || "Bitte bestätigen")}</h4><ul>${(plan.lines || []).map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
    <div class="acts"><button type="button" class="yes">${yes}</button><button type="button" class="no">Abbrechen</button></div>`;
  el.querySelector(".no").onclick = () => {
    el.remove();
    say(danger ? "Abgebrochen. Es wurde nichts gelöscht." : "Abgebrochen. Es wurde nichts gespeichert.");
  };
  el.querySelector(".yes").onclick = () => confirmPlan(plan, el);
  $("#confirms").appendChild(el);
  return el;
}

async function confirmPlan(plan, el) {
  el.querySelectorAll("button").forEach((b) => { b.disabled = true; });
  if (DEMO) {
    el.remove();
    if (plan.bot) activateBot(plan.bot, plan.summary);
    await say("Im Demo-Modus wird nichts gespeichert. Die Karte zeigt nur, was Jarvis nach deiner Bestätigung schreiben würde.");
    return;
  }
  try {
    const res = await fetch(fnUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ op: "confirm", kind: plan.kind, tool: plan.tool, bot: plan.bot, data: plan.data }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Speichern fehlgeschlagen.");
    el.remove();
    if (body.bot) activateBot(body.bot, body.summary || plan.summary);
    await say(body.log_warning ? `${body.summary}. ${body.log_warning}` : `${body.summary || "Gespeichert"}.`);
    if (body.panel) openArea(panelToArea(body.panel)).catch(() => {});
  } catch (e) {
    el.querySelectorAll("button").forEach((b) => { b.disabled = false; });
    toast("Nicht gespeichert", e.message || "Fehler", "!");
  }
}

function panelToArea(panel) {
  if (panel === "content_week") return "social";
  if (panel === "invoices") return "rechnungen";
  if (panel === "agenda") return "kalender";
  if (panel === "customer") return "contacts";
  return panel;
}

/* ---------- Bereiche ---------- */
async function openArea(id, filter) {
  currentFilter = filter || null;
  const cut = speechCut;
  beginReply();
  setMode("think");
  try {
    const view = DEMO ? demoView(id, filter) : await loadArea(sb, id, filter || {}, userId);
    if (id === "social" && filter?.view === "month" && DEMO) view.title = "Social · Monat";
    openView(view, id);
    if (cut !== speechCut) return;
    const n = view.posts ? view.posts.length : (view.rows ? view.rows.length : null);
    const line = view.spoken || (n == null ? `${view.title} ist offen.` : `${view.title}: ${n} Einträge.`);
    await say(line);
  } catch (e) {
    if (cut !== speechCut) return;
    openView({ title: AREAS.find((a) => a.id === id)?.label || "Bereich", crm: id, note: e.message || "Nicht lesbar.", rows: [], columns: [], kpis: [] }, id);
    await say(e.message || "Der Bereich ist gerade nicht lesbar.");
  }
}

async function openCustomer(idOrQuery) {
  const cut = speechCut;
  beginReply();
  setMode("think");
  try {
    const view = DEMO ? demoCustomer(idOrQuery) : await loadCustomer(sb, idOrQuery);
    openView(view, "contacts");
    if (cut !== speechCut) return;
    await say(view.spoken || view.note || "Hier ist die Akte.");
  } catch (e) {
    if (cut !== speechCut) return;
    await say(e.message || "Die Akte ist nicht lesbar.");
  }
}

async function openBriefing(manual) {
  const cut = speechCut;
  beginReply();
  setMode("think");
  try {
    const view = DEMO ? demoBriefing() : await loadBriefing(sb);
    openView(view, "kalender");
    if (!DEMO && !manual) {
      try { localStorage.setItem("jarvis_briefing_day", berlinToday()); } catch { /* ignore */ }
    }
    if (cut !== speechCut) return;
    await say(view.spoken);
  } catch (e) {
    if (cut !== speechCut) return;
    await say(e.message || "Das Briefing ist gerade nicht lesbar.");
  }
}

function toggleMenu(force) {
  const el = $("#launcher");
  const open = force === undefined ? !el.classList.contains("open") : !!force;
  el.classList.toggle("open", open);
  return open;
}

$("#launcher").innerHTML = AREAS.map((a) => `<button type="button" class="area-btn" data-area="${a.id}">${esc(a.label)}</button>`).join("");
$("#launcher").addEventListener("click", (e) => {
  const id = e.target?.dataset?.area;
  if (!id) return;
  toggleMenu(false);
  openArea(id);
});
$("#areasBtn").onclick = () => {
  const open = toggleMenu();
  if (open) say("Welchen Bereich soll ich öffnen?");
};

/* ---------- Demo-Engine und Live-Chat ---------- */
function engine(raw) {
  const q = ` ${raw.toLowerCase()} `;
  if (has(q, "schließ", "schliess", "fenster zu") || /^\s*(zu|weg)\W*$/.test(q)) {
    return { say: closeHolo() ? "Erledigt. Ich habe die Anzeige geschlossen." : "Es ist gerade keine Anzeige geöffnet." };
  }
  if (has(q, "bereich", "menü", "menu", "launcher")) return { menu: true, say: "Hier sind die CRM-Bereiche." };
  if (has(q, "briefing", "morgenbriefing", "guten morgen")) return { briefing: true };
  if (has(q, "stand bei", "kunden-akte", "kundenakte", "was läuft bei", "was laeuft bei")) return { customer: raw };
  if (has(q, "gespräch", "gespraech", "telefonat", "call notier", "besprochen", "meeting")) return { card: true, say: "Ich habe das Gespräch als eine Karte vorbereitet. Bestehende Notizen bleiben, die neue Notiz wird angehängt. Bitte bestätigen." };
  if (has(q, "nur überfällig", "nur ueberfaellig", "nur überfällige")) {
    const area = ["aufgaben", "wiedervorlagen", "rechnungen"].includes(currentArea) ? currentArea : "rechnungen";
    return { area, filter: { only: "overdue" }, say: "Ich filtere auf Überfälliges." };
  }
  if (has(q, "instagram") && has(q, "lead")) return { area: "contacts", filter: { status: "lead", quelle: "instagram" }, say: "Das sind die Leads aus Instagram." };
  if (has(q, "nur leads")) return { area: "contacts", filter: { status: "lead" }, say: "Hier sind nur die Leads." };
  if (has(q, "nur entwurf", "nur entwürfe")) {
    const area = currentArea === "rechnungen" ? "rechnungen" : "angebote";
    return { area, filter: { only: "drafts" }, say: "Ich zeige nur Entwürfe." };
  }
  const create = has(q, "erstell", "anleg", "leg ", "schreib", "notier", "neuer lead", "neuen lead");
  if (create && has(q, "lead", "kontakt")) {
    return { say: "Neuer Kontakt als Lead. Bitte bestätigen, dann liegt er in der Pipeline.", cardPlan: { kind: "contact_insert", tool: "upsert_contact", summary: "Neuen Kontakt anlegen", bot: null, lines: ["Firma: Beispiel Bäckerei", "Phase: Lead", "Quelle: instagram"], data: { firma: "Beispiel Bäckerei", status: "lead", quelle: "instagram" } } };
  }
  if (create && has(q, "angebot")) return { say: "Angebot als Entwurf. Es wird nicht versendet.", cardPlan: { kind: "angebot", tool: "create_angebot", summary: "Angebot anlegen", lines: ["Kunde: Beispiel-Café", "Betreff: Social-Betreuung", "Status: Entwurf"], data: { status: "entwurf" } } };
  if (create && has(q, "rechnung")) return { say: "Rechnung als Entwurf. Sie gilt nicht als offene Forderung und wird nicht versendet.", cardPlan: { kind: "rechnung", tool: "create_rechnung", summary: "Rechnung anlegen", bot: "cashy", lines: ["Kunde: Musterfirma GmbH", "Status: Entwurf"], data: { status: "entwurf" } } };
  if (create && has(q, "retainer")) return { say: "Retainer bleibt pausiert, bis du ihn ausdrücklich aktivierst.", cardPlan: { kind: "retainer", tool: "create_retainer", summary: "Retainer anlegen", lines: ["Paket: Social Betreuung", "Betrag: 850,00 € / Monat", "Status: pausiert"], data: { status: "pausiert" } } };
  if (has(q, "marky", "reel", "posts erstellen")) return { say: "Aufgabe an Marky. Sie landet erst nach deiner Bestätigung im Kanban.", bot: ["marky", "Posts erstellen"], cardPlan: { kind: "aufgabe", tool: "route_to_bot", bot: "marky", summary: "Aufgabe an Marky", lines: ["Aufgabe: 3 Reels schneiden", "Zuständig: Marky", "Status: Offen"], data: { status: "todo" } } };
  if (has(q, "lösch", "loesch")) {
    if (has(q, "aufgabe", "kanban")) {
      return {
        say: "Ich lösche Aufgaben nur nach deiner Bestätigung. Die Karte nennt Anzahl und Titel. Im Demo wird nichts gelöscht.",
        cardPlan: {
          kind: "aufgabe_delete",
          tool: "delete_aufgaben",
          danger: true,
          summary: "Alle 3 Aufgaben löschen",
          lines: ["Anzahl: 3", "Endgültig löschen.", "Angebot nachfassen", "Reel schneiden", "Rechnung prüfen"],
          data: { count: 3, scope: "all", confirm: true },
        },
      };
    }
    return { say: "Löschen geht hier nur bei Aufgaben. Kontakte, Angebote, Rechnungen, Termine, Wiedervorlagen, Posts und Retainer lösche ich nicht." };
  }
  if (has(q, "aufgabe", "kanban") && has(q, "erledig", "abhake", "abhaken", "wieder öffnen", "wieder oeffnen", "wieder offen", "unerledigt")) {
    const reopen = has(q, "wieder öffnen", "wieder oeffnen", "wieder offen", "unerledigt");
    return {
      say: reopen ? "Ich öffne die Aufgabe wieder, sobald du bestätigst." : "Ich markiere die Aufgabe als erledigt, sobald du bestätigst.",
      cardPlan: {
        kind: "aufgabe_status",
        tool: "set_aufgaben_status",
        summary: reopen ? "Aufgabe wieder öffnen: Angebot nachfassen" : "Aufgabe erledigen: Angebot nachfassen",
        lines: ["Anzahl: 1", reopen ? "Status: Offen" : "Status: Erledigt", "Angebot nachfassen"],
        data: { status: reopen ? "todo" : "done", count: 1 },
      },
    };
  }
  if (has(q, "social", "content", "instagram", "posts")) return { area: "social", say: "Hier ist der Social-Plan. Entwürfe haben den Status Idee." };
  if (has(q, "rechnung", "rechnungen")) return { area: "rechnungen", say: "Hier sind die Rechnungen." };
  if (has(q, "angebot")) return { area: "angebote", say: "Hier sind die Angebote." };
  if (has(q, "pipeline", "deal")) return { area: "pipeline", say: "Hier ist die Pipeline." };
  if (has(q, "retainer")) return { area: "retainer", say: "Hier sind die Retainer." };
  if (has(q, "paket", "leistungskatalog", "katalog")) return { area: "pakete", say: "Hier ist der Leistungskatalog. Preise ändern folgt." };
  if (has(q, "aufgabe", "kanban")) return { area: "aufgaben", say: "Hier sind die Aufgaben." };
  if (has(q, "wiedervorlage")) return { area: "wiedervorlagen", say: "Hier sind die Wiedervorlagen." };
  if (has(q, "kalender", "termin")) return { area: "kalender", say: "Hier ist der Kalender." };
  if (has(q, "ausgabe", "ausgaben")) return { area: "ausgaben", say: "Hier sind die Ausgaben." };
  if (has(q, "roi")) return { area: "roi", say: "Hier sind die ROI-Zeilen." };
  if (has(q, "ziel")) return { area: "ziele", say: "Hier sind die Ziele. Bearbeiten folgt." };
  if (has(q, "kontakt", "kunden", "leads")) return { area: "contacts", say: "Hier sind die Kontakte. Eine Zeile öffnet die Kunden-Akte." };
  if (has(q, "bot", "team")) return { say: "Webby, Marky, Saley, Cashy und Developy sind bereit. Einen Auftrag lege ich als Aufgabe an, nachdem du bestätigst." };
  if (has(q, "hallo", "hi", "moin", "servus")) return { say: "Hallo Kim. Womit soll ich anfangen? Briefing, eine Kunden-Akte oder ein CRM-Bereich." };
  return { say: DEMO
    ? "Frag nach einem Bereich, zum Beispiel Pipeline, Rechnungen, Social oder Ziele. „Briefing“ fasst den Tag zusammen."
    : null };
}

async function ask(text) {
  text = String(text || "").trim();
  if (!text) return;
  if (isStopCommand(text)) {
    $("#inp").value = "";
    interruptSpeech();
    toast("Jarvis", "Alles klar.", "J");
    return;
  }
  const cut = speechCut;
  $("#inp").value = "";
  beginReply();
  userMsg(text);
  speakToken += 1;
  speech.cancel();
  if (!DEMO) {
    history.push({ role: "user", content: text });
    await liveAsk(cut);
    return;
  }
  if (cut !== speechCut) return;
  const r = engine(text);
  if (cut !== speechCut) return;
  if (r.menu) toggleMenu(true);
  if (r.bot) activateBot(r.bot[0], r.bot[1]);
  if (r.card) showConfirm(demoMeeting());
  if (r.cardPlan) showConfirm(r.cardPlan);
  if (r.briefing) { await openBriefing(true); return; }
  if (r.customer) {
    const found = demoFind(r.customer.replace(/.*bei\s+/i, ""));
    if (found.kind === "none") { await say("Ich finde diesen Kontakt in den Beispieldaten nicht."); return; }
    if (found.kind === "many") { await openArea("contacts", { query: "muster" }); return; }
    await openCustomer(found.id);
    return;
  }
  if (r.area) { await openArea(r.area, r.filter); return; }
  if (r.say) await say(r.say);
}

async function liveAsk(cut) {
  const gen = beginReply();
  speakEpoch = gen;
  setMode("think");
  const el = document.createElement("div");
  el.className = "msg j";
  const sp = document.createElement("span");
  el.append(sp);
  $("#log").appendChild(el);
  try {
    const res = await fetch(fnUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages: history.slice(-12) }),
    });
    if (cut !== speechCut) return;
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Jarvis ist nicht erreichbar.");
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let full = "";
    const voiced = !speech.isMuted() && cut === speechCut;
    const voice = voiced ? speech.openStream({
      onstart() {
        if (cut !== speechCut) return;
        setMode("speak");
        S.speakEnd = performance.now() + 120000;
      },
      onboundary() { S.impulse = 1; },
      onend() {
        if (speakEpoch !== gen) return;
        S.speakEnd = 0;
        if (cut !== speechCut) return;
        if (S.mode === "speak") endSpeak();
        else finishReply(gen);
      },
      onfallback() { toast("Stimme", "ElevenLabs nicht erreichbar. Ich nutze die Browserstimme.", "i"); },
    }) : null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const chunks = buf.split("\n\n");
      buf = chunks.pop() || "";
      for (const chunk of chunks) {
        const ev = /event:\s*(\w+)/.exec(chunk)?.[1];
        const dataLine = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
        if (!ev || !dataLine) continue;
        let data = {};
        try { data = JSON.parse(dataLine); } catch { continue; }
        if (ev === "delta" && data.text) {
          full += data.text;
          sp.textContent = full;
          $("#log").scrollTop = 1e9;
          if (cut === speechCut) voice?.push(data.text);
        } else if (ev === "confirm") showConfirm(data);
        else if (ev === "ui" && data.data) openView(data.data, panelToArea(data.panel));
        else if (ev === "bot" && data.id) activateBot(data.id, data.task || "Auftrag");
        else if (ev === "error") throw new Error(data.message || "Fehler");
      }
    }
    if (full) history.push({ role: "assistant", content: full });
    if (cut !== speechCut) return;
    if (voice) voice.close();
    else finishReply(gen);
  } catch (e) {
    speech.cancel();
    sp.textContent = e.message || "Jarvis ist gerade nicht erreichbar.";
    S.speakEnd = 0;
    if (cut === speechCut) finishReply(gen);
  }
}

$("#form").addEventListener("submit", (e) => {
  e.preventDefault();
  speech.unlock?.();
  const v = $("#inp").value;
  $("#inp").value = "";
  ask(v);
});
$("#chips").addEventListener("click", (e) => {
  if (e.target.classList.contains("chip")) {
    speech.unlock?.();
    ask(e.target.textContent);
  }
});
$("#mute").onclick = () => {
  const next = !speech.isMuted();
  speech.setMuted(next);
  $("#mute").classList.toggle("off", next);
  $("#muteWave").style.display = next ? "none" : "";
};

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const listenSupport = handsFreeSupport(window);
const utterance = createUtterance();
let epoch = 0;
let speakEpoch = 0;
let speechCut = 0;
let armed = false;
let handsPending = false;
let ptt = false;
let armGen = 0;
let rec = null;
let activeTicket = 0;
let micStream = null;
let analyser = null;

function storedHands() {
  try { return localStorage.getItem(HANDSFREE_KEY); } catch { return null; }
}
function handsOn() {
  return handsFreePref(storedHands()) === true;
}
function writeHands(on) {
  try { localStorage.setItem(HANDSFREE_KEY, on ? "1" : "0"); } catch { /* privat */ }
}
function noteGrant() {
  if (!listenSupport.ok) return;
  const raw = storedHands();
  if (prefAfterGrant(raw) !== "1" || raw === "1") return;
  writeHands(true);
  armed = true;
  toast("Freisprechen", "Ist an. Eine kurze Pause sendet den Satz. Der Kopfhörer schaltet es aus.", "i");
  paintListen();
}

function paintListen() {
  const on = handsOn() && listenSupport.ok;
  const hands = $("#hands");
  const hint = $("#listenHint");
  const hintText = handsFreeHint(listenSupport.reason);
  if (hands) {
    hands.classList.toggle("on", on);
    hands.setAttribute("aria-pressed", on ? "true" : "false");
    hands.setAttribute("aria-disabled", listenSupport.ok ? "false" : "true");
    hands.title = listenSupport.ok ? (on ? "Freisprechen aus" : "Freisprechen an") : hintText;
  }
  if (hint) {
    hint.textContent = hintText;
    hint.hidden = !hintText;
  }
  const micOn = ptt || (on && armed && S.mode === "listen");
  $("#mic").classList.toggle("on", micOn);
  $("#mic").setAttribute("aria-pressed", micOn ? "true" : "false");
  $("#mic").title = on ? "Satz jetzt senden" : "Sprechen";
  $("#hMic").textContent = ptt ? "An" : (on && armed && S.mode === "listen" ? "Dauer" : "Aus");
  S.listening = micOn;
}

function haltRecognition() {
  activeTicket += 1;
  const current = rec;
  rec = null;
  try { current && current.abort(); } catch { /* ignore */ }
}

function closeMicMeter() {
  if (micStream) micStream.getTracks().forEach((t) => t.stop());
  micStream = null;
  if (analyser?._ac) analyser._ac.close().catch(() => {});
  analyser = null;
  S.mic = 0;
}

async function openMicMeter() {
  if (micStream) return true;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const src = ac.createMediaStreamSource(micStream);
    analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    analyser._data = new Uint8Array(analyser.fftSize);
    src.connect(analyser);
    analyser._ac = ac;
    return true;
  } catch {
    return false;
  }
}

function beginReply() {
  epoch += 1;
  utterance.reset();
  haltRecognition();
  return epoch;
}

function finishReply(gen) {
  if (gen !== epoch) return;
  if (speech.isSpeaking()) return;
  epoch += 1;
  if (ptt) return;
  if (armed && handsOn() && listenSupport.ok) {
    setMode("listen", "FREISPRECHEN");
    armHandsFree({ quiet: true }).then((ok) => {
      if (ok || rec || ptt || !handsOn() || !armed) return;
      handsPending = true;
      if (S.mode === "listen") setMode("idle");
    });
    return;
  }
  setMode("idle");
}

function interruptSpeech() {
  speechCut += 1;
  speech.cancel();
  speakToken += 1;
  S.speakEnd = 0;
  utterance.reset();
  finishReply(epoch);
}

function heardText(results) {
  let finalText = "";
  let interimText = "";
  const list = results || [];
  for (let i = 0; i < list.length; i++) {
    const result = list[i];
    const t = String(result[0]?.transcript || "").trim();
    if (!t) continue;
    if (result.isFinal) finalText = finalText ? `${finalText} ${t}` : t;
    else interimText = interimText ? `${interimText} ${t}` : t;
  }
  return { finalText, interimText };
}

function startContinuous(ticket, seenEpoch) {
  if (!SR || ticket !== activeTicket || epoch !== seenEpoch || !armed || ptt || !handsOn()) return false;
  let session;
  try { session = new SR(); } catch { return false; }
  let recError = "";
  rec = session;
  session.lang = "de-DE";
  session.continuous = true;
  session.interimResults = true;
  session.onresult = (e) => {
    if (ticket !== activeTicket || epoch !== seenEpoch || ptt) return;
    const heard = heardText(e.results);
    utterance.sync(heard.finalText, heard.interimText, (text) => {
      if (ticket !== activeTicket || epoch !== seenEpoch || !armed || ptt) return;
      ask(text);
    });
    const field = $("#inp");
    if (field) field.value = utterance.preview();
  };
  session.onerror = (ev) => { recError = ev?.error || "error"; };
  session.onend = () => {
    if (rec === session) rec = null;
    if (ticket !== activeTicket || epoch !== seenEpoch || !armed || ptt || !handsOn()) return;
    if (recError === "not-allowed" || recError === "service-not-allowed") {
      armed = false;
      handsPending = true;
      paintListen();
      if (S.mode === "listen") setMode("idle");
      toast("Mikrofon", "Kein Zugriff. Tippe nochmal auf den Kopfhörer.", "!");
      return;
    }
    if (recError === "audio-capture" && micStream) closeMicMeter();
    recError = "";
    setTimeout(() => {
      if (ticket !== activeTicket || epoch !== seenEpoch || !armed || ptt) return;
      startContinuous(ticket, seenEpoch);
    }, 280);
  };
  try {
    session.start();
    return true;
  } catch {
    if (rec === session) rec = null;
    return false;
  }
}

function armHandsFree(opts = {}) {
  if (!listenSupport.ok || !handsOn()) return Promise.resolve(false);
  const quiet = !!opts.quiet;
  const mine = ++armGen;
  armed = true;
  handsPending = false;
  return (async () => {
    haltRecognition();
    const ticket = activeTicket;
    const seenEpoch = epoch;
    const metered = await openMicMeter();
    if (mine !== armGen || ticket !== activeTicket || seenEpoch !== epoch || !armed || !handsOn() || ptt) return false;
    if (!metered && quiet) return false;
    if (metered) noteGrant();
    const started = startContinuous(ticket, seenEpoch);
    if (mine !== armGen || !started) return false;
    noteGrant();
    if (S.mode !== "think" && S.mode !== "speak") setMode("listen", "FREISPRECHEN");
    else paintListen();
    return true;
  })();
}

function bootHandsFree() {
  paintListen();
  if (!listenSupport.ok || !handsOn()) return;
  armHandsFree({ quiet: true }).then((ok) => {
    if (!ok && handsOn() && armed && !rec && !ptt) handsPending = true;
  });
}

async function startPtt() {
  if (ptt) return;
  ptt = true;
  utterance.reset();
  haltRecognition();
  setMode("listen", "SPRECHEN SIE JETZT");
  const metered = await openMicMeter();
  if (!ptt) return;
  if (!metered) {
    toast("Mikrofon", "Kein Zugriff. Bitte tippen.", "!");
    stopPtt();
    return;
  }
  noteGrant();
  if (!SR) {
    toast("Spracherkennung", "In diesem Browser nicht verfügbar.", "i");
    setTimeout(() => { if (ptt) stopPtt(); }, 4000);
    return;
  }
  let session;
  try { session = new SR(); } catch { stopPtt(); return; }
  rec = session;
  session.lang = "de-DE";
  session.interimResults = true;
  session.continuous = false;
  session.onresult = (e) => {
    if (!ptt || rec !== session) return;
    let said = "";
    for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
    said = said.trim();
    $("#inp").value = said;
    if (e.results[e.results.length - 1].isFinal) {
      stopPtt({ keepMode: true });
      ask(said);
    }
  };
  session.onerror = () => {};
  session.onend = () => { if (ptt && rec === session) stopPtt(); };
  try { session.start(); } catch { /* ignore */ }
}

function stopPtt(opts = {}) {
  const was = ptt;
  ptt = false;
  if (was) haltRecognition();
  if (!(armed && handsOn() && listenSupport.ok)) closeMicMeter();
  if (was && !opts.keepMode && S.mode === "listen") setMode("idle");
  else paintListen();
}

$("#hands").onclick = async () => {
  speech.unlock?.();
  if (!listenSupport.ok) {
    toast("Freisprechen", handsFreeHint(listenSupport.reason), "i");
    return;
  }
  if (handsOn()) {
    writeHands(false);
    armed = false;
    handsPending = false;
    utterance.reset();
    if (!ptt) {
      haltRecognition();
      closeMicMeter();
      if (S.mode === "listen") setMode("idle");
    }
    paintListen();
    return;
  }
  writeHands(true);
  const ok = await armHandsFree();
  if (!ok && handsOn()) toast("Mikrofon", "Kein Zugriff. Bitte die Freigabe erlauben und nochmal tippen.", "!");
};

$("#mic").onclick = async () => {
  speech.unlock?.();
  if (handsOn() && listenSupport.ok) {
    if (S.mode === "speak" || S.mode === "think" || speech.isSpeaking()) {
      interruptSpeech();
      return;
    }
    const pending = utterance.flushNow();
    if (pending) {
      ask(pending);
      return;
    }
    if (!rec) {
      const ok = await armHandsFree();
      if (!ok) toast("Mikrofon", "Kein Zugriff. Bitte tippen.", "!");
    }
    return;
  }
  if (ptt) {
    const pending = $("#inp").value.trim();
    stopPtt({ keepMode: !!pending });
    if (pending) ask(pending);
    return;
  }
  await startPtt();
};

/* ---------- Canvas ---------- */
const sc = $("#stars");
const sx = sc.getContext("2d");
let stars = [];
let SW = 0;
let SH = 0;
const DPR = Math.min(2, window.devicePixelRatio || 1);
function initStars() {
  SW = sc.width = innerWidth * DPR;
  SH = sc.height = innerHeight * DPR;
  sc.style.width = innerWidth + "px";
  sc.style.height = innerHeight + "px";
  const n = Math.min(220, Math.floor(innerWidth * innerHeight / 7000));
  stars = Array.from({ length: n }, () => ({ x: Math.random() * SW, y: Math.random() * SH, z: Math.random(), tw: Math.random() * 6 }));
}
function drawStars(t) {
  sx.clearRect(0, 0, SW, SH);
  for (const s of stars) {
    s.y -= (0.05 + s.z * 0.25) * DPR * (1 + S.amp);
    if (s.y < 0) { s.y = SH; s.x = Math.random() * SW; }
    const a = (0.25 + 0.55 * s.z) * (0.6 + 0.4 * Math.sin(t * 0.002 + s.tw));
    sx.fillStyle = s.z > 0.85 ? `rgba(54,226,255,${a})` : `rgba(253,190,90,${a * 0.8})`;
    sx.fillRect(s.x, s.y, (s.z > 0.9 ? 2 : 1) * DPR, (s.z > 0.9 ? 2 : 1) * DPR);
  }
}
const cv = $("#core");
const cx = cv.getContext("2d");
let CW = 0;
let CH = 0;
const sphere = [];
{
  const N = 420;
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = g * i;
    sphere.push([Math.cos(th) * r, y, Math.sin(th) * r, Math.random()]);
  }
}
function sizeCore() {
  const r = cv.getBoundingClientRect();
  CW = cv.width = Math.max(1, Math.round(r.width * DPR));
  CH = cv.height = Math.max(1, Math.round(r.height * DPR));
}
function drawCore(t) {
  const W = CW, H = CH, X = W / 2, Y = H / 2, R = Math.min(W, H) * 0.38, a = S.amp, T = t / 1000;
  cx.clearRect(0, 0, W, H);
  cx.globalCompositeOperation = "lighter";
  let g = cx.createRadialGradient(X, Y, 0, X, Y, R * 1.2);
  g.addColorStop(0, `rgba(253,173,0,${0.18 + a * 0.35})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  cx.fillStyle = g;
  cx.beginPath();
  cx.arc(X, Y, R * 1.2, 0, 7);
  cx.fill();
  cx.save();
  cx.translate(X, Y);
  cx.rotate(T * 0.15);
  cx.strokeStyle = `rgba(253,173,0,${0.35 + a * 0.4})`;
  cx.lineWidth = 2 * DPR;
  cx.beginPath();
  cx.arc(0, 0, R * 0.72, 0, 7);
  cx.stroke();
  cx.strokeStyle = `rgba(54,226,255,${0.25 + a * 0.45})`;
  cx.beginPath();
  cx.arc(0, 0, R * (0.9 + a * 0.05), T, T + 4);
  cx.stroke();
  cx.restore();
  const sr = R * (0.46 + a * 0.06);
  const cy = Math.cos(T * 0.35);
  const sy = Math.sin(T * 0.35);
  for (const p of sphere) {
    let x = p[0], y = p[1], z = p[2];
    const x1 = x * cy - z * sy;
    const z1 = x * sy + z * cy;
    const al = 0.15 + ((z1 + 1.4) / 2.6) * 0.7;
    cx.fillStyle = p[3] > 0.92 ? `rgba(54,226,255,${al})` : `rgba(253,173,0,${al})`;
    const px = X + x1 * sr;
    const py = Y + y * sr;
    const s = (0.8 + al) * DPR;
    cx.fillRect(px, py, s, s);
  }
  const nr = R * (0.12 + a * 0.08);
  g = cx.createRadialGradient(X, Y, 0, X, Y, nr * 2);
  g.addColorStop(0, "rgba(255,244,210,.95)");
  g.addColorStop(0.4, "rgba(253,173,0,.5)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  cx.fillStyle = g;
  cx.beginPath();
  cx.arc(X, Y, nr * 2, 0, 7);
  cx.fill();
  cx.globalCompositeOperation = "source-over";
}
function loop(t) {
  if (S.mode === "speak") {
    if (speech.hearing?.()) S.target = Math.min(1, 0.12 + speech.level());
    else S.target = 0.45 + 0.35 * Math.abs(Math.sin(t * 0.012));
    if (performance.now() > S.speakEnd && !speech.isSpeaking()) endSpeak();
  } else if (S.mode === "listen") {
    if (analyser) {
      analyser.getByteTimeDomainData(analyser._data);
      let sum = 0;
      for (const v of analyser._data) { const n = (v - 128) / 128; sum += n * n; }
      S.mic = Math.min(1, Math.sqrt(sum / analyser._data.length) * 5);
    }
    S.target = 0.2 + S.mic;
  } else if (S.mode === "think") S.target = 0.28 + 0.12 * Math.sin(t * 0.01);
  else S.target = 0.05 + 0.02 * Math.sin(t * 0.001);
  S.amp += (S.target - S.amp) * 0.12;
  S.impulse *= 0.9;
  $("#hAmp").textContent = String(Math.round(S.amp * 100)).padStart(2, "0") + "%";
  drawStars(t);
  drawCore(t);
  requestAnimationFrame(loop);
}

/* ---------- Boot, Auth, Startparameter ---------- */
let booted = false;
function finishBoot() {
  if (booted) return;
  booted = true;
  const b = $("#boot");
  if (b) b.classList.add("gone");
  document.body.classList.add("ready");
  setTimeout(() => b && b.remove(), 700);
}
function runBoot() {
  const lines = ["JARVIS KERNEL … INITIALISIERE", "HUD-RENDERER OK", "SPRACHMODUL de-DE OK", "HOLO-PANELS OK", "BEREIT"];
  const log = $("#bootLog");
  let i = 0;
  const step = () => {
    if (booted) return;
    if (i < lines.length) {
      const d = document.createElement("div");
      d.textContent = "> " + lines[i];
      log.appendChild(d);
      $("#bootBar").style.width = ((i + 1) / lines.length * 100) + "%";
      i += 1;
      setTimeout(step, 220);
    } else setTimeout(finishBoot, 280);
  };
  step();
}
$("#boot").addEventListener("click", finishBoot);
$("#skip").addEventListener("click", (e) => { e.stopPropagation(); finishBoot(); });
addEventListener("keydown", (e) => {
  if (!booted) { finishBoot(); return; }
  if (e.key === "Escape") { closeHolo(); toggleMenu(false); }
});

async function bootSession() {
  if (DEMO) {
    $("#login").hidden = true;
    renderSide(demoSide());
    return;
  }
  try {
    sb = await getSupabase();
    const got = await sb.auth.getSession();
    session = got.data.session;
    if (!session) {
      $("#login").hidden = false;
      return;
    }
    userId = session.user.id;
    $("#login").hidden = true;
    renderSide(await loadSide(sb).catch(() => ({ today: [], counts: {}, volume: 0, invoices: [], live: true })));
    const day = localStorage.getItem("jarvis_briefing_day");
    if (day !== berlinToday() && !params.has("noboot")) openBriefing(false);
  } catch (e) {
    $("#loginErr").textContent = "Anmeldung gerade nicht erreichbar.";
    $("#login").hidden = false;
  }
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#loginErr").textContent = "";
  try {
    sb = await getSupabase();
    const res = await sb.auth.signInWithPassword({ email: $("#email").value.trim(), password: $("#password").value });
    if (res.error || !res.data.session) throw new Error(res.error?.message || "Anmeldung fehlgeschlagen.");
    session = res.data.session;
    userId = session.user.id;
    $("#login").hidden = true;
    renderSide(await loadSide(sb));
    openBriefing(false);
  } catch (err) {
    $("#loginErr").textContent = err.message || "Anmeldung fehlgeschlagen.";
  }
});
$("#demoBtn").onclick = () => { location.search = "?demo=1&noboot=1"; };
$("#logout").onclick = async () => {
  if (sb) await sb.auth.signOut();
  session = null;
  location.reload();
};

const chips = ["Briefing", "Was ist der Stand bei Beispiel-Café?", "Gespräch mit Beispiel-Café notieren", "Offene Rechnungen", "Social diese Woche", "Pipeline", "Bereiche"];
$("#chips").innerHTML = chips.map((c) => `<button type="button" class="chip">${esc(c)}</button>`).join("");

renderSide(DEMO ? demoSide() : { today: [], counts: {}, volume: 0, invoices: [] });
tickClock();
setInterval(tickClock, 1000);
initStars();
sizeCore();
addEventListener("resize", () => { initStars(); sizeCore(); });
if (window.ResizeObserver) new ResizeObserver(sizeCore).observe(cv);
setMode("idle");
bootHandsFree();
requestAnimationFrame(loop);
if (params.has("noboot")) finishBoot();
else runBoot();
bootSession();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
}

async function applyQuery() {
  if (!DEMO && !session) return;
  if (params.has("menu")) toggleMenu(true);
  if (params.has("card")) showConfirm(demoMeeting());
  if (params.has("briefing")) await openBriefing(true);
  else if (params.has("akte")) await openCustomer(DEMO ? "c-cafe" : (params.get("akte") || ""));
  else if (params.get("panel")) {
    const id = params.get("panel");
    if (id === "customer") await openCustomer("c-cafe");
    else if (AREAS.some((a) => a.id === id)) await openArea(id, params.get("only") ? { only: params.get("only") } : null);
  }
}
if (DEMO) applyQuery();

window.jarvisAsk = ask;
window.jarvisOpenPanel = (id) => openArea(id);
window.jarvisClosePanels = closeHolo;
window.jarvisSkipBoot = finishBoot;
