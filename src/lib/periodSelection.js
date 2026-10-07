/**
 * ONE place that turns the header date filter (URL: ?period=today|yesterday|week|month|custom&from=&to=)
 * into everything a page needs: the period key, the encoded period string every period helper understands
 * ("today" | "week" | "month" | "custom:YYYY-MM-DD:YYYY-MM-DD"), the exact range, labels, and the
 * Mon-Fri working-day count used to scale the daily call target.
 *
 * Shared by the employee Dashboard, Call Reporting and Pipeline so the three pages can never disagree
 * about what "Yesterday" or a Custom range means. Pure functions only (no React) so they run under node.
 */
import { encodeCustomPeriod, localDateKey, parseCustomPeriod } from "./periodFilter.js";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EN_DASH = "–";
const PRESETS = ["today", "yesterday", "week", "month", "custom"];

/** Strict YYYY-MM-DD that is a real calendar date (rejects 2026-02-31). */
export function isValidDateKey(value) {
  if (!DATE_KEY_RE.test(String(value || ""))) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Both dates valid and From <= To (To is inclusive). */
export function isValidCustomRange(from, to) {
  return isValidDateKey(from) && isValidDateKey(to) && String(from) <= String(to);
}

/** Calendar-day arithmetic on YYYY-MM-DD keys (UTC maths, so no DST / machine-timezone surprises). */
export function addDaysToDateKey(key, days) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function yesterdayDateKey(now = new Date()) {
  const today = localDateKey(now);
  return today ? addDaysToDateKey(today, -1) : null;
}

function readParam(params, name) {
  if (!params) return "";
  if (typeof params.get === "function") return params.get(name) || "";
  return params[name] != null ? String(params[name]) : "";
}

/**
 * URL params -> selection. `params` is a URLSearchParams or a plain { period, from, to } object.
 *  - "yesterday" is a one-day custom range (yesterday -> yesterday), like the Pipeline.
 *  - "custom" needs BOTH dates, real calendar dates, From <= To; anything else falls back to `defaultPeriod`.
 *  - unknown / missing period falls back to `defaultPeriod` ("today" for Dashboard + Call Reporting, "month" for Pipeline).
 */
export function resolvePeriodSelection(params, { defaultPeriod = "today", now = new Date() } = {}) {
  const fallback = PRESETS.includes(defaultPeriod) && defaultPeriod !== "custom" ? defaultPeriod : "today";
  const raw = readParam(params, "period").trim().toLowerCase();
  const from = readParam(params, "from").trim();
  const to = readParam(params, "to").trim();

  let key = PRESETS.includes(raw) ? raw : fallback;
  if (key === "custom" && !isValidCustomRange(from, to)) key = fallback;
  if (key === "yesterday" && !yesterdayDateKey(now)) key = fallback;

  let period = key;
  let range = null;
  if (key === "yesterday") {
    const y = yesterdayDateKey(now);
    period = encodeCustomPeriod(y, y);
    range = { startDate: y, endDate: y };
  } else if (key === "custom") {
    period = encodeCustomPeriod(from, to);
    range = { startDate: from, endDate: to };
  }

  const selection = {
    key,
    period,
    range,
    customFrom: key === "custom" ? from : "",
    customTo: key === "custom" ? to : "",
    // yesterday + custom are not covered by the month window the other presets slice client-side
    needsExactFetch: key === "yesterday" || key === "custom",
  };
  selection.label = periodSelectionLabel(selection);
  return selection;
}

function dayParts(key) {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

function formatDay(key, withYear) {
  const { y, m, d } = dayParts(key);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ""}`;
}

/**
 * "6 Oct 2026" (one day) | "1 Oct - 6 Oct 2026" (same year) | "28 Dec 2025 - 3 Jan 2026" (crossing years).
 * withYear=false drops the year when both ends share it (short form used inside sentences).
 */
export function formatDateRangeLabel(from, to, { withYear = true } = {}) {
  if (!isValidDateKey(from) || !isValidDateKey(to)) return "";
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  if (from === to) return formatDay(from, withYear);
  if (!sameYear) return `${formatDay(from, true)} ${EN_DASH} ${formatDay(to, true)}`;
  return `${formatDay(from, false)} ${EN_DASH} ${formatDay(to, withYear)}`;
}

/** Label for any period: a preset key, "custom:FROM:TO", or an already-resolved selection. */
export function periodSelectionLabel(selection) {
  if (selection && typeof selection === "object") {
    if (selection.key === "today") return "Today";
    if (selection.key === "yesterday") return "Yesterday";
    if (selection.key === "week") return "This Week";
    if (selection.key === "month") return "This Month";
    if (selection.range) return formatDateRangeLabel(selection.range.startDate, selection.range.endDate);
    return "Custom";
  }
  const p = String(selection || "").toLowerCase();
  if (p === "today") return "Today";
  if (p === "yesterday") return "Yesterday";
  if (p === "week") return "This Week";
  if (p === "month") return "This Month";
  const custom = parseCustomPeriod(selection);
  if (custom) return formatDateRangeLabel(custom.startDate, custom.endDate);
  return p === "custom" ? "Custom" : String(selection || "");
}

/**
 * Wording for sentences:
 *   when    "today" | "yesterday" | "this week" | "this month" | "on 6 Oct" | "from 1 Oct to 6 Oct"
 *   calls   "Calls today" | "Calls yesterday" | ... | "Calls 1 Oct - 6 Oct"
 *   created "created today" | "created yesterday" | ... | "created 1 Oct - 6 Oct"
 *   label   same as selection.label ("Today" | "Yesterday" | "This Week" | "This Month" | "1 Oct - 6 Oct 2026")
 * The year is left out of the short custom form when the range is in the current year.
 */
export function periodWords(selection, now = new Date()) {
  const label = periodSelectionLabel(selection);
  if (selection.key === "today") return { when: "today", calls: "Calls today", created: "created today", label };
  if (selection.key === "yesterday") return { when: "yesterday", calls: "Calls yesterday", created: "created yesterday", label };
  if (selection.key === "week") return { when: "this week", calls: "Calls this week", created: "created this week", label };
  if (selection.key === "month") return { when: "this month", calls: "Calls this month", created: "created this month", label };
  const { startDate, endDate } = selection.range || {};
  if (!startDate || !endDate) return { when: "in this period", calls: "Calls", created: "created in this period", label };
  const thisYear = String(localDateKey(now) || "").slice(0, 4);
  const withYear = startDate.slice(0, 4) !== thisYear || endDate.slice(0, 4) !== thisYear;
  const short = formatDateRangeLabel(startDate, endDate, { withYear });
  const crossYear = startDate.slice(0, 4) !== endDate.slice(0, 4);
  const when = startDate === endDate
    ? `on ${short}`
    : `from ${formatDay(startDate, crossYear)} to ${formatDay(endDate, crossYear || withYear)}`;
  return { when, calls: `Calls ${short}`, created: `created ${short}`, label };
}

function isWeekdayKey(key) {
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6;
}

/** Mon-Fri days in an inclusive From-To range (0 for an invalid or reversed range, 0 for a Sat/Sun-only range). */
export function countWorkingDaysInRange(from, to) {
  if (!isValidCustomRange(from, to)) return 0;
  let days = 0;
  for (let k = from; k <= to; k = addDaysToDateKey(k, 1)) {
    if (isWeekdayKey(k)) days += 1;
  }
  return days;
}

/** The whole calendar week (Mon-Sun) and month the date key belongs to — the span the daily target is scaled over. */
export function calendarWeekRange(todayKey) {
  const dow = new Date(`${todayKey}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const start = addDaysToDateKey(todayKey, -((dow + 6) % 7));
  return { startDate: start, endDate: addDaysToDateKey(start, 6) };
}

export function calendarMonthRange(todayKey) {
  const { y, m } = dayParts(todayKey);
  const start = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // day 0 of next month = last day of this one
  return { startDate: start, endDate: end };
}

/**
 * Working days the daily call target is multiplied by.
 *   today      1 (a single day is always one target day, as before)
 *   week       Mon-Fri of the current calendar week (5)
 *   month      Mon-Fri of the current calendar month
 *   yesterday  1 if yesterday was a weekday, else 0
 *   custom     Mon-Fri days inside the range (0 when it is Saturday/Sunday only)
 * A result of 0 means "no target for this range" - callers must not divide by it.
 */
export function workingDaysForSelection(selection, now = new Date()) {
  const todayKey = localDateKey(now);
  if (selection.key === "today") return 1;
  if (selection.key === "week" && todayKey) {
    const r = calendarWeekRange(todayKey);
    return countWorkingDaysInRange(r.startDate, r.endDate);
  }
  if (selection.key === "month" && todayKey) {
    const r = calendarMonthRange(todayKey);
    return countWorkingDaysInRange(r.startDate, r.endDate);
  }
  if (selection.range) return countWorkingDaysInRange(selection.range.startDate, selection.range.endDate);
  return 0;
}

/** Query string the backend understands: period=today|week|month or period=custom&startDate=&endDate=. */
export function periodQueryString(period) {
  const custom = parseCustomPeriod(period);
  if (custom) {
    return `period=custom&startDate=${encodeURIComponent(custom.startDate)}&endDate=${encodeURIComponent(custom.endDate)}`;
  }
  const p = String(period || "month").toLowerCase();
  return `period=${p === "today" || p === "week" || p === "month" ? p : "month"}`;
}

/** Preset periods (other than the selected one) used by "No calls today - This week: 12" hints. */
export function otherPresetPeriods(selection) {
  return ["today", "week", "month"].filter((p) => p !== selection.key);
}
