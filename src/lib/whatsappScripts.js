import { apiGet, apiPost, apiPatch, apiDelete, invalidateCache } from "./api.js";
import { getCrmHeaders } from "./crmContext.js";

export const WA_SCRIPT_PLACEHOLDERS = [
  { key: "{name}", label: "Lead name" },
  { key: "{leadName}", label: "Lead name" },
  { key: "{company}", label: "Company" },
  { key: "{repName}", label: "Your name" },
  { key: "{employeeName}", label: "Your name" },
];

export function resolveWhatsAppScriptBody(template, { lead, employee } = {}) {
  if (!template) return "";
  const leadName = lead?.name || lead?.leadName || "there";
  const company = lead?.company || lead?.companyName || "your company";
  const repName = employee?.name || "our team";

  return String(template)
    .replace(/\{name\}/gi, leadName)
    .replace(/\{leadName\}/gi, leadName)
    .replace(/\{company\}/gi, company)
    .replace(/\{repName\}/gi, repName)
    .replace(/\{employeeName\}/gi, repName);
}

export function formatWhatsAppPhone(phone) {
  if (!phone) return "";
  const clean = String(phone).replace(/\D/g, "");
  if (!clean) return "";
  if (clean.length === 10) return `91${clean}`;
  return clean;
}

export function buildWhatsAppUrl(phone, message = "") {
  const formatted = formatWhatsAppPhone(phone);
  if (!formatted) return null;
  const base = `https://wa.me/${formatted}`;
  const text = String(message || "").trim();
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function openWhatsAppChat(phone, message = "") {
  const url = buildWhatsAppUrl(phone, message);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

function mapScript(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category || "General",
    isActive: row.isActive !== false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function fetchWhatsAppScripts(employeeId, { includeInactive = false } = {}) {
  const headers = getCrmHeaders("employee");
  const query = includeInactive ? "?includeInactive=1" : "";
  const res = await apiGet(`/api/v1/employee/${employeeId}/whatsapp-scripts${query}`, { headers });
  const items = res?.data ?? res ?? [];
  return (Array.isArray(items) ? items : []).map(mapScript).filter(Boolean);
}

export async function createWhatsAppScript(employeeId, payload) {
  const headers = getCrmHeaders("employee");
  const res = await apiPost(`/api/v1/employee/${employeeId}/whatsapp-scripts`, payload, { headers });
  invalidateCache("/api/v1/employee");
  return mapScript(res?.data ?? res);
}

export async function updateWhatsAppScript(scriptId, payload) {
  const headers = getCrmHeaders("employee");
  const res = await apiPatch(`/api/v1/employee/whatsapp-scripts/${scriptId}`, payload, { headers });
  invalidateCache("/api/v1/employee");
  return mapScript(res?.data ?? res);
}

export async function deleteWhatsAppScript(scriptId) {
  const headers = getCrmHeaders("employee");
  await apiDelete(`/api/v1/employee/whatsapp-scripts/${scriptId}`, { headers });
  invalidateCache("/api/v1/employee");
}
