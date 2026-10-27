// Google Calendar access through a service account that Brandi shares her calendar with.
// Secret GOOGLE_SERVICE_ACCOUNT holds the service account's JSON key.

const SCOPES = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly";
let cached = null; // { token, exp, email }

export function serviceAccountEmail(env) {
  try {
    return JSON.parse(env.GOOGLE_SERVICE_ACCOUNT || "").client_email || null;
  } catch {
    return null;
  }
}

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlStr = (s) => b64url(new TextEncoder().encode(s));

async function accessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;

  let sa;
  try {
    sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT || "");
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT secret is missing or not valid JSON");
  }
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const header = b64urlStr(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64urlStr(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPES,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  const jwt = `${header}.${claims}.${b64url(sig)}`;

  const res = await fetch(env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`Google token: ${data.error_description || data.error || res.status}`);
  cached = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return cached.token;
}

// Returns [{start: ms, end: ms}] busy intervals for the calendar.
export async function busyTimes(env, calendarId, timeMin, timeMax) {
  const token = await accessToken(env);
  const res = await fetch(`${env.GOOGLE_API_BASE || "https://www.googleapis.com"}/calendar/v3/freeBusy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin: new Date(timeMin).toISOString(),
      timeMax: new Date(timeMax).toISOString(),
      items: [{ id: calendarId }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Google freeBusy: ${data.error?.message || res.status}`);
  const cal = data.calendars?.[calendarId];
  if (!cal) throw new Error("Google freeBusy: calendar missing from response");
  if (cal.errors?.length) {
    const reason = cal.errors.map((e) => e.reason).join(", ");
    throw new Error(`Google freeBusy: no access to ${calendarId} (${reason})`);
  }
  return (cal.busy || []).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
}

export async function createEvent(env, calendarId, event) {
  const token = await accessToken(env);
  const res = await fetch(
    `${env.GOOGLE_API_BASE || "https://www.googleapis.com"}/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(event),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Google events.insert: ${data.error?.message || res.status}`);
  return data.id;
}
