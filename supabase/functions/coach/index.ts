// DayOne100 Tools · coach function
// Runs on Supabase Edge Functions. Calls the Claude API with your key, which never reaches the browser.
// Secrets (Supabase > Edge Functions > Secrets):
//   ANTHROPIC_API_KEY    required, your Claude API key
//   ANTHROPIC_MODEL      optional, default "claude-haiku-5-5"
//   DAILY_LIMIT          optional, AI calls per student per day, default 40
//   TEACHER_DAILY_LIMIT  optional, default 500
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
// The function checks the student's login itself, so "Verify JWT" can be switched off in its settings.

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
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
  if (!anon || !service) return reply({ error: "The server keys are missing." }, 500);
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return reply({ error: "The AI key is not set up yet." }, 500);

  let body: { kind?: string; mode?: string; prompt?: string; messages?: Msg[] };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Bad request." }, 400);
  }
  const promptCheck = body.mode === "prompt_check";

  // Who is asking?
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  let user = null;
  try {
    user = (await userClient.auth.getUser(token)).data.user;
  } catch { /* not logged in */ }

  // Guests (no login) may only use the Prompt Coach check, with a fixed server-side prompt,
  // so the key cannot be used as a free general chatbot.
  const origin = req.headers.get("Origin") ?? "";
  const allowed = (Deno.env.get("GUEST_ORIGINS") ?? "https://tools.dayone100.nl").split(",").map((s) => s.trim());
  if (!user && !(promptCheck && allowed.includes(origin))) return reply({ error: "Please log in again." }, 401);

  const admin = createClient(url, service);
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  let guestKey: string | null = null;

  if (user) {
    // Daily limit per user.
    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
    const limit = Number(
      profile?.role === "teacher"
        ? Deno.env.get("TEACHER_DAILY_LIMIT") ?? 500
        : Deno.env.get("DAILY_LIMIT") ?? 40,
    );
    const { count } = await admin
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", since.toISOString());
    if ((count ?? 0) >= limit) return reply({ error: "daily_limit" }, 429);
  } else {
    // Guests: a cap per network (a whole class shares one school IP) and a cap for all guests together,
    // which is the ceiling on what guests can cost you per day.
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const day = since.toISOString().slice(0, 10);
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + "|" + day + "|" + service));
    guestKey = Array.from(new Uint8Array(hash)).slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
    const perNet = Number(Deno.env.get("GUEST_DAILY_LIMIT") ?? 120);
    const total = Number(Deno.env.get("GUEST_DAILY_TOTAL") ?? 300);
    const { count: mine, error: e1 } = await admin
      .from("ai_usage").select("id", { count: "exact", head: true })
      .eq("guest_key", guestKey).gte("created_at", since.toISOString());
    const { count: all, error: e2 } = await admin
      .from("ai_usage").select("id", { count: "exact", head: true })
      .is("user_id", null).gte("created_at", since.toISOString());
    if (e1 || e2) {
      console.error("Guest usage check failed. Did you run supabase/guest-ai.sql?", e1 ?? e2);
      return reply({ error: "guest_off" }, 503);
    }
    if ((mine ?? 0) >= perNet || (all ?? 0) >= total) return reply({ error: "daily_limit" }, 429);
  }

  // Prompt Coach: build the coach instructions here, from the student's prompt only.
  if (promptCheck) {
    const p = String(body.prompt ?? "").trim().slice(0, 4000);
    if (p.length < 10) return reply({ error: "Empty question." }, 400);
    body.kind = "json";
    body.messages = [{ role: "user", content: promptCoach(p) }];
  }

  // Read and tidy the conversation: alternate roles, start and end with the student.
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

  await admin.from("ai_usage").insert(user ? { user_id: user.id, kind } : { user_id: null, guest_key: guestKey, kind: "guest_prompt" });
  return reply({ text, truncated: out.stop_reason === "max_tokens" });
});

// The Prompt Coach instructions (same text as aiPrompt in prompt/index.html).
function promptCoach(t: string): string {
  return `You are a prompt-writing coach for business students (first and second year, bachelor in entrepreneurship). Analyse the student's prompt with the RHODES model:
- r Role: the role or expertise the AI should take on ("You are an experienced ...").
- o Objective: the task and the output the student wants back.
- d Details: context, facts about the student or business, audience, goal, tone, length, format, constraints.
- e Examples: an example of good (or bad) output.
- s Sense check: asking the AI to ask questions first, state assumptions or check its own work.
Important: information about the student themselves ("I am an entrepreneur") is Details, not Role. A sentence can cover more than one part.

Reply with JSON only, in English, in exactly this shape:
{"sentences":[{"text":"the exact sentence from the prompt","parts":["d"],"note":"one short, concrete tip for this sentence, or an empty string if it is fine"}],
"missing":["r"],
"questions":["up to 3 questions the student must answer before the prompt can be good"],
"improved":{"r":"","o":"","d":"one item per line, like Audience: ...","e":"","s":""},
"summary":"two short sentences: the biggest strength and the biggest gap"}

Rules for "improved": keep the student's own facts and words where possible. Never invent facts about their business, customers or numbers. Where a fact is needed that you do not have, write [fill in: what is needed]. Keep the improved prompt under 200 words.
Be honest and specific. If the channel and audience do not seem to fit, say so in a note.

The student's prompt:
"""
${t}
"""`;
}
