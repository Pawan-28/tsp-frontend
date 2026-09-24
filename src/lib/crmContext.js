/** Shared CRM tenant/user headers for admin + employee panels. */

const EMPLOYEE_STORAGE_KEY = "crm_current_employee_v1";
export const AUTH_TOKEN_KEY = "crm_auth_token_v1";
export const AUTH_USER_KEY = "crm_auth_user_v1";

export function getAuthToken() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeAuthToken(token) {
  if (typeof window === "undefined" || !token) return;
  try {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function storeAuthUser(user) {
  if (typeof window === "undefined" || !user) return;
  try {
    window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(normalizeAuthUser(user)));
  } catch {
    // ignore
  }
}

export function normalizeAuthUser(user) {
  if (!user || typeof user !== "object") return null;
  return {
    ...user,
    mustChangePassword: Boolean(user.mustChangePassword),
    role: user.role || "employee",
    employeeId: user.employeeId != null ? Number(user.employeeId) : null,
    lastLoginAt: user.lastLoginAt || null,
    createdAt: user.createdAt || null,
  };
}

export function getStoredAuthUser() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_USER_KEY);
    return raw ? normalizeAuthUser(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function clearAuthStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_USER_KEY);
  } catch {
    // ignore
  }
}

export function getAuthHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getStoredEmployee() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(EMPLOYEE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed) return null;

    const authUser = getStoredAuthUser();
    if (authUser?.role === "employee" && authUser.employeeId != null) {
      if (Number(parsed.id) !== Number(authUser.employeeId)) {
        return null;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

export function storeEmployee(employee) {
  if (typeof window === "undefined" || !employee) return;
  try {
    window.localStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(employee));
  } catch {
    // ignore
  }
}

export function clearEmployeeStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(EMPLOYEE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getAuthenticatedEmployeeId() {
  const authUser = getStoredAuthUser();
  if (authUser?.role === "employee" && authUser.employeeId != null) {
    return Number(authUser.employeeId);
  }
  return null;
}
export function getCrmHeaders(role = "employee", employeeOverride = null) {
  const authUser = getStoredAuthUser();
  const emp = employeeOverride || getStoredEmployee();
  const headers = { ...getAuthHeaders() };

  if (authUser?.role === "admin" || role === "admin") {
    return {
      ...headers,
      "x-tenant-id": "default",
      "x-user-id": String(authUser?.id ?? "admin"),
      "x-user-name": authUser?.name || "Admin",
      "x-user-role": "admin",
    };
  }

  const employeeId = authUser?.employeeId != null
    ? Number(authUser.employeeId)
    : (emp?.id != null ? Number(emp.id) : "");
  return {
    ...headers,
    "x-tenant-id": "default",
    "x-user-id": String(employeeId),
    "x-user-name": authUser?.name || emp?.name || "Employee",
    "x-user-role": "employee",
  };
}

export function getAdminCrmHeaders() {
  return getCrmHeaders("admin");
}

export function mapApiEmployee(row) {
  if (!row) return null;
  const name = row.name || "Employee";
  const initials = row.initials
    || name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return {
    id: row.id,
    name,
    role: row.role || "Sales Executive",
    initials,
    email: row.email || "",
    phone: row.phone || "",
    department: row.department || "Sales",
    avatarColor: "#2563eb",
    avatarUrl: row.avatarUrl || row.avatar_url || "",
    status: String(row.status || "active").trim().toLowerCase(),
  };
}


export function isMockEmployeeId(id, mockId = 101) {
  return id == null || Number(id) === mockId;
}

function normalizePersonKey(value) {
  return String(value || "").trim().toLowerCase();
}

/** Resolve a DB employee row from list using id, email, or fuzzy name match. */
export function matchEmployeeFromList(employees, profile = {}, mockId = 101) {
  if (!Array.isArray(employees) || !employees.length) return null;

  const id = profile.id;
  if (!isMockEmployeeId(id, mockId)) {
    const byId = employees.find((row) => Number(row.id) === Number(id));
    if (byId) return byId;
  }

  const email = normalizePersonKey(profile.email);
  if (email) {
    const byEmail = employees.find((row) => normalizePersonKey(row.email) === email);
    if (byEmail) return byEmail;
  }

  const name = normalizePersonKey(profile.name);
  if (name) {
    const exact = employees.find((row) => normalizePersonKey(row.name) === name);
    if (exact) return exact;
  }

  return null;
}
