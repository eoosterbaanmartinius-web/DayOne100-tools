// DayOne100 Tools · coach function
// Runs on Supabase Edge Functions. Calls the Claude API with your key, which never reaches the browser.
// Secrets (Supabase > Edge Functions > Secrets):
//   ANTHROPIC_API_KEY    required, your Claude API key
//   ANTHROPIC_MODEL      optional, default "claude-haiku-5-5"
//   DAILY_LIMIT          optional, AI calls per student per day, default 40
//   TEACHER_DAILY_LIMIT  optional, default 500
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.

import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Msg = { role: "user" | "assistant"; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Use POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return reply({ error: "The AI key is not set up yet." }, 500);

  // Who is asking?
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return reply({ error: "Please log in again." }, 401);

  // Daily limit per user.
  const admin = createClient(url, service);
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  const limit = Number(
    profile?.role === "teacher"
      ? Deno.env.get("TEACHER_DAILY_LIMIT") ?? 500
      : Deno.env.get("DAILY_LIMIT") ?? 40,
  );
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since.toISOString());
  if ((count ?? 0) >= limit) return reply({ error: "daily_limit" }, 429);

  // Read and tidy the conversation: alternate roles, start and end with the student.
  let body: { kind?: string; messages?: Msg[] };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Bad request." }, 400);
  }
  const kind = body.kind === "json" ? "json" : "chat";
  const messages: Msg[] = [];
  let total = 0;
  for (const m of Array.isArray(body.messages) ? body.messages : []) {
    const role = m?.role === "assistant" ? "assistant" : "user";
    const content = String(m?.content ?? "").slice(0, 40000);
    if (!content.trim()) continue;
    total += content.length;
    const last = messages.at(-1);
    if (last && last.role === role) last.content += "\n\n" + content;
    else messages.push({ role, content });
  }
  while (messages.length && messages[0].role !== "user") messages.shift();
  while (messages.length && messages.at(-1)!.role !== "user") messages.pop();
  if (!messages.length) return reply({ error: "Empty question." }, 400);
  if (total > 120000) return reply({ error: "Too long." }, 413);

  // Ask Claude.
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-5-5",
      max_tokens: kind === "json" ? 2000 : 900,
      ...(kind === "json" ? { system: "Reply with only valid JSON. No other text before or after it." } : {}),
      messages,
    }),
  });
  if (!res.ok) {
    console.error("Claude API error", res.status, (await res.text()).slice(0, 500));
    return reply({ error: "The AI service did not answer." }, 502);
  }
  const out = await res.json();
  const text = (out.content ?? [])
    .filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text)
    .join("");

  await admin.from("ai_usage").insert({ user_id: user.id, kind });
  return reply({ text, truncated: out.stop_reason === "max_tokens" });
});
