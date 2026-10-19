// Sprachausgabe. createSpeech ist die Browserstimme.
// createElevenLabsSpeech bündelt kurze Sätze, lädt mehrere Blöcke voraus und spielt sie in Reihenfolge.

const SENTENCE_CAP = 1400;
// Zusätzliches Tempo nur für die ElevenLabs-Wiedergabe. 1 = Dateitempo.
// 1.2 klingt bei dieser Stimme verzerrt, deshalb Dateitempo. Hier später änderbar.
export const ELEVEN_PLAYBACK_RATE = 1.0;
export const FIRST_BLOCK = 120;
export const BLOCK_MAX = 250;
export const LOOKAHEAD = 2;

export function pullSentences(buffer, flush) {
  const ready = [];
  const src = String(buffer || "");
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const brk = ch === "\n" || ch === "." || ch === "!" || ch === "?" || ch === "…";
    if (!brk) continue;
    let end = i + 1;
    if (ch !== "\n") {
      while (end < src.length && ".!?…".includes(src[end])) end++;
    }
    const piece = src.slice(start, ch === "\n" ? i : end).trim();
    if (piece) ready.push(piece);
    while (end < src.length && /\s/.test(src[end])) end++;
    start = end;
    i = end - 1;
  }
  let rest = src.slice(start);
  if (flush) {
    const tail = rest.trim();
    if (tail) ready.push(tail);
    rest = "";
  } else if (rest.length > 420) {
    const cut = rest.lastIndexOf(" ", 420);
    const at = cut > 80 ? cut : 420;
    const piece = rest.slice(0, at).trim();
    if (piece) ready.push(piece);
    rest = rest.slice(at);
  }
  return { ready: ready.flatMap(splitLong).filter((s) => s.length > 1), rest };
}

function splitLong(sentence) {
  const text = String(sentence || "").replace(/\s+/g, " ").trim();
  if (text.length <= SENTENCE_CAP) return text ? [text] : [];
  const out = [];
  let i = 0;
  while (i < text.length) {
    const part = text.slice(i, i + SENTENCE_CAP).trim();
    if (part) out.push(part);
    i += SENTENCE_CAP;
  }
  return out;
}

export function foldBlocks(rest, emitted, sentences, flush) {
  let buf = String(rest || "").trim();
  let count = emitted || 0;
  const blocks = [];
  const take = (text) => {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (t.length <= 1) return;
    blocks.push(t);
    count += 1;
  };
  for (const raw of sentences || []) {
    const piece = String(raw || "").replace(/\s+/g, " ").trim();
    if (piece.length <= 1) continue;
    const max = count === 0 ? FIRST_BLOCK : BLOCK_MAX;
    if (!buf) {
      buf = piece;
      if (piece.length >= max) {
        take(buf);
        buf = "";
      }
      continue;
    }
    const joined = `${buf} ${piece}`;
    if (joined.length <= max) {
      buf = joined;
      continue;
    }
    take(buf);
    const nextMax = count === 0 ? FIRST_BLOCK : BLOCK_MAX;
    if (piece.length >= nextMax) take(piece);
    else buf = piece;
  }
  if (buf && (flush || sentences?.length)) {
    take(buf);
    buf = "";
  }
  return { blocks, rest: buf, count };
}

export function planSpeech(text) {
  const { ready } = pullSentences(String(text || ""), true);
  const folded = foldBlocks("", 0, ready, true);
  return folded.blocks.map((block, i, all) => ({
    text: block,
    previous_text: i > 0 ? all[i - 1] : "",
    next_text: i + 1 < all.length ? all[i + 1] : "",
  }));
}

export function createLoadQueue(hooks) {
  const items = [];
  const ends = [];
  let started = 0;
  let cursor = 0;
  let pumping = false;
  let closed = false;
  let done = false;
  const lookahead = hooks.lookahead ?? LOOKAHEAD;
  const alive = hooks.alive || (() => true);

  const finish = () => {
    if (done) return;
    done = true;
    hooks.ondone?.();
  };

  const fail = (error, index) => {
    if (done) return;
    done = true;
    hooks.onerror?.({ error, index });
  };

  const pump = async () => {
    if (pumping || done) return;
    pumping = true;
    try {
      while (alive() && !done) {
        const target = Math.min(items.length, cursor + lookahead + 1);
        while (started < target) {
          const item = items[started++];
          item.promise = Promise.resolve()
            .then(() => hooks.load(item.spec))
            .then((audio) => ({ audio }))
            .catch((error) => ({ error }));
        }
        if (cursor >= items.length) break;
        const item = items[cursor];
        if (!item?.promise) break;
        const loaded = await item.promise;
        if (!alive() || done) return;
        if (loaded.error) {
          pumping = false;
          fail(loaded.error, cursor);
          return;
        }
        const audio = loaded.audio;
        if (audio != null) {
          const ended = hooks.play(audio, item.spec, cursor);
          if (ended && typeof ended.then === "function") ends.push(ended);
        }
        cursor += 1;
      }
    } catch (error) {
      pumping = false;
      if (alive()) fail(error, cursor);
      return;
    }
    pumping = false;
    if (!alive() || done) return;
    if (cursor < items.length) {
      pump();
      return;
    }
    if (closed) {
      try {
        await Promise.all(ends);
      } catch { /* Abbruch der Wiedergabe */ }
      if (!alive() || done) return;
      finish();
    }
  };

  return {
    push(specs) {
      if (done || !alive()) return;
      for (const spec of specs || []) items.push({ spec, promise: null });
      pump();
    },
    close() {
      closed = true;
      if (!pumping && cursor >= items.length) {
        Promise.all(ends).then(() => {
          if (alive() && !done) finish();
        });
        return;
      }
      pump();
    },
  };
}

export function runPrefetch(blocks, hooks) {
  return new Promise((resolve, reject) => {
    const queue = createLoadQueue({
      load: hooks.load,
      play: hooks.play,
      alive: hooks.alive,
      lookahead: hooks.lookahead,
      ondone: () => resolve(true),
      onerror: (info) => reject(info.error || info),
    });
    queue.push(blocks);
    queue.close();
  });
}

export function createSpeech() {
  const has = typeof window !== "undefined" && "speechSynthesis" in window;
  let muted = false;
  let voice = null;
  let token = 0;

  function pick() {
    if (!has) return;
    const list = window.speechSynthesis.getVoices();
    voice = list.find((v) => /de[-_]DE/i.test(v.lang) && /google|neural|premium|online/i.test(v.name))
      || list.find((v) => /^de/i.test(v.lang))
      || null;
  }

  if (has) {
    pick();
    window.speechSynthesis.onvoiceschanged = pick;
  }

  return {
    setMuted(value) {
      muted = !!value;
      if (muted) this.cancel();
    },
    isMuted() {
      return muted;
    },
    isSpeaking() {
      return !!(has && window.speechSynthesis.speaking);
    },
    level() {
      return 0;
    },
    hearing() {
      return false;
    },
    cancel() {
      token += 1;
      if (has) {
        try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
      }
    },
    speak(text, hooks = {}) {
      const mine = ++token;
      if (!text || muted || !has) {
        hooks.onend?.();
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(String(text));
        utter.lang = "de-DE";
        if (voice) utter.voice = voice;
        utter.rate = 1.03;
        utter.pitch = 0.92;
        utter.onstart = () => { if (mine === token) hooks.onstart?.(); };
        utter.onboundary = () => { if (mine === token) hooks.onboundary?.(); };
        utter.onend = () => { if (mine === token) hooks.onend?.(); };
        utter.onerror = () => { if (mine === token) hooks.onerror?.(); };
        window.speechSynthesis.speak(utter);
      } catch {
        hooks.onerror?.();
      }
    },
  };
}

export function createElevenLabsSpeech(opts = {}) {
  const fallback = createSpeech();
  let muted = false;
  let token = 0;
  let speaking = false;
  let hearing = false;
  let audioCtx = null;
  let analyserNode = null;
  let levelData = null;
  let settle = null;
  let playhead = 0;
  let activeSources = 0;
  const aborts = new Set();
  const stops = new Set();

  function finishWait() {
    const done = settle;
    settle = null;
    done?.();
  }

  function stopAudio() {
    for (const ctrl of aborts) {
      try { ctrl.abort(); } catch { /* ignore */ }
    }
    aborts.clear();
    for (const stop of stops) {
      try { stop(); } catch { /* ignore */ }
    }
    stops.clear();
    activeSources = 0;
    playhead = 0;
    hearing = false;
    finishWait();
  }

  function ensureCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function canEleven() {
    return typeof opts.enabled === "function" ? !!opts.enabled() : true;
  }

  function playBrowser(text, mine) {
    return new Promise((resolve) => {
      if (mine !== token || muted) return resolve();
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        if (settle === done) settle = null;
        clearTimeout(timer);
        resolve();
      };
      settle = done;
      const timer = setTimeout(done, 20000);
      fallback.speak(text, { onend: done, onerror: done });
    });
  }

  function attachAnalyser(ctx) {
    if (analyserNode) return analyserNode;
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    an.smoothingTimeConstant = 0.65;
    levelData = new Uint8Array(an.fftSize);
    an.connect(ctx.destination);
    analyserNode = an;
    return an;
  }

  function scheduleBuffer(buffer, mine) {
    return new Promise((resolve, reject) => {
      if (mine !== token || muted) return resolve();
      const ctx = audioCtx;
      if (!ctx) return reject(new Error("Kein Audio."));
      const src = ctx.createBufferSource();
      const an = attachAnalyser(ctx);
      src.buffer = buffer;
      src.playbackRate.value = ELEVEN_PLAYBACK_RATE;
      src.preservesPitch = true;
      src.connect(an);
      const startAt = Math.max(ctx.currentTime + 0.02, playhead);
      const dur = buffer.duration / (ELEVEN_PLAYBACK_RATE || 1);
      playhead = startAt + dur;
      activeSources += 1;
      hearing = true;
      let settled = false;
      const done = (err) => {
        if (settled) return;
        settled = true;
        activeSources = Math.max(0, activeSources - 1);
        if (!activeSources) hearing = false;
        stops.delete(stop);
        try { src.disconnect(); } catch { /* ignore */ }
        if (err) reject(err);
        else resolve();
      };
      const stop = () => {
        try { src.stop(); } catch { /* ignore */ }
      };
      stops.add(stop);
      src.onended = () => done();
      try {
        src.start(startAt);
      } catch (err) {
        done(err instanceof Error ? err : new Error("Audio startet nicht."));
      }
    });
  }

  async function loadAudio(spec, mine) {
    const ctx = ensureCtx();
    if (!ctx) throw new Error("Kein Audio.");
    const access = typeof opts.token === "function" ? await opts.token() : "";
    if (mine !== token || muted) return null;
    if (!access) throw new Error("Anmeldung fehlt.");
    const ctrl = new AbortController();
    aborts.add(ctrl);
    try {
      const endpoint = typeof opts.url === "function" ? opts.url() : opts.url;
      const res = await fetch(endpoint, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${access}`,
          apikey: opts.apikey || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: spec.text,
          previous_text: spec.previous_text || "",
          next_text: spec.next_text || "",
        }),
      });
      if (mine !== token || muted) return null;
      const type = res.headers.get("content-type") || "";
      if (!res.ok || !type.includes("audio")) throw new Error("Sprachausgabe fehlgeschlagen.");
      const bytes = await res.arrayBuffer();
      if (mine !== token || muted) return null;
      return await ctx.decodeAudioData(bytes.slice(0));
    } finally {
      aborts.delete(ctrl);
    }
  }

  function openQueue(mine, hooks, specs) {
    let started = false;
    const queue = createLoadQueue({
      alive: () => mine === token && !muted,
      load: (spec) => loadAudio(spec, mine),
      play: (audio) => {
        if (!started) {
          started = true;
          hooks.onstart?.();
        }
        hooks.onboundary?.();
        return scheduleBuffer(audio, mine);
      },
      onerror: ({ error, index }) => {
        if (mine !== token || error?.name === "AbortError") return;
        stopAudio();
        hooks.onfallback?.();
        const rest = specs.slice(index).map((spec) => spec.text).join(" ");
        playBrowser(rest, mine).then(() => {
          if (mine !== token) return;
          speaking = false;
          hooks.onend?.();
        });
      },
      ondone: () => {
        if (mine !== token) return;
        speaking = false;
        hooks.onend?.();
      },
    });
    return queue;
  }

  return {
    unlock() {
      try { ensureCtx(); } catch { /* autoplay */ }
    },
    setMuted(value) {
      muted = !!value;
      fallback.setMuted(value);
      if (muted) this.cancel();
    },
    isMuted() {
      return muted;
    },
    isSpeaking() {
      return speaking || fallback.isSpeaking();
    },
    level() {
      if (!analyserNode || !levelData) return 0;
      analyserNode.getByteTimeDomainData(levelData);
      let sum = 0;
      for (let i = 0; i < levelData.length; i++) {
        const n = (levelData[i] - 128) / 128;
        sum += n * n;
      }
      return Math.min(1, Math.sqrt(sum / levelData.length) * 4.5);
    },
    hearing() {
      return hearing;
    },
    cancel() {
      token += 1;
      speaking = false;
      stopAudio();
      fallback.cancel();
    },
    speak(text, hooks = {}) {
      const mine = ++token;
      stopAudio();
      fallback.cancel();
      const specs = planSpeech(text);
      if (!specs.length || muted) {
        speaking = false;
        hooks.onend?.();
        return;
      }
      if (!canEleven()) {
        fallback.speak(specs.map((spec) => spec.text).join(" "), hooks);
        return;
      }
      speaking = true;
      playhead = 0;
      const queue = openQueue(mine, hooks, specs);
      queue.push(specs);
      queue.close();
    },
    openStream(hooks = {}) {
      const mine = ++token;
      stopAudio();
      fallback.cancel();
      let buf = "";
      let rest = "";
      let count = 0;
      let closed = false;
      let elevenDead = false;
      let ended = false;
      let browserChain = Promise.resolve();
      const specs = [];
      speaking = !muted;
      playhead = 0;
      const sayBrowser = (text) => {
        const line = String(text || "").trim();
        if (!line || mine !== token) return;
        browserChain = browserChain.then(() => playBrowser(line, mine));
      };
      const finish = () => {
        if (ended || mine !== token) return;
        ended = true;
        browserChain.then(() => {
          if (mine !== token) return;
          speaking = false;
          hooks.onend?.();
        });
      };
      const queue = openQueue(mine, {
        onstart: () => hooks.onstart?.(),
        onboundary: () => hooks.onboundary?.(),
        onfallback: () => {
          elevenDead = true;
          hooks.onfallback?.();
        },
        onend: () => {
          if (mine !== token || !closed) return;
          finish();
        },
      }, specs);

      const take = (sentences, flush) => {
        const folded = foldBlocks(rest, count, sentences, flush);
        rest = folded.rest;
        count = folded.count;
        if (!folded.blocks.length) return;
        const batch = folded.blocks.map((text) => {
          const spec = { text, previous_text: specs.length ? specs[specs.length - 1].text : "", next_text: "" };
          if (specs.length) specs[specs.length - 1].next_text = text;
          specs.push(spec);
          return spec;
        });
        if (elevenDead || !canEleven()) {
          sayBrowser(batch.map((spec) => spec.text).join(" "));
          return;
        }
        queue.push(batch);
      };

      return {
        push(text) {
          if (mine !== token || muted || closed) return;
          buf += String(text || "");
          const pulled = pullSentences(buf, false);
          buf = pulled.rest;
          take(pulled.ready, false);
        },
        close() {
          if (mine !== token || closed) return;
          closed = true;
          const pulled = pullSentences(buf, true);
          buf = "";
          take(pulled.ready, true);
          if (elevenDead || !specs.length) {
            finish();
            return;
          }
          queue.close();
        },
      };
    },
  };
}
