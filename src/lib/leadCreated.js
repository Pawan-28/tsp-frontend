import { parseAppDateTime } from "./timezone.js";

/**
 * "Lead Created" for the lead card: the date + time the lead entered the CRM, in Indian time - e.g. "8 Oct 2026, 12:20 PM".
 * `value` is the stored created time (naive "YYYY-MM-DD HH:mm:ss" is IST wall clock; an ISO string with a zone is converted).
 * Returns "" when the lead has no usable created time (the card then shows "—").
 */
export function formatLeadCreated(value) {
  const d = parseAppDateTime(value);
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()}`;
}
