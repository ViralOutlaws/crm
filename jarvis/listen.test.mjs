import assert from "node:assert/strict";
import test from "node:test";
import {
  createUtterance,
  handsFreeHint,
  handsFreePref,
  handsFreeSupport,
  isStopCommand,
  prefAfterGrant,
  SILENCE_MS,
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

test("Pause nach dem letzten finalen Ergebnis", () => {
  const c = clock();
  const u = createUtterance({ silenceMs: SILENCE_MS, schedule: c.schedule, cancel: c.cancel });
  const sent = [];
  u.sync("", "Hal", (t) => sent.push(t));
  c.advance(5000);
  assert.deepEqual(sent, []);
  u.sync("Hallo Kim", "", (t) => sent.push(t));
  c.advance(1199);
  assert.deepEqual(sent, []);
  c.advance(1);
  assert.deepEqual(sent, ["Hallo Kim"]);
});

test("Weiterreden setzt die Pause zurück", () => {
  const c = clock();
  const u = createUtterance({ silenceMs: 1200, schedule: c.schedule, cancel: c.cancel });
  const sent = [];
  const flush = (t) => sent.push(t);
  u.sync("Pipeline", "", flush);
  c.advance(500);
  u.sync("Pipeline", "bitte", flush);
  c.advance(2000);
  assert.deepEqual(sent, []);
  u.sync("Pipeline bitte", "", flush);
  c.advance(1199);
  assert.deepEqual(sent, []);
  c.advance(1);
  assert.deepEqual(sent, ["Pipeline bitte"]);
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

test("Freisprechen: iOS aus, ohne API aus, Chrome an", () => {
  assert.equal(handsFreeSupport({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/120.0 Mobile",
    SpeechRecognition: function SR() {},
  }).reason, "ios");
  assert.equal(handsFreeSupport({
    navigator: {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
    },
    webkitSpeechRecognition: function SR() {},
  }).reason, "ios");
  assert.equal(handsFreeSupport({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
    platform: "MacIntel",
    maxTouchPoints: 5,
    webkitSpeechRecognition: function SR() {},
  }).ok, false);
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

test("Speicher: erste Freigabe schaltet an, 0 bleibt", () => {
  assert.equal(handsFreePref(null), null);
  assert.equal(handsFreePref("1"), true);
  assert.equal(handsFreePref("0"), false);
  assert.equal(prefAfterGrant(null), "1");
  assert.equal(prefAfterGrant("0"), "0");
  assert.equal(prefAfterGrant("1"), "1");
});
