import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "../hooks/use-mobile.tsx";
import {
  Users, Plus, Search, CheckCircle2, X,
  Target, Flame, Pause, Play, PhoneCall,
  GripVertical, ChevronDown, ChevronUp, History, Layers,
  Shuffle, Zap, Upload, FileSpreadsheet,
  } from "lucide-react";
import AddLeadDrawer from "../components/AddLeadDrawer.jsx";
import UploadLeadsDrawer from "../components/leads/UploadLeadsDrawer.jsx";
import LeadDetailDrawer from "../components/leads/LeadDetailDrawer.jsx";
import { GlassCard, StatCard, Badge, Drawer, SectionHeader } from "../components/Primitives.jsx";
import { apiGet, apiPost, apiPut, apiPatch, readCachedJson, invalidateCache } from "../lib/api.js";
import { getAdminCrmHeaders } from "../lib/crmContext.js";
import { apiLeadToAdmin, apiEmployeeToAdmin, filterAssignableEmployees, fetchLeadsForAssignPage, unwrapApiData } from "../lib/leadSync.js";
import {
  getAssignmentState, assignLead, bulkAssign,
  toggleEmployeeReceiving, setDistributionMode, setAutoAssign,
  initRoundRobinOrder, syncRoundRobinOrder, autoAssignUnassigned, runDistributionNow, computeWorkload,
  workloadStatus,   getAssignmentForLead, getLeadId, normalizeSource,
  isConverted, persistAssignmentState,
  isQueueEligibleLead, isLeadUnassigned,
} from "../lib/leadAssignment.js";
import { useAdmin } from "../context/AdminContext.jsx";
import { extractLeadService, leadBelongsToService } from "../lib/servicesRegistry.js";
import { SEGMENT_WRAP, SEGMENT_BTN, SEGMENT_BTN_ACTIVE, SEGMENT_BTN_INACTIVE } from "../lib/segmentPills.js";
import { PERIOD_PILL_BTN, PERIOD_PILL_INACTIVE } from "../lib/dateRange.js";

const SOURCE_LABELS = {
  meta_ads: { label: "Meta Ads", tone: "info", color: "#2563eb" },
  google_ads: { label: "Google Ads", tone: "warning", color: "#d97706" },
  website: { label: "Website", tone: "success", color: "#16a34a" },
  whatsapp: { label: "WhatsApp", tone: "success", color: "#059669" },
  manual: { label: "Manual", tone: "muted", color: "#64748b" },
  api: { label: "API", tone: "primary", color: "#be123c" },
  n8n: { label: "N8N", tone: "info", color: "#7c3aed" },
};

const LEADS_CACHE_KEY = "/api/v1/leads?assignmentStatus=unassigned&limit=500&page=1";

const cardBase = {
  background: "#fff",
  border: "1px solid #fecdd3",
  borderRadius: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,.04)",
};

/** Right panel: visible employee cards before scroll. */
const VISIBLE_EMPLOYEE_COUNT = 2;
const EMPLOYEE_CARD_HEIGHT_PX = 190;

function employeeListViewportPx(count) {
  if (!count) return 0;
  const visible = Math.min(count, VISIBLE_EMPLOYEE_COUNT);
  return visible * EMPLOYEE_CARD_HEIGHT_PX + Math.max(0, visible - 1) * 10;
}

function getLeadPhone(lead) {
  return lead.phone || lead.phone_number || "—";
}

function getLeadService(lead) {
  const extracted = extractLeadService(lead);
  if (extracted) return `Service: ${extracted}`;
  return lead.service || lead.requirements || lead.insights || "—";
}

function EmployeeCard({ emp, stats, status, paused, onTogglePause, onDrop, dragOver }) {
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onDrop?.(true); }}
      onDragLeave={() => onDrop?.(false)}
      onDrop={(e) => {
        e.preventDefault();
        onDrop?.(false, emp);
      }}
      className={`rounded-xl border p-3 transition-all shrink-0 ${dragOver ? "border-rose-500 bg-rose-50 shadow-md scale-[1.01]" : "border-rose-100 bg-white hover:border-rose-300"}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg gradient-primary grid place-items-center text-[10px] font-bold text-white shrink-0">
            {(emp.name || "?").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 truncate">{emp.name}</p>
            <p className="text-[9px] text-slate-500 truncate">{emp.role || emp.department || "Sales"}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onTogglePause(emp.id)}
          title={paused ? "Resume receiving" : "Pause receiving"}
          className={`w-7 h-7 rounded-md grid place-items-center shrink-0 transition ${paused ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}
        </button>
      </div>

      <div className="flex items-center gap-1.5 mb-2">
        <span
          className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md"
          style={{ background: status.bg, color: status.color }}
        >
          <span className="w-1 h-1 rounded-full" style={{ background: status.dot }} />
          {status.label}
    </span>
        {paused && <Badge tone="warning"><span className="text-[9px]">Paused</span></Badge>}
      </div>

      <div className="grid grid-cols-2 gap-1.5 text-center mb-2">
        {[
          ["Assigned", stats.assigned],
          ["Active", stats.active],
          ["Converted", stats.converted],
          ["Follow-ups", stats.followUps],
        ].map(([l, v]) => (
          <div key={l} className="rounded-md bg-rose-50/50 py-1">
            <p className="text-[8px] font-bold text-slate-400 uppercase">{l}</p>
            <p className="text-xs font-black text-slate-800">{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Leads() {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [leads, setLeads] = useState(() => {
    const cached = readCachedJson(LEADS_CACHE_KEY);
    if (cached?.success && Array.isArray(cached.data) && cached.data.length) {
      return cached.data.map(apiLeadToAdmin);
    }
    return [];
  });
  const { selectedService } = useAdmin();
  const [employees, setEmployees] = useState([]);
  const [assignState, setAssignState] = useState(() => getAssignmentState());
  const [loading, setLoading] = useState(() => leads.length === 0);
  const [addOpen, setAddOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [showSheetLeadsOnly, setShowSheetLeadsOnly] = useState(false);
  const [detailLead, setDetailLead] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
const [toast, setToast] = useState(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [dragLeadId, setDragLeadId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [sortKey, setSortKey] = useState("created_at");
  const [sortDir] = useState("desc");

  const [bulkTab, setBulkTab] = useState("immediate");
  const [scheduleEmployeeId, setScheduleEmployeeId] = useState("");
  const [scheduleStartDate, setScheduleStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [leadsPerDay, setLeadsPerDay] = useState("10");

const showToast = (message, type = "success") => {
  setToast({ message, type });
  setTimeout(() => setToast(null), 3000);
};

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchInput), 250);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchLeadsForAssignPage(apiGet, { headers: getAdminCrmHeaders(), skipCache: true })
        .then((items) => ({ success: true, leads: items.map(apiLeadToAdmin), fromV1: true }))
        .catch(() => ({ success: false, leads: [] })),
      apiGet("/api/v1/employees?status=active", { headers: getAdminCrmHeaders(), skipCache: true })
        .then((res) => {
          const items = unwrapApiData(res);
          if (items.length) {
            return { success: true, employees: filterAssignableEmployees(items.map(apiEmployeeToAdmin)) };
          }
          throw new Error("empty");
        })
        .catch(() =>
          apiGet("/api/team/employees", { skipCache: true })
            .then((res) => {
              if (res?.success && Array.isArray(res.employees) && res.employees.length) {
                return {
                  success: true,
                  employees: filterAssignableEmployees(
                    res.employees.map((e) => ({
                      id: e.id,
                      name: e.name,
                      email: e.email,
                      role: e.role,
                      department: e.department,
                      status: e.status || "active",
                    })),
                  ),
                };
              }
              return { success: true, employees: [] };
            })
            .catch(() => ({ success: true, employees: [] })),
        ),
    ])
      .then(([leadData, empData]) => {
        const leadList = leadData.success ? leadData.leads : [];
        const empList = filterAssignableEmployees(empData.employees || []);

        setLeads(leadList);
        setEmployees(empList);

        let s = syncRoundRobinOrder(assignState, empList);
        if (!s.distribution.roundRobinOrder?.length) {
          s = initRoundRobinOrder(s, empList);
        }
        if (leadList.length && !leadData.fromV1) {
          const { state: next, newAssignments } = autoAssignUnassigned(s, empList, leadList);
          s = next;
          persistDistributedAssignments(newAssignments);
        }
        setAssignState(s);
      })
      .catch(() => {
        setLeads([]);
        setEmployees([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const leadId = searchParams.get("leadId");
    if (!leadId || !leads.length) return;
    const hit = leads.find((l) => String(getLeadId(l)) === String(leadId));
    if (hit) setDetailLead(hit);
  }, [searchParams, leads]);

  const saveLeadDetails = useCallback(async (leadId, updates) => {
    const payload = {};
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.email !== undefined) payload.email = updates.email;
    if (updates.company !== undefined) payload.companyName = updates.company;
    if (updates.city !== undefined) payload.city = updates.city;
    if (updates.source !== undefined) payload.source = updates.source;
    if (updates.service !== undefined) payload.requirements = updates.service;
    if (updates.expectedRevenue !== undefined) {
      payload.expectedRevenue = Number(updates.expectedRevenue) || 0;
    }

    if (Object.keys(payload).length) {
      await apiPut(`/api/v1/leads/${leadId}`, payload, { headers: getAdminCrmHeaders() });
    }
    if (updates.stage) {
      await apiPatch(`/api/v1/leads/${leadId}/stage`, {
        stage: updates.stage,
        status: updates.stage,
      }, { headers: getAdminCrmHeaders() });
    }

    invalidateCache("/api/v1");
    setLeads((prev) => prev.map((l) => {
      if (String(getLeadId(l)) !== String(leadId)) return l;
      return {
        ...l,
        phone: updates.phone !== undefined ? updates.phone : l.phone,
        email: updates.email !== undefined ? updates.email : l.email,
        company_name: updates.company !== undefined ? updates.company : l.company_name,
        city: updates.city !== undefined ? updates.city : l.city,
        source: updates.source !== undefined ? updates.source : l.source,
        requirements: updates.service !== undefined ? updates.service : l.requirements,
        service: updates.service !== undefined ? updates.service : l.service,
        expected_revenue: updates.expectedRevenue !== undefined
          ? Number(updates.expectedRevenue) || 0
          : l.expected_revenue,
        pipeline_stage: updates.stage !== undefined ? updates.stage : l.pipeline_stage,
        status: updates.stage !== undefined ? updates.stage : l.status,
      };
    }));
    setDetailLead((prev) => {
      if (!prev || String(getLeadId(prev)) !== String(leadId)) return prev;
      return {
        ...prev,
        phone: updates.phone !== undefined ? updates.phone : prev.phone,
        email: updates.email !== undefined ? updates.email : prev.email,
        company_name: updates.company !== undefined ? updates.company : prev.company_name,
        city: updates.city !== undefined ? updates.city : prev.city,
        source: updates.source !== undefined ? updates.source : prev.source,
        requirements: updates.service !== undefined ? updates.service : prev.requirements,
        service: updates.service !== undefined ? updates.service : prev.service,
        expected_revenue: updates.expectedRevenue !== undefined
          ? Number(updates.expectedRevenue) || 0
          : prev.expected_revenue,
        pipeline_stage: updates.stage !== undefined ? updates.stage : prev.pipeline_stage,
        status: updates.stage !== undefined ? updates.stage : prev.status,
      };
    });
    showToast("Lead details saved");
  }, []);

  const closeDetailLead = useCallback(() => {
    setDetailLead(null);
    if (searchParams.get("leadId")) {
      const next = new URLSearchParams(searchParams);
      next.delete("leadId");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const workload = useMemo(
    () => computeWorkload(employees, assignState.assignments, leads),
    [employees, leads, assignState.assignments],
  );

  const enrichedLeads = useMemo(
    () =>
      leads.map((l) => ({
        ...l,
        _assignment: getAssignmentForLead(assignState, l),
        _sourceKey: normalizeSource(l.source || l.form_name),
      })),
    [leads, assignState.assignments],
  );

  const queueLeads = useMemo(
    () =>
      enrichedLeads.filter(
        (l) => isQueueEligibleLead(l) && isLeadUnassigned(assignState, l) && !isConverted(l),
      ),
    [enrichedLeads, assignState.assignments],
  );

  const metrics = useMemo(() => {
    const total = queueLeads.length;
    const pickup = total;
    const hotLeads = leads.filter((l) =>
      String(l.temperature || l.status || l.priority || "").toLowerCase().includes("hot"),
    ).length;
    const converted = leads.filter(isConverted).length;
    return { total, pickup, hotLeads, converted, unassigned: total, assigned: leads.length - total };
  }, [queueLeads, leads]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return queueLeads
      .filter((l) => {
        if (selectedService && selectedService !== "All Services" && !leadBelongsToService(l, selectedService)) {
          return false;
        }
        if (showSheetLeadsOnly && !l.is_bulk_uploaded) return false;
        if (!q) return true;
        return [l.lead_name, l.phone, l.phone_number, getLeadService(l)]
          .some((f) => String(f || "").toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const va = a[sortKey] ?? "";
        const vb = b[sortKey] ?? "";
        return sortDir === "asc"
          ? String(va).localeCompare(String(vb))
          : String(vb).localeCompare(String(va));
      });
  }, [queueLeads, search, sortKey, sortDir, showSheetLeadsOnly, selectedService]);

  const handleAssign = useCallback(
    async (lead, employee, method = "manual") => {
      const next = assignLead(assignState, lead, employee, method);
      setAssignState(next);

      try {
        await apiPost("/api/v1/assignment/assign", {
          leadId: getLeadId(lead),
          employeeId: employee.id,
          method: method === "drag-drop" ? "manual" : method,
        }, { headers: getAdminCrmHeaders() });
        invalidateCache("/api/v1");
        setLeads((prev) => prev.map((l) => (
          String(getLeadId(l)) === String(getLeadId(lead))
            ? {
                ...l,
                assignedTo: { id: employee.id, name: employee.name },
                assigned_to: employee.id,
                assignment_status: "assigned",
                assignee_name: employee.name,
                owner: employee.name,
                employeeName: employee.name,
              }
            : l
        )));
      } catch {
        // local assignment still applied for offline/demo mode
      }

      showToast(`Assigned to ${employee.name}`);
    },
    [assignState],
  );

  /** Round-robin / workload / skill distribution only updates local state — this
   *  persists each resulting lead→employee assignment to the backend so employees
   *  actually receive the lead, instead of it only looking assigned in this admin view. */
  const persistDistributedAssignments = useCallback(async (newAssignments) => {
    if (!newAssignments?.length) return;
    const results = await Promise.allSettled(
      newAssignments.map(({ leadId, employee, method }) =>
        apiPost("/api/v1/assignment/assign", {
          leadId,
          employeeId: employee.id,
          method,
        }, { headers: getAdminCrmHeaders() }),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed) {
      showToast(`${failed} of ${newAssignments.length} assignments failed to save — they'll retry on next distribution`, "error");
    }
    invalidateCache("/api/v1");
    const byLeadId = new Map(newAssignments.map((a) => [String(a.leadId), a.employee]));
    setLeads((prev) => prev.map((l) => {
      const emp = byLeadId.get(String(getLeadId(l)));
      return emp
        ? {
            ...l,
            assignedTo: { id: emp.id, name: emp.name },
            assigned_to: emp.id,
            assignment_status: "assigned",
            assignee_name: emp.name,
            owner: emp.name,
            employeeName: emp.name,
          }
        : l;
    }));
  }, []);

  const handleBulkAssign = async (employee) => {
    const toAssign = filtered.filter((l) => selected.has(String(getLeadId(l))));
    if (!toAssign.length) return showToast("Select leads first", "error");
    const leadIds = toAssign.map((l) => getLeadId(l));

    try {
      await apiPost("/api/v1/assignment/bulk-assign", {
        leadIds,
        employeeId: employee.id,
        method: "bulk",
      }, { headers: getAdminCrmHeaders() });
      invalidateCache("/api/v1");
      const next = bulkAssign(assignState, toAssign, employee, "bulk");
      setAssignState(next);
      setLeads((prev) => prev.map((l) => (
        leadIds.includes(String(getLeadId(l)))
          ? { ...l, assignedTo: { id: employee.id, name: employee.name } }
          : l
      )));
      setSelected(new Set());
      setBulkOpen(false);
      showToast(`${toAssign.length} leads assigned to ${employee.name}`);
    } catch (err) {
      showToast(err.message || "Bulk assign failed", "error");
    }
  };

  const handleScheduleAssign = async () => {
    const toAssign = filtered.filter((l) => selected.has(String(getLeadId(l))));
    if (!toAssign.length) return showToast("Select leads first", "error");
    if (!scheduleEmployeeId) return showToast("Select an employee", "error");
    if (!scheduleStartDate) return showToast("Select a start date", "error");
    const parsedLpd = parseInt(leadsPerDay);
    if (!parsedLpd || parsedLpd <= 0) return showToast("Leads per day must be greater than 0", "error");

    const emp = employees.find((e) => String(e.id) === String(scheduleEmployeeId));
    if (!emp) return showToast("Invalid employee selected", "error");

    const leadIds = toAssign.map((l) => getLeadId(l));

    try {
      await apiPost("/api/v1/assignment/schedule-assign", {
        leadIds,
        employeeId: emp.id,
        startDate: scheduleStartDate,
        leadsPerDay: parsedLpd,
      }, { headers: getAdminCrmHeaders() });
      invalidateCache("/api/v1");

      const daysCount = Math.ceil(toAssign.length / parsedLpd);
      showToast(`${toAssign.length} leads scheduled to ${emp.name} over ${daysCount} days.`);
      
      setSelected(new Set());
      setBulkOpen(false);
      setBulkTab("immediate");
      setScheduleEmployeeId("");
    } catch (err) {
      showToast(err.message || "Failed to schedule leads", "error");
    }
  };

  const handleDropOnEmployee = (cardEmp, dragOverOnly, droppedEmployee) => {
    if (dragOverOnly === true) {
      setDropTarget(cardEmp?.id);
      return;
    }
    setDropTarget(null);
    if (!droppedEmployee || !dragLeadId) return;
    const lead = leads.find((l) => String(getLeadId(l)) === dragLeadId);
    const target = employees.find((e) => e.id === droppedEmployee.id);
    if (lead && target) handleAssign(lead, target, "drag-drop");
    setDragLeadId(null);
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((l) => String(getLeadId(l)))));
  };

  const rrOrder = useMemo(() => {
    const rotatable = employees.filter(
      (e) => String(e.status || "active").toLowerCase() !== "inactive"
        && String(e.status || "").toLowerCase() !== "on_leave",
    );
    const order = assignState.distribution.roundRobinOrder?.length
      ? assignState.distribution.roundRobinOrder
      : rotatable.map((e) => e.id);

    const buildRow = (emp, i) => {
      const s = assignState.employeeSettings[String(emp.id)] || {};
      return {
        order: i + 1,
        id: emp.id,
        name: emp.name,
        paused: s.receivingPaused,
        today: assignState.todayStats?.byEmployee?.[String(emp.id)] || 0,
      };
    };

    const mapped = order
      .map((id, i) => {
        const emp = employees.find((e) => String(e.id) === String(id));
        if (!emp) return null;
        return buildRow(emp, i);
      })
      .filter(Boolean);

    if (mapped.length) return mapped;
    return rotatable.map((emp, i) => buildRow(emp, i));
  }, [assignState, employees]);

  const leadAudit = (lead) => {
    if (!lead) return [];
    const lid = String(getLeadId(lead));
    return assignState.auditLog.filter((e) => e.leadId === lid);
  };

  const handleAddClose = (newLead) => {
    if (newLead && typeof newLead === "object") {
      const withSource = { ...newLead, source: newLead.source || "Manual" };
      setLeads((prev) => [withSource, ...prev]);
    }
    setAddOpen(false);
  };

  const modeLabels = {
    "round-robin": "Round Robin",
    workload: "Workload-based",
    skill: "Skill-based",
  };

  return (
    <div className="space-y-4 pb-6 page-shell min-w-0">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard label="In Queue" value={metrics.total} icon={Users} tone="primary" change={`${metrics.total} unassigned`} sub="N8N & manual only" />
        <StatCard label="Pickup" value={metrics.pickup} icon={PhoneCall} tone="info" change={metrics.pickup ? "Awaiting assignment" : "Queue clear"} sub="" />
        <StatCard label="Hot Leads" value={metrics.hotLeads} icon={Flame} tone="warning" change={metrics.hotLeads ? "High intent" : "None hot right now"} sub="" />
        <StatCard label="Converted" value={metrics.converted} icon={Target} tone="success" change="Closed won" sub="" />
            </div>

      {/* Round Robin center */}
      <GlassCard className="p-0 overflow-hidden">
        <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-rose-100 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 shrink-0">
            <Shuffle className="w-4 h-4 text-rose-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">Round Robin Distribution</p>
              <p className="text-[10px] text-slate-500 truncate">
                {modeLabels[assignState.distribution.mode]} · {assignState.distribution.autoAssign ? "Auto ON" : "Auto OFF"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap md:flex-nowrap items-center gap-1.5 w-full md:w-auto md:justify-end">
            <div className={`${SEGMENT_WRAP} w-full md:w-auto`}>
              <button
                type="button"
                onClick={() => setAssignState(setDistributionMode(assignState, "round-robin"))}
                className={`${SEGMENT_BTN} ${SEGMENT_BTN_ACTIVE}`}
              >
                Round Robin
              </button>
            </div>
            <button
              type="button"
              onClick={() => setAssignState(setAutoAssign(assignState, !assignState.distribution.autoAssign))}
              className={`${PERIOD_PILL_BTN} ${PERIOD_PILL_INACTIVE}`}
            >
              {assignState.distribution.autoAssign ? "Disable Auto" : "Enable Auto"}
            </button>
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className={`${PERIOD_PILL_BTN} ${PERIOD_PILL_INACTIVE} inline-flex items-center gap-1`}
            >
              <Upload size={12} /> Upload Sheet
            </button>
            <button
              type="button"
              onClick={() => {
                if (selected.size === 0) {
                  showToast("Select leads in the queue, choose a mode, then Run Now", "error");
                  return;
                }
                const selectedLeads = leads.filter((l) =>
                  selected.has(String(getLeadId(l))),
                );

                const { state: next, assignedCount, newAssignments } = runDistributionNow(
                  assignState,
                  employees,
                  leads,
                  selectedLeads,
                );
                setAssignState(next);
                if (assignedCount === 0) {
                  showToast(
                    "Could not assign — reps may be paused, on leave, or at capacity",
                    "error",
                  );
                } else {
                  showToast(
                    `${assignedCount} selected lead${assignedCount === 1 ? "" : "s"} assigned via ${modeLabels[assignState.distribution.mode]}`,
                  );
                  setSelected(new Set());
                  persistDistributedAssignments(newAssignments);
                }
              }}
              className={`${PERIOD_PILL_BTN} bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 flex items-center gap-1`}
            >
              <Zap size={11} /> Run Now
              {selected.size > 0 && (
                <span className="ml-0.5 px-1 py-0 rounded bg-emerald-600 text-white text-[9px]">
                  {selected.size}
                </span>
              )}
            </button>
          </div>
        </div>
        {/* Mobile: stacked list + stat cards */}
        <div className="p-3 sm:p-4 md:hidden">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Allocation Order</p>
          <div className="space-y-1">
            {rrOrder.map((r) => (
              <div
                key={r.id ?? r.order}
                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border ${
                  r.paused ? "bg-amber-50/80 border-amber-200" : "bg-white border-rose-100"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 grid place-items-center text-[9px] font-black shrink-0">
                    {r.order}
                  </span>
                  <span className={`text-[11px] font-semibold truncate ${r.paused ? "text-amber-800" : "text-slate-700"}`}>
                    {r.name}
                  </span>
                </div>
                {r.today > 0 && (
                  <Badge tone="success">
                    <span className="text-[9px]">{r.today} today</span>
                  </Badge>
                )}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="rounded-lg bg-rose-50/80 px-2 py-2 text-center">
              <p className="text-[9px] font-bold text-slate-500 uppercase">Assigned Today</p>
              <p className="text-lg font-black text-rose-700 leading-tight">{assignState.todayStats?.total || 0}</p>
            </div>
            <div className="rounded-lg bg-emerald-50/80 px-2 py-2 text-center">
              <p className="text-[9px] font-bold text-slate-500 uppercase">Active Reps</p>
              <p className="text-lg font-black text-emerald-700 leading-tight">
                {employees.filter((e) => {
                  const s = assignState.employeeSettings[String(e.id)] || {};
                  return !s.receivingPaused && e.status !== "inactive";
                }).length}
              </p>
            </div>
          </div>
        </div>

        {/* Desktop: allocation pills + stats in one row (wraps to 2nd row if needed) */}
        <div className="hidden md:block p-3 sm:p-4">
          <div className="flex items-end gap-3 flex-wrap xl:flex-nowrap">
            <div className="flex-1 min-w-[280px]">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Allocation Order</p>
              <div className="flex flex-wrap gap-1.5">
                {rrOrder.map((r) => (
                  <span
                    key={r.id ?? r.order}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border whitespace-nowrap ${
                      r.paused ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-white border-rose-100 text-slate-700"
                    }`}
                  >
                    <span className="w-5 h-5 rounded-md bg-rose-100 text-rose-700 grid place-items-center text-[9px] shrink-0">
                      {r.order}
                    </span>
                    {r.name}
                    {r.today > 0 && (
                      <Badge tone="success">
                        <span className="text-[9px]">{r.today} today</span>
                      </Badge>
                    )}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex gap-2 shrink-0 ml-auto">
              <div className="rounded-lg bg-rose-50/80 px-3 py-2 text-center min-w-[96px]">
                <p className="text-[9px] font-bold text-slate-500 uppercase whitespace-nowrap">Assigned Today</p>
                <p className="text-xl font-black text-rose-700 leading-tight">{assignState.todayStats?.total || 0}</p>
              </div>
              <div className="rounded-lg bg-emerald-50/80 px-3 py-2 text-center min-w-[96px]">
                <p className="text-[9px] font-bold text-slate-500 uppercase whitespace-nowrap">Active Reps</p>
                <p className="text-xl font-black text-emerald-700 leading-tight">
                  {employees.filter((e) => {
                    const s = assignState.employeeSettings[String(e.id)] || {};
                    return !s.receivingPaused && e.status !== "inactive";
                  }).length}
                </p>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Main two-column — right column stretches to match left card height */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 sm:gap-4 items-stretch min-w-0">
        {/* Lead queue */}
        <div className="xl:col-span-2 flex flex-col h-full min-h-0 min-w-0">
          <div style={cardBase} className="overflow-hidden flex flex-col flex-1 h-full min-w-0">
            <div className="px-3 sm:px-4 py-2.5 border-b border-rose-50">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                {/* Search + filters */}
                <div className="flex flex-row items-center gap-2 shrink-0">
                  <div className="relative w-[180px] sm:w-[220px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-rose-300 pointer-events-none" />
                    <input
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder="Search queue…"
                      className="w-full h-8 pl-8 pr-2.5 rounded-lg border border-rose-100 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-rose-400 bg-white"
                    />
                  </div>
                  <span className="inline-flex items-center h-5 px-2 rounded-full text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-100/50 whitespace-nowrap">
                    {showSheetLeadsOnly ? "Sheet Uploads" : "N8N & Manual"}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(true)}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 h-8 px-2.5 rounded-lg border border-rose-200 text-rose-700 text-[10px] sm:text-[11px] font-bold hover:bg-rose-50 transition whitespace-nowrap"
                  >
                    <History size={12} /> Audit Log
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSheetLeadsOnly(!showSheetLeadsOnly)}
                    className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 h-8 px-2.5 rounded-lg border text-[10px] sm:text-[11px] font-bold transition whitespace-nowrap ${
                      showSheetLeadsOnly
                        ? "bg-rose-600 border-rose-600 text-white shadow-glow hover:opacity-95"
                        : "border-rose-200 text-rose-700 hover:bg-rose-50"
                    }`}
                  >
                    <FileSpreadsheet size={12} /> {showSheetLeadsOnly ? "Showing Sheet" : "Sheet Only"}
                  </button>
                  {selected.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setBulkOpen(true)}
                      className="inline-flex items-center justify-center gap-1 h-8 px-2.5 rounded-lg border border-rose-200 text-rose-700 text-[10px] sm:text-[11px] font-bold hover:bg-rose-50 transition whitespace-nowrap"
                    >
                      <Layers size={12} /> Bulk ({selected.size})
            </button>
          )}
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 h-8 px-2.5 rounded-lg gradient-primary text-white text-[10px] sm:text-[11px] font-bold shadow-glow hover:opacity-95 transition whitespace-nowrap"
                  >
                    <Plus size={12} /> New Lead
                  </button>
                </div>
              </div>
        </div>

            <div className="max-h-[480px] overflow-y-auto">
              {loading ? (
                <p className="p-6 text-center text-rose-300 font-semibold text-xs">Loading queue…</p>
              ) : filtered.length === 0 ? (
                <p className="p-6 text-center text-slate-400 text-xs">No unassigned N8N or manual leads in queue</p>
              ) : isMobile ? (
                <div className="p-2 sm:p-3 flex flex-col gap-2">
                  {filtered.map((lead) => {
                    const lid = String(getLeadId(lead));
                    return (
                      <div
                        key={lid}
                        draggable
                        onDragStart={() => setDragLeadId(lid)}
                        onDragEnd={() => setDragLeadId(null)}
                        className="rounded-xl border border-rose-100 bg-white p-2.5 active:bg-rose-50/30"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="shrink-0 w-3.5 h-3.5"
                            checked={selected.has(lid)}
                            onChange={() => toggleSelect(lid)}
                          />
                          <button type="button" onClick={() => setDetailLead(lead)} className="text-left flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate leading-tight">{lead.lead_name || "—"}</p>
                            <p className="text-[10px] text-slate-500 truncate tabular-nums">{getLeadPhone(lead)}</p>
                          </button>
                          <GripVertical size={14} className="text-rose-300 shrink-0" />
                        </div>
                        <div className="flex flex-wrap items-center gap-1 mt-1.5 pl-5">
                          <span className="text-[10px] font-semibold text-slate-600 truncate">{getLeadService(lead)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr>
                    <th className="p-2 w-8">
                      <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                    </th>
                    <th className="p-2 text-left text-[9px] font-bold text-rose-700 uppercase tracking-wider">Lead</th>
                    <th className="p-2 text-left text-[9px] font-bold text-rose-700 uppercase tracking-wider">Phone</th>
                    <th className="p-2 text-left text-[9px] font-bold text-rose-700 uppercase tracking-wider">Service</th>
                    <th className="p-2 w-8" />
                </tr>
              </thead>
              <tbody>
                  {filtered.map((lead) => {
                    const lid = String(getLeadId(lead));
                    return (
                      <tr
                        key={lid}
                        draggable
                        onDragStart={() => setDragLeadId(lid)}
                        onDragEnd={() => setDragLeadId(null)}
                        className="border-t border-rose-50/80 hover:bg-rose-50/40 cursor-grab active:cursor-grabbing"
                      >
                        <td className="p-2">
                          <input type="checkbox" checked={selected.has(lid)} onChange={() => toggleSelect(lid)} />
                        </td>
                        <td className="p-2">
                          <button type="button" onClick={() => setDetailLead(lead)} className="text-left">
                            <p className="text-xs font-bold text-slate-900">{lead.lead_name || "—"}</p>
                          </button>
                        </td>
                        <td className="p-2">
                          <span className="text-[11px] font-semibold text-slate-700 tabular-nums">{getLeadPhone(lead)}</span>
                        </td>
                        <td className="p-2">
                          <span className="text-[10px] font-semibold text-slate-600">{getLeadService(lead)}</span>
                        </td>
                        <td className="p-2 text-rose-300">
                          <GripVertical size={14} />
                          </td>
                      </tr>
                        );
                      })}
              </tbody>
            </table>
              </div>
              )}
            </div>
            <div className="px-3 sm:px-4 py-2 border-t border-rose-50 text-[9px] sm:text-[10px] text-slate-400">
              N8N & manual unassigned leads · drag onto employee cards · {filtered.length} in queue
            </div>
          </div>
          </div>

        {/* Employee workload panel */}
        <div className="flex flex-col min-h-0 min-w-0 self-start w-full">
          <div style={cardBase} className="flex flex-col overflow-hidden min-w-0">
            <div className="px-3 sm:px-4 py-2.5 border-b border-rose-50 shrink-0">
              <p className="text-xs font-bold text-slate-900">Employee Workload</p>
              <p className="text-[10px] text-slate-500">Drop leads here to assign</p>
            </div>
            <div className="flex flex-col">
              <div
                className="overflow-y-auto overflow-x-hidden px-3 pt-3 pb-2 space-y-2 shrink-0 scrollbar-thin"
                style={{
                  height: employeeListViewportPx(employees.length),
                  maxHeight: employeeListViewportPx(employees.length),
                }}
              >
            {employees.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No team members loaded</p>
            ) : (
              employees.map((emp) => {
                const stats = workload[emp.id] || { assigned: 0, active: 0, converted: 0, followUps: 0 };
                const settings = assignState.employeeSettings[String(emp.id)] || {};
                const cap = settings.maxCapacity ?? 15;
                const utilPct = cap > 0 ? Math.round((stats.active / cap) * 100) : 0;
                const status = workloadStatus(utilPct);
                return (
                  <EmployeeCard
                    key={emp.id}
                    emp={emp}
                    stats={stats}
                    status={status}
                    paused={settings.receivingPaused}
                    onTogglePause={(id) => setAssignState(toggleEmployeeReceiving(assignState, id))}
                    onDrop={(a, b) => handleDropOnEmployee(emp, a, b)}
                    dragOver={dropTarget === emp.id}
                  />
                );
              })
            )}
              </div>
              {employees.length > VISIBLE_EMPLOYEE_COUNT && (
                <p className="px-4 pb-3 pt-1 text-[10px] font-semibold text-slate-400 text-center shrink-0">
                  Scroll for {employees.length - VISIBLE_EMPLOYEE_COUNT} more team member{employees.length - VISIBLE_EMPLOYEE_COUNT === 1 ? "" : "s"}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>



      <AddLeadDrawer open={addOpen} onClose={handleAddClose} showToast={showToast} />

      <UploadLeadsDrawer open={uploadOpen} onClose={() => setUploadOpen(false)} showToast={showToast} onUploadSuccess={loadData} />

      <LeadDetailDrawer
        open={!!detailLead}
        onClose={closeDetailLead}
        lead={detailLead}
        editable
        onSave={(updates) => saveLeadDetails(getLeadId(detailLead), updates)}
      />

      <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} title="Assignment Audit Log">
        <ul className="space-y-3 max-h-[70vh] overflow-y-auto">
          {assignState.auditLog.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No assignment events yet</p>
          ) : (
            assignState.auditLog.map((e) => (
              <li key={e.id} className="rounded-xl border border-rose-100 p-3 text-sm">
                <span className="font-bold capitalize text-slate-800">{e.action}</span>
                {" — "}
                <span className="text-slate-600">{e.leadName}</span>
                {" → "}
                <span className="text-rose-700 font-semibold">{e.employeeName || "—"}</span>
                <p className="text-[11px] text-slate-400 mt-1">
                  {new Date(e.at).toLocaleString()} · {e.method}
                </p>
              </li>
            ))
          )}
        </ul>
      </Drawer>

      <Drawer open={bulkOpen} onClose={() => setBulkOpen(false)} title={`Bulk Actions (${selected.size} leads)`}>
        <div className="flex border-b border-rose-100 mb-4">
          <button
            type="button"
            className={`flex-1 pb-2 text-xs font-bold transition-all border-b-2 ${
              bulkTab === "immediate"
                ? "border-rose-600 text-rose-600"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
            onClick={() => setBulkTab("immediate")}
          >
            Assign Immediately
          </button>
          <button
            type="button"
            className={`flex-1 pb-2 text-xs font-bold transition-all border-b-2 ${
              bulkTab === "schedule"
                ? "border-rose-600 text-rose-600"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
            onClick={() => setBulkTab("schedule")}
          >
            Schedule Distribution
          </button>
        </div>

        {bulkTab === "immediate" ? (
          <div>
            <p className="text-xs text-slate-500 mb-3">Select an employee to assign all {selected.size} leads immediately.</p>
            <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-1">
              {employees.map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => handleBulkAssign(emp)}
                  className="w-full text-left px-4 py-3 rounded-xl border border-rose-100 hover:border-rose-400 hover:bg-rose-50 font-semibold text-slate-800 transition"
                >
                  {emp.name}
                  <span className="text-xs text-slate-400 block">{emp.department || emp.role}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-slate-700 text-xs">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Assign to Employee</label>
              <select
                value={scheduleEmployeeId}
                onChange={(e) => setScheduleEmployeeId(e.target.value)}
                className="w-full border border-rose-100 rounded-lg px-3 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:border-rose-400"
              >
                <option value="">-- Choose Employee --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.department || emp.role})
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Start Date</label>
              <input
                type="date"
                value={scheduleStartDate}
                onChange={(e) => setScheduleStartDate(e.target.value)}
                className="w-full border border-rose-100 rounded-lg px-3 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:border-rose-400"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Leads Per Day</label>
              <input
                type="number"
                min="1"
                value={leadsPerDay}
                onChange={(e) => setLeadsPerDay(e.target.value)}
                className="w-full border border-rose-100 rounded-lg px-3 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:border-rose-400"
              />
            </div>

            {scheduleEmployeeId && parseInt(leadsPerDay) > 0 && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-800 text-[11px] leading-relaxed">
                <strong>Schedule Summary:</strong>
                <p className="mt-1">
                  Distributing <strong>{selected.size}</strong> leads to <strong>
                    {employees.find((e) => String(e.id) === String(scheduleEmployeeId))?.name}
                  </strong> at <strong>{leadsPerDay}</strong> leads per day.
                </p>
                <p className="mt-1 text-[10px] text-rose-600/90 font-medium">
                  This will take <strong>{Math.ceil(selected.size / parseInt(leadsPerDay))} days</strong> to complete.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleScheduleAssign}
              className="w-full py-2.5 rounded-lg gradient-primary text-white text-xs font-bold shadow-glow hover:opacity-95 transition"
            >
              Schedule Distribution
            </button>
          </div>
        )}
      </Drawer>

      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-6 right-6 z-[9999] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-medium"
          style={{
            background: toast.type === "success" ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${toast.type === "success" ? "#bbf7d0" : "#fecdd3"}`,
            color: toast.type === "success" ? "#15803d" : "#be123c",
          }}
        >
          {toast.type === "success" ? <CheckCircle2 size={16} /> : <X size={16} />}
          {toast.message}
        </motion.div>
      )}
    </div>
  );
}
