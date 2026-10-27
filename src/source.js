// Where a lead came from, from what the widget saw on the first page of the visit.

const SEARCH = [/(^|\.)google\./, /(^|\.)bing\.com$/, /(^|\.)yahoo\./, /(^|\.)duckduckgo\.com$/, /(^|\.)ecosia\.org$/, /(^|\.)search\.brave\.com$/, /(^|\.)yandex\./, /(^|\.)baidu\.com$/];
const AI = [/(^|\.)chatgpt\.com$/, /(^|\.)chat\.openai\.com$/, /(^|\.)perplexity\.ai$/, /(^|\.)gemini\.google\.com$/, /(^|\.)claude\.ai$/, /(^|\.)copilot\.microsoft\.com$/];
const SOCIAL = [/(^|\.)facebook\.com$/, /(^|\.)fb\.com$/, /(^|\.)instagram\.com$/, /(^|\.)linkedin\.com$/, /(^|\.)lnkd\.in$/, /(^|\.)t\.co$/, /(^|\.)x\.com$/, /(^|\.)twitter\.com$/, /(^|\.)youtube\.com$/, /(^|\.)tiktok\.com$/, /(^|\.)nextdoor\.com$/, /(^|\.)reddit\.com$/, /(^|\.)pinterest\.com$/, /(^|\.)threads\.net$/];

export const CHANNELS = [
  "Organic search",
  "Paid search",
  "Google Business Profile",
  "AI assistant",
  "Social",
  "Paid social",
  "Email",
  "Referral",
  "Direct",
];

const clip = (v, n) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

function host(u) {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function classify(src, siteHost) {
  const medium = (src.utm_medium || "").toLowerCase();
  const source = (src.utm_source || "").toLowerCase();
  const ref = host(src.referrer || "");

  if (/^(gbp|gmb|google_business|googlebusiness|google-business|business\.google)/.test(source) || /^(gbp|gmb)$/.test(medium)) return "Google Business Profile";
  if (src.gclid || src.gbraid || src.wbraid || src.msclkid) return "Paid search";
  if (/^(cpc|ppc|paid|paidsearch|paid_search|paid-search|sem)$/.test(medium)) return "Paid search";
  if (/^(paid_social|paidsocial|paid-social|social_paid|cpm)$/.test(medium)) return "Paid social";
  if (/^(email|e-mail|newsletter)$/.test(medium)) return "Email";
  if (/^(social|social-media|social_media|sm)$/.test(medium) || src.fbclid) return "Social";
  if (!ref || ref === siteHost) return "Direct";
  if (AI.some((r) => r.test(ref))) return "AI assistant";
  if (SEARCH.some((r) => r.test(ref))) return "Organic search";
  if (SOCIAL.some((r) => r.test(ref))) return "Social";
  return "Referral";
}

export function cleanSource(raw, sitePage) {
  const src = raw && typeof raw === "object" ? raw : {};
  const siteHost = host(src.landing || sitePage || "");
  const clickKey = ["gclid", "gbraid", "wbraid", "msclkid", "fbclid"].find((k) => clip(src[k], 200));
  return {
    landing_page: clip(src.landing, 500),
    referrer: clip(src.referrer, 500),
    utm_source: clip(src.utm_source, 200),
    utm_medium: clip(src.utm_medium, 200),
    utm_campaign: clip(src.utm_campaign, 200),
    utm_term: clip(src.utm_term, 200),
    utm_content: clip(src.utm_content, 200),
    click_id: clickKey ? `${clickKey}:${clip(src[clickKey], 200)}` : null,
    channel: classify(src, siteHost),
  };
}

// "https://brandiwolfelaw.com/blog/uncontested-divorce/?utm_source=x" -> "/blog/uncontested-divorce/"
export function pathOf(u) {
  try {
    const x = new URL(u);
    return x.pathname || "/";
  } catch {
    return u || "";
  }
}
