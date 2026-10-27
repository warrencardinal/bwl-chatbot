import { loadSettings, saveSettings, openSlots, cancelBooking, DAY_NAMES, fullLabel, TZ } from "./booking.js";
import { serviceAccountEmail } from "./google.js";
import { loadAlerts, saveAlerts, parseEmails, leadRecipients } from "./alerts.js";
import { esc, page, flash, sameOrigin, matterLabel, MATTER_KEYS } from "./ui.js";
import { pathOf } from "./source.js";

const STATUSES = ["new", "contacted", "booked", "closed"];
const STATUS_LABELS = { new: "New", contacted: "Contacted", booked: "Booked", closed: "Closed" };
const FILTERS = [
  ["open", "Open"],
  ["new", "New"],
  ["contacted", "Contacted"],
  ["booked", "Booked"],
  ["closed", "Closed"],
  ["all", "All"],
];

const when = (iso) => {
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  const day = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d);
  return `<b>${esc(day)}</b>${esc(time)}`;
};

// ---------- Leads ----------

export async function adminPage(env, url) {
  const filter = FILTERS.some(([k]) => k === url.searchParams.get("show")) ? url.searchParams.get("show") : "open";
  const where =
    filter === "all" ? "" : filter === "open" ? "WHERE l.status != 'closed'" : "WHERE l.status = ?";
  const stmt = env.DB.prepare(
    `SELECT l.*, b.start_utc AS appt, b.id AS booking_id FROM leads l
     LEFT JOIN bookings b ON b.lead_id = l.id AND b.status = 'confirmed'
     ${where} ORDER BY l.created_at DESC LIMIT 300`
  );
  const [{ results }, counts] = await Promise.all([
    (where.includes("?") ? stmt.bind(filter) : stmt).all(),
    env.DB.prepare("SELECT status, COUNT(*) AS n FROM leads GROUP BY status").all(),
  ]);

  const n = Object.fromEntries(counts.results.map((r) => [r.status, r.n]));
  const total = Object.values(n).reduce((a, b) => a + b, 0);
  const count = (k) => (k === "all" ? total : k === "open" ? total - (n.closed || 0) : n[k] || 0);

  const chips = FILTERS.map(
    ([k, label]) =>
      `<a href="/admin?show=${k}" class="${k === filter ? "on" : ""}">${label} <b>${count(k)}</b></a>`
  ).join("");

  const rows = results
    .map((l) => {
      const opts = STATUSES.map(
        (s) => `<option value="${s}"${s === l.status ? " selected" : ""}>${STATUS_LABELS[s]}</option>`
      ).join("");
      const cls = l.urgent ? "is-urgent" : l.status === "new" ? "is-new" : "";
      const tags = [
        l.urgent ? '<span class="tag urgent">Urgent</span>' : "",
        l.status === "new" && !l.urgent ? '<span class="tag new">New</span>' : "",
        `<span class="tag">${esc(matterLabel(l.matter_type))}</span>`,
      ].join("");
      return `<article class="lead ${cls}">
  <div class="when">${when(l.created_at)}</div>
  <div class="who">
    <p class="name">${esc(l.name || "No name")} ${tags}</p>
    ${l.summary ? `<p class="summary">${esc(l.summary)}</p>` : ""}
    ${l.opposing_party ? `<p class="meta">Other party: ${esc(l.opposing_party)}</p>` : ""}
    ${l.channel ? `<p class="meta">Came from ${esc(l.channel)}${l.utm_campaign ? ` (${esc(l.utm_campaign)})` : ""}${l.landing_page ? `, landed on ${esc(pathOf(l.landing_page))}` : ""}</p>` : ""}
    ${l.appt ? `<div class="appt-row"><p class="appt">Consultation: ${esc(fullLabel(Date.parse(l.appt)))}</p>
      <form method="post" action="/admin/cancel" onsubmit="return confirm('Cancel this consultation and remove it from the calendar? The client is not notified.')">
        <input type="hidden" name="booking" value="${l.booking_id}"><input type="hidden" name="show" value="${filter}">
        <button class="link-btn" type="submit">Cancel consultation</button>
      </form></div>` : ""}
  </div>
  <div class="contact">
    ${l.phone ? `<a href="tel:${esc(l.phone.replace(/[^\d+]/g, ""))}">${esc(l.phone)}</a>` : ""}
    ${l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : ""}
    <span class="alert">${l.notified ? `Alert sent to ${esc((l.routed_to || "").split(",").join(", "))}` : "No alert sent"}</span>
  </div>
  <form class="state" method="post" action="/admin/status">
    <input type="hidden" name="id" value="${l.id}"><input type="hidden" name="show" value="${filter}">
    <label class="sr" for="s${l.id}">Status for ${esc(l.name || "this lead")}</label>
    <select id="s${l.id}" name="status" onchange="this.form.submit()">${opts}</select>
    <noscript><button class="btn ghost">Save</button></noscript>
  </form>
</article>`;
    })
    .join("");

  return page(
    "Leads",
    "leads",
    `<h1>Leads</h1>
${flash(url)}
<nav class="filters" aria-label="Filter leads">${chips}</nav>
<section class="list">${rows || '<p class="empty">No leads here yet.</p>'}</section>`
  );
}

export async function updateStatus(request, env) {
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const form = await request.formData();
  const id = Number(form.get("id"));
  const status = String(form.get("status") || "");
  const show = String(form.get("show") || "open").replace(/[^a-z]/g, "");
  if (!Number.isInteger(id) || !STATUSES.includes(status)) return new Response("Bad request", { status: 400 });

  await env.DB.prepare("UPDATE leads SET status = ? WHERE id = ?").bind(status, id).run();
  return Response.redirect(`${url.origin}/admin?show=${show}`, 303);
}

export async function cancelConsult(request, env) {
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const form = await request.formData();
  const id = Number(form.get("booking"));
  const show = String(form.get("show") || "open").replace(/[^a-z]/g, "");
  const back = (k, v) => Response.redirect(`${url.origin}/admin?show=${show}&${k}=${encodeURIComponent(v)}`, 303);
  if (!Number.isInteger(id)) return back("error", "Couldn't find that consultation.");
  try {
    const r = await cancelBooking(env, await loadSettings(env), id);
    if (r.error) return back("error", r.error);
    return back("ok", "Consultation cancelled and removed from the calendar. The time is open again.");
  } catch (err) {
    return back("error", `Couldn't cancel: ${err.message}`);
  }
}

// ---------- Availability ----------

export async function availabilityPage(env, url) {
  const s = await loadSettings(env);
  const sa = serviceAccountEmail(env);

  let state;
  let next = "";
  if (!sa) state = '<span class="dot bad">Google access not set up</span>';
  else if (!s.calendar_id) state = '<span class="dot bad">No calendar entered</span>';
  else {
    try {
      const days = await openSlots(env, s);
      const total = days.reduce((n, d) => n + d.slots.length, 0);
      state = '<span class="dot ok">Calendar connected</span>';
      const first = days.flatMap((d) => d.slots.map((x) => `${d.label}, ${x.label}`)).slice(0, 5);
      next = total
        ? `<div class="kv"><span>Open times</span>${total}</div><div class="kv"><span>Next available</span><ul class="next">${first
            .map((x) => `<li>${esc(x)}</li>`)
            .join("")}</ul></div>`
        : '<div class="kv"><span>Open times</span>None with these settings</div>';
    } catch (err) {
      state = `<span class="dot bad">Calendar not connected</span><div class="kv"><span>Error</span>${esc(err.message)}</div>`;
    }
  }

  const order = [1, 2, 3, 4, 5, 6, 0];
  const week = order
    .map((i) => {
      const d = s.days[i];
      return `<div class="day${d.on ? "" : " off"}">
  <label class="switch"><input type="checkbox" name="on_${i}"${d.on ? " checked" : ""} onchange="this.closest('.day').classList.toggle('off',!this.checked)"> ${DAY_NAMES[i]}</label>
  <input type="time" name="start_${i}" value="${esc(d.start)}" step="900" aria-label="${DAY_NAMES[i]} start">
  <span class="to">to</span>
  <input type="time" name="end_${i}" value="${esc(d.end)}" step="900" aria-label="${DAY_NAMES[i]} end">
</div>`;
    })
    .join("");

  const num = (name, label, value, min, max) =>
    `<div><label class="f" for="${name}">${label}</label><input type="number" id="${name}" name="${name}" value="${value}" min="${min}" max="${max}" required></div>`;

  return page(
    "Availability",
    "availability",
    `<h1>Availability</h1>
<p class="sub">Uncontested divorce consultations booked from the chat</p>
${flash(url)}
<div class="cols">
<form method="post" action="/admin/availability">
  <section class="panel">
    <h2>Calendar</h2>
    <div class="field"><label class="f" for="calendar_id">Google Calendar</label>
    <input type="email" id="calendar_id" name="calendar_id" value="${esc(s.calendar_id)}" placeholder="name@brandiwolfelaw.com" autocomplete="off"></div>
  </section>
  <section class="panel">
    <h2>Days and hours (Central)</h2>
    <div class="week">${week}</div>
  </section>
  <section class="panel">
    <h2>Appointments</h2>
    <div class="grid2">
      ${num("slot_minutes", "Length (minutes)", s.slot_minutes, 15, 240)}
      ${num("buffer_minutes", "Buffer between (minutes)", s.buffer_minutes, 0, 120)}
      ${num("min_notice_hours", "Minimum notice (hours)", s.min_notice_hours, 0, 336)}
      ${num("days_ahead", "Bookable up to (days ahead)", s.days_ahead, 1, 90)}
      ${num("max_per_day", "Most per day", s.max_per_day, 1, 20)}
    </div>
  </section>
  <section class="panel">
    <h2>Blocked dates</h2>
    <p class="hint">One date per line, like 2026-11-26</p>
    <textarea name="blocked_dates" aria-label="Blocked dates">${esc((s.blocked_dates || []).join("\n"))}</textarea>
  </section>
  <section class="panel">
    <h2>Booking details</h2>
    <div class="field"><label class="f" for="event_title">Calendar event title</label>
    <input type="text" id="event_title" name="event_title" value="${esc(s.event_title)}" maxlength="100"></div>
    <div class="field"><label class="f" for="confirmation_note">Note in the confirmation</label>
    <textarea id="confirmation_note" name="confirmation_note" maxlength="400" placeholder="Brandi will call you at the number you gave.">${esc(s.confirmation_note)}</textarea></div>
  </section>
  <div class="bar"><button class="btn" type="submit">Save availability</button></div>
</form>
<aside class="side panel"><div class="status">
  <h2>Status</h2>
  ${state}
  ${next}
  ${sa ? `<div class="kv"><span>Calendar access email</span><code>${esc(sa)}</code></div>` : ""}
</div></aside>
</div>`
  );
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function saveAvailability(request, env) {
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const base = new URL(request.url).origin + "/admin/availability";
  const f = await request.formData();
  const fail = (msg) => Response.redirect(`${base}?error=${encodeURIComponent(msg)}`, 303);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const on = f.get(`on_${i}`) === "on";
    const start = String(f.get(`start_${i}`) || "09:00");
    const end = String(f.get(`end_${i}`) || "17:00");
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) return fail(`${DAY_NAMES[i]}: enter a valid time.`);
    if (on && start >= end) return fail(`${DAY_NAMES[i]}: the end time has to be after the start time.`);
    days.push({ on, start, end });
  }

  const int = (name, min, max) => {
    const n = Number(f.get(name));
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  const labels = {
    slot_minutes: ["Length", 15, 240],
    buffer_minutes: ["Buffer", 0, 120],
    min_notice_hours: ["Minimum notice", 0, 336],
    days_ahead: ["Bookable up to", 1, 90],
    max_per_day: ["Most per day", 1, 20],
  };
  const nums = {};
  for (const [k, [label, min, max]] of Object.entries(labels)) {
    nums[k] = int(k, min, max);
    if (nums[k] === null) return fail(`${label} has to be a whole number from ${min} to ${max}.`);
  }

  const blocked = String(f.get("blocked_dates") || "")
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const badDate = blocked.find((d) => !DATE_RE.test(d) || Number.isNaN(Date.parse(d)));
  if (badDate) return fail(`Blocked dates: "${badDate}" isn't in YYYY-MM-DD format.`);

  const calendar_id = String(f.get("calendar_id") || "").trim();
  if (calendar_id && !/^[^\s@]+@[^\s@]+$/.test(calendar_id)) return fail("Google Calendar has to be an email address.");

  await saveSettings(env, {
    calendar_id,
    days,
    ...nums,
    blocked_dates: [...new Set(blocked)].sort(),
    event_title: String(f.get("event_title") || "").trim().slice(0, 100) || "Uncontested divorce consultation",
    confirmation_note: String(f.get("confirmation_note") || "").trim().slice(0, 400),
  });
  return Response.redirect(`${base}?saved=1`, 303);
}

// ---------- Alerts ----------

export async function alertsPage(env, url) {
  const a = await loadAlerts(env);
  const lines = (list) => esc((list || []).join("\n"));
  const from = env.ALERT_FROM || "";

  const sending = !from
    ? '<span class="dot bad">No sending address</span>'
    : a.to.length
      ? '<span class="dot ok">Alerts on</span>'
      : '<span class="dot bad">No one gets alerts yet</span>';

  const overrides = MATTER_KEYS.filter((k) => a.routes?.[k]?.length).length;
  const routeRows = MATTER_KEYS.map(
    (k) => `<tr><td><label for="r_${k}">${esc(matterLabel(k))}</label></td>
<td><input type="text" id="r_${k}" name="r_${k}" value="${esc((a.routes?.[k] || []).join(", "))}" placeholder="Default"></td></tr>`
  ).join("");

  return page(
    "Alerts",
    "alerts",
    `<h1>Alerts</h1>
${flash(url)}
<div class="cols">
<form method="post" action="/admin/alerts">
  <section class="panel">
    <h2>New leads</h2>
    <p class="hint">One email per line</p>
    <textarea name="to" aria-label="New lead recipients">${lines(a.to)}</textarea>
  </section>
  <section class="panel">
    <h2>Urgent leads also go to</h2>
    <p class="hint">Leads that mention danger, violence or a child at risk</p>
    <textarea name="urgent_to" aria-label="Urgent lead recipients">${lines(a.urgent_to)}</textarea>
  </section>
  <section class="panel">
    <h2>Booked consultations</h2>
    <p class="hint">Leave empty to use the new-lead list</p>
    <textarea name="booking_to" aria-label="Booking recipients">${lines(a.booking_to)}</textarea>
  </section>
  <section class="panel">
    <details${overrides ? " open" : ""}>
      <summary>By matter type${overrides ? ` (${overrides} set)` : ""}</summary>
      <p class="hint">Replaces the new-lead list for that matter type. Separate emails with commas.</p>
      <table class="routes"><tbody>${routeRows}</tbody></table>
    </details>
  </section>
  <div class="bar"><button class="btn" type="submit">Save alerts</button></div>
</form>
<aside class="side panel"><div class="status">
  <h2>Status</h2>
  ${sending}
  <div class="kv"><span>Sent from</span><code>${esc(from || "Not set")}</code></div>
  <div class="kv"><span>New leads go to</span>${a.to.length ? esc(a.to.join(", ")) : "No one"}</div>
  <form method="post" action="/admin/alerts/test"><button class="btn ghost" type="submit"${a.to.length && from ? "" : " disabled"}>Send test email</button></form>
</div></aside>
</div>`
  );
}

export async function saveAlertsForm(request, env) {
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const base = new URL(request.url).origin + "/admin/alerts";
  const f = await request.formData();
  const fail = (msg) => Response.redirect(`${base}?error=${encodeURIComponent(msg)}`, 303);

  const fields = { to: "New leads", urgent_to: "Urgent leads", booking_to: "Booked consultations" };
  const out = { routes: {} };
  for (const [k, label] of Object.entries(fields)) {
    const { list, bad } = parseEmails(f.get(k));
    if (bad.length) return fail(`${label}: "${bad[0]}" isn't a valid email.`);
    if (list.length > 50) return fail(`${label}: 50 emails at most.`);
    out[k] = list;
  }
  for (const k of MATTER_KEYS) {
    const { list, bad } = parseEmails(f.get(`r_${k}`));
    if (bad.length) return fail(`${matterLabel(k)}: "${bad[0]}" isn't a valid email.`);
    if (list.length) out.routes[k] = list;
  }
  await saveAlerts(env, out);
  return Response.redirect(`${base}?saved=1`, 303);
}

export async function sendTestAlert(request, env) {
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const base = new URL(request.url).origin + "/admin/alerts";
  const a = await loadAlerts(env);
  const to = leadRecipients(a, "other", false);
  if (!env.ALERT_FROM || !to.length) return Response.redirect(`${base}?error=${encodeURIComponent("Add a recipient and save first.")}`, 303);
  try {
    await env.EMAIL.send({
      from: { email: env.ALERT_FROM, name: "BWL Website Chat" },
      to,
      subject: "Test alert from the website chat",
      text: "This is a test. New chat leads will arrive from this address.",
    });
    return Response.redirect(`${base}?ok=${encodeURIComponent(`Test email sent to ${to.join(", ")}`)}`, 303);
  } catch (err) {
    const msg = `Test email failed: ${err.code ? err.code + ": " : ""}${err.message}`;
    return Response.redirect(`${base}?error=${encodeURIComponent(msg.slice(0, 300))}`, 303);
  }
}
