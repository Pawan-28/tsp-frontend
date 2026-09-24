import { formatINR, formatServicePriceLabel } from "../lib/indianFormat.js";

export const SERVICE_CATEGORIES = [
  { id: "all", label: "Category: All" },
  { id: "ai", label: "AI Solutions" },
  { id: "crm", label: "CRM & Ops" },
  { id: "leadgen", label: "Lead Gen" },
  { id: "consulting", label: "Consulting" },
  { id: "dev", label: "Custom Dev" },
];

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
