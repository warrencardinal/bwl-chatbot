// Who gets alert emails. Stored in D1 settings under key 'alerts'.
// Falls back to the ALERT_TO / ROUTES vars until saved from /admin/alerts.

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export const DEFAULT_ALERTS = { to: [], urgent_to: [], booking_to: [], routes: {} };

export function parseEmails(text) {
  const list = String(text || "")
    .split(/[\s,;]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const bad = list.filter((x) => !EMAIL_RE.test(x));
  return { list: [...new Set(list)], bad };
}

export async function loadAlerts(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'alerts'").first();
  if (row) {
    try {
      return { ...DEFAULT_ALERTS, ...JSON.parse(row.value), saved: true };
    } catch {}
  }
  let routes = {};
  try {
    const raw = JSON.parse(env.ROUTES || "{}");
    for (const [k, v] of Object.entries(raw)) routes[k] = parseEmails(v).list;
  } catch {}
  return { ...DEFAULT_ALERTS, to: parseEmails(env.ALERT_TO).list, routes, saved: false };
}

export async function saveAlerts(env, a) {
  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES ('alerts', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  )
    .bind(JSON.stringify({ to: a.to, urgent_to: a.urgent_to, booking_to: a.booking_to, routes: a.routes }))
    .run();
}

export function leadRecipients(a, matterType, urgent) {
  const base = a.routes?.[matterType]?.length ? a.routes[matterType] : a.to;
  const all = urgent ? [...base, ...(a.urgent_to || [])] : base;
  return [...new Set(all)].slice(0, 50);
}

export function bookingRecipients(a) {
  const list = a.booking_to?.length ? a.booking_to : leadRecipients(a, "uncontested_divorce", false);
  return [...new Set(list)].slice(0, 50);
}
