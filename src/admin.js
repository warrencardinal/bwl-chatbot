const STATUSES = ["new", "contacted", "booked", "closed"];

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function adminPage(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM leads ORDER BY created_at DESC LIMIT 300"
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
  <td>${l.notified ? esc(l.routed_to) : '<span class="muted">not sent</span>'}</td>
  <td><form method="post" action="/admin/status"><input type="hidden" name="id" value="${l.id}"><select name="status" onchange="this.form.submit()">${opts}</select></form></td>
</tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chat Leads</title>
<style>
:root{--bg:#fff;--fg:#1d2433;--muted:#6b7385;--line:#e4e7ee;--urgent:#fdecec;--accent:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#14171f;--fg:#e8eaf0;--muted:#959cad;--line:#2a2f3b;--urgent:#3a1d1f;--accent:#f97066}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
h1{font-size:18px;margin:20px 16px 12px}
.wrap{overflow-x:auto;padding:0 16px 24px}
table{border-collapse:collapse;width:100%;min-width:900px}
th,td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--line)}
th{font-weight:600;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.03em}
tr.urgent td{background:var(--urgent)}
.tag{color:var(--accent);font-weight:700;font-size:11px}
.muted{color:var(--muted)}
a{color:inherit}
select{font:inherit;padding:2px 4px}
</style></head><body>
<h1>Chat Leads (${results.length})</h1>
<div class="wrap"><table>
<thead><tr><th>Received</th><th>Name</th><th>Contact</th><th>Matter</th><th>Summary</th><th>Other party</th><th>Alert</th><th>Status</th></tr></thead>
<tbody>${rows || '<tr><td colspan="8" class="muted">No leads yet.</td></tr>'}</tbody>
</table></div>
</body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function updateStatus(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return new Response("Forbidden", { status: 403 });

  const form = await request.formData();
  const id = Number(form.get("id"));
  const status = String(form.get("status") || "");
  if (!Number.isInteger(id) || !STATUSES.includes(status)) return new Response("Bad request", { status: 400 });

  await env.DB.prepare("UPDATE leads SET status = ? WHERE id = ?").bind(status, id).run();
  return Response.redirect(`${url.origin}/admin`, 303);
}
