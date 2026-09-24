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

export function periodLabel(preset = "month") {
  const p = String(preset || "month").toLowerCase();
  if (p === "today") return "Today";
  if (p === "week") return "This Week";
  if (p === "month") return "This Month";
  if (p === "custom") return "Custom";
  return preset;
}
