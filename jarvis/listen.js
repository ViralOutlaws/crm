// Freisprechen. Kein Mikrofon, kein Netz: nur die Regeln für Pause, Speicher und Browser.

export const SILENCE_MS = 1200;
export const HANDSFREE_KEY = "jarvis_handsfree";

export function handsFreePref(raw) {
  if (raw === "0") return false;
  if (raw === "1") return true;
  return null;
}

/** Fehlender Wert wird bei der ersten Freigabe zu an. Eine gespeicherte 0 bleibt aus. */
export function prefAfterGrant(raw) {
  if (raw === "0" || raw === "1") return raw;
  return "1";
}

export function handsFreeSupport(nav) {
  const provided = nav || {};
  const agent = provided.userAgent || provided.platform
    ? provided
    : (provided.navigator || {});
  const SR = provided.SpeechRecognition || provided.webkitSpeechRecognition
    || agent.SpeechRecognition || agent.webkitSpeechRecognition;
  const ua = String(agent.userAgent || "");
  const platform = String(agent.platform || "");
  const touch = Number(agent.maxTouchPoints || 0);
  const iOS = /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && touch > 1);
  if (iOS) return { ok: false, reason: "ios" };
  if (!SR) return { ok: false, reason: "unsupported" };
  return { ok: true, reason: "" };
}

export function handsFreeHint(reason) {
  if (reason === "ios") return "Auf iPhone und iPad tippe das Mikrofon an. Dauerhaftes Zuhören geht dort nicht.";
  if (reason === "unsupported") return "Dieser Browser hört nicht dauerhaft zu. Tippe das Mikrofon an.";
  return "";
}

export function isStopCommand(text) {
  return /^(stopp|stop|halt)[.!?…]*$/i.test(String(text || "").trim());
}

/**
 * finalText ist der bisher fertige Satz, interimText das, was noch läuft.
 * Die Pause startet nur, wenn etwas fertig ist und nichts mehr läuft.
 * Weiterreden (neues final oder ein Zwischenstand) setzt sie zurück.
 * schedule(fn, ms) liefert eine ID, cancel(id) verwirft sie.
 */
export function createUtterance(opts = {}) {
  const silenceMs = opts.silenceMs ?? SILENCE_MS;
  const schedule = opts.schedule || ((fn, ms) => setTimeout(fn, ms));
  const cancel = opts.cancel || ((id) => clearTimeout(id));
  let finals = "";
  let interim = "";
  let timer = null;
  let generation = 0;

  function clearTimer() {
    if (timer == null) return;
    cancel(timer);
    timer = null;
  }

  return {
    reset() {
      finals = "";
      interim = "";
      generation += 1;
      clearTimer();
    },
    sync(finalText, interimText, onFlush) {
      finals = String(finalText || "").trim();
      interim = String(interimText || "").trim();
      clearTimer();
      const mine = ++generation;
      if (!finals || interim) return;
      const pending = finals;
      timer = schedule(() => {
        if (mine !== generation) return;
        timer = null;
        if (finals !== pending || interim) return;
        finals = "";
        interim = "";
        onFlush(pending);
      }, silenceMs);
    },
    preview() {
      return `${finals} ${interim}`.trim();
    },
    flushNow() {
      generation += 1;
      clearTimer();
      const text = `${finals} ${interim}`.trim();
      finals = "";
      interim = "";
      return text;
    },
  };
}
