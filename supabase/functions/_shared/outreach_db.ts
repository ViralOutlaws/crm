// Lesehilfe für die Outreach-Funktionen. Zugangsdaten bleiben in den Secrets.
import { websiteDomain, type KnownParty } from "./outreach.ts";

type Db = { from: (table: string) => any };

export type Guard = {
  crm: KnownParty[];
  blocklist: string[];
  priorEmails: string[];
  priorDomains: string[];
  rejectedEmails: string[];
};

export function migrationHint(error: { message?: string; code?: string } | null): string | null {
  if (!error) return null;
  const msg = `${error.code || ""} ${error.message || ""}`;
  if (/42P01|PGRST205|does not exist|schema cache|outreach_/i.test(msg)) return "Outreach ist noch nicht migriert.";
  return error.message || "Abfrage fehlgeschlagen";
}

export async function loadGuard(sb: Db, workspaceId: string): Promise<Guard> {
  const [contacts, block, drafts, targets] = await Promise.all([
    sb.from("contacts").select("email, web, status, archiviert").eq("workspace_id", workspaceId).limit(1000),
    sb.from("outreach_blocklist").select("value, kind").eq("workspace_id", workspaceId).limit(1000),
    sb.from("outreach_drafts").select("email, status").eq("workspace_id", workspaceId).limit(1000),
    sb.from("outreach_targets").select("domain, status").eq("workspace_id", workspaceId).limit(1000),
  ]);
  for (const res of [block, drafts, targets]) {
    const hint = migrationHint(res.error);
    if (hint) throw new Error(hint);
  }
  if (contacts.error) throw new Error(contacts.error.message || "Kontakte nicht lesbar");
  return {
    crm: (contacts.data || []).filter((c: { archiviert?: boolean }) => !c.archiviert).map((c: { email?: string; web?: string; status?: string }) => ({
      email: String(c.email || ""),
      domain: websiteDomain(String(c.web || "")),
      customer: c.status === "gewonnen",
    })).filter((c: KnownParty) => c.email || c.domain),
    blocklist: (block.data || []).filter((b: { kind?: string }) => b.kind === "email").map((b: { value?: string }) => String(b.value || "").toLowerCase()),
    priorEmails: (drafts.data || []).filter((d: { status?: string }) => d.status !== "abgelehnt").map((d: { email?: string }) => String(d.email || "").toLowerCase()),
    priorDomains: (targets.data || []).filter((t: { status?: string }) => t.status === "recherchiert" || t.status === "uebersprungen").map((t: { domain?: string }) => String(t.domain || "")),
    rejectedEmails: (drafts.data || []).filter((d: { status?: string }) => d.status === "abgelehnt").map((d: { email?: string }) => String(d.email || "").toLowerCase()),
  };
}

export async function sentStats(sb: Db, workspaceId: string, now = new Date()): Promise<{ sentToday: number; lastSentAt: number | null }> {
  const rows = await sb.from("outreach_messages").select("created_at, direction").eq("workspace_id", workspaceId).eq("direction", "out").order("created_at", { ascending: false }).limit(200);
  const hint = migrationHint(rows.error);
  if (hint) throw new Error(hint);
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });
  const today = fmt.format(now);
  let sentToday = 0;
  let lastSentAt: number | null = null;
  for (const row of rows.data || []) {
    const at = new Date(row.created_at).getTime();
    if (Number.isFinite(at) && (lastSentAt == null || at > lastSentAt)) lastSentAt = at;
    if (fmt.format(new Date(row.created_at)) === today) sentToday += 1;
  }
  return { sentToday, lastSentAt };
}
