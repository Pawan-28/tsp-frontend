const STORAGE_KEY = "crm_lead_assignment_v1";

function isEmployeeInRotation(emp) {
  const status = String(emp?.status || "active").toLowerCase();
  return status !== "inactive" && status !== "on_leave";
}

const defaultState = () => ({
  assignments: {},
  employeeSettings: {},
  distribution: {
    mode: "round-robin",
    roundRobinOrder: [],
    rrIndex: 0,
    autoAssign: true,
  },
  auditLog: [],
  todayKey: new Date().toISOString().slice(0, 10),
  todayStats: { total: 0, byEmployee: {} },
});

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    if (parsed.todayKey !== today) {
      parsed.todayKey = today;
      parsed.todayStats = { total: 0, byEmployee: {} };
    }
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

export function getAssignmentState() {
  return loadState();
}

export function persistAssignmentState(state) {
  saveState(state);
}

export function normalizeSource(raw = "") {
  const s = String(raw || "").toLowerCase().trim();
  if (!s) return "api";
  if (s.includes("facebook") || s.includes("instagram") || s.includes("meta")) return "meta_ads";
  if (s.includes("google")) return "google_ads";
  if (s.includes("whatsapp") || s.includes("wa ")) return "whatsapp";
  if (s.includes("website") || s.includes("organic") || s.includes("web")) return "website";
  if (s.includes("linkedin")) return "linkedin";
  if (s.includes("referral")) return "referral";
  if (s.includes("campaign")) return "campaign";
  if (s.includes("landing")) return "landing_page";
  if (s.includes("manual")) return "manual";
  if (s.includes("n8n") || s.includes("webhook") || s.includes("zapier")) return "n8n";
  if (s.includes("callyzer")) return "callyzer";
  if (s.includes("api")) return "api";
  return s.replace(/\s+/g, "_");
}

export function isQueueEligibleLead(lead) {
  if (!lead) return false;
  return true;
}

export function isConverted(lead) {
  const stage = String(lead.pipeline_stage || lead.pipelineStage || lead.stage || lead.status || "").toLowerCase();
  return (
    stage.includes("payment complete")
    || stage.includes("won")
    || stage.includes("convert")
    || stage.includes("closed won")
  );
}

export function isActiveLead(lead) {
  return !isConverted(lead) && String(lead.status || "").toLowerCase() !== "closed lost";
}

export function getLeadId(lead) {
  return lead.id ?? lead.lead_id ?? lead._id;
}

export function appendAudit(state, entry) {
  const log = [
    { id: Date.now(), at: new Date().toISOString(), ...entry },
    ...state.auditLog,
  ].slice(0, 200);
  return { ...state, auditLog: log };
}

export function recordTodayAssignment(state, employeeId) {
  const key = String(employeeId);
  return {
    ...state,
    todayStats: {
      total: (state.todayStats?.total || 0) + 1,
      byEmployee: {
        ...(state.todayStats?.byEmployee || {}),
        [key]: (state.todayStats?.byEmployee?.[key] || 0) + 1,
      },
    },
  };
}

export function assignLead(state, lead, employee, method = "manual") {
  const leadId = String(getLeadId(lead));
  const empId = String(employee.id);
  let next = {
    ...state,
    assignments: {
      ...state.assignments,
      [leadId]: {
        employeeId: empId,
        employeeName: employee.name,
        assignedAt: new Date().toISOString(),
        method,
      },
    },
  };
  next = recordTodayAssignment(next, empId);
  next = appendAudit(next, {
    action: method === "reassign" ? "reassigned" : "assigned",
    leadId,
    leadName: lead.lead_name || lead.company_name || "Lead",
    employeeId: empId,
    employeeName: employee.name,
    method,
  });
  saveState(next);
  return next;
}

export function unassignLead(state, lead) {
  const leadId = String(getLeadId(lead));
  const prev = state.assignments[leadId];
  const assignments = { ...state.assignments };
  delete assignments[leadId];
  let next = { ...state, assignments };
  if (prev) {
    next = appendAudit(next, {
      action: "unassigned",
      leadId,
      leadName: lead.lead_name || lead.company_name || "Lead",
      employeeId: prev.employeeId,
      employeeName: prev.employeeName,
      method: "manual",
    });
  }
  saveState(next);
  return next;
}

export function bulkAssign(state, leads, employee, method = "bulk") {
  let next = state;
  for (const lead of leads) {
    next = assignLead(next, lead, employee, method);
  }
  return next;
}

export function toggleEmployeeReceiving(state, employeeId) {
  const key = String(employeeId);
  const cur = state.employeeSettings[key] || { receivingPaused: false, maxCapacity: 15, skills: [] };
  const next = {
    ...state,
    employeeSettings: {
      ...state.employeeSettings,
      [key]: { ...cur, receivingPaused: !cur.receivingPaused },
    },
  };
  saveState(next);
  return next;
}

export function setDistributionMode(state, mode) {
  const next = { ...state, distribution: { ...state.distribution, mode } };
  saveState(next);
  return next;
}

export function setAutoAssign(state, autoAssign) {
  const next = { ...state, distribution: { ...state.distribution, autoAssign } };
  saveState(next);
  return next;
}

export function initRoundRobinOrder(state, employees) {
  const active = employees.filter(isEmployeeInRotation);
  const order = active.map((e) => e.id);
  const next = {
    ...state,
    distribution: { ...state.distribution, roundRobinOrder: order, rrIndex: 0 },
  };
  saveState(next);
  return next;
}

/** Keep stored rotation in sync when employee IDs change (API vs cached demo IDs). */
export function syncRoundRobinOrder(state, employees) {
  if (!employees?.length) return state;

  const activeIds = employees.filter(isEmployeeInRotation).map((e) => e.id);
  if (!activeIds.length) return state;

  const idSet = new Set(activeIds.map(String));
  const prevOrder = state.distribution.roundRobinOrder || [];
  const kept = prevOrder.filter((id) => idSet.has(String(id)));
  const keptSet = new Set(kept.map(String));
  const added = activeIds.filter((id) => !keptSet.has(String(id)));
  const order = [...kept, ...added];

  const unchanged =
    order.length === prevOrder.length &&
    order.every((id, i) => String(id) === String(prevOrder[i]));

  if (unchanged) return state;

  const next = {
    ...state,
    distribution: {
      ...state.distribution,
      roundRobinOrder: order,
      rrIndex: order.length ? Math.min(state.distribution.rrIndex || 0, order.length - 1) : 0,
    },
  };
  saveState(next);
  return next;
}

function employeeCapacity(emp, settings, workload) {
  const s = settings[String(emp.id)] || {};
  return s.maxCapacity ?? 15;
}

function employeeUtilization(emp, settings, workload) {
  const cap = employeeCapacity(emp, settings, workload);
  const assigned = workload[emp.id]?.active ?? 0;
  return cap > 0 ? Math.round((assigned / cap) * 100) : 0;
}

function isAvailable(emp, settings, workload) {
  const s = settings[String(emp.id)] || {};
  if (s.receivingPaused || !isEmployeeInRotation(emp)) return false;
  const util = employeeUtilization(emp, settings, workload);
  return util < 100;
}

function skillMatch(lead, emp) {
  const dept = String(emp.department || "").toLowerCase();
  const source = normalizeSource(lead.source || lead.form_name);
  const map = {
    meta_ads: ["sales", "marketing"],
    google_ads: ["sales", "marketing"],
    website: ["sales", "support"],
    whatsapp: ["sales", "support"],
    manual: ["sales"],
    api: ["sales"],
    n8n: ["sales", "marketing"],
  };
  const allowed = map[source] || ["sales"];
  return !dept || allowed.some((d) => dept.includes(d));
}

export function computeWorkload(employees, assignments, leads) {
  const byEmp = {};
  for (const emp of employees) {
    if (emp && emp.id != null) {
      byEmp[emp.id] = { assigned: 0, active: 0, converted: 0, followUps: 0 };
    }
  }
  const empList = Array.isArray(employees) ? employees : [];

  for (const lead of leads) {
    if (!lead) continue;
    const lid = String(getLeadId(lead));
    const a = assignments ? assignments[lid] : null;

    let targetEmp = null;
    if (a?.employeeId) {
      targetEmp = empList.find((e) => String(e.id) === String(a.employeeId));
    }

    if (!targetEmp) {
      const dbAssign = lead.assignedTo;
      if (dbAssign && typeof dbAssign === "object" && dbAssign.id != null) {
        targetEmp = empList.find((e) => String(e.id) === String(dbAssign.id));
      } else if (dbAssign && typeof dbAssign !== "object") {
        targetEmp = empList.find((e) => String(e.id) === String(dbAssign));
      }
    }

    if (!targetEmp) {
      const rawAssigneeId = lead.assigned_to ?? lead.assignedTo ?? lead.assigneeId;
      if (rawAssigneeId != null && rawAssigneeId !== "") {
        targetEmp = empList.find((e) => String(e.id) === String(rawAssigneeId));
      }
    }

    if (!targetEmp) {
      const empName = lead.assignee_name || lead.assigneeName || lead.assignee || lead.employeeName || lead.owner;
      if (empName) {
        const lower = String(empName).toLowerCase().trim();
        targetEmp = empList.find((e) => e.name && String(e.name).toLowerCase().trim() === lower);
      }
    }

    if (!targetEmp) continue;

    const eid = targetEmp.id;
    if (!byEmp[eid]) byEmp[eid] = { assigned: 0, active: 0, converted: 0, followUps: 0 };
    byEmp[eid].assigned += 1;
    if (isConverted(lead)) byEmp[eid].converted += 1;
    else if (isActiveLead(lead)) byEmp[eid].active += 1;
    if (lead.next_followup_date || lead.nextFollowUp || lead.next_followup) byEmp[eid].followUps += 1;
  }
  return byEmp;
}

export function workloadStatus(utilPct) {
  if (utilPct >= 90) return { label: "Fully Occupied", color: "#dc2626", bg: "#fef2f2", dot: "#ef4444" };
  if (utilPct >= 55) return { label: "Moderate Load", color: "#d97706", bg: "#fffbeb", dot: "#f59e0b" };
  return { label: "Available", color: "#16a34a", bg: "#f0fdf4", dot: "#22c55e" };
}

export function pickNextEmployee(state, employees, lead, workload) {
  const { mode } = state.distribution;
  const settings = state.employeeSettings;
  let pool = employees.filter((e) => isAvailable(e, settings, workload));

  if (mode === "skill") {
    pool = pool.filter((e) => skillMatch(lead, e));
  }

  if (!pool.length) return null;

  if (mode === "workload") {
    pool.sort(
      (a, b) =>
        employeeUtilization(a, settings, workload) - employeeUtilization(b, settings, workload),
    );
    return pool[0];
  }

  if (mode === "skill") {
    const dept = String(lead.source || "").toLowerCase();
    const skilled = pool.filter((e) => {
      const d = String(e.department || e.role || "").toLowerCase();
      return !dept || d.includes("sales") || d.includes(dept.split(" ")[0]);
    });
    if (skilled.length) pool = skilled;
    pool.sort(
      (a, b) =>
        employeeUtilization(a, settings, workload) - employeeUtilization(b, settings, workload),
    );
    return pool[0];
  }

  // round-robin — strict rotation order, availability only
  const order = state.distribution.roundRobinOrder?.length
    ? state.distribution.roundRobinOrder
    : employees.map((e) => e.id);
  const idx = state.distribution.rrIndex || 0;
  for (let i = 0; i < order.length; i += 1) {
    const empId = order[(idx + i) % order.length];
    const emp = pool.find((e) => String(e.id) === String(empId));
    if (emp) {
      return { employee: emp, nextIndex: (idx + i + 1) % order.length };
    }
  }
  return pool[0] ? { employee: pool[0], nextIndex: idx } : null;
}

function distributeUnassigned(state, employees, leads, options = {}) {
  const {
    includeManual = false,
    allLeads,
    forceAssign = false,
  } = options;

  let next = state;

  next = syncRoundRobinOrder(next, employees);
  if (!next.distribution.roundRobinOrder?.length && employees.length) {
    next = initRoundRobinOrder(next, employees);
  }

  const workloadLeads = allLeads || leads;
  let workload = computeWorkload(employees, next.assignments, workloadLeads);
  let assignedCount = 0;
  const newAssignments = [];

  for (const lead of leads) {
    const lid = String(getLeadId(lead));
    if (!lid || lid === "undefined") continue;
    if (isConverted(lead)) continue;

    const alreadyAssigned = Boolean(next.assignments[lid]);
    if (alreadyAssigned && !forceAssign) continue;

    const src = normalizeSource(lead.source || lead.form_name);
    if (!includeManual && !forceAssign && src === "manual") continue;

    const pick = pickNextEmployee(next, employees, lead, workload);
    if (!pick) continue;

    const emp = pick.employee || pick;
    const method = alreadyAssigned
      ? "reassign"
      : `auto-${next.distribution.mode}`;
    next = assignLead(next, lead, emp, method);
    assignedCount += 1;
    newAssignments.push({ leadId: lid, employee: emp, method });

    if (pick.nextIndex != null) {
      next = {
        ...next,
        distribution: { ...next.distribution, rrIndex: pick.nextIndex },
      };
    }
    workload = computeWorkload(employees, next.assignments, workloadLeads);
  }

  saveState(next);
  return { state: next, assignedCount, newAssignments };
}

/** Background auto-assign (respects autoAssign toggle, skips manual leads). */
export function autoAssignUnassigned(state, employees, leads) {
  if (!state.distribution.autoAssign) return { state, assignedCount: 0, newAssignments: [] };
  return distributeUnassigned(state, employees, leads, {
    includeManual: false,
    allLeads: leads,
  });
}

/**
 * Manual "Run Now".
 * Pass `selectedLeads` to assign only checked rows (round-robin / workload / skill).
 */
export function runDistributionNow(state, employees, allLeads, selectedLeads = null) {
  const targets = selectedLeads?.length ? selectedLeads : allLeads;
  return distributeUnassigned(state, employees, targets, {
    includeManual: true,
    allLeads,
    forceAssign: Boolean(selectedLeads?.length),
  });
}

export function getAssignmentForLead(state, lead) {
  const local = state.assignments[String(getLeadId(lead))];
  if (local) return local;

  const assigned = lead.assignedTo;
  if (assigned && typeof assigned === "object" && assigned.name) {
    return {
      employeeId: String(assigned.id),
      employeeName: assigned.name,
      assignedAt: lead.assigned_at || lead.assignedAt,
      method: lead.assignment_method || lead.assignmentMethod || "api",
    };
  }

  const employeeName =
    lead.assignee_name ||
    lead.assigneeName ||
    lead.assignee ||
    lead.employeeName ||
    lead.owner;
  if (employeeName) {
    return {
      employeeId: String(lead.assigneeId || lead.assigned_to || lead.assignedTo || ""),
      employeeName,
      assignedAt: lead.assigned_at || lead.assignedAt,
      method: lead.assignment_method || lead.assignmentMethod || "api",
    };
  }

  return null;
}

export function isLeadUnassigned(state, lead) {
  if (!lead) return false;

  // Local localStorage state assignment check
  const lid = String(getLeadId(lead));
  if (state?.assignments?.[lid]) return false;

  // Assignment status check
  const status = String(lead.assignment_status || lead.assignmentStatus || "").toLowerCase().trim();
  if (["assigned", "accepted", "in_progress"].includes(status)) return false;

  // Assigned rep ID or object check
  const raw = lead.assigned_to ?? lead.assignedTo ?? lead.assigneeId;
  if (raw != null && raw !== "" && raw !== 0 && raw !== "0") {
    if (typeof raw === "object") {
      if (raw.id != null && raw.id !== "" && raw.id !== 0 && raw.id !== "0") {
        return false;
      }
    } else {
      return false;
    }
  }

  // Assigned rep name string check
  const empName = String(
    lead.assignee_name ||
    lead.assigneeName ||
    lead.assignee ||
    lead.employeeName ||
    lead.owner ||
    ""
  ).trim();

  if (empName && empName !== "—" && empName.toLowerCase() !== "unassigned" && empName.toLowerCase() !== "null") {
    return false;
  }

  return true;
}

/** Resolve the sales employee assigned to a lead (API, DB, or local assignment). */
export function getLeadEmployeeName(lead, assignmentState = null) {
  if (!lead) return "";
  if (assignmentState) {
    const assignment = getAssignmentForLead(assignmentState, lead);
    if (assignment?.employeeName) return assignment.employeeName;
  }
  if (typeof lead.assignedTo === "object" && lead.assignedTo?.name) return lead.assignedTo.name;
  return (
    lead.assignee_name ||
    lead.assigneeName ||
    lead.assignee ||
    lead.employeeName ||
    lead.owner ||
    ""
  );
}
