/**
 * ONE date format for activity / timeline rows across the app.
 *   < 1 min        "Just now"
 *   < 1 hour       "5 mins ago"
 *   < 24 hours     "3 hours ago"
 *   < 7 days       "2 days ago"
 *   otherwise      "6 Aug 2026"
 * Missing / invalid timestamps render "—" (never a made-up time).
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toDate(input) {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Absolute date, e.g. "6 Aug 2026". */
export function formatAbsoluteDate(input) {
  const d = toDate(input);
  if (!d) return "—";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Absolute date + time, e.g. "6 Aug 2026, 4:05 pm" (for tooltips). */
export function formatAbsoluteDateTime(input) {
  const d = toDate(input);
  if (!d) return "—";
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${formatAbsoluteDate(d)}, ${h}:${m} ${ap}`;
}

export function formatActivityDate(input, now = new Date()) {
  const d = toDate(input);
  if (!d) return "—";

  const diffSecs = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diffSecs < 60) return "Just now"; // also covers small clock skew (future timestamps)
  const mins = Math.floor(diffSecs / 60);
  if (mins < 60) return `${mins} ${mins === 1 ? "min" : "mins"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return formatAbsoluteDate(d);
}
