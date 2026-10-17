// Sprachausgabe. createSpeech ist die Browserstimme.
// createElevenLabsSpeech spricht Satz für Satz über jarvis-tts und fällt bei Fehlern darauf zurück.

const SENTENCE_CAP = 1400;
// Zusätzliches Tempo nur für die ElevenLabs-Wiedergabe. 1 = Dateitempo.
// 1.2 klingt bei dieser Stimme verzerrt, deshalb Dateitempo. Hier später änderbar.
export const ELEVEN_PLAYBACK_RATE = 1.0;

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
  let stopSource = null;
  let abort = null;
  let settle = null;

  function finishWait() {
    const done = settle;
    settle = null;
    done?.();
  }

  function stopAudio() {
    if (abort) {
      try { abort.abort(); } catch { /* ignore */ }
      abort = null;
    }
    if (stopSource) {
      const stop = stopSource;
      stopSource = null;
      try { stop(); } catch { /* ignore */ }
    }
    hearing = false;
    analyserNode = null;
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

  function playBuffer(buffer, mine) {
    return new Promise((resolve, reject) => {
      if (mine !== token || muted) return resolve();
      const ctx = audioCtx;
      if (!ctx) return reject(new Error("Kein Audio."));
      const src = ctx.createBufferSource();
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.65;
      levelData = new Uint8Array(an.fftSize);
      analyserNode = an;
      src.buffer = buffer;
      src.playbackRate.value = ELEVEN_PLAYBACK_RATE;
      src.preservesPitch = true;
      src.connect(an);
      an.connect(ctx.destination);
      let settled = false;
      const done = (err) => {
        if (settled) return;
        settled = true;
        hearing = false;
        if (analyserNode === an) analyserNode = null;
        if (stopSource === stop) stopSource = null;
        try { src.disconnect(); } catch { /* ignore */ }
        if (err) reject(err);
        else resolve();
      };
      const stop = () => { try { src.stop(); } catch { /* ignore */ } };
      stopSource = stop;
      src.onended = () => done();
      hearing = true;
      try {
        src.start();
      } catch (err) {
        done(err instanceof Error ? err : new Error("Audio startet nicht."));
      }
    });
  }

  async function playEleven(sentence, mine) {
    const ctx = ensureCtx();
    if (!ctx) throw new Error("Kein Audio.");
    const access = typeof opts.token === "function" ? await opts.token() : "";
    if (mine !== token || muted) return;
    if (!access) throw new Error("Anmeldung fehlt.");
    const ctrl = new AbortController();
    abort = ctrl;
    const endpoint = typeof opts.url === "function" ? opts.url() : opts.url;
    const res = await fetch(endpoint, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${access}`,
        apikey: opts.apikey || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: sentence }),
    });
    if (abort === ctrl) abort = null;
    if (mine !== token || muted) return;
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !type.includes("audio")) throw new Error("Sprachausgabe fehlgeschlagen.");
    const bytes = await res.arrayBuffer();
    if (mine !== token || muted) return;
    const copy = bytes.slice(0);
    const audio = await ctx.decodeAudioData(copy);
    if (mine !== token || muted) return;
    await playBuffer(audio, mine);
  }

  async function runQueue(sentences, mine, hooks) {
    let started = false;
    let elevenFailed = false;
    speaking = true;
    for (const sentence of sentences) {
      if (mine !== token || muted) return;
      if (!started) {
        started = true;
        hooks.onstart?.();
      }
      hooks.onboundary?.();
      try {
        if (elevenFailed || !canEleven()) throw new Error("fallback");
        await playEleven(sentence, mine);
      } catch (err) {
        if (mine !== token || err?.name === "AbortError") return;
        if (!elevenFailed && canEleven()) {
          elevenFailed = true;
          hooks.onfallback?.();
        }
        await playBrowser(sentence, mine);
      }
    }
    if (mine !== token) return;
    speaking = false;
    hooks.onend?.();
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
      const { ready } = pullSentences(String(text || ""), true);
      if (!ready.length || muted) {
        speaking = false;
        hooks.onend?.();
        return;
      }
      if (!canEleven()) {
        fallback.speak(ready.join(" "), hooks);
        return;
      }
      speaking = true;
      runQueue(ready, mine, hooks);
    },
    openStream(hooks = {}) {
      const mine = ++token;
      stopAudio();
      fallback.cancel();
      let buf = "";
      let closed = false;
      let pumping = false;
      let started = false;
      let elevenFailed = false;
      const queue = [];
      speaking = !muted;

      const pump = async () => {
        if (pumping || mine !== token) return;
        pumping = true;
        while (queue.length && mine === token && !muted) {
          const sentence = queue.shift();
          if (!started) {
            started = true;
            hooks.onstart?.();
          }
          hooks.onboundary?.();
          try {
            if (elevenFailed || !canEleven()) throw new Error("fallback");
            await playEleven(sentence, mine);
          } catch (err) {
            if (mine !== token || err?.name === "AbortError") break;
            if (!elevenFailed && canEleven()) {
              elevenFailed = true;
              hooks.onfallback?.();
            }
            await playBrowser(sentence, mine);
          }
        }
        pumping = false;
        if (mine !== token) return;
        if (queue.length && !muted) {
          pump();
          return;
        }
        if (closed) {
          speaking = false;
          hooks.onend?.();
        }
      };

      return {
        push(text) {
          if (mine !== token || muted || closed) return;
          buf += String(text || "");
          const pulled = pullSentences(buf, false);
          buf = pulled.rest;
          if (!pulled.ready.length) return;
          queue.push(...pulled.ready);
          pump();
        },
        close() {
          if (mine !== token || closed) return;
          closed = true;
          const pulled = pullSentences(buf, true);
          buf = "";
          queue.push(...pulled.ready);
          if (!queue.length && !pumping) {
            speaking = false;
            hooks.onend?.();
            return;
          }
          pump();
        },
      };
    },
  };
}
