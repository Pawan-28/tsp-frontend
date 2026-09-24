import { normalizeSource } from "./leadAssignment.js";

/** Known marketing / intake sources shown first on the dashboard. */
export const SOURCE_CATALOG = [
  { key: "meta_ads", label: "Meta" },
  { key: "google_ads", label: "Google Ads" },
  { key: "website", label: "Website" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "referral", label: "Referral" },
  { key: "landing_page", label: "Landing Page" },
  { key: "campaign", label: "Campaign" },
  { key: "manual", label: "Manual" },
  { key: "n8n", label: "n8n / Webhook" },
  { key: "api", label: "API" },
  { key: "form", label: "Form" },
  { key: "other", label: "Other" },
];

const CATALOG_LABELS = Object.fromEntries(SOURCE_CATALOG.map((s) => [s.key, s.label]));

function dig(obj, ...keys) {
  if (!obj || typeof obj !== "object") return null;
  for (const key of keys) {
    const val = obj[key];
    if (val != null && String(val).trim()) return String(val).trim();
  }
  return null;
}

/** Sources that are internal integrations — not marketing channels. */
export const EXCLUDED_SOURCE_KEYS = new Set([
  "callyzer",
  "third_party",
]);

/** Valid marketing source keys for the Source dashboard. */
export const MARKETING_SOURCE_KEYS = new Set(SOURCE_CATALOG.map((s) => s.key));

function isSeedOrDemoLead(lead) {
  if (!lead) return true;

  // 1) Explicit mock / seed flags
  if (lead.is_demo || lead.isDemo || lead.is_seed || lead.isSeed) return true;

  // 2) Mock ID patterns
  const idStr = String(lead.id || "").toLowerCase();
  if (
    idStr.startsWith("seed-") ||
    idStr.startsWith("mock-") ||
    idStr.startsWith("demo-") ||
    idStr.startsWith("test-")
  ) {
    return true;
  }

  // 3) Assigned by seed / mock
  const assignedBy = String(lead?.assigned_by || lead?.assignedBy || "").toLowerCase();
  if (assignedBy === "seed" || assignedBy === "demo" || assignedBy === "mock") return true;

  // 4) Check sourceMeta flags
  const meta = lead.sourceMeta || lead.source_meta || {};
  if (meta.isSeed || meta.is_seed || meta.isDemo || meta.is_demo || meta.dummy || meta.isMock) return true;

  // 5) Dummy name patterns
  const name = String(lead.lead_name || lead.leadName || lead.name || "").toLowerCase();
  if (
    name.includes("demo") ||
    name.includes("test lead") ||
    name.includes("sample lead") ||
    name.includes("dummy") ||
    name.includes("mock lead")
  ) {
    return true;
  }

  // 6) Dummy email patterns
  const email = String(lead?.email || "").toLowerCase();
  if (
    email.endsWith("@example.com") ||
    email.endsWith("@test.com") ||
    email.endsWith("@demo.com") ||
    email.includes("dummy") ||
    email.includes("test")
  ) {
    return true;
  }

  // 7) Dummy phone patterns
  const phone = String(lead?.phone || lead?.phone_number || "").replace(/\D/g, "");
  if (
    phone.startsWith("9190000") ||
    phone.startsWith("90000") ||
    phone.startsWith("00000") ||
    phone.startsWith("12345") ||
    phone === "1234567890" ||
    phone === "9876543210" ||
    phone === "9999999999"
  ) {
    return true;
  }

  return false;
}

/** Keep only real marketing-channel leads on the Source dashboard. */
export function isSourceDashboardLead(lead) {
  if (!lead || isSeedOrDemoLead(lead)) return false;

  const rawSource = String(lead.source || lead.sourceMeta?.integration || "").toLowerCase();
  if (rawSource.includes("callyzer")) return false;

  const key = resolveLeadSourceKey(lead);
  if (EXCLUDED_SOURCE_KEYS.has(key)) return false;
  if (!MARKETING_SOURCE_KEYS.has(key)) return false;

  // Legacy manual rows without channel attribution are not marketing sources.
  if (key === "manual") {
    const meta = lead.sourceMeta || lead.source_meta || {};
    if (!meta.channel) return false;
  }

  return true;
}

export function filterLeadsForSourceDashboard(leads = []) {
  return (Array.isArray(leads) ? leads : []).filter(isSourceDashboardLead);
}

/**
 * Resolve the display/grouping source for a lead (Meta, Google, Website, etc.).
 * n8n webhooks keep source=n8n in DB but channel lives in sourceMeta / payload.
 */
export function resolveLeadSourceKey(lead) {
  if (!lead) return "other";

  const meta = lead.sourceMeta || lead.source_meta || {};
  const raw = meta.rawPayload || meta.raw_payload || meta;

  const candidates = [
    meta.channel,
    meta.platform,
    meta.utm_source,
    meta.source,
    dig(raw, "channel", "platform", "utm_source", "source", "lead_source"),
    lead.source,
    lead.form_name,
    lead.formName,
    lead.keyword,
  ].filter(Boolean);

  for (const value of candidates) {
    const key = normalizeSource(value);
    if (key === "n8n") continue;
    if (key) return key;
  }

  const dbSource = normalizeSource(lead.source);
  if (dbSource && dbSource !== "n8n") return dbSource;
  return "n8n";
}

export function getSourceLabel(key) {
  return CATALOG_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function leadRevenue(lead) {
  return Number(lead?.expectedRevenue ?? lead?.expected_revenue ?? lead?.revenue ?? 0) || 0;
}

export function isLeadConverted(lead) {
  const stage = String(lead?.pipelineStage || lead?.pipeline_stage || lead?.status || "").toLowerCase();
  const temp = String(lead?.temperature || "").toLowerCase();
  return (
    stage.includes("converted")
    || stage.includes("won")
    || stage.includes("payment complete")
    || temp === "converted"
    || String(lead?.status || "").toLowerCase() === "converted"
  );
}

export function aggregateLeadsBySource(leads = []) {
  const buckets = new Map();

  for (const lead of leads) {
    const key = resolveLeadSourceKey(lead);
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        label: getSourceLabel(key),
        leads: [],
        leadCount: 0,
        totalRevenue: 0,
        convertedCount: 0,
      });
    }
    const bucket = buckets.get(key);
    const converted = isLeadConverted(lead);
    const revenue = converted ? leadRevenue(lead) : 0;
    bucket.leads.push(lead);
    bucket.leadCount += 1;
    bucket.totalRevenue += revenue;
    if (converted) bucket.convertedCount += 1;
  }

  return Array.from(buckets.values())
    .map((b) => ({
      ...b,
      conversion: b.leadCount ? Math.round((b.convertedCount / b.leadCount) * 100) : 0,
    }))
    .sort((a, b) => b.leadCount - a.leadCount || b.totalRevenue - a.totalRevenue);
}

export function getSourcesSummary(sourceGroups = []) {
  const totalLeads = sourceGroups.reduce((s, g) => s + g.leadCount, 0);
  const totalEarnings = sourceGroups.reduce((s, g) => s + g.totalRevenue, 0);
  const top = sourceGroups[0];
  return {
    totalSources: sourceGroups.length,
    totalLeads,
    totalEarnings,
    topSource: top?.label || "—",
    topSourceLeads: top?.leadCount || 0,
  };
}

export function formatSourceRevenue(val) {
  const n = Number(val) || 0;
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function filterLeadsBySourceKey(leads, sourceKey) {
  const target = String(sourceKey || "").toLowerCase();
  return leads.filter((lead) => resolveLeadSourceKey(lead) === target);
}

/**
 * A dismissed source stays hidden only while every one of its leads predates the
 * dismissal — a fresh lead on that channel after dismissal brings the card back.
 */
export function isSourceDismissed(group, dismissedAtIso) {
  if (!dismissedAtIso) return false;
  const dismissedAt = new Date(dismissedAtIso).getTime();
  if (Number.isNaN(dismissedAt)) return false;
  return group.leads.every((lead) => {
    const createdAt = new Date(lead.createdAt || lead.created_at || 0).getTime();
    return Number.isNaN(createdAt) || createdAt <= dismissedAt;
  });
}
