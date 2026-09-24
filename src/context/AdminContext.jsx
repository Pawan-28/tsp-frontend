import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { getStoredAuthUser, getAdminCrmHeaders } from "../lib/crmContext.js";
import { adminProfileFromAuth } from "../lib/adminProfile.js";
import { apiGet } from "../lib/api.js";
import { CANONICAL_SERVICES, getDynamicServicesList, cleanServiceName } from "../lib/servicesRegistry.js";

const STORAGE_KEY = "ts_admin_profile";

export const DEFAULT_ADMIN = {
  id: "admin-1",
  initials: "AD",
  fullName: "Admin",
  role: "Super Admin",
  department: "Operations",
  email: "",
  phone: "",
  city: "",
  avatarUrl: "",
  timezone: "Asia/Kolkata (IST)",
  loginId: "",
  joinedAt: null,
  lastLogin: null,
  permissions: [
    "Full dashboard access",
    "Team & employee management",
    "Incentive rule configuration",
    "SOP publish & archive",
    "Reports export",
    "Workspace settings",
  ],
  notifications: {
    emailNotifications: true,
    leadAssigned: true,
    meetingReminder: true,
    targetAchieved: false,
    weeklyDigest: true,
  },
  stats: {
    teamMembers: 0,
    rulesPublished: 0,
    actionsThisWeek: 0,
  },
};

function loadProfile() {
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_ADMIN };
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = raw ? { ...DEFAULT_ADMIN, ...JSON.parse(raw) } : { ...DEFAULT_ADMIN };
    const authUser = getStoredAuthUser();
    return authUser?.role === "admin" ? adminProfileFromAuth(authUser, stored) : stored;
  } catch {
    const authUser = getStoredAuthUser();
    const base = { ...DEFAULT_ADMIN };
    return authUser?.role === "admin" ? adminProfileFromAuth(authUser, base) : base;
  }
}

const AdminContext = createContext(null);

export function AdminProvider({ children }) {
  const { user } = useAuth();
  const [admin, setAdmin] = useState(loadProfile);
  const [selectedService, setSelectedService] = useState("All Services");
  const [selectedEmployee, setSelectedEmployee] = useState("All Employees");
  const [catalogServices, setCatalogServices] = useState([]);
  const [extraServices, setExtraServices] = useState([]);
  const [employeesList, setEmployeesList] = useState(["All Employees", "Ritik Verma", "Sarita", "Sushmit Verma", "Piyush Dhingra"]);

  useEffect(() => {
    if (user?.role === "admin") {
      setAdmin((prev) => adminProfileFromAuth(user, prev));
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(admin));
  }, [admin]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [svcRes, leadsRes, empRes] = await Promise.allSettled([
          apiGet("/api/services", { headers: getAdminCrmHeaders(), skipCache: true, cacheTtl: 0 }),
          apiGet("/api/v1/leads?limit=500&page=1", { headers: getAdminCrmHeaders() }),
          apiGet("/api/v1/employees", { headers: getAdminCrmHeaders() }),
        ]);
        
        const catalog = svcRes.status === "fulfilled" && Array.isArray(svcRes.value?.services)
          ? svcRes.value.services
          : [];
        const leads = leadsRes.status === "fulfilled"
          ? (Array.isArray(leadsRes.value) ? leadsRes.value : (leadsRes.value?.data || leadsRes.value?.leads || []))
          : [];
        
        if (active) {
          setCatalogServices(catalog);
          const computed = getDynamicServicesList(catalog, leads);
          setExtraServices(computed);

          if (empRes.status === "fulfilled") {
            const rawEmps = Array.isArray(empRes.value) ? empRes.value : (empRes.value?.data || empRes.value?.employees || []);
            const activeNames = rawEmps
              .filter((e) => e && e.name && String(e.status || "active").toLowerCase() === "active")
              .map((e) => e.name);
            if (activeNames.length > 0) {
              const uniqueNames = Array.from(new Set(activeNames)).sort();
              setEmployeesList(["All Employees", ...uniqueNames]);
            }
          }
        }
      } catch (err) {
        console.error("Error loading services/employees in AdminContext:", err);
      }
    })();
    return () => { active = false; };
  }, []);

  const servicesList = useMemo(() => {
    return getDynamicServicesList(catalogServices, extraServices);
  }, [catalogServices, extraServices]);

  const registerNewService = (rawName) => {
    const cleaned = cleanServiceName(rawName);
    if (!cleaned) return;
    setExtraServices((prev) => Array.from(new Set([...prev, cleaned])));
  };

  const updateAdmin = (patch) => setAdmin((prev) => ({ ...prev, ...patch }));

  const updateNotifications = (patch) =>
    setAdmin((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, ...patch },
    }));

  const value = useMemo(
    () => ({
      admin,
      updateAdmin,
      updateNotifications,
      selectedService,
      setSelectedService,
      servicesList,
      selectedEmployee,
      setSelectedEmployee,
      employeesList,
      registerNewService,
    }),
    [admin, selectedService, servicesList, selectedEmployee, employeesList],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

const DEFAULT_ADMIN_CONTEXT = {
  admin: DEFAULT_ADMIN,
  updateAdmin: () => {},
  updateNotifications: () => {},
  selectedService: "All Services",
  setSelectedService: () => {},
  servicesList: ["All Services"],
  selectedEmployee: "All Employees",
  setSelectedEmployee: () => {},
  employeesList: ["All Employees", "Ritik Verma", "Sarita", "Sushmit Verma", "Piyush Dhingra"],
  registerNewService: () => {},
};

export function useAdmin() {
  const ctx = useContext(AdminContext);
  return ctx || DEFAULT_ADMIN_CONTEXT;
}
