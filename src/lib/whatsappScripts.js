import { apiGet, apiPost, apiPatch, apiDelete, invalidateCache } from "./api.js";
import { getCrmHeaders } from "./crmContext.js";
import { formatWhatsAppPhone as formatWhatsAppPhoneCentral } from "./phoneUtils.js";

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

// Delegates to the central normalizer (lib/phoneUtils.js): "91" + last 10 digits for
// Indian numbers, so "+91919876543210" no longer becomes wa.me/91919876543210.
export function formatWhatsAppPhone(phone) {
  return formatWhatsAppPhoneCentral(phone);
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

/** Booked meeting → "Wed, 7 Oct 2026" / "2:00 PM" (scheduledAt is the IST wall-clock "YYYY-MM-DDTHH:mm:ss"). */
function formatMeetingWhen(scheduledAt) {
  const d = scheduledAt ? new Date(scheduledAt) : null;
  if (!d || Number.isNaN(d.getTime())) return { date: "", time: "" };
  return {
    date: d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase(),
  };
}

/** Default confirmation text sent to the customer right after a meeting is booked (editable before sending). */
export function buildMeetingConfirmationMessage({ leadName, meeting, employeeName } = {}) {
  const { date, time } = formatMeetingWhen(meeting?.scheduledAt);
  const lines = [
    leadName ? `Hi ${leadName},` : "Hi,",
    "",
    "Your meeting is confirmed ✅",
    meeting?.title ? `📌 *${meeting.title}*` : null,
    date ? `📅 *Date:* ${date}` : null,
    time ? `⏰ *Time:* ${time}` : (meeting?.time ? `⏰ *Time:* ${meeting.time}` : null),
    meeting?.meetLink ? `\n🔗 *Join Google Meet:* ${meeting.meetLink}` : null,
    "",
    "Looking forward to speaking with you!",
    employeeName ? `— ${employeeName}` : null,
  ];
  return lines.filter((l) => l !== null).join("\n");
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
