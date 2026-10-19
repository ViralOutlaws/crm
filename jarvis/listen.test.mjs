import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanTranscript,
  createUtterance,
  createWakeGate,
  handsFreeHint,
  handsFreePref,
  handsFreeSupport,
  historyExpired,
  HISTORY_IDLE_MS,
  isStopCommand,
  prefAfterGrant,
  SILENCE_MS,
  STALL_MS,
  voiceCardAction,
  withEntityContext,
} from "./listen.js";

function clock() {
  let now = 0;
  const pending = [];
  return {
    schedule(fn, ms) {
      const item = { fn, at: now + ms };
      pending.push(item);
      return item;
    },
    cancel(item) {
      item.fn = null;
    },
    advance(ms) {
      now += ms;
      for (const item of pending) {
        if (item.fn && item.at <= now) {
          const fn = item.fn;
          item.fn = null;
          fn();
        }
      }
    },
  };
}

test("Pause nach dem letzten Ergebnis, auch beim Zwischenstand", () => {
  const c = clock();
  const u = createUtterance({ silenceMs: SILENCE_MS, stallMs: 10000, schedule: c.schedule, cancel: c.cancel });
  const sent = [];
  u.sync("", "Hal", (t) => sent.push(t));
  c.advance(SILENCE_MS - 1);
  assert.deepEqual(sent, []);
  c.advance(1);
  assert.deepEqual(sent, ["Hal"]);
});

test("Weiterreden setzt die Pause zurück", () => {
  const c = clock();
  const u = createUtterance({ silenceMs: 1200, schedule: c.schedule, cancel: c.cancel });
  const sent = [];
  const flush = (t) => sent.push(t);
  u.sync("Pipeline", "", flush);
  c.advance(500);
  u.sync("Pipeline", "bitte", flush);
  c.advance(1199);
  assert.deepEqual(sent, []);
  u.sync("Pipeline bitte", "", flush);
  c.advance(1199);
  assert.deepEqual(sent, []);
  c.advance(1);
  assert.deepEqual(sent, ["Pipeline bitte"]);
});

test("Lange Aussage: Sitzungen zusammenführen, gleiche Erkennung setzt die Pause nicht neu", () => {
  const c = clock();
  const u = createUtterance({ silenceMs: 1400, stallMs: 2000, schedule: c.schedule, cancel: c.cancel });
  const sent = [];
  const flush = (t) => sent.push(t);
  u.sync("Ich möchte", "eine lange", flush);
  c.advance(1000);
  u.seal();
  u.sync("Pipeline Erklärung", "", flush);
  assert.equal(u.preview(), "Ich möchte eine lange Pipeline Erklärung");
  c.advance(400);
  u.sync("Pipeline Erklärung", "", flush);
  c.advance(1000);
  assert.deepEqual(sent, ["Ich möchte eine lange Pipeline Erklärung"]);
});

test("Ohne neues Ergebnis sendet der Deckel nach 2 Sekunden genau einmal", () => {
  const c = clock();
  const u = createUtterance({ silenceMs: 10000, stallMs: STALL_MS, schedule: c.schedule, cancel: c.cancel });
  const sent = [];
  u.sync("", "hängt im Feld", (t) => sent.push(t));
  c.advance(STALL_MS - 1);
  assert.deepEqual(sent, []);
  c.advance(1);
  assert.deepEqual(sent, ["hängt im Feld"]);
  c.advance(5000);
  assert.deepEqual(sent, ["hängt im Feld"]);
});

test("flushNow sendet auch den Zwischenstand und stoppt die Pause", () => {
  const c = clock();
  const u = createUtterance({ silenceMs: 1200, schedule: c.schedule, cancel: c.cancel });
  const sent = [];
  u.sync("Offene", "Rechnungen", (t) => sent.push(t));
  assert.equal(u.preview(), "Offene Rechnungen");
  assert.equal(u.flushNow(), "Offene Rechnungen");
  c.advance(5000);
  assert.deepEqual(sent, []);
  assert.equal(u.preview(), "");
});

test("Stopp ist nur das einzelne Wort", () => {
  assert.equal(isStopCommand("Stopp"), true);
  assert.equal(isStopCommand("  stopp. "), true);
  assert.equal(isStopCommand("Halt!"), true);
  assert.equal(isStopCommand("stop"), true);
  assert.equal(isStopCommand("Stopp die Rechnung"), false);
  assert.equal(isStopCommand(""), false);
});

test("Freisprechen: iOS mit API in Abschnitten, ohne API aus, Chrome dauerhaft", () => {
  const iphone = handsFreeSupport({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/120.0 Mobile",
    SpeechRecognition: function SR() {},
  });
  assert.equal(iphone.ok, true);
  assert.equal(iphone.continuous, false);
  const safari = handsFreeSupport({
    navigator: {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
    },
    webkitSpeechRecognition: function SR() {},
  });
  assert.equal(safari.ok, true);
  assert.equal(safari.continuous, false);
  assert.equal(handsFreeSupport({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)",
    platform: "iPhone",
  }).reason, "ios");
  const ipad = handsFreeSupport({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
    platform: "MacIntel",
    maxTouchPoints: 5,
    webkitSpeechRecognition: function SR() {},
  });
  assert.equal(ipad.ok, true);
  assert.equal(ipad.continuous, false);
  assert.equal(handsFreeSupport({
    userAgent: "Mozilla/5.0 (Windows NT 10.0)",
    platform: "Win32",
    maxTouchPoints: 0,
  }).reason, "unsupported");
  assert.equal(handsFreeSupport({
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0",
    platform: "Linux x86_64",
    maxTouchPoints: 0,
    webkitSpeechRecognition: function SR() {},
  }).ok, true);
  assert.equal(handsFreeSupport({
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0",
    platform: "Linux x86_64",
    maxTouchPoints: 0,
    webkitSpeechRecognition: function SR() {},
  }).continuous, true);
  assert.equal(handsFreeSupport({
    navigator: {
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0",
      platform: "Linux x86_64",
      maxTouchPoints: 0,
    },
    webkitSpeechRecognition: function SR() {},
  }).ok, true);
  assert.match(handsFreeHint("ios"), /Mikrofon/);
  assert.equal(handsFreeHint(""), "");
});

test("Spracherkennung: Jarvis weg, Aliase glatt", () => {
  assert.equal(cleanTranscript("  jarwis  zeig   Marki  "), "Jarvis zeig Marky");
  assert.equal(cleanTranscript("Hey Jarvis, Sally soll das machen"), "Hey Jarvis, Saley soll das machen");
  assert.equal(cleanTranscript("Kashy und Webbi und Developi"), "Cashy und Webby und Developy");
});

test("Freisprechen hört nur auf Jarvis, dann 15 Sekunden", () => {
  let now = 1_000;
  const gate = createWakeGate({ now: () => now, windowMs: 15000 });
  assert.deepEqual(gate.accept("Pipeline bitte"), { take: false, text: "" });
  assert.deepEqual(gate.accept("Jarvis, Pipeline bitte"), { take: true, text: "Pipeline bitte" });
  now += 10000;
  assert.deepEqual(gate.accept("und die Rechnungen"), { take: true, text: "und die Rechnungen" });
  now += 15000;
  assert.deepEqual(gate.accept("nochwas"), { take: false, text: "" });
  assert.deepEqual(gate.accept("Hey Jarvis"), { take: false, text: "" });
});

test("Karte: bestätigen, abbrechen, Löschen nur mit löschen", () => {
  assert.equal(voiceCardAction("bestätigen"), "confirm");
  assert.equal(voiceCardAction("passt so"), "confirm");
  assert.equal(voiceCardAction("ja, mach"), "confirm");
  assert.equal(voiceCardAction("Jarvis, bestätigen"), "confirm");
  assert.equal(voiceCardAction("abbrechen"), "reject");
  assert.equal(voiceCardAction("nein"), "reject");
  assert.equal(voiceCardAction("ja", true), null);
  assert.equal(voiceCardAction("bestätigen", true), null);
  assert.equal(voiceCardAction("löschen", true), "confirm");
  assert.equal(voiceCardAction("ja, löschen", true), "confirm");
  assert.equal(voiceCardAction("nein", true), "reject");
  assert.equal(historyExpired(0, 10_000), false);
  assert.equal(historyExpired(1_000, 1_000 + HISTORY_IDLE_MS - 1), false);
  assert.equal(historyExpired(1_000, 1_000 + HISTORY_IDLE_MS), true);
  const msgs = withEntityContext([{ role: "user", content: "Wer war das?" }], "Beispiel GmbH (contacts abc)");
  assert.match(msgs[0].content, /Beispiel GmbH/);
  assert.match(msgs[0].content, /nicht vorlesen/);
});

test("Speicher: erste Freigabe schaltet an, 0 bleibt", () => {
  assert.equal(handsFreePref(null), null);
  assert.equal(handsFreePref("1"), true);
  assert.equal(handsFreePref("0"), false);
  assert.equal(prefAfterGrant(null), "1");
  assert.equal(prefAfterGrant("0"), "0");
  assert.equal(prefAfterGrant("1"), "1");
});
