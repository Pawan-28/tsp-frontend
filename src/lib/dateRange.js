export const RANGE_TABS = [
  { id: "today", label: "Today", shortLabel: "Today" },
  { id: "yesterday", label: "Yesterday", shortLabel: "Yest." },
  { id: "month", label: "Month", shortLabel: "Month" },
  { id: "custom", label: "Custom", shortLabel: "Custom" },
];

/** Shared compact pill classes for date/period filters */
export const PERIOD_PILL_BTN =
  "px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold transition-all border whitespace-nowrap shrink-0 shadow-xs";
export const PERIOD_PILL_ACTIVE =
  "border-rose-600 bg-gradient-to-r from-red-600 via-rose-500 to-pink-500 text-white shadow-sm font-bold";
export const PERIOD_PILL_INACTIVE =
  "border-rose-200/90 bg-white text-slate-700 hover:border-rose-400 hover:text-rose-600 hover:bg-rose-50/50 font-medium";

const LABEL_BY_ID = Object.fromEntries(RANGE_TABS.map((t) => [t.id, t.label]));

export function presetToApiLabel(preset) {
  return LABEL_BY_ID[preset] || "Month";
}

export function defaultPresetForRoute(pathname) {
  if (pathname === "/") return "today";
  if (pathname === "/team") return "month";
  return "month";
}

export function yesterdayKey(now = new Date()) {
  return formatLocalYMD(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
}

export function emptyRangeState(pathname) {
  return { preset: defaultPresetForRoute(pathname), fromDate: "", toDate: "" };
}

function formatLocalYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Resolve preset + optional custom dates to local ISO date strings (YYYY-MM-DD). */
export function getDateBounds(preset, fromDate = "", toDate = "") {
  const now = new Date();
  if (preset === "custom" && fromDate && toDate) {
    return { start: fromDate, end: toDate };
  }

  const todayStr = formatLocalYMD(now);

  if (preset === "today" || preset === "day") {
    return { start: todayStr, end: todayStr };
  }

  // Monday of the current week
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
  const weekStartStr = formatLocalYMD(weekStart);

  if (preset === "yesterday") {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yStr = formatLocalYMD(y);
    return { start: yStr, end: yStr };
  }

  if (preset === "week" || preset === "this_week") {
    return { start: weekStartStr, end: todayStr };
  }

  // Hierarchical month: begins at the earlier of the 1st of month or Monday of current week
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const hierStart = weekStart.getTime() < monthStart.getTime() ? weekStart : monthStart;
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    start: formatLocalYMD(hierStart),
    end: formatLocalYMD(monthEnd),
  };
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isDateKey(v) {
  if (typeof v !== "string" || !DATE_KEY_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** A custom range is usable only when BOTH dates are valid YYYY-MM-DD and From <= To. */
export function isValidCustomRange(from, to) {
  return isDateKey(from) && isDateKey(to) && from <= to;
}

/** Why a draft custom range cannot be applied (null when it can). */
export function customRangeError(from, to) {
  if (!from && !to) return "Select both a From and a To date.";
  if (!from) return "Select a From date.";
  if (!to) return "Select a To date.";
  if (!isDateKey(from) || !isDateKey(to)) return "Enter valid dates.";
  if (from > to) return "From date must be on or before the To date.";
  return null;
}

/** "1 Oct – 6 Oct 2026" (or "1 Oct 2026" for a single day). `withYear=false` drops the year (compact pills). */
export function formatRangeLabel(from, to, withYear = true) {
  if (!isDateKey(from) || !isDateKey(to)) return "";
  const fmt = (key, y) => {
    const [yy, mm, dd] = key.split("-").map(Number);
    return `${dd} ${MONTH_SHORT[mm - 1]}${y ? ` ${yy}` : ""}`;
  };
  if (from === to) return fmt(from, withYear);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  if (!withYear) return `${fmt(from, false)} – ${fmt(to, false)}`;
  return `${fmt(from, !sameYear)} – ${fmt(to, true)}`;
}
