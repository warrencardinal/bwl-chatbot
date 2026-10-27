import { systemPrompt, SAVE_LEAD_TOOL, SHOW_SCHEDULER_TOOL } from "./prompt.js";

export async function callClaude(env, { system, messages, tools, model, maxTokens = 500 }) {
  const base = env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || env.MODEL || "claude-haiku-5-5",
      max_tokens: maxTokens,
      system,
      ...(tools ? { tools } : {}),
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  return res.json();
}

export function savedFallback(env) {
  const booking = (env.BOOKING_URL || "").trim();
  return booking
    ? `Thanks, you're all set. You can pick a consultation time here: ${booking}`
    : "Thanks, you're all set. Someone from the firm will contact you to schedule a consultation.";
}

// One bot turn: model reply, running any tool calls through handleTool(name, input).
// handleTool returns { result: string, leadSaved?: boolean, schedule?: boolean }.
export async function runBot(env, messages, scheduling, handleTool) {
  const convo = messages.map((m) => ({ role: m.role, content: m.content }));
  const system = systemPrompt(env, scheduling);
  const tools = scheduling ? [SAVE_LEAD_TOOL, SHOW_SCHEDULER_TOOL] : [SAVE_LEAD_TOOL];
  const toolCalls = [];
  let leadSaved = false;
  let schedule = null;
  let lastText = "";

  // Up to 3 model calls: reply, or tool call -> result -> reply.
  for (let i = 0; i < 3; i++) {
    const res = await callClaude(env, { system, messages: convo, tools });
    const toolUses = res.content.filter((c) => c.type === "tool_use");
    const text = res.content.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
    if (text) lastText = text;

    if (res.stop_reason !== "tool_use" || toolUses.length === 0) {
      const fallback = leadSaved ? savedFallback(env) : "Sorry, I didn't catch that. Could you say it another way?";
      return { reply: lastText || fallback, leadSaved, schedule, toolCalls };
    }

    convo.push({ role: "assistant", content: res.content });
    const results = [];
    for (const tu of toolUses) {
      const out = await handleTool(tu.name, tu.input || {});
      if (out.leadSaved) leadSaved = true;
      if (out.schedule) schedule = true;
      toolCalls.push({ name: tu.name, input: tu.input || {}, result: out.result });
      results.push({ type: "tool_result", tool_use_id: tu.id, content: out.result });
    }
    convo.push({ role: "user", content: results });
  }
  return { reply: lastText || savedFallback(env), leadSaved, schedule, toolCalls };
}
