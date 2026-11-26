// Einfache MIME-Dekodierung für eingehende Antworten: RFC 2047 Header, base64, quoted-printable, multipart.

function decodeBytes(bytes: Uint8Array, charset: string): string {
  const cs = (charset || "utf-8").toLowerCase().replace(/^"|"$/g, "");
  try {
    return new TextDecoder(cs === "latin1" ? "iso-8859-1" : cs).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function b64Bytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/=]/g, "");
  try {
    const bin = atob(clean);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return new TextEncoder().encode(s);
  }
}

function qpBytes(s: string, header = false): Uint8Array {
  const src = header ? s.replace(/_/g, " ") : s.replace(/=\r?\n/g, "");
  const out: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(src.slice(i + 1, i + 3))) {
      out.push(parseInt(src.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const code = src.charCodeAt(i);
      if (code < 256) out.push(code);
      else out.push(...new TextEncoder().encode(c));
    }
  }
  return new Uint8Array(out);
}

/** Rohe 8-Bit-Zeichen (ein Zeichen pro Byte) als UTF-8 lesen, sonst unverändert. */
export function binaryToText(value: string, charset = "utf-8"): string {
  const s = String(value || "");
  if (!/[\x80-\xff]/.test(s) || /[^\x00-\xff]/.test(s)) return s;
  const bytes = Uint8Array.from(s, (c) => c.charCodeAt(0));
  try {
    return new TextDecoder(charset, { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("iso-8859-1").decode(bytes);
  }
}

/** "=?UTF-8?Q?Aw:_Anfragen?=" -> "Aw: Anfragen" */
export function decodeWords(value: string): string {
  return binaryToText(String(value || ""))
    .replace(/\?=\s+=\?/g, "?==?")
    .replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, cs, enc, txt) =>
      decodeBytes(String(enc).toUpperCase() === "B" ? b64Bytes(txt) : qpBytes(txt, true), cs));
}

/** Header auseinanderfalten und einen Wert lesen (dekodiert). */
export function mimeHeader(header: string, name: string): string {
  const unfolded = String(header || "").replace(/\r?\n[ \t]+/g, " ");
  const re = new RegExp(`^${name}:\\s*(.*)$`, "im");
  return decodeWords((re.exec(unfolded)?.[1] || "").trim());
}

function param(value: string, key: string): string {
  return new RegExp(`${key}\\s*=\\s*"?([^";]+)"?`, "i").exec(value)?.[1] || "";
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodePart(headers: string, body: string): { type: string; text: string } {
  const ct = mimeHeader(headers, "content-type") || "text/plain";
  const type = ct.split(";")[0].trim().toLowerCase();
  const cte = mimeHeader(headers, "content-transfer-encoding").toLowerCase();
  const charset = param(ct, "charset") || "utf-8";
  if (type.startsWith("multipart/")) {
    const boundary = param(ct, "boundary");
    if (!boundary) return { type: "text/plain", text: body };
    const parts = body.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?\\s*\\r?\\n?`)).slice(1);
    const decoded = parts.map((p) => {
      const idx = p.search(/\r?\n\r?\n/);
      if (idx < 0) return { type: "", text: "" };
      return decodePart(p.slice(0, idx), p.slice(idx).replace(/^\r?\n\r?\n/, ""));
    }).filter((p) => p.text.trim());
    return decoded.find((p) => p.type === "text/plain") || decoded.find((p) => p.type === "text/html") || decoded[0] || { type: "text/plain", text: "" };
  }
  let bytes: Uint8Array;
  if (cte === "base64") bytes = b64Bytes(body);
  else if (cte === "quoted-printable") bytes = qpBytes(body);
  else bytes = Uint8Array.from(body, (c) => c.charCodeAt(0) & 0xff);
  let text = cte === "base64" || cte === "quoted-printable" ? decodeBytes(bytes, charset) : binaryToText(body, charset);
  if (type === "text/html") text = htmlToText(text);
  return { type: type === "text/html" ? "text/html" : type, text };
}

/** Lesbarer Text aus Header (mit Content-Type) und BODY[TEXT]. */
export function mailBodyText(header: string, body: string): string {
  const out = decodePart(header, String(body || "")).text;
  return out.replace(/\r\n/g, "\n").trim();
}

/** Abwesenheitsnotiz / automatische Antwort? Header zuerst, dann Betreff. */
export function isAutoReply(header: string, subject: string): boolean {
  const auto = mimeHeader(header, "auto-submitted").toLowerCase();
  if (auto && auto !== "no") return true;
  if (mimeHeader(header, "x-autoreply") || mimeHeader(header, "x-autorespond") || mimeHeader(header, "x-autoreply-from")) return true;
  const prec = mimeHeader(header, "precedence").toLowerCase();
  if (/auto_reply|bulk|junk/.test(prec)) return true;
  const s = String(subject || "").toLowerCase();
  return /automatische antwort|automatic reply|auto-?reply|autoreply|autoresponder|out of office|abwesenheit|abwesend|nicht im büro|urlaubs?(?:notiz|bedingt)|im urlaub/.test(s);
}
