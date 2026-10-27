import { loadSettings, saveSettings, openSlots, DAY_NAMES, fullLabel } from "./booking.js";
import { serviceAccountEmail } from "./google.js";

const STATUSES = ["new", "contacted", "booked", "closed"];

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function page(title, active, body) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#fff;--fg:#1d2433;--muted:#6b7385;--line:#e4e7ee;--urgent:#fdecec;--accent:#b42318;--ok:#067647;--field:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#14171f;--fg:#e8eaf0;--muted:#959cad;--line:#2a2f3b;--urgent:#3a1d1f;--accent:#f97066;--ok:#47cd89;--field:#1c2029}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
nav{display:flex;gap:18px;padding:14px 16px;border-bottom:1px solid var(--line)}
nav a{text-decoration:none;color:var(--muted);font-weight:600}
nav a.on{color:var(--fg)}
h1{font-size:18px;margin:20px 16px 12px}
.wrap{overflow-x:auto;padding:0 16px 24px}
table{border-collapse:collapse;width:100%}
.leads{min-width:1000px}
th,td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--line)}
th{font-weight:600;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.03em}
tr.urgent td{background:var(--urgent)}
.tag{color:var(--accent);font-weight:700;font-size:11px}
.muted{color:var(--muted)}
.ok{color:var(--ok);font-weight:600}
.bad{color:var(--accent);font-weight:600}
a{color:inherit}
input,select,textarea{font:inherit;padding:5px 7px;border:1px solid var(--line);border-radius:6px;background:var(--field);color:var(--fg)}
input[type=checkbox]{width:16px;height:16px}
input[type=number]{width:80px}
.form{max-width:640px;padding:0 16px 32px}
.row{display:flex;align-items:center;gap:10px;margin:10px 0;flex-wrap:wrap}
.row label{min-width:190px}
.days td{padding:6px 8px}
textarea{width:100%;min-height:70px}
.full{width:100%}
.status{margin:0 0 16px;padding:10px 12px;border:1px solid var(--line);border-radius:8px}
.status div{margin:2px 0}
button{font:inherit;font-weight:600;padding:8px 18px;border:0;border-radius:8px;background:var(--fg);color:var(--bg);cursor:pointer}
h2{font-size:14px;margin:22px 0 6px}
</style></head><body>
<nav><a href="/admin" class="${active === "leads" ? "on" : ""}">Leads</a><a href="/admin/availability" class="${active === "availability" ? "on" : ""}">Availability</a></nav>
${body}
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

// ---------- Leads ----------

export async function adminPage(env) {
  const { results } = await env.DB.prepare(
    `SELECT l.*, b.start_utc AS appt FROM leads l
     LEFT JOIN bookings b ON b.lead_id = l.id AND b.status = 'confirmed'
     ORDER BY l.created_at DESC LIMIT 300`
  ).all();

  const rows = results
    .map((l) => {
      const opts = STATUSES.map((s) => `<option${s === l.status ? " selected" : ""}>${s}</option>`).join("");
      return `<tr class="${l.urgent ? "urgent" : ""}">
  <td>${esc(l.created_at.replace("T", " ").replace("Z", " UTC"))}</td>
  <td>${esc(l.name)}${l.urgent ? ' <span class="tag">URGENT</span>' : ""}</td>
  <td>${l.phone ? `<a href="tel:${esc(l.phone)}">${esc(l.phone)}</a>` : ""}${l.email ? `<br><a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : ""}</td>
  <td>${esc((l.matter_type || "").replace(/_/g, " "))}</td>
  <td>${esc(l.summary)}</td>
  <td>${esc(l.opposing_party)}</td>
  <td>${l.appt ? esc(fullLabel(Date.parse(l.appt))) : ""}</td>
  <td>${l.notified ? esc(l.routed_to) : '<span class="muted">not sent</span>'}</td>
  <td><form method="post" action="/admin/status"><input type="hidden" name="id" value="${l.id}"><select name="status" onchange="this.form.submit()">${opts}</select></form></td>
</tr>`;
    })
    .join("");

  return page(
    "Chat Leads",
    "leads",
    `<h1>Chat Leads (${results.length})</h1>
<div class="wrap"><table class="leads">
<thead><tr><th>Received</th><th>Name</th><th>Contact</th><th>Matter</th><th>Summary</th><th>Other party</th><th>Appointment</th><th>Alert</th><th>Status</th></tr></thead>
<tbody>${rows || '<tr><td colspan="9" class="muted">No leads yet.</td></tr>'}</tbody>
</table></div>`
  );
}

export async function updateStatus(request, env) {
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const form = await request.formData();
  const id = Number(form.get("id"));
  const status = String(form.get("status") || "");
  if (!Number.isInteger(id) || !STATUSES.includes(status)) return new Response("Bad request", { status: 400 });

  await env.DB.prepare("UPDATE leads SET status = ? WHERE id = ?").bind(status, id).run();
  return Response.redirect(`${url.origin}/admin`, 303);
}

// ---------- Availability ----------

export async function availabilityPage(env, url) {
  const s = await loadSettings(env);
  const sa = serviceAccountEmail(env);

  let calendarLine;
  let nextLine = "";
  if (!sa) {
    calendarLine = '<span class="bad">Google access not set up</span>';
  } else if (!s.calendar_id) {
    calendarLine = '<span class="bad">No calendar entered</span>';
  } else {
    try {
      const days = await openSlots(env, s);
      calendarLine = '<span class="ok">Calendar connected</span>';
      const first = days.flatMap((d) => d.slots.map((x) => `${d.label} ${x.label}`)).slice(0, 4);
      const total = days.reduce((n, d) => n + d.slots.length, 0);
      nextLine = total
        ? `<div>Open times: ${total} &middot; next: ${esc(first.join(", "))}</div>`
        : '<div class="bad">No open times with these settings</div>';
    } catch (err) {
      calendarLine = `<span class="bad">Calendar not connected: ${esc(err.message)}</span>`;
    }
  }

  const saved = url.searchParams.get("saved") ? '<div class="ok">Saved</div>' : "";
  const err = url.searchParams.get("error") ? `<div class="bad">${esc(url.searchParams.get("error"))}</div>` : "";

  const order = [1, 2, 3, 4, 5, 6, 0];
  const dayRows = order
    .map((i) => {
      const d = s.days[i];
      return `<tr><td><label><input type="checkbox" name="on_${i}"${d.on ? " checked" : ""}> ${DAY_NAMES[i]}</label></td>
<td><input type="time" name="start_${i}" value="${esc(d.start)}" step="900"></td>
<td><input type="time" name="end_${i}" value="${esc(d.end)}" step="900"></td></tr>`;
    })
    .join("");

  const num = (name, label, value, min, max) =>
    `<div class="row"><label for="${name}">${label}</label><input type="number" id="${name}" name="${name}" value="${value}" min="${min}" max="${max}" required></div>`;

  return page(
    "Availability",
    "availability",
    `<h1>Uncontested divorce consultations</h1>
<form class="form" method="post" action="/admin/availability">
<div class="status">${saved}${err}<div>${calendarLine}</div>${nextLine}${
      sa ? `<div class="muted">Calendar access email: ${esc(sa)}</div>` : ""
    }</div>

<div class="row"><label for="calendar_id">Google Calendar</label><input class="full" type="email" id="calendar_id" name="calendar_id" value="${esc(s.calendar_id)}" placeholder="brandi@example.com"></div>

<h2>Days and hours (Central)</h2>
<table class="days"><tbody>${dayRows}</tbody></table>

<h2>Appointments</h2>
${num("slot_minutes", "Length (minutes)", s.slot_minutes, 15, 240)}
${num("buffer_minutes", "Buffer between (minutes)", s.buffer_minutes, 0, 120)}
${num("min_notice_hours", "Minimum notice (hours)", s.min_notice_hours, 0, 336)}
${num("days_ahead", "Book up to (days ahead)", s.days_ahead, 1, 90)}
${num("max_per_day", "Max per day", s.max_per_day, 1, 20)}

<h2>Blocked dates</h2>
<textarea name="blocked_dates" placeholder="2026-11-26">${esc((s.blocked_dates || []).join("\n"))}</textarea>

<h2>Calendar event title</h2>
<input class="full" name="event_title" value="${esc(s.event_title)}" maxlength="100">

<h2>Confirmation note</h2>
<textarea name="confirmation_note" maxlength="400" placeholder="Brandi will call you at the number you gave.">${esc(s.confirmation_note)}</textarea>

<div class="row"><button type="submit">Save</button></div>
</form>`
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
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) return fail(`${DAY_NAMES[i]}: invalid time`);
    if (on && start >= end) return fail(`${DAY_NAMES[i]}: end time must be after start time`);
    days.push({ on, start, end });
  }

  const int = (name, min, max) => {
    const n = Number(f.get(name));
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  const nums = {
    slot_minutes: int("slot_minutes", 15, 240),
    buffer_minutes: int("buffer_minutes", 0, 120),
    min_notice_hours: int("min_notice_hours", 0, 336),
    days_ahead: int("days_ahead", 1, 90),
    max_per_day: int("max_per_day", 1, 20),
  };
  for (const [k, v] of Object.entries(nums)) if (v === null) return fail(`${k.replace(/_/g, " ")}: out of range`);

  const blocked = String(f.get("blocked_dates") || "")
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const badDate = blocked.find((d) => !DATE_RE.test(d) || Number.isNaN(Date.parse(d)));
  if (badDate) return fail(`Blocked date not in YYYY-MM-DD format: ${badDate}`);

  const calendar_id = String(f.get("calendar_id") || "").trim();
  if (calendar_id && !/^[^\s@]+@[^\s@]+$/.test(calendar_id)) return fail("Google Calendar must be an email address or calendar ID");

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
