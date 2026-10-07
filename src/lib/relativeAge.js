/**
 * Short "time ago" label with correct weeks/months, e.g. "just now", "5h ago", "3d ago",
 * "6w ago", "4mo ago". Dates from another calendar year (or 12+ months old) show the
 * date with its year ("22 Aug 2025") so a stale item is never mistaken for a recent one.
 */
const DAY_MS = 86400000;

export function formatRelativeAge(value, now = new Date()) {
  if (value == null || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const ref = now instanceof Date ? now : new Date(now);

  const diff = ref.getTime() - date.getTime();
  if (diff < 0) return "just now";

  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(diff / DAY_MS);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;

  const months =
    (ref.getFullYear() - date.getFullYear()) * 12 + (ref.getMonth() - date.getMonth())
    - (ref.getDate() < date.getDate() ? 1 : 0);
  if (date.getFullYear() !== ref.getFullYear() || months >= 12) {
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }
  return `${Math.max(1, months)}mo ago`;
}
