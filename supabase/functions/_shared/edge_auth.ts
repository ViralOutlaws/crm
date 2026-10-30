import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export async function userClient(req: Request): Promise<{ sb: SupabaseClient; userId: string; workspaceId: string }> {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) throw new Error("Anmeldung fehlt");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) throw new Error("Anmeldung fehlt");
  const profile = await sb.from("profiles").select("workspace_id").eq("id", data.user.id).maybeSingle();
  if (profile.error) throw new Error(profile.error.message || "Kein Workspace");
  const workspaceId = profile.data?.workspace_id || "";
  if (!workspaceId) throw new Error("Kein Workspace");
  return { sb, userId: data.user.id, workspaceId };
}

export async function anthropicText(system: string, user: string, maxTokens = 700): Promise<string | null> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return null;
  const model = Deno.env.get("JARVIS_MODEL") || "claude-sonnet-5-5";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user.slice(0, 24000) }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const block = Array.isArray(data.content) ? data.content.find((b: { type?: string }) => b.type === "text") : null;
  return typeof block?.text === "string" ? block.text : null;
}
