/** KRA period helpers — day, week, month views with prorated targets. */

export const KRA_PERIODS = [
  { id: "day", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
];

export function getDaysInMonth(refDate = new Date()) {
  return new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).getDate();
}

/** Prorate monthly employee targets for day/week views. */
export function prorateKraTarget(monthlyTarget, period, refDate = new Date()) {
  const target = Number(monthlyTarget) || 0;
  if (!target || period === "month") return target;

  const daysInMonth = getDaysInMonth(refDate);
  if (period === "day") {
    return Math.max(1, Math.round(target / daysInMonth));
  }
  if (period === "week") {
    return Math.max(1, Math.round((target / daysInMonth) * 7));
  }
  return target;
}

function startOfWeekLocal(refDate = new Date()) {
  const d = new Date(refDate);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d;
}

function endOfDayLocal(refDate = new Date()) {
  const d = new Date(refDate);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function getKraPeriodBounds(period, { month, refDate = new Date() } = {}) {
  const p = period || "month";
  const end = endOfDayLocal(refDate);

  if (p === "day") {
    const start = new Date(refDate);
    start.setHours(0, 0, 0, 0);
    return { start, end, label: "Today" };
  }

  if (p === "week") {
    return { start: startOfWeekLocal(refDate), end, label: "This week" };
  }

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(y, m, 0, 23, 59, 59, 999);
    return { start, end: monthEnd, label: month };
  }

  const start = new Date(refDate.getFullYear(), refDate.getMonth(), 1, 0, 0, 0, 0);
  return { start, end, label: "This month" };
}

export function isTimestampInKraPeriod(ts, period, options = {}) {
  if (!ts) return false;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return false;
  const { start, end } = getKraPeriodBounds(period, options);
  return d >= start && d <= end;
}

function isPipelineQualifiedLead(lead) {
  const stage = String(lead.pipeline_stage || lead.pipelineStage || lead.stage || "").toLowerCase();
  const status = String(lead.status || "").toLowerCase();
  const normStage = stage.replace(/_/g, " ");
  const normStatus = status.replace(/_/g, " ");
  const booked = stage.includes("booked") || status.includes("booked");
  const showed =
    normStage.includes("showed up")
    || normStage.includes("show up")
    || normStatus.includes("showed up")
    || normStatus.includes("show up");
  return booked || showed;
}

function isBookedLead(lead) {
  const stage = String(lead.pipeline_stage || lead.pipelineStage || lead.stage || "").toLowerCase();
  const status = String(lead.status || "").toLowerCase();
  return stage.includes("booked") || status.includes("booked");
}

export function computeLeadKraForPeriod(leads, period, options = {}) {
  const list = Array.isArray(leads) ? leads : [];
  const inPeriod = list.filter((lead) =>
    isTimestampInKraPeriod(lead.updated_at || lead.updatedAt || lead.created_at, period, options),
  );

  let qualified = 0;
  let meetings = 0;
  inPeriod.forEach((lead) => {
    if (isPipelineQualifiedLead(lead)) qualified += 1;
    if (isBookedLead(lead)) meetings += 1;
  });

  return { qualified, meetings, activeInPeriod: inPeriod.length };
}

export function kraPeriodToCallyzerQuery(period, month) {
  if (period === "day") return "period=today";
  if (period === "week") return "period=week";
  if (month) return `month=${month}`;
  return "period=month";
}

export function kraPeriodLabel(period) {
  return KRA_PERIODS.find((p) => p.id === period)?.label || "This month";
}
