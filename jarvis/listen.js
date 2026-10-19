// Freisprechen. Kein Mikrofon, kein Netz: nur die Regeln für Pause, Speicher und Browser.

export const SILENCE_MS = 1400;
export const STALL_MS = 2000;
export const HANDSFREE_KEY = "jarvis_handsfree";
export const WAKE_WINDOW_MS = 15000;
export const HISTORY_IDLE_MS = 30 * 60 * 1000;

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
  if (!SR) return { ok: false, reason: iOS ? "ios" : "unsupported", continuous: false };
  return { ok: true, reason: "", continuous: !iOS };
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
 * Eine Sitzung der Web Speech API liefert finalText und interimText nur für sich.
 * seal() hängt die Sitzung an den bisherigen Text, damit ein Neustart nach onend
 * nichts verwirft. Jedes neue Ergebnis, auch ein Zwischenstand, startet die Pause
 * neu. Nach STALL_MS ohne neues Ergebnis geht der Text trotzdem raus.
 * schedule(fn, ms) liefert eine ID, cancel(id) verwirft sie.
 */
export function createUtterance(opts = {}) {
  const silenceMs = opts.silenceMs ?? SILENCE_MS;
  const stallMs = opts.stallMs ?? STALL_MS;
  const schedule = opts.schedule || ((fn, ms) => setTimeout(fn, ms));
  const cancel = opts.cancel || ((id) => clearTimeout(id));
  let committed = "";
  let finals = "";
  let interim = "";
  let silenceTimer = null;
  let stallTimer = null;
  let generation = 0;

  function clearTimers() {
    if (silenceTimer != null) cancel(silenceTimer);
    if (stallTimer != null) cancel(stallTimer);
    silenceTimer = null;
    stallTimer = null;
  }

  function preview() {
    return `${committed} ${finals} ${interim}`.replace(/\s+/g, " ").trim();
  }

  function arm(onFlush) {
    clearTimers();
    if (!preview()) return;
    const mine = ++generation;
    const fire = () => {
      if (mine !== generation) return;
      generation += 1;
      clearTimers();
      const text = preview();
      committed = "";
      finals = "";
      interim = "";
      if (text) onFlush(text);
    };
    silenceTimer = schedule(fire, silenceMs);
    stallTimer = schedule(fire, stallMs);
  }

  return {
    reset() {
      committed = "";
      finals = "";
      interim = "";
      generation += 1;
      clearTimers();
    },
    sync(finalText, interimText, onFlush) {
      const nextFinal = String(finalText || "").trim();
      const nextInterim = String(interimText || "").trim();
      if (nextFinal === finals && nextInterim === interim) return;
      finals = nextFinal;
      interim = nextInterim;
      arm(onFlush);
    },
    seal() {
      const chunk = `${finals} ${interim}`.replace(/\s+/g, " ").trim();
      if (chunk) committed = `${committed} ${chunk}`.replace(/\s+/g, " ").trim();
      finals = "";
      interim = "";
    },
    preview,
    flushNow() {
      generation += 1;
      clearTimers();
      const text = preview();
      committed = "";
      finals = "";
      interim = "";
      return text;
    },
  };
}

const HEAR = [
  [/\bjarwis\b/gi, "Jarvis"],
  [/\bjervis\b/gi, "Jarvis"],
  [/\bjarves\b/gi, "Jarvis"],
  [/\bmarkie\b/gi, "Marky"],
  [/\bmarki\b/gi, "Marky"],
  [/\bsally\b/gi, "Saley"],
  [/\bsali\b/gi, "Saley"],
  [/\bkashy\b/gi, "Cashy"],
  [/\bcashi\b/gi, "Cashy"],
  [/\bwebbi\b/gi, "Webby"],
  [/\bweby\b/gi, "Webby"],
  [/\bdevelopi\b/gi, "Developy"],
];

export function cleanTranscript(text) {
  let s = String(text || "").replace(/\s+/g, " ").trim();
  for (const [re, to] of HEAR) s = s.replace(re, to);
  return s.replace(/\s+/g, " ").trim();
}

export function hasWake(text) {
  return /\bjarvis\b/i.test(cleanTranscript(text));
}

export function stripWake(text) {
  return cleanTranscript(text)
    .replace(/^(?:hey[, ]+)?jarvis\b[,:]?\s*/i, "")
    .replace(/\bjarvis\b[,:]?\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function createWakeGate(opts = {}) {
  const windowMs = opts.windowMs ?? WAKE_WINDOW_MS;
  const now = opts.now || (() => Date.now());
  let until = 0;
  return {
    accept(text) {
      const cleaned = cleanTranscript(text);
      const t = now();
      if (!hasWake(cleaned) && t >= until) return { take: false, text: "" };
      const command = stripWake(cleaned);
      until = t + windowMs;
      if (!command) return { take: false, text: "" };
      return { take: true, text: command };
    },
    reset() {
      until = 0;
    },
  };
}

export function voiceCardAction(text, danger = false) {
  const s = stripWake(text).toLowerCase().replace(/[!.?,…]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (/^(abbrechen|nein|nee|doch nicht|lass das|lass es)$/.test(s)) return "reject";
  const confirmish = /^(ja mach|ja mach das|mach das|passt so|passt|bestätigen|bestaetigen|bestätige|bestaetige|ja)$/.test(s);
  if (danger) {
    if (/\blösch/.test(s) && !/\bnicht\b/.test(s) && s.split(" ").length <= 4) return "confirm";
    return null;
  }
  if (confirmish) return "confirm";
  return null;
}

export function historyExpired(lastAt, now, idle = HISTORY_IDLE_MS) {
  if (!lastAt) return false;
  return now - lastAt >= idle;
}

export function withEntityContext(messages, note) {
  const copy = (messages || []).map((m) => ({ role: m.role, content: m.content }));
  const line = String(note || "").trim();
  if (!line) return copy;
  for (let i = copy.length - 1; i >= 0; i--) {
    if (copy[i].role === "user") {
      copy[i] = { role: "user", content: `${copy[i].content}\n\nKontext, nicht vorlesen und keine IDs sagen: ${line}` };
      break;
    }
  }
  return copy;
}
