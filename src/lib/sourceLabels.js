/** Human-readable labels for stored lead source keys (meta_ads -> "Meta Ads"). */
export const SOURCE_LABELS = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  manual: "Manual entry",
  n8n: "Integration",
  callyzer: "Call import",
  website: "Website",
  whatsapp: "WhatsApp",
  landing_page: "Landing page",
  linkedin: "LinkedIn",
  referral: "Referral",
  form: "Form",
};

function titleCase(text) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Display label for a source key. Unknown keys fall back to Title Case with underscores replaced. */
export function sourceLabel(key) {
  const raw = String(key ?? "").trim();
  if (!raw) return "";
  const norm = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (SOURCE_LABELS[norm]) return SOURCE_LABELS[norm];
  return titleCase(raw.replace(/_/g, " "));
}
