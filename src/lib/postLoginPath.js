/**
 * Where to go after a successful login.
 * RequireAuth sends a logged-out visitor to /login?redirect=<page they wanted>; Login used to ignore it and always opened the
 * default page. The redirect is only honoured when it is a path INSIDE this app (never another site) and fits the user's role.
 */
export function safeRedirectPath(search, role) {
  let raw = "";
  try {
    raw = new URLSearchParams(search || "").get("redirect") || "";
  } catch {
    return null;
  }
  // only an in-app absolute path: "/x", never "//host", "/\\host", "http://..." or a path to the login pages themselves
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || /[\r\n]/.test(raw)) return null;
  const pathOnly = raw.split(/[?#]/)[0];
  if (/^\/(login|change-password)(\/|$)/.test(pathOnly)) return null;
  const inEmployeeArea = /^\/employee(\/|$)/.test(pathOnly);
  if (role === "employee" && !inEmployeeArea) return null;
  if (role !== "employee" && inEmployeeArea) return null;
  return raw;
}

export function resolvePostLoginPath(authUser, search = "") {
  if (Boolean(authUser?.mustChangePassword)) return "/change-password";
  const wanted = safeRedirectPath(search, authUser?.role);
  if (wanted) return wanted;
  if (authUser?.role === "employee") return "/employee/pipeline";
  return "/";
}
