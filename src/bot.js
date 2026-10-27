import { systemPrompt, SAVE_LEAD_TOOL, SHOW_SCHEDULER_TOOL, CONTACT_FORM_TOOL } from "./prompt.js";

export async function callClaude(env, { system, messages, tools, toolChoice, model, maxTokens = 500 }) {
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
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  return res.json();
}

// Drop a dangling opening "¿" or "¡" (or other stray trailing punctuation) left by a cut-off sentence.
export function tidy(text) {
  return String(text || "").trim().replace(/\s*[¿¡:,(]+$/u, "").trim();
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
  const tools = scheduling ? [CONTACT_FORM_TOOL, SAVE_LEAD_TOOL, SHOW_SCHEDULER_TOOL] : [CONTACT_FORM_TOOL, SAVE_LEAD_TOOL];
  const toolCalls = [];
  const notes = [];
  let leadSaved = false;
  let schedule = null;
  let form = null;
  let lastText = "";

  // Up to 3 model calls: reply, or tool call -> result -> reply.
  for (let i = 0; i < 3; i++) {
    let res = await callClaude(env, { system, messages: convo, tools, maxTokens: 1024 });
    const empty = (r) => !(r.content || []).some((c) => c.type === "tool_use" || (c.type === "text" && tidy(c.text)));
    if (empty(res)) {
      // The model occasionally returns nothing usable; note why and try once more.
      notes.push(`Empty AI reply (stop_reason: ${res.stop_reason}), retried`);
      console.warn("Empty reply, retrying", res.stop_reason, JSON.stringify(res.content).slice(0, 300));
      res = await callClaude(env, { system, messages: convo, tools, maxTokens: 1024 });
      if (empty(res)) notes.push(`Empty again on retry (stop_reason: ${res.stop_reason})`);
    }
    const toolUses = (res.content || []).filter((c) => c.type === "tool_use");
    const text = tidy((res.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n"));
    if (text) lastText = text;
    if (!["end_turn", "tool_use"].includes(res.stop_reason)) console.warn("Unusual stop_reason", res.stop_reason, JSON.stringify(res.content).slice(0, 500));

    if (toolUses.length === 0) {
      const fallback = form
        ? (form.lang === "es" ? "¿Me puede dar su nombre y la mejor forma de comunicarnos con usted?" : "Can I get your name and the best way for the firm to reach you?")
        : leadSaved
          ? savedFallback(env)
          : "Sorry, I didn't catch that. Could you say it another way?";
      return { reply: lastText || fallback, leadSaved, schedule, form, toolCalls, notes };
    }

    convo.push({ role: "assistant", content: res.content });
    const results = [];
    let endTurn = false;
    for (const tu of toolUses) {
      const out = await handleTool(tu.name, tu.input || {});
      if (out.leadSaved) leadSaved = true;
      if (out.schedule) schedule = true;
      if (out.form) form = out.form;
      if (out.endTurn) endTurn = true;
      toolCalls.push({ name: tu.name, input: tu.input || {}, result: out.result });
      results.push({ type: "tool_result", tool_use_id: tu.id, content: out.result });
    }
    convo.push({ role: "user", content: results });
    // The contact form speaks for itself: reply with what the bot already said and stop.
    if (endTurn) {
      const formText = form && form.lang === "es" ? "¿Me puede dar su nombre y la mejor forma de comunicarnos con usted?" : "Can I get your name and the best way for the firm to reach you?";
      return { reply: text || formText, leadSaved, schedule, form, toolCalls, notes };
    }
  }
  return { reply: lastText || (form ? "Can I get your name and the best way for the firm to reach you?" : savedFallback(env)), leadSaved, schedule, form, toolCalls, notes };
}
