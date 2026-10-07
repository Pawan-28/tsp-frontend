import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SUFFIX = "TS Publication CRM";

const ADMIN_TITLES = {
  "/": "Dashboard",
  "/sop": "SOP Management",
  "/sales": "Sales Funnel",
  "/team": "Team Management",
  "/incentives": "Incentives",
  "/settings": "Settings",
  "/admin": "Admin Profile",
  "/leads": "Leads",
  "/pipeline": "Pipeline",
  "/sources": "Source",
  "/forms": "Source",
  "/services": "Services",
  "/reports": "Reports",
  "/login": "Sign in",
  "/change-password": "Change Password",
};

const EMPLOYEE_TITLES = {
  "/employee": "Dashboard",
  "/employee/tasks": "My Tasks",
  "/employee/follow-ups": "Follow-Up",
  "/employee/whatsapp-scripts": "WhatsApp Scripts",
  "/employee/calls": "Call Reporting",
  "/employee/call-detail": "Call Detail",
  "/employee/call-assistant": "Call Assistant",
  "/employee/leads": "Pipeline",
  "/employee/pipeline": "Pipeline",
  "/employee/sales-process": "Sales Process",
  "/employee/assets": "Assets",
  "/employee/meetings": "Meetings",
  "/employee/profile": "Profile",
};

/** Route -> page name (without the app suffix). */
export function pageNameForPath(pathname = "/") {
  const path = (pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname) || "/";
  if (EMPLOYEE_TITLES[path]) return `${EMPLOYEE_TITLES[path]} (Employee)`;
  if (/^\/employee\/sales-process\/[^/]+$/.test(path)) return "SOP Detail (Employee)";
  if (ADMIN_TITLES[path]) return ADMIN_TITLES[path];
  if (/^\/services\/[^/]+\/edit$/.test(path)) return "Edit Service";
  if (/^\/services\/[^/]+$/.test(path)) return "Service Detail";
  if (/^\/(sources|forms)\/[^/]+/.test(path)) return "Source Leads";
  return "";
}

export function pageTitleForPath(pathname) {
  const name = pageNameForPath(pathname);
  return name ? `${name} \u00b7 ${SUFFIX}` : SUFFIX;
}

/** Keeps document.title in sync with the current route. Call once inside a router-aware layout. */
export function useRouteDocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = pageTitleForPath(pathname);
  }, [pathname]);
}
