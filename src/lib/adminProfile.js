/** Map authenticated admin user + API data into admin UI profile shape. */

export function formatAdminDisplayName(user) {
  if (!user) return "Admin";
  if (user.name && user.name !== "Admin") return user.name;
  const login = String(user.loginId || "").trim();
  if (login) {
    return login
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  const email = String(user.email || "").split("@")[0];
  if (email) {
    return email
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return "Admin";
}

export function initialsFromName(name) {
  return String(name || "A")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function adminProfileFromAuth(user, existing = {}) {
  if (!user || user.role !== "admin") return existing;
  const fullName = formatAdminDisplayName(user);
  return {
    ...existing,
    id: String(user.id),
    fullName,
    email: user.email || existing.email,
    role: "Super Admin",
    initials: initialsFromName(fullName),
    lastLogin: user.lastLoginAt || existing.lastLogin,
    joinedAt: user.createdAt || existing.joinedAt,
    loginId: user.loginId || existing.loginId,
  };
}

export function currentBrowserSession(lastLoginAt) {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  let device = "This browser";
  if (/iPhone|iPad/i.test(ua)) device = "iPhone · Safari";
  else if (/Android/i.test(ua)) device = "Android · Chrome";
  else if (/Windows/i.test(ua)) device = "Windows · Chrome";
  else if (/Mac/i.test(ua)) device = "Mac · Chrome";
  else if (/Firefox/i.test(ua)) device = "Firefox";

  return {
    id: 1,
    device,
    location: "This device",
    current: true,
    lastActive: lastLoginAt ? formatDateTime(lastLoginAt) : "Active now",
  };
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return formatDateTime(iso);
}

export function mapActivityLogRow(row) {
  const action = row.action || row.summary || "Activity";
  const who = row.user_name || row.actorName || row.actor_name || "System";
  return {
    id: row.id,
    action: `${action}${who && who !== "System" ? ` — ${who}` : ""}`,
    time: formatRelativeTime(row.created_at || row.createdAt),
    createdAt: row.created_at || row.createdAt,
  };
}

export function mapAuditLogRow(row) {
  const action = row.action || row.resource || "Audit event";
  const actor = row.actorId || row.actor_id || "";
  return {
    id: row.id,
    action: actor ? `${action} — ${actor}` : action,
    time: formatRelativeTime(row.created_at || row.createdAt),
    createdAt: row.created_at || row.createdAt,
  };
}
