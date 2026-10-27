import { busyTimes, createEvent } from "./google.js";

export const TZ = "America/Chicago";
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const DEFAULT_SETTINGS = {
  calendar_id: "",
  days: [
    { on: false, start: "09:00", end: "17:00" },
    { on: true, start: "09:00", end: "17:00" },
    { on: true, start: "09:00", end: "17:00" },
    { on: true, start: "09:00", end: "17:00" },
    { on: true, start: "09:00", end: "17:00" },
    { on: true, start: "09:00", end: "17:00" },
    { on: false, start: "09:00", end: "17:00" },
  ],
  slot_minutes: 30,
  buffer_minutes: 15,
  min_notice_hours: 24,
  days_ahead: 21,
  max_per_day: 4,
  blocked_dates: [],
  event_title: "Uncontested divorce consultation",
  confirmation_note: "",
};

// ---------- settings ----------

export async function loadSettings(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'booking'").first();
  let saved = {};
  try {
    saved = row ? JSON.parse(row.value) : {};
  } catch {}
  return { ...DEFAULT_SETTINGS, ...saved, days: saved.days || DEFAULT_SETTINGS.days };
}

export async function saveSettings(env, s) {
  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES ('booking', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  )
    .bind(JSON.stringify(s))
    .run();
}

export function bookingConfigured(env, s) {
  return Boolean(env.GOOGLE_SERVICE_ACCOUNT && s.calendar_id && s.days.some((d) => d.on));
}

// ---------- time zone helpers ----------

function offsetMinutes(ms, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - ms) / 60000);
}

// "2026-10-28", 600 (minutes after local midnight) -> UTC ms
export function localToUtc(dateStr, minutes, tz = TZ) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  let ms = guess - offsetMinutes(guess, tz) * 60000;
  ms = guess - offsetMinutes(ms, tz) * 60000;
  return ms;
}

export function localDate(ms, tz = TZ) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(ms)
  );
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function weekday(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + (m || 0);
};

export const dayLabel = (ms) =>
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }).format(new Date(ms));
export const timeLabel = (ms) =>
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(ms));
export const fullLabel = (ms) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms)) + " Central";

// ---------- slots ----------

export async function openSlots(env, s, now = Date.now()) {
  const slotMs = s.slot_minutes * 60000;
  const bufMs = s.buffer_minutes * 60000;
  const earliest = now + s.min_notice_hours * 3600000;
  const today = localDate(now);
  const lastDay = addDays(today, s.days_ahead);
  const rangeEnd = localToUtc(addDays(lastDay, 1), 0);

  const busy = await busyTimes(env, s.calendar_id, now, rangeEnd);

  const { results: booked } = await env.DB.prepare(
    "SELECT start_utc, end_utc, local_date FROM bookings WHERE status != 'cancelled' AND local_date >= ?"
  )
    .bind(today)
    .all();
  const perDay = {};
  for (const b of booked) {
    perDay[b.local_date] = (perDay[b.local_date] || 0) + 1;
    busy.push({ start: Date.parse(b.start_utc), end: Date.parse(b.end_utc) });
  }

  const blocked = new Set(s.blocked_dates || []);
  const days = [];
  for (let i = 0; i <= s.days_ahead; i++) {
    const date = addDays(today, i);
    const rule = s.days[weekday(date)];
    if (!rule || !rule.on || blocked.has(date)) continue;
    if ((perDay[date] || 0) >= s.max_per_day) continue;

    const slots = [];
    const endMin = toMinutes(rule.end);
    for (let t = toMinutes(rule.start); t + s.slot_minutes <= endMin; t += s.slot_minutes) {
      const st = localToUtc(date, t);
      const en = st + slotMs;
      if (st < earliest) continue;
      if (busy.some((b) => st - bufMs < b.end && en + bufMs > b.start)) continue;
      slots.push({ start: new Date(st).toISOString(), label: timeLabel(st) });
    }
    if (slots.length) days.push({ date, label: dayLabel(localToUtc(date, 720)), slots });
  }
  return days;
}

// ---------- booking ----------

export async function bookSlot(env, s, { lead, sid, startIso }) {
  const st = Date.parse(startIso);
  if (!Number.isFinite(st)) return { error: "That time isn't valid." };

  const days = await openSlots(env, s);
  const ok = days.some((d) => d.slots.some((x) => Date.parse(x.start) === st));
  if (!ok) return { error: "That time was just taken. Please pick another.", refresh: true };

  const en = st + s.slot_minutes * 60000;
  const startUtc = new Date(st).toISOString();
  let bookingId;
  try {
    const row = await env.DB.prepare(
      `INSERT INTO bookings (lead_id, session_id, start_utc, end_utc, local_date) VALUES (?,?,?,?,?) RETURNING id`
    )
      .bind(lead.id, sid, startUtc, new Date(en).toISOString(), localDate(st))
      .first();
    bookingId = row.id;
  } catch (err) {
    if (String(err).includes("UNIQUE")) return { error: "That time was just taken. Please pick another.", refresh: true };
    throw err;
  }

  let eventId;
  try {
    eventId = await createEvent(env, s.calendar_id, {
      summary: `${s.event_title}: ${lead.name || "Website lead"}`,
      description: [
        `Name: ${lead.name || ""}`,
        `Phone: ${lead.phone || ""}`,
        `Email: ${lead.email || ""}`,
        `Other party: ${lead.opposing_party || ""}`,
        `Summary: ${lead.summary || ""}`,
        `Booked through the website chat. Lead #${lead.id}`,
      ].join("\n"),
      start: { dateTime: startUtc, timeZone: TZ },
      end: { dateTime: new Date(en).toISOString(), timeZone: TZ },
    });
  } catch (err) {
    await env.DB.prepare("DELETE FROM bookings WHERE id = ?").bind(bookingId).run();
    throw err;
  }

  await env.DB.batch([
    env.DB.prepare("UPDATE bookings SET event_id = ?, status = 'confirmed' WHERE id = ?").bind(eventId, bookingId),
    env.DB.prepare("UPDATE leads SET status = 'booked' WHERE id = ?").bind(lead.id),
  ]);

  return { ok: true, start: startUtc, label: fullLabel(st) };
}
