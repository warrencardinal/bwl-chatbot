export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const MATTER_LABELS = {
  uncontested_divorce: "Uncontested divorce",
  divorce: "Divorce",
  child_custody: "Child custody",
  child_support: "Child support",
  spousal_support: "Spousal support",
  property_division: "Property division",
  modification_or_enforcement: "Modification or enforcement",
  protective_order: "Protective order",
  cps: "CPS",
  grandparents_rights: "Grandparents' rights",
  paternity: "Paternity",
  adoption: "Adoption",
  termination_of_parental_rights: "Termination of parental rights",
  estate_planning: "Estate planning",
  existing_client: "Existing client",
  other: "Other",
};
export const matterLabel = (m) => MATTER_LABELS[m] || String(m || "").replace(/_/g, " ");
export const MATTER_KEYS = Object.keys(MATTER_LABELS);

const CSS = `
:root{
  --ink:#1f2a44; --text:#1d2433; --muted:#5d6779; --paper:#f4f6f9; --surface:#fff;
  --line:#dde1e8; --soft:#eef1f5; --gold:#d99a1e; --gold-soft:#fdf3dc; --gold-ink:#7a5205;
  --red:#b42318; --red-soft:#fdeceb; --green:#0f7a4f; --green-soft:#e4f4ec; --focus:#2f5bd3;
}
@media (prefers-color-scheme:dark){:root{
  --ink:#c9d4ee; --text:#e7eaf1; --muted:#9aa3b5; --paper:#11151d; --surface:#181d27;
  --line:#2b3240; --soft:#202634; --gold:#e8b042; --gold-soft:#3a2e14; --gold-ink:#f1cc7c;
  --red:#f2786d; --red-soft:#3b1d1c; --green:#4fc28f; --green-soft:#16312a; --focus:#8aa6ff;
}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--text);font:15px/1.5 "Public Sans",system-ui,-apple-system,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums}
a{color:inherit}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:4px}
.top{background:var(--surface);border-bottom:1px solid var(--line)}
.top-in{max-width:1120px;margin:0 auto;padding:0 20px;display:flex;align-items:flex-end;gap:32px;flex-wrap:wrap}
.brand{padding:16px 0 14px;line-height:1.15}
.brand b{display:block;font-size:17px;font-weight:800;color:var(--ink);letter-spacing:-.01em}
.brand span{font-size:13px;color:var(--muted)}
.tabs{display:flex;gap:4px;margin-left:auto}
.tabs a{display:block;padding:14px 14px 12px;text-decoration:none;color:var(--muted);font-weight:600;border-bottom:3px solid transparent}
.tabs a:hover{color:var(--text)}
.tabs a.on{color:var(--ink);border-bottom-color:var(--gold)}
main{max-width:1120px;margin:0 auto;padding:28px 20px 64px}
h1{font-size:26px;line-height:1.2;font-weight:800;color:var(--ink);letter-spacing:-.015em;margin:0 0 4px}
.sub{color:var(--muted);margin:0 0 22px}
h2{font-size:16px;font-weight:700;margin:0 0 12px;color:var(--text)}
.flash{padding:10px 14px;border-radius:8px;margin:0 0 18px;font-weight:600}
.flash.ok{background:var(--green-soft);color:var(--green)}
.flash.bad{background:var(--red-soft);color:var(--red)}

/* leads */
.filters{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}
.filters a{display:inline-flex;gap:8px;align-items:center;padding:6px 12px;border:1px solid var(--line);border-radius:999px;background:var(--surface);text-decoration:none;font-size:14px;font-weight:600;color:var(--muted)}
.filters a b{font-weight:700;color:var(--text)}
.filters a.on{border-color:var(--ink);color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}
.list{background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.lead{display:grid;grid-template-columns:120px minmax(0,1fr) 230px 150px;gap:18px;padding:16px 20px;border-top:1px solid var(--line);position:relative}
.lead:first-child{border-top:0}
.lead.is-new::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--gold)}
.lead.is-urgent::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--red)}
.when{font-size:13px;color:var(--muted);line-height:1.35}
.when b{display:block;color:var(--text);font-size:14px}
.who{min-width:0}
.name{font-size:16px;font-weight:700;margin:0 0 4px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tag{display:inline-block;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--soft);color:var(--muted)}
.tag.urgent{background:var(--red-soft);color:var(--red)}
.tag.new{background:var(--gold-soft);color:var(--gold-ink)}
.summary{margin:0;color:var(--text)}
.meta{margin:6px 0 0;font-size:13px;color:var(--muted)}
.appt{margin:8px 0 0;font-size:14px;font-weight:600;color:var(--green)}
.contact{display:flex;flex-direction:column;gap:6px;font-size:14px}
.contact a{text-decoration:none;font-weight:600;color:var(--ink);overflow-wrap:anywhere}
.contact a:hover{text-decoration:underline}
.contact .alert{font-size:12px;color:var(--muted);font-weight:400}
.state select{width:100%}
.empty{padding:40px 20px;text-align:center;color:var(--muted)}

/* forms */
.cols{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:24px;align-items:start}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:20px 22px;margin:0 0 18px}
.side{position:sticky;top:20px}
label.f{display:block;font-weight:600;font-size:14px;margin:0 0 6px}
.hint{font-size:13px;color:var(--muted);margin:-2px 0 8px}
.field{margin:0 0 16px}
.field:last-child{margin-bottom:0}
input,select,textarea{font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:8px 10px}
input:focus,select:focus,textarea:focus{border-color:var(--focus);outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--focus) 20%,transparent)}
input[type=text],input[type=email],textarea{width:100%}
textarea{min-height:84px;resize:vertical;line-height:1.45}
input[type=number]{width:96px}
.grid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px 20px}
.week{display:flex;flex-direction:column}
.day{display:grid;grid-template-columns:170px 150px 24px 150px;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--line)}
.day input[type=time]{width:100%;min-width:0}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.day:first-child{border-top:0}
.day .to{color:var(--muted);font-size:14px;text-align:center}
.day.off input[type=time]{opacity:.45}
.switch{display:flex;align-items:center;gap:10px;font-weight:600;cursor:pointer}
.switch input{appearance:none;width:38px;height:22px;border-radius:999px;background:var(--line);position:relative;margin:0;padding:0;border:0;cursor:pointer;transition:background .15s}
.switch input::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s}
.switch input:checked{background:var(--ink)}
.switch input:checked::after{transform:translateX(16px)}
.status{display:flex;flex-direction:column;gap:10px}
.dot{display:inline-flex;align-items:center;gap:8px;font-weight:700}
.dot::before{content:"";width:9px;height:9px;border-radius:50%;background:currentColor}
.dot.ok{color:var(--green)}
.dot.bad{color:var(--red)}
.kv{font-size:14px}
.kv span{display:block;color:var(--muted);font-size:13px}
.kv code{font:inherit;overflow-wrap:anywhere}
.next{list-style:none;margin:4px 0 0;padding:0;font-size:14px}
.next li{padding:5px 0;border-top:1px solid var(--line)}
.next li:first-child{border-top:0}
.routes{width:100%;border-collapse:collapse}
.routes td{padding:8px 0;border-top:1px solid var(--line);vertical-align:middle}
.routes tr:first-child td{border-top:0}
.routes td:first-child{width:46%;padding-right:12px;font-size:14px}
.bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.btn{font:inherit;font-weight:700;padding:10px 20px;border:0;border-radius:8px;background:var(--ink);color:var(--surface);cursor:pointer}
.btn.ghost{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}
.btn:hover{filter:brightness(1.08)}
details summary{cursor:pointer;font-weight:700;list-style-position:inside}
details[open] summary{margin-bottom:12px}

@media (max-width:860px){
  .cols{grid-template-columns:1fr}
  .side{position:static;order:-1}
  .lead{grid-template-columns:1fr;gap:10px}
  .when b{display:inline;margin-right:6px}
  .contact{flex-direction:row;flex-wrap:wrap;gap:6px 16px}
  .tabs{margin-left:0;width:100%}
}
@media (max-width:520px){
  .day{grid-template-columns:minmax(0,1fr) 24px minmax(0,1fr);row-gap:8px}
  .day .switch{grid-column:1/-1}
  main{padding:22px 14px 48px}
  .top-in{padding:0 14px}
  .panel{padding:18px 16px}
  .tabs a{padding:10px 10px 9px}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

export function page(title, active, body) {
  const tab = (href, key, label) => `<a href="${href}" class="${active === key ? "on" : ""}"${active === key ? ' aria-current="page"' : ""}>${label}</a>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | BWL Chat</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<header class="top"><div class="top-in">
<div class="brand"><b>Brandi Wolfe Law</b><span>Website chat</span></div>
<nav class="tabs">${tab("/admin", "leads", "Leads")}${tab("/admin/availability", "availability", "Availability")}${tab("/admin/alerts", "alerts", "Alerts")}</nav>
</div></header>
<main>${body}</main>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export function flash(url) {
  const ok = url.searchParams.get("saved") ? "Saved" : url.searchParams.get("ok");
  const err = url.searchParams.get("error");
  if (err) return `<div class="flash bad" role="alert">${esc(err)}</div>`;
  if (ok) return `<div class="flash ok" role="status">${esc(ok)}</div>`;
  return "";
}

export function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}
