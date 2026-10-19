import assert from "node:assert/strict";
import test from "node:test";
import {
  BLOCK_MAX,
  ELEVEN_PLAYBACK_RATE,
  FIRST_BLOCK,
  LOOKAHEAD,
  createElevenLabsSpeech,
  foldBlocks,
  planSpeech,
  runPrefetch,
} from "./speech.js";

test("playbackRate bleibt 1, Vorlauf mindestens zwei Blöcke", () => {
  assert.equal(ELEVEN_PLAYBACK_RATE, 1);
  assert.ok(LOOKAHEAD >= 2);
  assert.ok(FIRST_BLOCK < BLOCK_MAX);
  assert.ok(BLOCK_MAX <= 250);
});

test("Kurze Sätze werden zu Blöcken, der erste bleibt klein", () => {
  const sentences = Array.from({ length: 14 }, (_, i) => `Satz ${i} ist kurz und deutlich.`);
  const folded = foldBlocks("", 0, sentences, true);
  assert.ok(folded.blocks.length >= 2);
  assert.ok(folded.blocks[0].length <= FIRST_BLOCK);
  assert.match(folded.blocks[0], /^Satz 0/);
  for (const block of folded.blocks.slice(1)) assert.ok(block.length <= BLOCK_MAX);
  assert.equal(folded.rest, "");
  const plan = planSpeech(sentences.join(" "));
  assert.equal(plan[0].previous_text, "");
  assert.equal(plan[0].next_text, plan[1].text);
  assert.equal(plan[1].previous_text, plan[0].text);
  assert.equal(plan.at(-1).next_text, "");
});

test("Ein fertiger Satz geht sofort raus, der nächste startet nicht erst am Ende", () => {
  const first = foldBlocks("", 0, ["Ja."], false);
  assert.deepEqual(first.blocks, ["Ja."]);
  const second = foldBlocks(first.rest, first.count, ["Die Pipeline hat vier offene Angebote."], false);
  assert.equal(second.blocks.length, 1);
  assert.match(second.blocks[0], /Pipeline/);
});

test("Die nächsten Blöcke werden geladen, bevor der erste zu Ende ist", async () => {
  const blocks = ["eins", "zwei", "drei", "vier"].map((text, i, all) => ({
    text,
    previous_text: i ? all[i - 1] : "",
    next_text: i + 1 < all.length ? all[i + 1] : "",
  }));
  const started = [];
  const played = [];
  await runPrefetch(blocks, {
    load: async (spec) => {
      started.push(spec.text);
      await new Promise((resolve) => setTimeout(resolve, 15));
      return spec.text;
    },
    play: async (audio) => {
      if (!played.length) {
        assert.ok(started.includes("zwei"));
        assert.ok(started.includes("drei"));
        assert.equal(started.includes("vier"), false);
      }
      played.push(audio);
    },
  });
  assert.deepEqual(played, ["eins", "zwei", "drei", "vier"]);
});

test("Unterbrechen bricht offene Anfragen ab und stoppt geplante Clips", async () => {
  const sources = [];
  const stopped = [];
  const abortedTexts = [];
  globalThis.window = {
    speechSynthesis: {
      getVoices: () => [],
      cancel() {},
      speak() {},
    },
    AudioContext: class {
      constructor() {
        this.currentTime = 0;
        this.state = "running";
        this.destination = {};
      }
      resume() { return Promise.resolve(); }
      createAnalyser() {
        return { fftSize: 1024, smoothingTimeConstant: 0, connect() {}, getByteTimeDomainData() {} };
      }
      createBufferSource() {
        const src = {
          buffer: null,
          playbackRate: { value: 0 },
          preservesPitch: false,
          connect() {},
          disconnect() {},
          start() { sources.push(src); },
          stop() { stopped.push(src); },
          onended: null,
        };
        return src;
      }
      decodeAudioData() { return Promise.resolve({ duration: 0.4 }); }
    },
  };
  const pending = [];
  globalThis.fetch = (_url, opts) => new Promise((resolve, reject) => {
    const spec = JSON.parse(opts.body);
    const fail = () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      reject(err);
    };
    spec.release = () => resolve({
      ok: true,
      headers: { get: () => "audio/mpeg" },
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    pending.push(spec);
    const note = () => { abortedTexts.push(spec.text.slice(0, 1)); fail(); };
    if (opts.signal.aborted) note();
    else opts.signal.addEventListener("abort", note, { once: true });
  });
  const originalFetch = globalThis.fetch;
  try {
    const sentences = ["A", "B", "C", "D"].map((ch) => `${ch.repeat(130)}.`);
    const plan = planSpeech(sentences.join(" "));
    assert.ok(plan.length >= 4);
    let ended = false;
    const speech = createElevenLabsSpeech({
      enabled: () => true,
      url: "https://example.test/jarvis-tts",
      apikey: "k",
      token: async () => "tok",
    });
    speech.speak(sentences.join(" "), { onend: () => { ended = true; } });
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(pending.length, 3);
    const first = pending[0];
    first.release();
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(sources.length, 1);
    assert.equal(sources[0].playbackRate.value, 1);
    assert.equal(sources[0].preservesPitch, true);
    assert.equal(pending.length, 4);
    speech.cancel();
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(stopped.length, 1);
    assert.deepEqual(abortedTexts.sort(), ["B", "C", "D"]);
    assert.equal(pending.length, 4);
    assert.equal(ended, false);
    assert.equal(speech.isSpeaking(), false);
  } finally {
    delete globalThis.window;
    if (globalThis.fetch === originalFetch) delete globalThis.fetch;
  }
});
