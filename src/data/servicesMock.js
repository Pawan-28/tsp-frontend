import { formatINR, formatServicePriceLabel } from "../lib/indianFormat.js";

export const SERVICE_CATEGORIES = [
  { id: "all", label: "Category: All" },
  { id: "ai", label: "AI Solutions" },
  { id: "crm", label: "CRM & Ops" },
  { id: "leadgen", label: "Lead Gen" },
  { id: "consulting", label: "Consulting" },
  { id: "dev", label: "Custom Dev" },
];

/** Category labels for ids that are stored lowercase/abbreviated in the DB. */
const CATEGORY_LABEL_OVERRIDES = {
  general: "General Services",
  leadgen: "Lead Gen",
  crm: "CRM & Ops",
  ai: "AI Solutions",
  dev: "Custom Dev",
};

export function formatServiceCategoryLabel(category) {
  const raw = String(category || "").trim();
  if (!raw) return "General Services";
  const key = raw.toLowerCase();
  if (CATEGORY_LABEL_OVERRIDES[key]) return CATEGORY_LABEL_OVERRIDES[key];
  if (raw === key) return raw.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return raw;
}

/** Category filter options derived from the services that are actually in the catalog (plus "All"). */
export function deriveServiceCategoryOptions(services = []) {
  const seen = new Map();
  services.forEach((s) => {
    const id = String(s?.category || "").trim();
    if (id && !seen.has(id)) seen.set(id, formatServiceCategoryLabel(id));
  });
  const options = [...seen.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [{ id: "all", label: "Category: All" }, ...options];
}

/** True when a description is empty or an auto-generated / throwaway placeholder (not real copy). */
export function isPlaceholderDescription(description, name = "") {
  const text = String(description ?? "").trim();
  if (!text) return true;
  if (/^auto-created service offering for\b/i.test(text)) return true;
  if (/^service catalog offering for\b/i.test(text)) return true;
  if (text.length <= 3) return true;
  if (name && text.toLowerCase() === String(name).trim().toLowerCase()) return true;
  return false;
}

/** True when the service has a created date within the last `days` days (false when no date is available). */
export function isRecentService(service, days = 14) {
  const raw = service?.createdAt || service?.created_at;
  if (!raw) return false;
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < days * 24 * 60 * 60 * 1000;
}

export const SERVICE_STATUSES = [
  { id: "all", label: "Status: All" },
  { id: "ACTIVE", label: "Active" },
  { id: "PAUSED", label: "Paused" },
  { id: "DRAFT", label: "Draft" },
];

export const SERVICE_PRICING_SORT = [
  { id: "high", label: "Pricing: High to Low" },
  { id: "low", label: "Pricing: Low to High" },
];


export function getServiceById(id) {
  const base = [...extraServices].find((s) => String(s.id) === String(id));
  if (!base) return null;
  const patch = catalogOverrides[id];
  return cloneService(patch ? { ...base, ...patch } : base);
}

let extraServices = [];

export function registerService(service) {
  extraServices = [service, ...extraServices.filter((s) => s.id !== service.id)];
}

const catalogOverrides = {};

function cloneService(service) {
  if (!service) return null;
  return {
    ...service,
    tags: [...(service.tags || [])],
    tiers: (service.tiers || []).map((t) => ({ ...t, features: [...(t.features || [])] })),
    features: (service.features || []).map((f) => ({ ...f })),
    team: (service.team || []).map((m) => ({ ...m })),
    insights: [...(service.insights || [])],
    delivery: (service.delivery || []).map((d) => ({ ...d })),
    documents: service.documents || ["Standard Proposal v4", "SOW Template v2", "Onboarding Checklist"],
    routingRule: service.routingRule || "Round Robin (Sales Team)",
    insightThreshold: service.insightThreshold ?? 85,
    publicVisible: service.publicVisible ?? true,
    clientPortal: service.clientPortal ?? false,
  };
}

export function updateService(service) {
  const next = cloneService(service);
  catalogOverrides[service.id] = next;
  const idx = extraServices.findIndex((s) => s.id === service.id);
  if (idx >= 0) extraServices[idx] = next;
  return next;
}

export function getAllServices() {
  return [...extraServices].map((s) => {
    const patch = catalogOverrides[s.id];
    return patch ? cloneService({ ...s, ...patch }) : cloneService(s);
  });
}

export function formatServiceMoney(val) {
  return formatINR(val);
}

export { formatServicePriceLabel };

export function serviceBadgeTone(badge) {
  if (badge === "POPULAR") return "danger";
  if (badge === "ENTERPRISE") return "purple";
  return "success";
}
