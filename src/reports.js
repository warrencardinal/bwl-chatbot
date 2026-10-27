import { esc, page, matterLabel } from "./ui.js";
import { pathOf } from "./source.js";

const RANGES = [
  ["7", "7 days"],
  ["30", "30 days"],
  ["90", "90 days"],
  ["365", "12 months"],
  ["all", "All time"],
];

function group(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    const g = m.get(k) || { key: k, leads: 0, booked: 0 };
    g.leads++;
    if (r.booked) g.booked++;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.leads - a.leads || b.booked - a.booked || a.key.localeCompare(b.key));
}

function table(title, firstCol, groups, limit, fmt = (k) => esc(k)) {
  const shown = groups.slice(0, limit);
  const max = Math.max(1, ...shown.map((g) => g.leads));
  const body = shown.length
    ? shown
        .map(
          (g) => `<tr title="${esc(g.key)}: ${g.leads} lead${g.leads === 1 ? "" : "s"}, ${g.booked} booked">
  <th scope="row">${fmt(g.key)}</th>
  <td class="barcell"><span class="bar" style="width:${((g.leads / max) * 100).toFixed(1)}%"></span></td>
  <td class="num">${g.leads}</td><td class="num">${g.booked}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="4" class="empty-row">No leads in this range</td></tr>`;
  const more = groups.length > limit ? `<p class="more">${groups.length - limit} more not shown</p>` : "";
  return `<section class="panel report">
  <h2>${title}</h2>
  <table class="rtable"><thead><tr><th scope="col">${firstCol}</th><th scope="col"><span class="sr">Share</span></th><th scope="col" class="num">Leads</th><th scope="col" class="num">Booked</th></tr></thead>
  <tbody>${body}</tbody></table>${more}
</section>`;
}

export async function reportsPage(env, url) {
  const range = RANGES.some(([k]) => k === url.searchParams.get("range")) ? url.searchParams.get("range") : "30";
  const since = range === "all" ? "1970-01-01" : new Date(Date.now() - Number(range) * 86400000).toISOString().slice(0, 19) + "Z";

  const { results: rows } = await env.DB.prepare(
    `SELECT l.id, l.channel, l.landing_page, l.source_page, l.matter_type, l.urgent, l.utm_campaign,
       EXISTS (SELECT 1 FROM bookings b WHERE b.lead_id = l.id AND b.status = 'confirmed') AS booked
     FROM leads l WHERE l.created_at >= ? ORDER BY l.created_at DESC LIMIT 10000`
  )
    .bind(since)
    .all();

  const leads = rows.length;
  const booked = rows.filter((r) => r.booked).length;
  const urgent = rows.filter((r) => r.urgent).length;
  const rate = leads ? Math.round((booked / leads) * 100) : 0;

  const chips = RANGES.map(
    ([k, label]) => `<a href="/admin/reports?range=${k}" class="${k === range ? "on" : ""}">${label}</a>`
  ).join("");

  const pathLink = (p) => (p === "Not tracked" ? `<span class="muted">${p}</span>` : `<span class="path">${esc(p)}</span>`);

  const tiles = `<div class="tiles">
  <div class="tile"><b>${leads}</b><span>Leads</span></div>
  <div class="tile"><b>${booked}</b><span>Consultations booked</span></div>
  <div class="tile"><b>${rate}%</b><span>Of leads booked</span></div>
  <div class="tile"><b>${urgent}</b><span>Urgent</span></div>
</div>`;

  const campaigns = group(rows.filter((r) => r.utm_campaign), (r) => r.utm_campaign);

  return page(
    "Reports",
    "reports",
    `<h1>Reports</h1>
<nav class="filters" aria-label="Date range">${chips}</nav>
${tiles}
<div class="reports">
${table("Where leads came from", "Channel", group(rows, (r) => r.channel || "Not tracked"), 12)}
${table("Matter type", "Matter", group(rows, (r) => matterLabel(r.matter_type)), 16)}
${table("Landing page", "First page of the visit", group(rows, (r) => (r.landing_page ? pathOf(r.landing_page) : "Not tracked")), 15, pathLink)}
${table("Page where they chatted", "Page", group(rows, (r) => (r.source_page ? pathOf(r.source_page) : "Not tracked")), 15, pathLink)}
${campaigns.length ? table("Campaigns", "Campaign", campaigns, 15) : ""}
</div>`
  );
}
