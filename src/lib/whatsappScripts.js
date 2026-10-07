import { apiGet, apiPost, apiPatch, apiDelete, invalidateCache } from "./api.js";
import { getCrmHeaders } from "./crmContext.js";
import { formatWhatsAppPhone as formatWhatsAppPhoneCentral } from "./phoneUtils.js";
import { appDateKey } from "./timezone.js";

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

const WEEKDAY_FMT = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Date key (YYYY-MM-DD) one day after `key`. */
function nextDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Booked meeting -> { date, time } for the customer message, in the app timezone (IST):
 *   date: "Today" / "Tomorrow" / "Wed, 7 Oct 2026"      time: "5:30 PM"
 * `scheduledAt` is the IST wall clock "YYYY-MM-DDTHH:mm:ss" (an ISO string with a zone is converted to IST first).
 */
export function formatMeetingWhen(scheduledAt, now = new Date()) {
  let key = "";
  let hh = NaN;
  let mm = NaN;
  const m = String(scheduledAt || "").match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?!.*(?:Z|[+-]\d{2}:?\d{2})$)/);
  if (m) {
    key = m[1];
    hh = Number(m[2]);
    mm = Number(m[3]);
  } else if (scheduledAt) {
    const d = new Date(scheduledAt);
    if (!Number.isNaN(d.getTime())) {
      key = appDateKey(d);
      const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).formatToParts(d);
      hh = Number(parts.find((p) => p.type === "hour").value) % 24;
      mm = Number(parts.find((p) => p.type === "minute").value);
    }
  }
  if (!key || Number.isNaN(hh) || Number.isNaN(mm)) return { date: "", time: "" };
  const today = appDateKey(now);
  const [y, mo, d] = key.split("-").map(Number);
  const date = key === today ? "Today" : key === nextDateKey(today) ? "Tomorrow" : WEEKDAY_FMT.format(new Date(Date.UTC(y, mo - 1, d)));
  const time = `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, "0")} ${hh >= 12 ? "PM" : "AM"}`;
  return { date, time };
}

/**
 * Confirmation text sent to the customer right after a meeting is booked (editable before sending).
 *
 *   Hello <customer name>
 *
 *   This is to confirm our Discovery Call scheduled for
 *
 *   Date : Today
 *   Time : 5:30 PM
 *   Meeting Link : <link>
 *
 *   Kindly acknowledge by replying \u201cConfirmed\u201d
 */
export function buildMeetingConfirmationMessage({ leadName, meeting, now } = {}) {
  const { date, time } = formatMeetingWhen(meeting?.scheduledAt, now);
  const link = String(meeting?.meetLink || meeting?.meet_link || "").trim();
  return [
    leadName ? `Hello ${String(leadName).trim()}` : "Hello",
    "",
    "This is to confirm our Discovery Call scheduled for",
    "",
    `Date : ${date}`,
    `Time : ${time || meeting?.time || ""}`,
    `Meeting Link : ${link}`,
    "",
    "Kindly acknowledge by replying \u201cConfirmed\u201d",
  ].join("\n");
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
