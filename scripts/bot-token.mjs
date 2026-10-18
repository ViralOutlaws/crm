#!/usr/bin/env node
// Druckt einmalig einen Bot-Token und das INSERT für den SHA-256-Hash.
// Webby führt das mit Management-Zugang aus (Supabase SQL-Editor). Der Token kommt nicht ins Repo.
import { createHash, randomBytes } from "node:crypto";

const BOTS = ["webby", "marky", "saley", "cashy", "developy"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bot = String(process.argv[2] || "").toLowerCase();
const workspace = String(process.argv[3] || "").toLowerCase();

if (!BOTS.includes(bot) || !UUID.test(workspace)) {
  console.error("Aufruf: node scripts/bot-token.mjs <webby|marky|saley|cashy|developy> <workspace-uuid>");
  process.exit(1);
}

const token = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(token).digest("hex");

console.log("Token, nur dieses eine Mal. In die Grok-Routine des Bots, nicht ins Repo:");
console.log(token);
console.log("");
console.log("Hash in bot_tokens (SQL-Editor, Management-Zugang):");
console.log(`insert into public.bot_tokens (bot, workspace_id, token_hash) values ('${bot}', '${workspace}', '${tokenHash}');`);
console.log("");
console.log("Der Bot sendet danach Authorization: Bearer <Token> an /functions/v1/bot-api.");
console.log("Widerruf: update public.bot_tokens set revoked_at = now() where token_hash = '" + tokenHash + "';");
