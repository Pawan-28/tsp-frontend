import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "./AuthContext.jsx";
import { getDynamicServicesList } from "../lib/servicesRegistry.js";
import {
  CURRENT_EMPLOYEE,
  MOCK_EMPLOYEE_ID,
  normalizeTasksMap,
  tasksMapFromApi,
  priorityToApi,
  empLeadFromDrawerPayload,
  mapAdminSopsForEmployee,
  getFollowUpUrgency,
  formatFollowUpSchedule,
  buildFollowUpTaskName,
  followUpPriority,
  formatFollowUpCompletedAt,
  callToApiPayload,
  callFromApi,
  followUpToApiPayload,
  followUpFromApi,
  meetingToApiPayload,
  meetingFromApi,
  partitionMeetings,
  extractApiSopList,
  readCachedEmployeeSops,
  persistEmployeeSops,
  getEmpStageMeta,
  mapEmpLeadKanbanStage,
  formatEmpPipelineValue,
  mergeCallsById,
  resolvePipelineStageLabel,
  pipelineStageCountsKey,
  isFollowUpCompleted,
} from "../data/employeeMock.js";
import { apiGet, apiPost, apiPut, apiPatch, invalidateCache, shouldPersistToApi } from "../lib/api.js";
import {
  applyFollowUpOutcomes,
  clearFollowUpOutcome,
  persistFollowUpOutcome,
} from "../lib/followUpOutcomes.js";
import {
  getCrmHeaders,
  mapApiEmployee,
  storeEmployee,
  getStoredEmployee,
  getStoredAuthUser,
  getAuthenticatedEmployeeId,
  clearEmployeeStorage,
  isMockEmployeeId,
  matchEmployeeFromList,
} from "../lib/crmContext.js";
import {
  apiLeadToEmployee,
  temperatureToApi,
  workflowStatusFromTemperature,
  employeeStagePatch,
  unwrapApiData,
  unwrapApiList,
  mergeFetchedList,
  replaceFetchedList,
  unwrapWorkspacePayload,
  fetchAllEmployeeLeads,
  filterAssignableEmployees,
} from "../lib/leadSync.js";
import { invalidateCallyzerStatsCache, CALLYZER_POLL_INTERVAL_MS, dispatchCallyzerRefresh } from "../lib/useCallyzerStats.js";
import { onLeadChanged, onDashboardRefresh, markLocalLeadChange } from "../lib/realtime.js";
import { invalidatePipelineBoardCache } from "../lib/usePipelineSync.js";

const EmployeeContext = createContext(null);

const EMPLOYEE_CACHE_TTL = 60_000;
const CALLYZER_SYNC_INTERVAL_MS = CALLYZER_POLL_INTERVAL_MS;
const EMPLOYEE_LIST_CACHE_TTL = 5 * 60 * 1000;
const WORKSPACE_SNAPSHOT_PREFIX = "emp_workspace_v2:";
const WORKSPACE_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const AVATAR_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#7c3aed", "#dc2626", "#0ea5e9", "#64748b"];

function initialsFromName(name) {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function readJsonStorage(key, fallback) {
  if (typeof window === "undefined") return fallback();
  try {
    const saved = window.localStorage.getItem(key);
    if (!saved) return fallback();
    return JSON.parse(saved);
  } catch {
    return fallback();
  }
}

function readWorkspaceSnapshot(employeeId) {
  if (!employeeId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${WORKSPACE_SNAPSHOT_PREFIX}${employeeId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() - (parsed.ts || 0) > WORKSPACE_SNAPSHOT_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistWorkspaceSnapshot(employeeId, { calls: callList, leads: leadList }) {
  if (!employeeId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${WORKSPACE_SNAPSHOT_PREFIX}${employeeId}`,
      JSON.stringify({
        calls: Array.isArray(callList) ? callList.slice(0, 200) : [],
        leads: Array.isArray(leadList) ? leadList.slice(0, 5000) : [],
        ts: Date.now(),
      }),
    );
  } catch {
    /* storage full — ignore */
  }
}

function profileFromAuthUser(authUser) {
  if (!authUser || authUser.role !== "employee" || authUser.employeeId == null) return null;
  return {
    ...CURRENT_EMPLOYEE,
    id: Number(authUser.employeeId),
    name: authUser.name || CURRENT_EMPLOYEE.name,
    email: authUser.email || CURRENT_EMPLOYEE.email,
    role: authUser.employeeRole || CURRENT_EMPLOYEE.role,
    department: authUser.department || CURRENT_EMPLOYEE.department,
  };
}

function readBootstrappedEmployee() {
  const authProfile = profileFromAuthUser(getStoredAuthUser());
  if (authProfile) return authProfile;

  const stored = getStoredEmployee();
  if (stored?.id && !isMockEmployeeId(stored.id, MOCK_EMPLOYEE_ID)) {
    return { ...CURRENT_EMPLOYEE, ...stored };
  }
  return CURRENT_EMPLOYEE;
}

function countTasks(map) {
  if (!map || typeof map !== "object") return 0;
  return Object.values(map).reduce(
    (sum, items) => sum + (Array.isArray(items) ? items.length : 0),
    0,
  );
}

function listUpdaterForSession() {
  return getAuthenticatedEmployeeId() ? replaceFetchedList : mergeFetchedList;
}

function mapFollowUpsFromApi(items, leadList = []) {
  const mapped = items.map((f) => followUpFromApi(f, leadList));
  return applyFollowUpOutcomes(mapped, { isCompleted: isFollowUpCompleted });
}

function applyLeadsIfChanged(prev, incoming) {
  const next = listUpdaterForSession()(prev, incoming);
  if (
    prev === next
    || (Array.isArray(prev) && Array.isArray(next)
      && prev.length === next.length
      && pipelineStageCountsKey(prev) === pipelineStageCountsKey(next))
  ) {
    return prev;
  }
  return next;
}

function filterLeadsForEmployee(leadList, employeeId, { trustServer = false } = {}) {
  if (!Array.isArray(leadList)) return [];
  if (trustServer || !employeeId) return leadList;
  return leadList.filter((l) => {
    const assigneeId = l.assigneeId ?? l.assigned_to ?? l.assignedTo;
    const resolved = typeof assigneeId === "object" ? assigneeId?.id : assigneeId;
    if (resolved == null) return true;
    return Number(resolved) === Number(employeeId);
  });
}

function employeeDashboardPath(fallbackId) {
  if (getAuthenticatedEmployeeId()) return "/api/v1/employee/me/dashboard";
  if (fallbackId != null && !isMockEmployeeId(fallbackId, MOCK_EMPLOYEE_ID)) {
    return `/api/v1/employee/${fallbackId}/dashboard`;
  }
  return null;
}

function employeeResourcePath(fallbackId, resource) {
  const authId = getAuthenticatedEmployeeId();
  const id = authId || fallbackId;
  if (id == null || isMockEmployeeId(id, MOCK_EMPLOYEE_ID)) return null;
  return resource ? `/api/v1/employee/${id}/${resource}` : `/api/v1/employee/${id}`;
}

export function EmployeeProvider({ children }) {
  const { user: authUser, loading: authLoading } = useAuth();
  const [employee, setEmployee] = useState(() => {
    const fromAuth = profileFromAuthUser(getStoredAuthUser());
    if (fromAuth) return fromAuth;
    return { ...CURRENT_EMPLOYEE, id: null, name: "Employee" };
  });
  const initialBoot = readBootstrappedEmployee();
  const initialSnapshot = initialBoot?.id ? readWorkspaceSnapshot(initialBoot.id) : null;
  const [linkError, setLinkError] = useState(null);
  const [workspaceError, setWorkspaceError] = useState(null);
  const [leads, setLeads] = useState(() => initialSnapshot?.leads ?? []);
  const leadsRef = useRef(leads);
  const syncCallyzerInFlightRef = useRef(false);
  const syncCallyzerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [usingApi, setUsingApi] = useState(() => typeof window !== "undefined");

  const [tasks, setTasksState] = useState({});
  const [followUps, setFollowUpsState] = useState([]);
  const [calls, setCalls] = useState(() => initialSnapshot?.calls ?? []);
  const [meetingsUpcoming, setMeetingsUpcoming] = useState([]);
  const [meetingsHistory, setMeetingsHistory] = useState([]);
  const [activities, setActivities] = useState({});
  const [sops, setSopsState] = useState([]);
  const [selectedService, setSelectedService] = useState("All Services");
  const [teamEmployees, setTeamEmployees] = useState([]);

  useEffect(() => {
    leadsRef.current = leads;
  }, [leads]);

  const resolveApiEmployeeId = useCallback(async (preferredId, preferredProfile) => {
    const authEmployeeId = getAuthenticatedEmployeeId();
    if (authEmployeeId) return authEmployeeId;

    const profile = typeof preferredProfile === "object" && preferredProfile
      ? preferredProfile
      : { id: preferredId, name: preferredProfile };
    if (!isMockEmployeeId(profile.id, MOCK_EMPLOYEE_ID)) return profile.id;

    if (teamEmployees.length) {
      const cached = matchEmployeeFromList(teamEmployees, profile, MOCK_EMPLOYEE_ID);
      if (cached?.id) return cached.id;
    }

    const res = await apiGet("/api/v1/team/employees", {
      headers: getCrmHeaders("employee", profile),
      cacheTtl: EMPLOYEE_LIST_CACHE_TTL,
      skipCache: true,
    }).catch(() => apiGet("/api/v1/employees", {
      headers: getCrmHeaders("employee", profile),
      cacheTtl: EMPLOYEE_LIST_CACHE_TTL,
      skipCache: true,
    }));
    if (res?.success === false) {
      throw new Error(res.message || "Could not load employees");
    }
    const employees = unwrapApiData(res) || res?.employees || res?.data || [];
    if (!Array.isArray(employees) || !employees.length) {
      throw new Error("No employees in database — add team members first");
    }

    const matched = matchEmployeeFromList(employees, profile, MOCK_EMPLOYEE_ID);
    if (!matched?.id) {
      throw new Error("Could not resolve employee id for this task");
    }

    const mapped = { ...employee, ...mapApiEmployee(matched) };
    setEmployee(mapped);
    storeEmployee(mapped);
    setTeamEmployees(filterAssignableEmployees(employees.map((e) => mapApiEmployee(e))));
    setUsingApi(true);
    return matched.id;
  }, [employee, teamEmployees]);

  const loadEmployeeWorkspace = useCallback(async (empId, empProfile, options = {}) => {
    const { forceRefresh = false, syncCallyzer = false } = options;
    const authEmployeeId = getAuthenticatedEmployeeId();
    try {
      let resolvedId = authEmployeeId || empId;
      if (!authEmployeeId && isMockEmployeeId(empId, MOCK_EMPLOYEE_ID)) {
        resolvedId = await resolveApiEmployeeId(empId, empProfile);
      }
      const dashboardPath = employeeDashboardPath(resolvedId);
      if (!dashboardPath) {
        throw new Error("Could not resolve employee workspace");
      }
      const syncParam = syncCallyzer ? "1" : "0";
      const res = await apiGet(`${dashboardPath}?syncCallyzer=${syncParam}`, {
        headers: getCrmHeaders("employee", empProfile),
        cacheTtl: forceRefresh ? 0 : EMPLOYEE_CACHE_TTL,
        skipCache: forceRefresh,
      });
      if (res?.success === false) {
        throw new Error(res.message || "Dashboard API failed");
      }
      const data = unwrapWorkspacePayload(res);
      if (!data) {
        throw new Error("Dashboard API returned an invalid payload");
      }
      const scopeId = authEmployeeId || resolvedId;
      const workspaceLeads = Array.isArray(data.leads)
        ? filterLeadsForEmployee(
          data.leads.map((l) => apiLeadToEmployee(l, AVATAR_COLORS)),
          scopeId,
          { trustServer: Boolean(authEmployeeId) },
        )
        : null;

      const applyList = listUpdaterForSession();

      if (workspaceLeads) {
        setLeads((prev) => applyLeadsIfChanged(prev, workspaceLeads));
      }

      if (Array.isArray(data.followups)) {
        setFollowUpsState(() => {
          const next = mapFollowUpsFromApi(data.followups, workspaceLeads || []);
          return applyList([], next);
        });
      }

      let nextCalls = null;
      if (Array.isArray(data.calls)) {
        nextCalls = data.calls.map((c) => callFromApi(c, workspaceLeads || []));
        setCalls(() => applyList([], nextCalls));
      }

      if (scopeId && (workspaceLeads || nextCalls)) {
        const prior = readWorkspaceSnapshot(scopeId);
        persistWorkspaceSnapshot(scopeId, {
          calls: nextCalls ?? prior?.calls ?? [],
          leads: workspaceLeads ?? prior?.leads ?? [],
        });
      }

      if (Array.isArray(data.meetings)) {
        const split = partitionMeetings(data.meetings, workspaceLeads || []);
        setMeetingsUpcoming(() => applyList([], split.upcoming));
        setMeetingsHistory(() => applyList([], split.history));
      }

      if (Array.isArray(data.tasks)) {
        setTasksState(() => tasksMapFromApi(data.tasks, empProfile));
      }
      if (Array.isArray(data.sops) && data.sops.length) {
        const mapped = mapAdminSopsForEmployee(data.sops);
        if (mapped.length) {
          setSopsState(mapped);
          persistEmployeeSops(data.sops);
        }
      }
      if (data.employee) {
        const mapped = { ...empProfile, ...mapApiEmployee(data.employee) };
        if (authEmployeeId) mapped.id = authEmployeeId;
        setEmployee(mapped);
        storeEmployee(mapped);
      } else if (authEmployeeId) {
        const mapped = { ...empProfile, id: authEmployeeId };
        setEmployee(mapped);
        storeEmployee(mapped);
      }
      setUsingApi(true);
      setWorkspaceError(null);
      return "ok";
    } catch (err) {
      setWorkspaceError(err.message || "Could not load your workspace data");
      if (err.status === 429) return "rate_limited";
      return "error";
    }
  }, [resolveApiEmployeeId]);

  const refreshLeads = useCallback(async (empId = employee.id, empProfile = employee) => {
    try {
      const authEmployeeId = getAuthenticatedEmployeeId();
      let resolvedId = authEmployeeId || empId;
      if (!authEmployeeId && isMockEmployeeId(empId, MOCK_EMPLOYEE_ID)) {
        resolvedId = await resolveApiEmployeeId(empId, empProfile);
      }
      if (!resolvedId || isMockEmployeeId(resolvedId, MOCK_EMPLOYEE_ID)) return false;
      const items = await fetchAllEmployeeLeads(apiGet, resolvedId, {
        headers: getCrmHeaders("employee", empProfile),
      });
      const mapped = filterLeadsForEmployee(
        items.map((l) => apiLeadToEmployee(l, AVATAR_COLORS)),
        authEmployeeId || resolvedId,
        { trustServer: Boolean(authEmployeeId) },
      );
      setLeads((prev) => applyLeadsIfChanged(prev, mapped));
      setUsingApi(true);
      setWorkspaceError(null);
      return true;
    } catch (err) {
      setWorkspaceError(err.message || "Could not refresh leads");
      return false;
    }
  }, [employee, resolveApiEmployeeId]);

  const refreshTasks = useCallback(async (empId = employee.id, empProfile = employee) => {
    try {
      let resolvedId = empId;
      if (isMockEmployeeId(empId, MOCK_EMPLOYEE_ID)) {
        resolvedId = await resolveApiEmployeeId(empId, empProfile);
      }
      const res = await apiGet(`/api/v1/employee/${resolvedId}/tasks`, {
        headers: getCrmHeaders("employee", empProfile),
        cacheTtl: EMPLOYEE_CACHE_TTL,
      });
      const items = unwrapApiList(res);
      if (!items) return false;
      setTasksState((prev) => {
        const next = tasksMapFromApi(items, empProfile);
        if (getAuthenticatedEmployeeId()) return next;
        return countTasks(next) === 0 && countTasks(prev) > 0 ? prev : next;
      });
      setUsingApi(true);
      return true;
    } catch {
      return false;
    }
  }, [employee, resolveApiEmployeeId]);

  const refreshFollowUps = useCallback(async (empId = employee.id, leadList = leads) => {
    try {
      let resolvedId = empId;
      if (isMockEmployeeId(empId)) {
        resolvedId = await resolveApiEmployeeId(empId, employee);
      }
      const res = await apiGet(`/api/v1/employee/${resolvedId}/followups`, {
        headers: getCrmHeaders(),
        cacheTtl: EMPLOYEE_CACHE_TTL,
      });
      const items = unwrapApiList(res);
      if (!items) return false;
      setFollowUpsState((prev) => listUpdaterForSession()(
        prev,
        mapFollowUpsFromApi(items, leadList),
      ));
      setUsingApi(true);
      return true;
    } catch {
      return false;
    }
  }, [employee, leads, resolveApiEmployeeId]);

  const refreshCalls = useCallback(async (empId = employee.id, empProfile = employee, leadList = leads) => {
    try {
      const authEmployeeId = getAuthenticatedEmployeeId();
      let resolvedId = authEmployeeId || empId;
      if (!authEmployeeId && isMockEmployeeId(empId, MOCK_EMPLOYEE_ID)) {
        resolvedId = await resolveApiEmployeeId(empId, empProfile);
      }
      const callsPath = employeeResourcePath(resolvedId, "calls");
      if (!callsPath) return false;
      const res = await apiGet(callsPath, {
        headers: getCrmHeaders("employee", empProfile),
        cacheTtl: 0,
        skipCache: true,
      });
      const items = unwrapApiList(res);
      if (!items) return false;
      const mapped = items.map((c) => callFromApi(c, leadList));
      setCalls((prev) => mergeCallsById(prev, mapped));
      setUsingApi(true);
      return true;
    } catch {
      return false;
    }
  }, [employee, leads, resolveApiEmployeeId]);

  const syncCallyzerData = useCallback(async () => {
    if (!shouldPersistToApi(usingApi) || !employee?.id || syncCallyzerInFlightRef.current) return;

    syncCallyzerInFlightRef.current = true;
    try {
      const authEmployeeId = getAuthenticatedEmployeeId();
      let resolvedId = authEmployeeId || employee.id;
      if (!authEmployeeId && isMockEmployeeId(employee.id, MOCK_EMPLOYEE_ID)) {
        resolvedId = await resolveApiEmployeeId(employee.id, employee);
      }

      const leadsPath = employeeResourcePath(resolvedId, "leads");
      const callsPath = employeeResourcePath(resolvedId, "calls");
      if (!callsPath) return;

      invalidateCallyzerStatsCache(employee.id);

      const headers = getCrmHeaders("employee", employee);
      const fetchOpts = { headers, cacheTtl: 60_000, skipCache: false };
      const callsQuery = "?period=month&limit=5000";
      const shouldRefreshLeads = !Array.isArray(leadsRef.current) || leadsRef.current.length === 0;
      const [leadItems, callsRes] = await Promise.all([
        shouldRefreshLeads && resolvedId && !isMockEmployeeId(resolvedId, MOCK_EMPLOYEE_ID)
          ? fetchAllEmployeeLeads(apiGet, resolvedId, { headers, skipCache: false, cacheTtl: 60_000 })
          : Promise.resolve(null),
        apiGet(`${callsPath}${callsQuery}`, fetchOpts),
      ]);

      let mappedLeads = leadsRef.current;
      if (Array.isArray(leadItems)) {
        mappedLeads = filterLeadsForEmployee(
          leadItems.map((l) => apiLeadToEmployee(l, AVATAR_COLORS)),
          resolvedId,
          { trustServer: Boolean(authEmployeeId) },
        );
        setLeads((prev) => applyLeadsIfChanged(prev, mappedLeads));
        leadsRef.current = applyLeadsIfChanged(leadsRef.current, mappedLeads);
      }

      const callItems = unwrapApiList(callsRes);
      if (callItems) {
        const mappedCalls = callItems.map((c) => callFromApi(c, mappedLeads));
        setCalls((prev) => mergeCallsById(prev, mappedCalls));
        persistWorkspaceSnapshot(resolvedId, { calls: mappedCalls, leads: mappedLeads });
        dispatchCallyzerRefresh(employee.id);
      }
    } catch {
      /* silent background sync */
    } finally {
      syncCallyzerInFlightRef.current = false;
    }
  }, [employee, resolveApiEmployeeId, usingApi]);

  const resolveAssigneeId = useCallback(async () => {
    const authEmployeeId = getAuthenticatedEmployeeId();
    if (authEmployeeId) return authEmployeeId;
    return resolveApiEmployeeId(employee.id, employee);
  }, [employee, resolveApiEmployeeId]);

  const createTask = useCallback(async ({ date, task }) => {
    const tempId = Date.now();
    const localTask = { ...task, id: tempId };
    const persist = shouldPersistToApi(usingApi);

    setTasksState((prev) => ({
      ...prev,
      [date]: [...(prev[date] || []), localTask],
    }));

    if (!persist) return localTask;

    try {
      const assigneeId = await resolveAssigneeId();
      if (!assigneeId) {
        throw new Error("Could not resolve assignee for this task");
      }

      const res = await apiPost("/api/v1/employee/tasks", {
        assigneeId,
        title: task.name,
        priority: priorityToApi(task.priority),
        dueAt: `${date}T${task.deadline || "17:00"}:00`,
        status: "pending",
      }, { headers: getCrmHeaders() });

      const saved = unwrapApiData(res) || res?.data || res;
      const savedId = saved?.id ?? saved?.taskId ?? saved?._id;
      if (!savedId) {
        throw new Error("Task was not saved — server returned no task id");
      }

      setTasksState((prev) => ({
        ...prev,
        [date]: (prev[date] || []).map((t) => (
          t.id === tempId ? { ...localTask, id: savedId } : t
        )),
      }));
      invalidateCache("/api/v1");
      await refreshTasks(assigneeId);
      return { ...localTask, id: savedId };
    } catch (err) {
      setTasksState((prev) => ({
        ...prev,
        [date]: (prev[date] || []).filter((t) => t.id !== tempId),
      }));
      toast.error(err.message || "Could not save task to server");
      return null;
    }
  }, [employee, resolveAssigneeId, usingApi, refreshTasks]);

  const updateTaskStatus = useCallback(async (date, taskId, done) => {
    setTasksState((prev) => ({
      ...prev,
      [date]: (prev[date] || []).map((t) => (t.id === taskId ? { ...t, done } : t)),
    }));

    if (!shouldPersistToApi(usingApi) || !taskId) return;

    try {
      await apiPatch(`/api/v1/employee/tasks/${taskId}`, {
        status: done ? "done" : "pending",
        completedAt: done ? new Date().toISOString() : null,
      }, { headers: getCrmHeaders() });
      invalidateCache("/api/v1");
    } catch (err) {
      toast.error(err.message || "Could not update task");
      await refreshTasks();
    }
  }, [refreshTasks, usingApi]);

  const removeTask = useCallback(async (date, taskId) => {
    const previous = tasks;
    setTasksState((prev) => ({
      ...prev,
      [date]: (prev[date] || []).filter((t) => t.id !== taskId),
    }));

    if (!shouldPersistToApi(usingApi) || !taskId) return;

    try {
      await apiPatch(`/api/v1/employee/tasks/${taskId}`, {
        status: "cancelled",
      }, { headers: getCrmHeaders() });
      invalidateCache("/api/v1");
    } catch (err) {
      setTasksState(previous);
      toast.error(err.message || "Could not delete task");
    }
  }, [tasks, usingApi]);

  const setTasks = useCallback((updater) => {
    setTasksState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return normalizeTasksMap(next, { useMockFallback: false });
    });
  }, []);

  const setFollowUps = useCallback((updater) => {
    setFollowUpsState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next;
    });
  }, []);

  const applySopList = useCallback((rawList) => {
    const mapped = mapAdminSopsForEmployee(rawList);
    if (mapped.length) {
      setSopsState(mapped);
      persistEmployeeSops(rawList);
      return true;
    }
    return false;
  }, []);

  const refreshSops = useCallback(async (options = {}) => {
    const { force = false } = options;
    const endpoints = ["/api/v1/sops", "/api/sop/all"];
    for (const path of endpoints) {
      try {
        const sopRes = await apiGet(path, {
          skipCache: force,
          cacheTtl: force ? 0 : EMPLOYEE_CACHE_TTL,
          headers: getCrmHeaders("employee", employee),
        });
        const list = extractApiSopList(sopRes);
        if (list && list.length && applySopList(list)) {
          return true;
        }
        if (list && list.length === 0) {
          setSopsState((prev) => (prev.length ? prev : []));
          return false;
        }
      } catch (err) {
        if (err?.status === 429) return false;
        /* try next endpoint */
      }
    }

    const cached = readCachedEmployeeSops();
    if (cached.length && applySopList(cached)) {
      return true;
    }

    return false;
  }, [applySopList, employee]);

  const addCallRecord = useCallback(async (newCall) => {
    const tempId = newCall.id || Date.now();
    const optimistic = { ...newCall, id: tempId };
    setCalls((prev) => [optimistic, ...prev]);

    if (!shouldPersistToApi(usingApi)) return optimistic;

    if (!newCall.leadId) {
      setCalls((prev) => prev.filter((c) => c.id !== tempId));
      toast.error("Could not save call — select a valid lead");
      return null;
    }

    try {
      const employeeId = await resolveApiEmployeeId(employee.id, employee);
      const payload = callToApiPayload(newCall, employeeId);
      const res = await apiPost("/api/v1/employee/calls", payload, { headers: getCrmHeaders() });
      const saved = unwrapApiData(res) || res.data || res;
      const mapped = callFromApi(saved, leads);
      setCalls((prev) => [mapped, ...prev.filter((c) => c.id !== tempId)]);

      const momText = String(newCall.aiMoM || newCall.note || newCall.aiSummary || "").trim();
      if (momText) {
        try {
          await apiPost(
            `/api/v1/leads/${newCall.leadId}/notes`,
            { body: `[Call MoM]\n${momText}` },
            { headers: getCrmHeaders() },
          );
        } catch {
          /* call row saved; lead note is supplementary */
        }
      }

      invalidateCache("/api/v1");
      return mapped;
    } catch (err) {
      setCalls((prev) => prev.filter((c) => c.id !== tempId));
      toast.error(err.message || "Could not save call to server");
      return null;
    }
  }, [usingApi, employee, leads, resolveApiEmployeeId]);

  const addActivityRecord = useCallback((leadId, newEvent) => {
    setActivities((prev) => {
      const existing = prev[leadId] || [];
      const updated = [newEvent, ...existing];
      return { ...prev, [leadId]: updated };
    });
  }, []);

  const scheduleFollowUp = useCallback(async ({ leadName, company, type, date, time, note, leadId, phone }) => {
    const lead = leadId != null
      ? leads.find((l) => String(l.id) === String(leadId))
      : null;
    const resolvedLeadId = leadId ?? lead?.id;
    const urgency = getFollowUpUrgency(date);
    const resolvedCompany = company || lead?.company || "—";
    const av = lead?.av || initialsFromName(leadName);
    const color = lead?.color || "#64748b";

    if (shouldPersistToApi(usingApi)) {
      if (!resolvedLeadId) {
        toast.error("Select a valid lead to schedule follow-up");
        return null;
      }
      try {
        const employeeId = await resolveApiEmployeeId(employee.id, employee);
        const payload = followUpToApiPayload(
          { leadName, company, type, date, time, note, leadId: resolvedLeadId },
          employeeId,
          leads,
        );
        const res = await apiPost("/api/v1/employee/followups", payload, { headers: getCrmHeaders() });
        const saved = unwrapApiData(res) || res.data || res;
        const followUp = { ...followUpFromApi(saved, leads, type), company: resolvedCompany, av, color };
        const task = {
          id: saved.taskId,
          name: buildFollowUpTaskName({ type, name: leadName, note }),
          done: false,
          priority: followUpPriority(urgency),
          assignee: employee.name,
          assigneeAv: employee.initials,
          assigneeColor: employee.avatarColor,
          deadline: time,
          source: "followup",
          followUpId: saved.id,
        };

        setFollowUps((prev) => [...prev, followUp]);
        setTasks((prev) => ({
          ...prev,
          [date]: [...(prev[date] || []), task],
        }));
        invalidateCache("/api/v1");
        await refreshFollowUps(employeeId, leads);
        return followUp;
      } catch (err) {
        toast.error(err.message || "Could not save follow-up to server");
        return null;
      }
    }

    const id = Date.now();
    const taskId = id + 1;

    const followUp = {
      id,
      name: leadName,
      company: resolvedCompany,
      type,
      urgency,
      time: formatFollowUpSchedule(date, time),
      av,
      color,
      note: note?.trim() || `${type} follow-up scheduled`,
      scheduledDate: date,
      scheduledTime: time,
      done: false,
      taskId,
      leadId: resolvedLeadId,
    };

    const task = {
      id: taskId,
      name: buildFollowUpTaskName({ type, name: leadName, note }),
      done: false,
      priority: followUpPriority(urgency),
      assignee: employee.name,
      assigneeAv: employee.initials,
      assigneeColor: employee.avatarColor,
      deadline: time,
      source: "followup",
      followUpId: id,
    };

    setFollowUps((prev) => [...prev, followUp]);
    setTasks((prev) => ({
      ...prev,
      [date]: [...(prev[date] || []), task],
    }));

    return followUp;
  }, [employee, leads, setFollowUps, setTasks, usingApi, resolveApiEmployeeId, refreshFollowUps]);

  const completeFollowUp = useCallback(async (followUpId) => {
    if (!followUpId) return;

    const completedAt = new Date().toISOString();
    const completedTime = formatFollowUpCompletedAt(completedAt);

    setFollowUps((prev) => prev.map((f) => (
      String(f.id) === String(followUpId)
        ? { ...f, done: true, status: "completed", completedAt, completedTime }
        : f
    )));
    clearFollowUpOutcome(followUpId);
    setTasks((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((date) => {
        next[date] = (next[date] || []).map((t) => (
          String(t.followUpId) === String(followUpId) ? { ...t, done: true } : t
        ));
      });
      return next;
    });

    if (!shouldPersistToApi(usingApi)) return;

    try {
      await apiPatch(`/api/v1/employee/followups/${followUpId}/complete`, {}, { headers: getCrmHeaders() });
      invalidateCache("/api/v1/employee/");
    } catch (err) {
      toast.error(err.message || "Could not mark follow-up complete on server");
    }
  }, [setFollowUps, setTasks, usingApi]);

  /** Mark follow-up completed after call + MOM saved — shows in Completed section. */
  const completeFollowUpWithMom = useCallback(async ({ followUpId, leadId, leadName, mom } = {}) => {
    if (!followUpId && !leadId && !leadName) return null;

    const completedAt = new Date().toISOString();
    const completedTime = formatFollowUpCompletedAt(completedAt);
    let matchedId = followUpId;

    setFollowUps((prev) => {
      let found = false;
      const next = prev.map((f) => {
        if (f.completedWithMom) return f;
        const idMatch = followUpId && String(f.id) === String(followUpId);
        const leadIdMatch = leadId && String(f.leadId) === String(leadId);
        const nameMatch = leadName && String(f.name || "").trim().toLowerCase() === String(leadName).trim().toLowerCase();
        if (!idMatch && !leadIdMatch && !nameMatch) return f;
        found = true;
        matchedId = f.id;
        return {
          ...f,
          done: true,
          status: "completed",
          completedWithMom: true,
          completedAt,
          completedTime,
          momSnippet: typeof mom === "string" && mom.trim() ? mom.slice(0, 160) : f.momSnippet,
        };
      });
      return found ? next : prev;
    });

    setTasks((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((date) => {
        next[date] = (next[date] || []).map((t) => (
          t.followUpId === matchedId ? { ...t, done: true } : t
        ));
      });
      return next;
    });

    if (shouldPersistToApi(usingApi) && matchedId) {
      try {
        await apiPatch(`/api/v1/employee/followups/${matchedId}/complete`, {
          completedWithMom: true,
          completedAt,
        }, { headers: getCrmHeaders() });
        invalidateCache("/api/v1");
      } catch {
        /* local state still updated */
      }
    }

    return matchedId;
  }, [setFollowUps, setTasks, usingApi]);

  const syncTaskWithFollowUp = useCallback(async (date, taskId, done) => {
    let linkedFollowUpId;
    setTasks((prev) => {
      const task = prev[date]?.find((t) => t.id === taskId);
      linkedFollowUpId = task?.followUpId;
      const dayTasks = prev[date] || [];
      const next = {
        ...prev,
        [date]: dayTasks.map((t) => (t.id === taskId ? { ...t, done } : t)),
      };
      if (task?.followUpId && done) {
        setFollowUps((fuPrev) => fuPrev.map((f) => (
          f.id === task.followUpId ? { ...f, done: true } : f
        )));
      }
      return next;
    });

    if (shouldPersistToApi(usingApi) && done && linkedFollowUpId) {
      try {
        await apiPatch(`/api/v1/employee/followups/${linkedFollowUpId}/complete`, {}, { headers: getCrmHeaders() });
        invalidateCache("/api/v1");
      } catch {
        /* follow-up may already be complete */
      }
    }

    if (shouldPersistToApi(usingApi) && taskId) {
      try {
        await apiPatch(`/api/v1/employee/tasks/${taskId}`, {
          status: done ? "done" : "pending",
          completedAt: done ? new Date().toISOString() : null,
        }, { headers: getCrmHeaders() });
        invalidateCache("/api/v1");
      } catch (err) {
        toast.error(err.message || "Could not update task on server");
        await refreshTasks();
      }
    }
  }, [setTasks, setFollowUps, usingApi, refreshTasks]);

  const addLead = useCallback(async (form) => {
    const localLead = form.lead_name || form.company_name
      ? empLeadFromDrawerPayload(form, AVATAR_COLORS)
      : (() => {
        const name = [form.firstName, form.lastName].filter(Boolean).join(" ").trim() || "New Lead";
        const id = Date.now();
        const av = initialsFromName(name);
        return {
          id,
          name,
          company: form.company || "—",
          status: form.status || "warm",
          stage: form.stage || "Lead",
          source: form.source || "Website",
          budget: form.budget || "—",
          last: "Just now",
          av,
          color: AVATAR_COLORS[id % AVATAR_COLORS.length],
          city: form.city || "",
          state: form.state || "",
        };
      })();

    if (shouldPersistToApi(usingApi)) {
      try {
        const res = await apiPost("/api/v1/leads", {
          leadName: localLead.name,
          companyName: localLead.company,
          phone: form.phone || localLead.phone,
          email: form.email || localLead.email,
          city: localLead.city,
          source: localLead.source,
          temperature: temperatureToApi(localLead.status),
          pipelineStage: localLead.stage,
          expectedRevenue: Number(form.expected_revenue || 0),
          requirements: form.service || form.interested_service,
        }, { headers: getCrmHeaders() });

        const createdLead = res?.data?.lead || res?.data || res?.lead || res;
        const createdLeadId = createdLead?.id ?? createdLead?.lead_id ?? res?.data?.id ?? res?.id;

        if (createdLeadId) {
          await apiPost("/api/v1/assignment/assign", {
            leadId: createdLeadId,
            employeeId: await resolveApiEmployeeId(employee.id, employee),
            method: "manual",
          }, { headers: getCrmHeaders() });
        }

        invalidateCache("/api/v1");
        await refreshLeads(employee.id);
        toast.success(`${localLead.name} added to your pipeline`);
        return apiLeadToEmployee(createdLead, AVATAR_COLORS);
      } catch (err) {
        toast.error(err.message || "Could not save lead to server");
      }
    }

    localLead.assignee = employee.name;
    localLead.assigneeId = employee.id;
    setLeads((prev) => [localLead, ...prev]);
    return localLead;
  }, [employee, refreshLeads, usingApi, resolveApiEmployeeId]);

  const updateLeadStage = useCallback(async (leadId, stageLabel, options = {}) => {
    const { fromNewAssigned = false } = options;
    const current = leads.find((l) => l.id === leadId);
    const patch = employeeStagePatch(stageLabel, current?.status);
    const acceptedAt = fromNewAssigned ? new Date().toISOString() : current?.acceptedAt;
    const prevSnapshot = current ? { ...current } : null;

    markLocalLeadChange();
    setLeads((prev) => prev.map((l) => {
      if (String(l.id) !== String(leadId)) return l;
      return {
        ...l,
        stage: stageLabel,
        pipelineStage: stageLabel,
        stageOverride: true,
        status: patch.employeeStatus || l.status,
        assignmentStatus: fromNewAssigned ? "accepted" : l.assignmentStatus,
        acceptedAt,
      };
    }));

    if (shouldPersistToApi(usingApi)) {
      try {
        await apiPatch(`/api/v1/leads/${leadId}/stage`, {
          stage: stageLabel,
          status: patch.employeeStatus || stageLabel,
        }, { headers: getCrmHeaders() });
        invalidateCache("/api/v1/employee/");
        invalidateCache(`/api/v1/leads/${leadId}`);
        // usePipelineSync keeps its own module-level board cache that invalidateCache
        // does not touch — without this the board keeps serving the pre-move payload.
        invalidatePipelineBoardCache();
      } catch (err) {
        if (prevSnapshot) {
          setLeads((prev) => prev.map((l) => (String(l.id) === String(leadId) ? prevSnapshot : l)));
        }
        toast.error(err.message || "Stage update failed");
        throw err;
      }
    }
  }, [leads, usingApi]);

  const updateLeadTemperature = useCallback(async (leadId, nextStatus) => {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: nextStatus } : l)));

    if (shouldPersistToApi(usingApi)) {
      try {
        await apiPut(`/api/v1/leads/${leadId}`, {
          temperature: temperatureToApi(nextStatus),
        }, { headers: getCrmHeaders() });
        invalidateCache("/api/v1");
      } catch (err) {
        toast.error(err.message || "Temperature update failed");
      }
    }
  }, [usingApi]);

  const markFollowUpNotPicked = useCallback(async (followUpId, { leadId, leadName } = {}) => {
    let matchedId = followUpId;

    setFollowUps((prev) => {
      let found = false;
      const next = prev.map((f) => {
        if (isFollowUpCompleted(f)) return f;
        const idMatch = followUpId && String(f.id) === String(followUpId);
        const leadIdMatch = leadId && String(f.leadId) === String(leadId);
        const nameMatch = leadName && String(f.name || "").trim().toLowerCase() === String(leadName).trim().toLowerCase();
        if (!idMatch && !leadIdMatch && !nameMatch) return f;
        found = true;
        matchedId = f.id;
        const noteBase = (f.note || "Call follow-up scheduled").replace(/ · Not picked/gi, "").replace(/ · Call again/gi, "");
        return {
          ...f,
          done: false,
          status: "pending",
          notPicked: true,
          lastCallOutcome: "not_picked",
          note: `${noteBase} · Not picked`,
        };
      });
      return found ? next : prev;
    });

    if (matchedId) persistFollowUpOutcome(matchedId, "not_picked");
    if (leadId) {
      try {
        await updateLeadTemperature(leadId, "notpick");
      } catch {
        /* local follow-up state still updated */
      }
    }
    return matchedId;
  }, [setFollowUps, updateLeadTemperature]);

  const markFollowUpCallAgain = useCallback(async (followUpId, { leadId, leadName } = {}) => {
    let matchedId = followUpId;

    setFollowUps((prev) => {
      let found = false;
      const next = prev.map((f) => {
        if (isFollowUpCompleted(f)) return f;
        const idMatch = followUpId && String(f.id) === String(followUpId);
        const leadIdMatch = leadId && String(f.leadId) === String(leadId);
        const nameMatch = leadName && String(f.name || "").trim().toLowerCase() === String(leadName).trim().toLowerCase();
        if (!idMatch && !leadIdMatch && !nameMatch) return f;
        found = true;
        matchedId = f.id;
        const noteBase = (f.note || "Call follow-up scheduled").replace(/ · Not picked/gi, "").replace(/ · Call again/gi, "");
        return {
          ...f,
          done: false,
          status: "pending",
          notPicked: false,
          lastCallOutcome: "call_again",
          note: `${noteBase} · Call again`,
        };
      });
      return found ? next : prev;
    });

    if (matchedId) persistFollowUpOutcome(matchedId, "call_again");
    return matchedId;
  }, [setFollowUps]);

  const editLeadDetails = useCallback(async (leadId, updates) => {
    const normalizedUpdates = { ...updates };
    const stageUpdate = updates.pipelineStage !== undefined
      ? resolvePipelineStageLabel(updates.pipelineStage, updates.status || "")
      : undefined;
    if (stageUpdate) {
      normalizedUpdates.pipelineStage = stageUpdate;
      normalizedUpdates.stage = stageUpdate;
    }

    const prevSnapshot = leads.find((l) => String(l.id) === String(leadId));

    markLocalLeadChange();
    setLeads((prev) => prev.map((l) => (
      String(l.id) === String(leadId)
        ? {
          ...l,
          ...normalizedUpdates,
          ...(updates.name !== undefined ? { name: updates.name } : {}),
          ...(updates.status !== undefined ? { status: updates.status } : {}),
          stage: normalizedUpdates.stage || l.stage,
          pipelineStage: normalizedUpdates.pipelineStage || l.pipelineStage,
          stageOverride: Boolean(stageUpdate || l.stageOverride),
          ...(updates.company !== undefined ? { company: updates.company } : {}),
          ...(updates.city !== undefined ? { city: updates.city } : {}),
          ...(updates.source !== undefined ? { source: updates.source } : {}),
          ...(updates.service !== undefined ? { service: updates.service } : {}),
          ...(updates.expectedRevenue !== undefined
            ? {
              expectedRevenue: Number(updates.expectedRevenue) || 0,
              budget: Number(updates.expectedRevenue) > 0
                ? formatEmpPipelineValue(Number(updates.expectedRevenue))
                : "—",
            }
            : {}),
        }
        : l
    )));

    if (shouldPersistToApi(usingApi)) {
      try {
        const payload = {};
        if (updates.name !== undefined) payload.leadName = updates.name;
        if (updates.status !== undefined) {
          payload.temperature = temperatureToApi(updates.status);
          payload.status = workflowStatusFromTemperature(updates.status);
        }
        if (updates.phone !== undefined) payload.phone = updates.phone;
        if (updates.email !== undefined) payload.email = updates.email;
        if (updates.company !== undefined) payload.companyName = updates.company;
        if (updates.city !== undefined) payload.city = updates.city;
        if (updates.source !== undefined) payload.source = updates.source;
        if (updates.service !== undefined || updates.requirements !== undefined) {
          payload.requirements = updates.service ?? updates.requirements;
        }
        if (updates.expectedRevenue !== undefined) {
          payload.expectedRevenue = Number(updates.expectedRevenue) || 0;
        }

        if (Object.keys(payload).length) {
          await apiPut(`/api/v1/leads/${leadId}`, payload, { headers: getCrmHeaders() });
        }

        if (stageUpdate) {
          const stagePatch = employeeStagePatch(stageUpdate, updates.status || prevSnapshot?.status);
          await apiPatch(`/api/v1/leads/${leadId}/stage`, {
            stage: stageUpdate,
            status: stagePatch.employeeStatus || stageUpdate,
          }, { headers: getCrmHeaders() });
        }

        const res = await apiGet(`/api/v1/leads/${leadId}`, {
          headers: getCrmHeaders(),
          cacheTtl: 0,
          skipCache: true,
        });
        const updated = apiLeadToEmployee(res?.data || res, AVATAR_COLORS);
        if (updated?.id) {
          setLeads((prev) => prev.map((l) => {
            if (String(l.id) !== String(leadId)) return l;
            return {
              ...updated,
              ...(updates.name !== undefined ? { name: updates.name } : {}),
              ...(updates.status !== undefined ? { status: updates.status } : {}),
              stage: stageUpdate || updated.stage,
              pipelineStage: stageUpdate || updated.pipelineStage,
              ...(updates.company !== undefined ? { company: updates.company } : {}),
              ...(updates.city !== undefined ? { city: updates.city } : {}),
              ...(updates.source !== undefined ? { source: updates.source } : {}),
              ...(updates.service !== undefined ? { service: updates.service } : {}),
              ...(updates.expectedRevenue !== undefined
                ? {
                  expectedRevenue: Number(updates.expectedRevenue) || 0,
                  budget: Number(updates.expectedRevenue) > 0
                    ? formatEmpPipelineValue(Number(updates.expectedRevenue))
                    : "—",
                }
                : {}),
            };
          }));
        }
        invalidateCache("/api/v1/employee/");
        invalidateCache(`/api/v1/leads/${leadId}`);
        if (stageUpdate) invalidatePipelineBoardCache();
      } catch (err) {
        if (prevSnapshot) {
          setLeads((prev) => prev.map((l) => (
            String(l.id) === String(leadId) ? prevSnapshot : l
          )));
        }
        toast.error(err.message || "Lead details update failed");
        throw err;
      }
    }
  }, [usingApi, leads]);

  const updateEmployeeAvatar = useCallback(async (avatarUrl) => {
    setEmployee((prev) => (prev ? { ...prev, avatarUrl } : prev));
    if (!employee?.id) return;
    try {
      await apiPut(`/api/v1/employees/${employee.id}`, { avatarUrl }, { headers: getCrmHeaders() });
      invalidateCache("/api/v1/employee");
    } catch (err) {
      toast.error(err.message || "Could not save photo");
    }
  }, [employee?.id]);

  const refreshTeamEmployees = useCallback(async () => {
    try {
      // Use /api/v1/employees?status=active to get ONLY the 4 real active employees
      const empRes = await apiGet("/api/v1/employees?status=active", {
        headers: getCrmHeaders("employee", employee),
        skipCache: true,
        cacheTtl: 0,
      }).catch(() => apiGet("/api/team/employees", {
        headers: getCrmHeaders("employee", employee),
        skipCache: true,
        cacheTtl: 0,
      }));
      if (empRes?.success === false) return [];
      const employees = unwrapApiData(empRes) || empRes?.employees || empRes?.data || [];
      const rawList = Array.isArray(employees) ? employees : [];
      const mapped = rawList.map((e) => mapApiEmployee(e));
      // Only keep active employees
      const list = filterAssignableEmployees(mapped);
      if (list.length) {
        setTeamEmployees(list);
      }
      return list;
    } catch {
      return [];
    }
  }, [employee]);

  const reassignLead = useCallback(async (leadId, employeeId, employeeName, method = "manual") => {
    setLeads((prev) => prev.map((l) => (
      l.id === leadId ? { ...l, assignee: employeeName, assigneeId: employeeId } : l
    )));

    if (!shouldPersistToApi(usingApi)) return true;

    try {
      await apiPost("/api/v1/assignment/assign", {
        leadId,
        employeeId,
        method: method === "auto" ? "reassign" : method,
      }, { headers: getCrmHeaders() });
      invalidateCache("/api/v1");
      await refreshLeads(employee.id);
      return true;
    } catch (err) {
      toast.error(err.message || "Could not reassign lead");
      await refreshLeads(employee.id);
      return false;
    }
  }, [employee.id, refreshLeads, usingApi]);

  const refreshMeetings = useCallback(async (empId = employee.id, leadList = leads) => {
    try {
      let resolvedId = empId;
      if (isMockEmployeeId(empId)) {
        resolvedId = await resolveApiEmployeeId(empId, employee);
      }
      const res = await apiGet(`/api/v1/employee/${resolvedId}/meetings`, {
        headers: getCrmHeaders(),
        cacheTtl: EMPLOYEE_CACHE_TTL,
      });
      const items = unwrapApiList(res);
      if (!items) return false;
      const split = partitionMeetings(items, leadList);
      setMeetingsUpcoming((prev) => listUpdaterForSession()(prev, split.upcoming));
      setMeetingsHistory((prev) => listUpdaterForSession()(prev, split.history));
      setUsingApi(true);
      return true;
    } catch {
      return false;
    }
  }, [employee, leads, resolveApiEmployeeId]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateWorkspace(profile, forceRefresh = true) {
      setEmployee(profile);
      storeEmployee(profile);
      setUsingApi(true);
      setWorkspaceError(null);

      const loaded = await loadEmployeeWorkspace(profile.id, profile, { forceRefresh });
      if (cancelled) return;
      if (loaded === "error") {
        await refreshLeads(profile.id, profile);
        if (cancelled) return;
        await refreshTasks(profile.id, profile);
        try {
          await refreshSops();
        } catch {
          /* SOPs optional */
        }
      }
    }

    async function bootstrap() {
      setLoading(true);
      setLinkError(null);
      try {
        if (authLoading) return;

        const authProfile = profileFromAuthUser(authUser);

        if (authUser?.role === "employee" && !authProfile) {
          setLinkError("Your login is not linked to an employee profile. Ask admin to reset your credentials from Team Management.");
          setLeads([]);
          setTasksState({});
          setFollowUpsState([]);
          setCalls([]);
          setMeetingsUpcoming([]);
          setMeetingsHistory([]);
          return;
        }

        if (authProfile) {
          const stored = getStoredEmployee();
          const employeeChanged = stored?.id && Number(stored.id) !== Number(authProfile.id);
          if (employeeChanged) {
            clearEmployeeStorage();
            setLeads([]);
            setTasksState({});
            setFollowUpsState([]);
            setCalls([]);
            setMeetingsUpcoming([]);
            setMeetingsHistory([]);
            setActivities({});
            invalidateCache("/api/v1/employee/");
          }

          setWorkspaceError(null);

          await hydrateWorkspace(authProfile, employeeChanged);
          if (cancelled) return;
          if (!cancelled) setLoading(false);

          try {
            const empRes = await apiGet("/api/v1/employees?status=active", {
              headers: getCrmHeaders("employee", authProfile),
              skipCache: true,
              cacheTtl: 0,
            });
            if (!cancelled && empRes?.success !== false) {
              const employees = unwrapApiData(empRes);
              const rawList = Array.isArray(employees) ? employees : [];
              const list = filterAssignableEmployees(rawList.map((e) => mapApiEmployee(e)));
              if (list.length) {
                setTeamEmployees(list);
              }
            }
          } catch {
            /* team list is optional for reassign dropdown */
          }
          return;
        }

        if (authUser?.role === "employee") {
          setLinkError("Could not load your employee profile. Sign out and sign in again.");
          return;
        }

        const stored = getStoredEmployee();
        const seedProfile = stored?.id && !isMockEmployeeId(stored.id, MOCK_EMPLOYEE_ID)
          ? { ...CURRENT_EMPLOYEE, ...stored }
          : { ...CURRENT_EMPLOYEE };

        try {
          const empRes = await apiGet("/api/v1/employees?status=active", {
            headers: getCrmHeaders("employee", seedProfile),
            skipCache: true,
            cacheTtl: 0,
          }).catch(() => apiGet("/api/team/employees", {
            headers: getCrmHeaders("employee", seedProfile),
            skipCache: true,
            cacheTtl: 0,
          }));
          if (cancelled) return;
          if (empRes?.success === false) {
            throw new Error(empRes.message || "Employees API failed");
          }
          const employees = unwrapApiData(empRes) || empRes?.employees || empRes?.data || [];
          const rawList = Array.isArray(employees) ? employees : [];
          const list = filterAssignableEmployees(rawList.map((e) => mapApiEmployee(e)));
          if (list.length && !cancelled) {
            setTeamEmployees(list);
          }
          const matched = matchEmployeeFromList(list, seedProfile, MOCK_EMPLOYEE_ID);
          if (matched && !cancelled) {
            const mapped = { ...CURRENT_EMPLOYEE, ...mapApiEmployee(matched) };
            await hydrateWorkspace(mapped, true);
            return;
          }
        } catch {
          /* retry workspace load with resolver below */
        }

        if (!cancelled) {
          const persisted = getStoredEmployee();
          const fallbackProfile = persisted?.id && !isMockEmployeeId(persisted.id, MOCK_EMPLOYEE_ID)
            ? { ...CURRENT_EMPLOYEE, ...persisted }
            : seedProfile;

          setEmployee((prev) => (
            !isMockEmployeeId(prev?.id, MOCK_EMPLOYEE_ID) ? prev : fallbackProfile
          ));
          setUsingApi(true);
          try {
            await hydrateWorkspace(fallbackProfile, true);
          } catch {
            /* show empty workspace until API recovers */
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    return () => { cancelled = true; };
  }, [authUser?.id, authUser?.employeeId, authUser?.role, authLoading]);

  useEffect(() => {
    const employeeId = getAuthenticatedEmployeeId();
    if (!employeeId || linkError) return undefined;

    let debounceTimer = null;

    const syncAssignedWork = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        invalidateCache("/api/v1/employee/");
        refreshLeads(employeeId, employee);
        refreshTasks(employeeId, employee);
        refreshMeetings(employeeId, leads);
        refreshFollowUps(employeeId, leads);
      }, 800);
    };

    document.addEventListener("visibilitychange", syncAssignedWork);
    return () => {
      clearTimeout(debounceTimer);
      document.removeEventListener("visibilitychange", syncAssignedWork);
    };
  }, [employee?.id, linkError, refreshLeads, refreshTasks, refreshMeetings, refreshFollowUps]);

  const createMeeting = useCallback(async (form) => {
    const lead = leads.find((l) => String(l.id) === String(form.leadId));
    const platformLabel = { google_meet: "Google Meet", zoom: "Zoom", teams: "Teams" }[form.platform]
      || form.platform
      || "Google Meet";
    const meetLink = String(form.meetLink || "").trim();
    const tempId = Date.now();
    const optimistic = {
      id: tempId,
      title: form.title.trim(),
      time: `Scheduled, ${form.time}`,
      date: form.date,
      scheduledAt: `${form.date}T${form.time || "09:00"}:00`,
      platform: platformLabel,
      lead: lead?.name || "—",
      company: lead?.company || "—",
      color: lead?.color || "#e11d48",
      meetLink,
      status: "scheduled",
    };

    setMeetingsUpcoming((prev) => [optimistic, ...prev]);

    if (!shouldPersistToApi(usingApi)) return optimistic;

    if (!form.leadId) {
      setMeetingsUpcoming((prev) => prev.filter((m) => m.id !== tempId));
      toast.error("Select a lead before booking a meeting");
      return null;
    }

    try {
      const employeeId = await resolveApiEmployeeId(employee.id, employee);
      const payload = meetingToApiPayload({ ...form, meetLink }, employeeId);
      const headers = getCrmHeaders("employee", { ...employee, id: employeeId });
      const res = await apiPost("/api/v1/employee/meetings", payload, { headers });
      const saved = unwrapApiData(res) || res?.data || res;
      const savedId = saved?.id ?? saved?._id;
      if (!savedId) throw new Error("Meeting was not saved — server returned no id");

      const mapped = meetingFromApi(saved, leads);
      setMeetingsUpcoming((prev) => [mapped, ...prev.filter((m) => m.id !== tempId)]);
      invalidateCache("/api/v1");
      return mapped;
    } catch (err) {
      setMeetingsUpcoming((prev) => prev.filter((m) => m.id !== tempId));
      toast.error(err.message || "Could not save meeting to server");
      return null;
    }
  }, [employee, leads, usingApi, resolveApiEmployeeId]);

  const cancelMeeting = useCallback(async (meetingId) => {
    const previousUpcoming = meetingsUpcoming;
    setMeetingsUpcoming((prev) => prev.filter((m) => m.id !== meetingId));

    if (!shouldPersistToApi(usingApi) || !meetingId) return;

    try {
      await apiPatch(`/api/v1/employee/meetings/${meetingId}`, { status: "cancelled" }, {
        headers: getCrmHeaders(),
      });
      invalidateCache("/api/v1");
    } catch (err) {
      setMeetingsUpcoming(previousUpcoming);
      toast.error(err.message || "Could not delete meeting");
    }
  }, [meetingsUpcoming, usingApi]);

  const reloadWorkspace = useCallback(async () => {
    const authId = getAuthenticatedEmployeeId();
    const profile = authId
      ? { ...employee, id: authId }
      : employee;
    if (!profile?.id) return false;
    invalidateCache("/api/v1/employee/");
    setLoading(true);
    setWorkspaceError(null);
    try {
      const result = await loadEmployeeWorkspace(profile.id, profile, { forceRefresh: true });
      if (result === "error") {
        await refreshLeads(profile.id, profile);
        await refreshTasks(profile.id, profile);
      } else if (result === "ok") {
        syncCallyzerData();
      }
      return result === "ok";
    } finally {
      setLoading(false);
    }
  }, [employee, loadEmployeeWorkspace, refreshLeads, refreshTasks, syncCallyzerData]);

  const startCallyzerCall = useCallback(async (lead) => {
    if (!lead?.id) {
      toast.error("Select a valid lead to call");
      return null;
    }
    if (!lead.phone) {
      toast.error("Add a phone number to this lead before calling");
      return null;
    }

    const employeeId = await resolveApiEmployeeId(employee.id, employee);
    try {
      const res = await apiPost(
        "/api/v1/employee/callyzer/start-call",
        { leadId: lead.id, employeeId },
        { headers: getCrmHeaders() },
      );
      const data = unwrapApiData(res) || res?.data || res;
      if (data?.dialUrl) {
        window.location.href = data.dialUrl;
      }
      window.setTimeout(() => syncCallyzerData(), 8000);
      window.setTimeout(() => syncCallyzerData(), 20000);
      return data;
    } catch (err) {
      toast.error(err.message || "Could not start Callyzer call");
      return null;
    }
  }, [employee, resolveApiEmployeeId, syncCallyzerData]);

  syncCallyzerRef.current = syncCallyzerData;

  useEffect(() => {
    if (!usingApi || !employee?.id || loading) return undefined;

    syncCallyzerRef.current?.();

    const intervalId = window.setInterval(() => {
      if (!document.hidden) syncCallyzerRef.current?.();
    }, CALLYZER_SYNC_INTERVAL_MS);

    const onVisibility = () => {
      if (!document.hidden) syncCallyzerRef.current?.();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [usingApi, employee?.id, loading]);

  // Live sync — a stage change made elsewhere (admin web, another device) refetches this employee's leads.
  useEffect(() => {
    if (!usingApi || !employee?.id) return undefined;
    let timer = null;
    const refetch = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        refreshLeads(employee.id, employee);
      }, 400);
    };
    const offLead = onLeadChanged(refetch);
    const offDashboard = onDashboardRefresh(refetch);
    return () => {
      if (timer) window.clearTimeout(timer);
      offLead();
      offDashboard();
    };
  }, [usingApi, employee?.id, refreshLeads]);

  const value = useMemo(() => ({
    employee,
    tasks,
    setTasks,
    createTask,
    updateTaskStatus,
    removeTask,
    refreshTasks,
    followUps,
    setFollowUps,
    scheduleFollowUp,
    completeFollowUp,
    completeFollowUpWithMom,
    markFollowUpNotPicked,
    markFollowUpCallAgain,
    refreshFollowUps,
    syncTaskWithFollowUp,
    leads,
    setLeads,
    addLead,
    updateLeadStage,
    updateLeadTemperature,
    editLeadDetails,
    updateEmployeeAvatar,
    refreshLeads,
    refreshCalls,
    syncCallyzerData,
    reassignLead,
    teamEmployees,
    refreshTeamEmployees,
    usingApi,
    calls,
    setCalls,
    addCallRecord,
    startCallyzerCall,
    activities,
    addActivityRecord,
    sops,
    refreshSops,
    meetingsUpcoming,
    meetingsHistory,
    createMeeting,
    cancelMeeting,
    refreshMeetings,
    loading,
    linkError,
    workspaceError,
    reloadWorkspace,
    selectedService,
    setSelectedService,
    servicesList: getDynamicServicesList([], leads),
  }), [
    employee, tasks, setTasks, createTask, updateTaskStatus, removeTask, refreshTasks,
    followUps, setFollowUps, scheduleFollowUp, completeFollowUp, completeFollowUpWithMom, markFollowUpNotPicked, markFollowUpCallAgain, refreshFollowUps,
    syncTaskWithFollowUp, leads, addLead, updateLeadStage, updateLeadTemperature, editLeadDetails, updateEmployeeAvatar, refreshLeads, refreshCalls, syncCallyzerData,
    reassignLead, teamEmployees, refreshTeamEmployees,
    usingApi, calls, setCalls, addCallRecord, startCallyzerCall, activities, addActivityRecord, sops, refreshSops,
    meetingsUpcoming, meetingsHistory, createMeeting, cancelMeeting, refreshMeetings, loading, linkError,
    workspaceError, reloadWorkspace, selectedService,
  ]);

  return (
    <EmployeeContext.Provider value={value}>
      {linkError && (
        <div className="mx-3 sm:mx-4 md:mx-6 lg:mx-8 mt-3 p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-sm">
          {linkError}
        </div>
      )}
      {workspaceError && !linkError && (
        <div className="mx-3 sm:mx-4 md:mx-6 lg:mx-8 mt-3 p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-900 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span>{workspaceError}</span>
          <button
            type="button"
            onClick={() => reloadWorkspace()}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold"
          >
            Retry load
          </button>
        </div>
      )}
      {children}
    </EmployeeContext.Provider>
  );
}

const DEFAULT_EMPLOYEE_CONTEXT = {
  employee: null,
  selectedService: "All Services",
  setSelectedService: () => {},
  servicesList: ["All Services"],
};

export function useEmployee() {
  const ctx = useContext(EmployeeContext);
  return ctx || DEFAULT_EMPLOYEE_CONTEXT;
}
