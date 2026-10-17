// Sprachausgabe hinter einem kleinen Adapter. Später kann createElevenLabsSpeech
// denselben Vertrag erfüllen, ohne dass die Oberfläche umgebaut werden muss.

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

// Platzhalter mit demselben Vertrag. Noch keine ElevenLabs-Anbindung.
export function createElevenLabsSpeech() {
  return {
    setMuted() {},
    isMuted() { return true; },
    isSpeaking() { return false; },
    cancel() {},
    speak(_text, hooks = {}) {
      hooks.onerror?.(new Error("ElevenLabs ist noch nicht angebunden."));
    },
  };
}
