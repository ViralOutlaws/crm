#!/usr/bin/env node
// Druckt einmalig einen Kalender-Token, die webcal-URL und das INSERT für den SHA-256-Hash.
// Der Token kommt nicht ins Repo. Optional --out schreibt nur die URL in eine Datei mit Rechten 600.
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOST = "jjfmxiqippkgqkwihgek.supabase.co";
const args = process.argv.slice(2).filter((a) => a !== "--");
const outAt = args.indexOf("--out");
const outFile = outAt >= 0 ? args[outAt + 1] : "";
const workspace = String(args.find((a) => !a.startsWith("--") && a !== outFile) || "").toLowerCase();

if (!UUID.test(workspace) || (outAt >= 0 && !outFile)) {
  console.error("Aufruf: node scripts/calendar-token.mjs <workspace-uuid> [--out datei]");
  process.exit(1);
}

const token = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(token).digest("hex");
const url = `webcal://${HOST}/functions/v1/calendar-feed?t=${token}`;

console.log("Token und webcal-URL, nur dieses eine Mal. Nicht ins Repo:");
console.log(token);
console.log(url);
console.log("");
console.log("Hash in calendar_feed_tokens (SQL-Editor, Management-Zugang):");
console.log(`insert into public.calendar_feed_tokens (workspace_id, token_hash) values ('${workspace}', '${tokenHash}');`);
console.log("");
console.log("Widerruf: update public.calendar_feed_tokens set revoked_at = now() where token_hash = '" + tokenHash + "';");

if (outFile) {
  writeFileSync(outFile, url + "\n", { mode: 0o600 });
  chmodSync(outFile, 0o600);
  console.log("");
  console.log("URL geschrieben, Rechte 600: " + outFile);
}
