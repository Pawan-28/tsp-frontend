/** CRM + Callyzer operate in IST — display/filter consistently on any device or server. */
export const APP_TZ = "Asia/Kolkata";
export const APP_TZ_OFFSET = "+05:30";

/** YYYY-MM-DD in APP_TZ for period filters and "Today" labels. */
export function appDateKey(date, timeZone = APP_TZ) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return y && m && day ? `${y}-${m}-${day}` : null;
}

/** Parse API naive datetime (IST wall clock, no Z) into a Date instant. */
export function parseAppDateTime(value) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso) && !/[Zz]|[+-]\d{2}:\d{2}$/.test(iso)) {
    const d = new Date(`${iso}${APP_TZ_OFFSET}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
