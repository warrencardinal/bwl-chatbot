import { runBot } from "./bot.js";
import { adminPage, updateStatus, cancelConsult, availabilityPage, saveAvailability, alertsPage, saveAlertsForm, sendTestAlert } from "./admin.js";
import { loadAlerts, leadRecipients, bookingRecipients } from "./alerts.js";
import { reportsPage } from "./reports.js";
import { testsPage, runTests } from "./tests.js";
import { matterLabel } from "./ui.js";
import { cleanSource } from "./source.js";
import { loadSettings, bookingConfigured, openSlots, bookSlot } from "./booking.js";

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
      if (path === "/admin" && request.method === "GET") return adminPage(env, url);
      if (path === "/admin/status" && request.method === "POST") return updateStatus(request, env);
      if (path === "/admin/cancel" && request.method === "POST") return cancelConsult(request, env);
      if (path === "/admin/availability" && request.method === "GET") return availabilityPage(env, url);
      if (path === "/admin/availability" && request.method === "POST") return saveAvailability(request, env);
      if (path === "/admin/reports" && request.method === "GET") return reportsPage(env, url);
      if (path === "/admin/tests" && request.method === "GET") return testsPage(env, url);
      if (path === "/admin/tests/run" && request.method === "POST") return runTests(request, env);
      if (path === "/admin/alerts" && request.method === "GET") return alertsPage(env, url);
      if (path === "/admin/alerts" && request.method === "POST") return saveAlertsForm(request, env);
      if (path === "/admin/alerts/test" && request.method === "POST") return sendTestAlert(request, env);
      return new Response("Not found", { status: 404 });
    }

    if (["/config", "/session", "/chat", "/slots", "/book", "/contact"].includes(path)) {
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
        if (path === "/slots") return await handleSlots(request, env, cors);
        if (path === "/book") return await handleBook(request, env, cors);
        if (path === "/contact") return await handleContact(request, env, cors);
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
  const origin = cleanSource(body.source, sourcePage);
  const settings = await loadSettings(env);
  const scheduling = bookingConfigured(env, settings);

  const out = await runBot(env, messages, scheduling, async (name, input) => {
    if (name === "save_lead") {
      try {
        const result = await saveLead(env, input, session.sid, sourcePage, origin);
        return { result, leadSaved: result.startsWith("Saved") };
      } catch (err) {
        console.error("saveLead failed", err);
        return { result: "Not saved because of a system error. Ask them to call (210) 571-0400 so the firm gets their details." };
      }
    }
    if (name === "show_contact_form") {
      const existing = await env.DB.prepare("SELECT id FROM leads WHERE session_id = ?").bind(session.sid).first();
      if (existing) return { result: "Their details are already saved. Don't show the form again." };
      const lang = input.language === "es" ? "es" : "en";
      const token = await signSession(
        {
          sid: session.sid,
          kind: "form",
          m: clip(input.matter_type, 60) || "other",
          s: clip(input.summary, 500),
          u: input.urgent ? 1 : 0,
          exp: Date.now() + SESSION_TTL_MS,
        },
        env.SESSION_SECRET
      );
      return { result: "The form is now showing under your reply.", form: { token, lang }, endTurn: true };
    }
    if (name === "show_scheduler") {
      try {
        const check = await canSchedule(env, settings, session.sid);
        if (check === "ok") return { result: "The calendar is now open in the chat.", schedule: true };
        if (check === "booked") return { result: "They already have a consultation booked. Tell them the firm will see them then." };
        return { result: "Not available. Save an uncontested_divorce lead first, or if already saved, tell them someone from the firm will contact them to schedule." };
      } catch (err) {
        console.error("show_scheduler failed", err);
        return { result: "Not available right now. Tell them someone from the firm will contact them to schedule." };
      }
    }
    return { result: "Unknown tool." };
  });

  return json({ reply: out.reply, leadSaved: out.leadSaved, schedule: out.schedule, form: out.form }, 200, cors);
}

// ---------- Contact form ----------

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function handleContact(request, env, cors) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "Bad request" }, 400, cors);
  const session = env.SESSION_SECRET ? await verifySession(body.session, env.SESSION_SECRET) : null;
  if (!session) return json({ error: "session_expired" }, 401, cors);
  const form = await verifySession(body.form, env.SESSION_SECRET);
  if (!form || form.kind !== "form" || form.sid !== session.sid) {
    return json({ error: "This form has expired. Please type your details in the chat." }, 400, cors);
  }
  const es = body.lang === "es";

  const name = clip(body.name, 120);
  const phone = clip(body.phone, 40);
  const email = clip(body.email, 200);
  const digits = (phone || "").replace(/\D/g, "");
  const errors = {};
  if (!name) errors.name = es ? "Escriba su nombre." : "Enter your name.";
  if (phone && (digits.length < 10 || digits.length > 15)) errors.phone = es ? "Revise el número de teléfono." : "Check the phone number.";
  if (email && !EMAIL_OK.test(email)) errors.email = es ? "Revise el correo electrónico." : "Check the email address.";
  if (!phone && !email) errors.phone = es ? "Escriba un teléfono o un correo electrónico." : "Enter a phone number or an email.";
  if (Object.keys(errors).length) return json({ errors }, 422, cors);

  const sourcePage = typeof body.page === "string" ? body.page.slice(0, 500) : null;
  const result = await saveLead(
    env,
    { name, phone, email, matter_type: form.m, summary: form.s, opposing_party: body.opposing_party, urgent: form.u },
    session.sid,
    sourcePage,
    cleanSource(body.source, sourcePage)
  );
  if (!result.startsWith("Saved")) return json({ error: es ? "No se pudo guardar. Llame al (210) 571-0400." : "Couldn't save that. Please call (210) 571-0400." }, 500, cors);

  const first = name.split(/\s+/)[0];
  const reach = phone || email;
  let reply;
  let schedule = null;
  if (form.m === "uncontested_divorce" && (await canSchedule(env, await loadSettings(env), session.sid)) === "ok") {
    schedule = true;
    reply = es ? `Gracias, ${first}. Elija un horario para su consulta.` : `Thanks, ${first}. Pick a time for your consultation.`;
  } else if (form.u) {
    reply = es
      ? `Gracias, ${first}. Sus datos están marcados como urgentes y la firma se comunicará con usted lo antes posible al ${reach}. Si alguien está en peligro inmediato, llame al 911.`
      : `Thanks, ${first}. Your details are marked urgent, and the firm will reach out as soon as possible at ${reach}. If anyone is in immediate danger, call 911.`;
  } else if (form.m === "existing_client") {
    reply = es ? `Gracias, ${first}. La firma se comunicará con usted al ${reach}.` : `Thanks, ${first}. The firm will get back to you at ${reach}.`;
  } else {
    const booking = (env.BOOKING_URL || "").trim();
    reply = booking
      ? es
        ? `Gracias, ${first}. Puede elegir un horario para su consulta aquí: ${booking}`
        : `Thanks, ${first}. You can pick a consultation time here: ${booking}`
      : es
        ? `Gracias, ${first}. Alguien de la firma se comunicará con usted al ${reach} para programar una consulta.`
        : `Thanks, ${first}. Someone from the firm will contact you at ${reach} to schedule a consultation.`;
  }

  // What the bot sees on later turns, so it doesn't ask again.
  const note = `I filled in the contact form. Name: ${name}. Phone: ${phone || "none"}. Email: ${email || "none"}. Other party: ${clip(body.opposing_party, 120) || "not given"}.`;
  return json({ ok: true, reply, schedule, note }, 200, cors);
}

async function canSchedule(env, settings, sid) {
  if (!bookingConfigured(env, settings)) return "off";
  const lead = await env.DB.prepare("SELECT id, matter_type FROM leads WHERE session_id = ?").bind(sid).first();
  if (!lead || lead.matter_type !== "uncontested_divorce") return "no_lead";
  const booked = await env.DB.prepare(
    "SELECT id FROM bookings WHERE session_id = ? AND status != 'cancelled'"
  ).bind(sid).first();
  return booked ? "booked" : "ok";
}

// ---------- Booking ----------

async function sessionFrom(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return { body: null, session: null };
  const session = env.SESSION_SECRET ? await verifySession(body.session, env.SESSION_SECRET) : null;
  return { body, session };
}

async function handleSlots(request, env, cors) {
  const { session } = await sessionFrom(request, env);
  if (!session) return json({ error: "session_expired" }, 401, cors);
  const settings = await loadSettings(env);
  const check = await canSchedule(env, settings, session.sid);
  if (check !== "ok") return json({ error: "Scheduling isn't available for this chat.", state: check }, 403, cors);
  const days = await openSlots(env, settings);
  return json({ days }, 200, cors);
}

async function handleBook(request, env, cors) {
  const { body, session } = await sessionFrom(request, env);
  if (!session) return json({ error: "session_expired" }, 401, cors);
  const settings = await loadSettings(env);
  const check = await canSchedule(env, settings, session.sid);
  if (check !== "ok") return json({ error: "Scheduling isn't available for this chat.", state: check }, 403, cors);

  const lead = await env.DB.prepare("SELECT * FROM leads WHERE session_id = ?").bind(session.sid).first();
  const result = await bookSlot(env, settings, { lead, sid: session.sid, startIso: body.start });
  if (!result.ok) return json(result, 409, cors);

  const note = (settings.confirmation_note || "").trim();
  const message =
    `You're booked for ${result.label}.` +
    (lead.email ? ` A confirmation is on its way to ${lead.email}.` : "") +
    (note ? ` ${note}` : "");

  const emails = [];
  const firmTo = bookingRecipients(await loadAlerts(env));
  if (env.ALERT_FROM && firmTo.length) {
    emails.push(
      env.EMAIL.send({
        from: { email: env.ALERT_FROM, name: "BWL Website Chat" },
        to: firmTo,
        subject: `Consultation booked: ${lead.name || "website lead"}, ${result.label}`,
        text: [
          `Time: ${result.label}`,
          `Name: ${lead.name || ""}`,
          `Phone: ${lead.phone || ""}`,
          `Email: ${lead.email || ""}`,
          `Other party: ${lead.opposing_party || ""}`,
          `Summary: ${lead.summary || ""}`,
          `Lead #${lead.id}. It's on the calendar.`,
        ].join("\n"),
      })
    );
  }
  if (env.ALERT_FROM && lead.email) {
    emails.push(
      env.EMAIL.send({
        from: { email: env.ALERT_FROM, name: "Brandi Wolfe Law" },
        to: lead.email,
        replyTo: firmTo[0] || undefined,
        subject: `Your consultation with Brandi Wolfe Law: ${result.label}`,
        text: [
          `Hi ${lead.name || ""},`,
          "",
          `Your consultation with Brandi Wolfe Law is booked for ${result.label}.`,
          note,
          "",
          "To reschedule or cancel, call (210) 571-0400.",
          "",
          "Brandi Wolfe Law, PLLC",
          "7550 W Interstate 10, Suite 800, San Antonio, TX 78230",
        ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"),
      })
    );
  }
  const sent = await Promise.allSettled(emails);
  sent.forEach((r) => r.status === "rejected" && console.error("Booking email failed", r.reason));

  return json({ ok: true, message }, 200, cors);
}


export function cleanMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out = [];
  for (const m of raw) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
    const content = m.content.trim().slice(0, MAX_CHARS);
    if (!content) return null;
    const prev = out[out.length - 1];
    // Booking confirmations add a second assistant message in a row; merge same-role runs.
    if (prev && prev.role === m.role) prev.content = `${prev.content}\n\n${content}`.slice(0, MAX_CHARS * 2);
    else out.push({ role: m.role, content });
  }
  if (out[0].role !== "user" || out[out.length - 1].role !== "user") return null;
  return out;
}


// ---------- Leads ----------

const clip = (v, n) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

async function saveLead(env, input, sid, sourcePage, origin = cleanSource(null, sourcePage)) {
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
  const to = leadRecipients(await loadAlerts(env), lead.matter_type, Boolean(lead.urgent));

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
       routed_to, source_page, session_id, landing_page, referrer, utm_source, utm_medium, utm_campaign,
       utm_term, utm_content, click_id, channel) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`
    )
      .bind(lead.name, lead.phone, lead.email, lead.matter_type, lead.summary, lead.opposing_party,
        lead.urgent, lead.existing_client, null, sourcePage, sid, origin.landing_page, origin.referrer,
        origin.utm_source, origin.utm_medium, origin.utm_campaign, origin.utm_term, origin.utm_content,
        origin.click_id, origin.channel)
      .first();
    id = row.id;
  }

  if (!notified && to.length && env.ALERT_FROM) {
    try {
      await env.EMAIL.send({
        from: { email: env.ALERT_FROM, name: "BWL Website Chat" },
        to,
        subject: `${lead.urgent ? "URGENT: " : ""}New chat lead: ${matterLabel(lead.matter_type)} (${lead.name || "no name"})`,
        text: [
          `Name: ${lead.name || ""}`,
          `Phone: ${lead.phone || ""}`,
          `Email: ${lead.email || ""}`,
          `Matter: ${matterLabel(lead.matter_type)}`,
          `Other party: ${lead.opposing_party || ""}`,
          `Summary: ${lead.summary || ""}`,
          `Urgent: ${lead.urgent ? "YES" : "no"}`,
          `Chat page: ${sourcePage || ""}`,
          `Came from: ${origin.channel}${origin.utm_campaign ? ` (${origin.utm_campaign})` : ""}`,
          `Landing page: ${origin.landing_page || ""}`,
          `Lead #${id}`,
        ].join("\n"),
      });
      await env.DB.prepare("UPDATE leads SET notified = 1, routed_to = ? WHERE id = ?").bind(to.join(","), id).run();
    } catch (err) {
      console.error("Alert email failed", err);
    }
  }

  return "Saved. The firm has the details.";
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
