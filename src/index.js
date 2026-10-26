import { systemPrompt, SAVE_LEAD_TOOL } from "./prompt.js";
import { adminPage, updateStatus } from "./admin.js";

const MAX_MESSAGES = 40;
const MAX_CHARS = 2000;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/admin" || path.startsWith("/admin/")) {
      if (!checkAdmin(request, env)) {
        return new Response("Unauthorized", {
          status: 401,
          headers: { "WWW-Authenticate": 'Basic realm="BWL leads"' },
        });
      }
      if (path === "/admin" && request.method === "GET") return adminPage(env);
      if (path === "/admin/status" && request.method === "POST") return updateStatus(request, env);
      return new Response("Not found", { status: 404 });
    }

    if (path === "/config" || path === "/session" || path === "/chat") {
      const origin = request.headers.get("Origin") || "";
      const cors = corsHeaders(origin, url, env, request.method);
      if (!cors) return new Response("Forbidden", { status: 403 });
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

      try {
        if (path === "/config" && request.method === "GET") {
          return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY || null }, 200, cors);
        }
        if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const { success } = await env.CHAT_LIMITER.limit({ key: ip });
        if (!success) return json({ error: "Too many messages. Please wait a minute." }, 429, cors);

        if (path === "/session") return await handleSession(request, env, cors, ip);
        return await handleChat(request, env, cors);
      } catch (err) {
        console.error(err);
        const body = { error: "Something went wrong. Please call (210) 571-0400." };
        if (origin === url.origin) body.detail = String(err && err.message ? err.message : err).slice(0, 800);
        return json(body, 500, cors);
      }
    }

    return new Response("Not found", { status: 404 });
  },
};

// ---------- CORS ----------

function corsHeaders(origin, url, env, method) {
  // Browsers omit Origin on same-origin GETs; /config is public, so allow it.
  if (!origin) return method === "GET" ? {} : null;
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (origin !== url.origin && !allowed.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// ---------- Sessions (Turnstile once, then a signed token) ----------

async function handleSession(request, env, cors, ip) {
  if (!env.SESSION_SECRET) return json({ error: "Chat is not configured." }, 500, cors);
  const body = await request.json().catch(() => ({}));

  if (env.TURNSTILE_SITE_KEY) {
    const ok = await verifyTurnstile(body.turnstileToken, ip, env);
    if (!ok) return json({ error: "Verification failed. Please refresh and try again." }, 403, cors);
  }

  const sid = crypto.randomUUID();
  const token = await signSession({ sid, exp: Date.now() + SESSION_TTL_MS }, env.SESSION_SECRET);
  return json({ session: token }, 200, cors);
}

async function verifyTurnstile(token, ip, env) {
  if (!token || !env.TURNSTILE_SECRET) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  return data.success === true;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function signSession(payload, secret) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(body));
  return `${body}.${b64url(sig)}`;
}

async function verifySession(token, secret) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromB64url(sig),
      new TextEncoder().encode(body)
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    if (!payload.sid || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------- Chat ----------

async function handleChat(request, env, cors) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "Bad request" }, 400, cors);

  const session = env.SESSION_SECRET ? await verifySession(body.session, env.SESSION_SECRET) : null;
  if (!session) return json({ error: "session_expired" }, 401, cors);

  const messages = cleanMessages(body.messages);
  if (!messages) return json({ error: "Bad request" }, 400, cors);
  if (messages.length > MAX_MESSAGES) {
    return json({ reply: "This chat has reached its limit. Please call (210) 571-0400 and we'll take it from here." }, 200, cors);
  }

  const sourcePage = typeof body.page === "string" ? body.page.slice(0, 500) : null;
  const convo = messages.map((m) => ({ role: m.role, content: m.content }));
  let leadSaved = false;
  let lastText = "";

  // Up to 3 model turns: reply, or tool call -> result -> reply.
  for (let i = 0; i < 3; i++) {
    const res = await callClaude(env, convo);
    const toolUses = res.content.filter((c) => c.type === "tool_use");
    const text = res.content.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();

    if (text) lastText = text;

    if (res.stop_reason !== "tool_use" || toolUses.length === 0) {
      const fallback = leadSaved ? savedFallback(env) : "Sorry, I didn't catch that. Could you say it another way?";
      return json({ reply: lastText || fallback, leadSaved }, 200, cors);
    }

    convo.push({ role: "assistant", content: res.content });
    const results = [];
    for (const tu of toolUses) {
      let result = "Unknown tool.";
      if (tu.name === "save_lead") {
        result = await saveLead(env, tu.input || {}, session.sid, sourcePage);
        leadSaved = true;
      }
      results.push({ type: "tool_result", tool_use_id: tu.id, content: result });
    }
    convo.push({ role: "user", content: results });
  }

  return json({ reply: lastText || savedFallback(env), leadSaved }, 200, cors);
}

function savedFallback(env) {
  const booking = (env.BOOKING_URL || "").trim();
  return booking
    ? `Thanks, you're all set. You can pick a consultation time here: ${booking}`
    : "Thanks, you're all set. Someone from the firm will contact you to schedule a consultation.";
}

function cleanMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out = [];
  for (const m of raw) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
    const content = m.content.trim().slice(0, MAX_CHARS);
    if (!content) return null;
    out.push({ role: m.role, content });
  }
  if (out[0].role !== "user" || out[out.length - 1].role !== "user") return null;
  for (let i = 1; i < out.length; i++) if (out[i].role === out[i - 1].role) return null;
  return out;
}

async function callClaude(env, messages) {
  const base = env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.MODEL || "claude-haiku-5-5",
      max_tokens: 500,
      system: systemPrompt(env),
      tools: [SAVE_LEAD_TOOL],
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---------- Leads ----------

const clip = (v, n) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

async function saveLead(env, input, sid, sourcePage) {
  const lead = {
    name: clip(input.name, 120),
    phone: clip(input.phone, 40),
    email: clip(input.email, 200),
    matter_type: clip(input.matter_type, 60) || "other",
    summary: clip(input.summary, 500),
    opposing_party: clip(input.opposing_party, 120),
    urgent: input.urgent ? 1 : 0,
  };
  if (!lead.phone && !lead.email) return "Not saved: need a phone number or email first.";
  lead.existing_client = lead.matter_type === "existing_client" ? 1 : 0;
  const to = routeFor(env, lead.matter_type);

  const existing = await env.DB.prepare("SELECT id, notified FROM leads WHERE session_id = ?").bind(sid).first();

  let id;
  let notified = existing ? existing.notified : 0;
  if (existing) {
    id = existing.id;
    await env.DB.prepare(
      `UPDATE leads SET name=?, phone=?, email=?, matter_type=?, summary=?, opposing_party=?,
       urgent=MAX(urgent, ?), existing_client=? WHERE id=?`
    )
      .bind(lead.name, lead.phone, lead.email, lead.matter_type, lead.summary, lead.opposing_party,
        lead.urgent, lead.existing_client, id)
      .run();
  } else {
    const row = await env.DB.prepare(
      `INSERT INTO leads (name, phone, email, matter_type, summary, opposing_party, urgent, existing_client,
       routed_to, source_page, session_id) VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id`
    )
      .bind(lead.name, lead.phone, lead.email, lead.matter_type, lead.summary, lead.opposing_party,
        lead.urgent, lead.existing_client, to, sourcePage, sid)
      .first();
    id = row.id;
  }

  if (!notified && to && env.ALERT_FROM) {
    try {
      await env.EMAIL.send({
        from: { email: env.ALERT_FROM, name: "BWL Website Chat" },
        to,
        subject: `${lead.urgent ? "URGENT: " : ""}New chat lead: ${lead.matter_type.replace(/_/g, " ")} (${lead.name || "no name"})`,
        text: [
          `Name: ${lead.name || ""}`,
          `Phone: ${lead.phone || ""}`,
          `Email: ${lead.email || ""}`,
          `Matter: ${lead.matter_type}`,
          `Other party: ${lead.opposing_party || ""}`,
          `Summary: ${lead.summary || ""}`,
          `Urgent: ${lead.urgent ? "YES" : "no"}`,
          `Page: ${sourcePage || ""}`,
          `Lead #${id}`,
        ].join("\n"),
      });
      await env.DB.prepare("UPDATE leads SET notified = 1 WHERE id = ?").bind(id).run();
    } catch (err) {
      console.error("Alert email failed", err);
    }
  }

  return "Saved. The firm has the details.";
}

function routeFor(env, matterType) {
  let routes = {};
  try {
    routes = JSON.parse(env.ROUTES || "{}");
  } catch {}
  return (routes[matterType] || env.ALERT_TO || "").trim() || null;
}

// ---------- Helpers ----------

function checkAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const h = request.headers.get("Authorization") || "";
  if (!h.startsWith("Basic ")) return false;
  let decoded = "";
  try {
    decoded = atob(h.slice(6));
  } catch {
    return false;
  }
  const pass = decoded.slice(decoded.indexOf(":") + 1);
  return timingSafeEqual(pass, env.ADMIN_PASSWORD);
}

function timingSafeEqual(a, b) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] || 0) ^ (eb[i] || 0);
  return diff === 0;
}

function json(data, status, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
