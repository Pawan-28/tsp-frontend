import { apiGet, apiPost, apiPatch, apiDelete, invalidateCache } from "./api.js";
import { getCrmHeaders } from "./crmContext.js";
import { formatWhatsAppPhone as formatWhatsAppPhoneCentral } from "./phoneUtils.js";
import { appDateKey } from "./timezone.js";
import { cleanServiceName } from "./meetingTitle.js";

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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Date key (YYYY-MM-DD) one day after `key`. */
function nextDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Booked meeting -> { date, relative, time } for the customer message, in the app timezone (IST):
 *   date: "Thu, 8 Oct 2026"    relative: "Today" | "Tomorrow" | ""    time: "5:30 PM"
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
  if (!key || Number.isNaN(hh) || Number.isNaN(mm)) return { date: "", relative: "", time: "" };
  const today = appDateKey(now);
  const [y, mo, d] = key.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  const date = `${weekday}, ${d} ${MONTHS[mo - 1]} ${y}`;
  const relative = key === today ? "Today" : key === nextDateKey(today) ? "Tomorrow" : "";
  const time = `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, "0")} ${hh >= 12 ? "PM" : "AM"}`;
  return { date, relative, time };
}

/**
 * The service the meeting is about - it must be the one the MEETING was booked for, i.e. the one in its title
 * ("<Customer> <Service> - Clarity Call"), so the message and the meeting always say the same thing. The lead's own stored service
 * can differ (a service picked while booking, or a code sent with another name) - it only fills in when the title has no service.
 * Order: the service read out of the meeting title -> the service passed in -> the meeting's own service. "" when none is known.
 */
export function serviceForMeetingMessage({ serviceName, meeting, leadName } = {}) {
  const candidates = [serviceName, meeting?.leadService, meeting?.service]
    .map(cleanServiceName)
    .filter((c) => c && !/^SRV-\d+$/i.test(c));
  const name = String(leadName || "").trim();
  let title = String(meeting?.title || "").replace(/\s*[-\u2013\u2014]\s*Clarity Call\s*$/i, "").trim();
  if (title) {
    // a known service that the title ends with agrees with the title - use it as written
    const agreeing = candidates.find((c) => title.toLowerCase().endsWith(c.toLowerCase()));
    if (agreeing) return agreeing;
    // otherwise the title decides (the customer's name is the part in front of the service)
    const hasNamePrefix = name && title.toLowerCase().startsWith(name.toLowerCase());
    if (hasNamePrefix) {
      const fromTitle = title.slice(name.length).trim();
      if (fromTitle) return fromTitle;
    } else if (!candidates.length && title.toLowerCase() !== name.toLowerCase()) {
      return title;
    }
  }
  return candidates[0] || "";
}

/** "Ravi" -> "Ravi JI"; a name that already ends in "ji" is left as it is. */
function nameWithJi(name) {
  const n = String(name || "").trim();
  if (!n) return "";
  return /\bji$/i.test(n) ? n : `${n} JI`;
}

/**
 * Confirmation text sent to the customer right after a meeting is booked (editable before sending).
 *
 *   Hello <name> JI
 *
 *   This is to confirm our Clarity Call scheduled for <service>
 *
 *   Date : Today - Thu, 8 Oct 2026
 *   Time : 2:00 PM
 *   Meeting Link : <link>
 *
 *   Kindly acknowledge by replying \u201cConfirmed\u201d
 */
export function buildMeetingConfirmationMessage({ leadName, serviceName, meeting, now } = {}) {
  const { date, relative, time } = formatMeetingWhen(meeting?.scheduledAt, now);
  const link = String(meeting?.meetLink || meeting?.meet_link || "").trim();
  const service = serviceForMeetingMessage({ serviceName, meeting, leadName });
  const dateText = relative && date ? `${relative} - ${date}` : (date || relative);
  const greeting = nameWithJi(leadName);
  return [
    greeting ? `Hello ${greeting}` : "Hello",
    "",
    `This is to confirm our Clarity Call scheduled for${service ? ` ${service}` : ""}`,
    "",
    `Date : ${dateText}`,
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
