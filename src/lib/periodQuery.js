import { formatDateRangeLabel, periodSelectionLabel } from "./periodSelection.js";

/** Build URLSearchParams for Today / Week / Month / Custom period filters. */
export function buildPeriodQueryParams({ preset = "month", bounds = {}, extra = {} } = {}) {
  const q = new URLSearchParams();
  const period = String(preset || "month").toLowerCase();
  q.set("period", period);
  if (period === "custom" && bounds?.start && bounds?.end) {
    q.set("startDate", bounds.start);
    q.set("endDate", bounds.end);
  }
  Object.entries(extra).forEach(([key, value]) => {
    if (value != null && value !== "") q.set(key, String(value));
  });
  return q;
}

/**
 * Same wording everywhere: Today / Yesterday / This Week / This Month / "1 Oct – 6 Oct 2026".
 * `preset` may be a preset key or an encoded "custom:FROM:TO" period; for a bare "custom" pass
 * `bounds` ({ start, end } or { startDate, endDate }) to get the date range instead of "Custom".
 */
export function periodLabel(preset = "month", bounds = null) {
  const p = String(preset || "month").toLowerCase();
  if (p === "custom" && bounds) {
    const from = bounds.start ?? bounds.startDate;
    const to = bounds.end ?? bounds.endDate;
    const range = formatDateRangeLabel(from, to);
    if (range) return range;
  }
  const label = periodSelectionLabel(preset || "month");
  return label || preset;
}
