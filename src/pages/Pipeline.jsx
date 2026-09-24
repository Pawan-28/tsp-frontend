import { useEffect, useMemo, useRef, useState, useDeferredValue, memo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Search, Plus, Kanban, Flame, TrendingUp, Thermometer, Snowflake, ThumbsDown, Phone } from "lucide-react";
import toast from "react-hot-toast";
import { GlassCard, Badge, StatCard } from "../components/Primitives.jsx";
import AddLeadDrawer from "../components/AddLeadDrawer.jsx";
import PipelineLeadDrawer from "../components/pipeline/PipelineLeadDrawer.jsx";
import { formatTelUrl } from "../lib/phoneUtils.js";
import {
  PIPELINE_STAGES,
  PRIORITY_BADGE,
  formatPipelineValue,
  getPipelineSummary,
  getStageMeta,
  leadFromForm,
  patchLead,
} from "../data/pipelineMock.js";
import { apiPatch, invalidateCache } from "../lib/api.js";
import { getAdminCrmHeaders } from "../lib/crmContext.js";
import { useAdmin } from "../context/AdminContext.jsx";
import { adminPipelineIdToDbStage } from "../lib/leadSync.js";
import useIsMobile from "../lib/useIsMobile.js";
import { SEGMENT_WRAP, SEGMENT_BTN, SEGMENT_BTN_ACTIVE, SEGMENT_BTN_INACTIVE } from "../lib/segmentPills.js";
import { CALL_CONVERSATION_LABEL, CALL_SHORT_LABEL } from "../lib/callMetrics.js";
import { usePipelineBoard, visibleKanbanColumnLeads, hiddenKanbanColumnCount } from "../lib/usePipelineBoard.js";
import { usePipelineSync, invalidatePipelineBoardCache } from "../lib/usePipelineSync.js";
import { resolveLeadKanbanColumn, getPipelineStagePillCount } from "../lib/leadKanban.js";
import { filterLeadsByActivityPeriod } from "../lib/periodFilter.js";
import { buildLeadActivityLabelMap } from "../lib/callDisplay.js";
import { onLeadChanged, onDashboardRefresh, markLocalLeadChange } from "../lib/realtime.js";
import { CANONICAL_SERVICES } from "../lib/servicesRegistry.js";

function startLeadCardDrag(e, leadId, onDragStart) {
  e.dataTransfer.setData("text/plain", String(leadId));
  e.dataTransfer.setData("text/lead-id", String(leadId));
  e.dataTransfer.effectAllowed = "move";
  onDragStart?.();
}

function isDraggablePipelineLead(lead) {
  if (!lead || lead._fromCall || lead._fromMeeting) return false;
  const dbId = lead._dbId ?? lead.id;
  return /^\d+$/.test(String(dbId));
}

const LeadCard = memo(function LeadCard({ lead, lastLabel, onOpen, isDragging, onDragStart, onDragEnd, onMoveStage, currentStage }) {
  const priorityTone = PRIORITY_BADGE[lead.priority] || "muted";
  const canDrag = isDraggablePipelineLead(lead);

  const rawPhone = lead.phone || lead.phone_number || "";
  const cleanDigits = String(rawPhone).replace(/\D/g, "");
  const formattedPhone = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : (rawPhone || "No Number");

  const rawName = String(lead.name || "").trim();
  const hasValidName = rawName && !/^unknown$/i.test(rawName) && rawName !== "Lead";
  const displayName = hasValidName ? rawName : formattedPhone;

  const displayService = lead.service || lead.requirements || lead.serviceName || lead.service_name || "—";

  return (
    <div
      draggable={canDrag}
      onDragStart={(e) => {
        if (!canDrag) {
          e.preventDefault();
          return;
        }
        startLeadCardDrag(e, lead._dbId ?? lead.id, onDragStart);
      }}
      onDragEnd={onDragEnd}
      className={`rounded-xl border border-rose-100 bg-white transition group shrink-0 w-[min(78vw,215px)] sm:w-full sm:shrink snap-start ${
        canDrag ? "cursor-grab active:cursor-grabbing select-none" : ""
      } ${isDragging ? "opacity-40 scale-[0.98]" : "hover:border-rose-300 hover:shadow-md"}`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className="w-full text-left p-3"
      >
        <div className="flex items-start justify-between gap-1.5 mb-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-slate-900 truncate group-hover:text-rose-800 transition tabular-nums" title={displayName}>
              {displayName}
            </p>
            <p className="text-[10px] text-slate-500 truncate mt-0.5" title={displayService}>
              {displayService}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {rawPhone ? (
              <button
                type="button"
                title={`Call ${displayName}`}
                onClick={(e) => {
                  e.stopPropagation();
                  const url = formatTelUrl(rawPhone);
                  if (url) window.location.href = url;
                }}
                className="sm:hidden inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 shrink-0 transition active:scale-95 shadow-sm"
              >
                <Phone className="w-3 h-3 fill-rose-600 text-rose-600" />
              </button>
            ) : null}
            <Badge tone={priorityTone}>{lead.priority}</Badge>
          </div>
        </div>

        {canDrag && onMoveStage && (
          <div className="block sm:hidden mb-2">
            <select
              value={currentStage || lead.pipelineStage || lead.stage || ""}
              onChange={(e) => {
                e.stopPropagation();
                onMoveStage(lead._dbId ?? lead.id, e.target.value);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-rose-50/50 hover:bg-rose-50 text-[9px] font-black text-rose-700 border border-rose-200/80 rounded px-1.5 py-0.5 outline-none appearance-none pr-4"
              style={{
                background: 'url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23be123c\' stroke-width=\'3.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E") no-repeat right 3px center/8px',
                paddingRight: '12px'
              }}
            >
              <option value="" disabled style={{ color: '#64748b', backgroundColor: '#ffffff' }}>Move stage...</option>
              {PIPELINE_STAGES.map((s) => (
                <option key={s.id} value={s.id} style={{ color: '#1e293b', backgroundColor: '#ffffff' }}>
                  {s.id === "conversation_2min" ? "Convo" : s.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-rose-50">
          <span className="text-xs font-black text-rose-700 tabular-nums">{formatPipelineValue(lead.value)}</span>
          <span className="text-[9px] font-medium text-slate-400">{lastLabel}</span>
        </div>
      </div>
    </div>
  );
});

export default function Pipeline() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const [leads, setLeads] = useState([]);
  const [search, setSearch] = useState("");
  const [activeStage, setActiveStage] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [dragLeadId, setDragLeadId] = useState(null);
  const [dropStageId, setDropStageId] = useState(null);
  const columnRefs = useRef({});
  const dropDepthRef = useRef(0);
  const period = String(searchParams.get("period") || "month").toLowerCase();
  const deferredPeriod = useDeferredValue(period);
  const isBoardStale = deferredPeriod !== period;
  const periodLabel = period === "today" ? "Today" : period === "week" ? "This Week" : "This Month";
  const [groupRev, setGroupRev] = useState(0);
  const [expandedColumns, setExpandedColumns] = useState({});

  const {
    leads: syncedLeads,
    calls: syncedBoardCalls,
    meetings: boardMeetings,
    loading: boardLoading,
    syncing: boardSyncing,
    refreshLeadsOnly: refreshBoardLeads,
  } = usePipelineSync({
    scope: "admin",
    period: deferredPeriod,
    enabled: true,
    mapLeads: true,
  });

  useEffect(() => {
    if (!Array.isArray(syncedLeads)) return;
    setLeads((prev) => (prev === syncedLeads ? prev : syncedLeads));
  }, [syncedLeads]);

  // Live sync — a stage change made elsewhere (employee app, another device) refetches this board.
  useEffect(() => {
    let timer = null;
    const refetch = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        refreshBoardLeads();
      }, 400);
    };
    const offLead = onLeadChanged(refetch);
    const offDashboard = onDashboardRefresh(refetch);
    return () => {
      if (timer) window.clearTimeout(timer);
      offLead();
      offDashboard();
    };
  }, [refreshBoardLeads]);

  const periodCalls = syncedBoardCalls || [];

  useEffect(() => {
    setExpandedColumns({});
  }, [period]);

  const meetings = boardMeetings || [];
  const leadsLoading = boardLoading;
  const callsSyncing = boardSyncing;

  const handleDragEnter = (stageId) => {
    dropDepthRef.current += 1;
    setDropStageId(stageId);
  };

  const handleDragLeave = () => {
    dropDepthRef.current = Math.max(0, dropDepthRef.current - 1);
    if (dropDepthRef.current === 0) setDropStageId(null);
  };

  const handleDrop = (e, stageId) => {
    e.preventDefault();
    dropDepthRef.current = 0;
    setDropStageId(null);
    setDragLeadId(null);
    const id = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("text/lead-id");
    if (id) moveLeadToStage(id, stageId);
  };

  const openLeadDetail = (lead) => setSelectedLead(lead);

  useEffect(() => {
    if (new URLSearchParams(location.search).get("action") === "addLead") {
      setAddOpen(true);
    }
  }, [location.search]);

  const showToast = (message, type = "success") => {
    if (type === "error") toast.error(message);
    else toast.success(message);
  };

  const handleAddClose = (newLead) => {
    if (newLead && typeof newLead === "object") {
      const pipelineLead = leadFromForm(newLead);
      setLeads((prev) => [pipelineLead, ...prev]);
      scrollToStage(pipelineLead.stage);
    }
    setAddOpen(false);
    if (new URLSearchParams(location.search).get("action") === "addLead") {
      navigate("/pipeline", { replace: true });
    }
  };

  const { selectedService, setSelectedService, servicesList, selectedEmployee, setSelectedEmployee, employeesList } = useAdmin();

  const filtered = useMemo(() => {
    let list = leads || [];
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");

    if (q) {
      list = list.filter((l) => {
        const name = String(l?.name || l?.lead_name || l?.leadName || "").toLowerCase();
        const company = String(l?.company || l?.company_name || l?.companyName || "").toLowerCase();
        const phone = String(l?.phone || l?.phone_number || l?.mobile || l?.clientPhone || "").toLowerCase();
        const phoneDigits = phone.replace(/\D/g, "");
        const email = String(l?.email || "").toLowerCase();
        const service = String(l?.service || l?.requirements || "").toLowerCase();
        const source = String(l?.source || "").toLowerCase();

        // 1. Text match on name, company, email, service, source
        if (
          name.includes(q) ||
          company.includes(q) ||
          email.includes(q) ||
          service.includes(q) ||
          source.includes(q)
        ) {
          return true;
        }

        // 2. Direct string phone match
        if (phone && phone.includes(q)) return true;

        // 3. Digit match on phone (e.g. typing 9810... matches +919810... or 9810...)
        if (qDigits && phoneDigits) {
          if (
            phoneDigits.includes(qDigits) ||
            qDigits.includes(phoneDigits.slice(-10)) ||
            phoneDigits.slice(-10).includes(qDigits)
          ) {
            return true;
          }
        }

        return false;
      });
    }

    if (selectedService && selectedService !== "All Services") {
      list = list.filter((l) => l.service === selectedService || l.requirements === selectedService);
    }
    if (selectedEmployee && selectedEmployee !== "All Employees") {
      const empLower = selectedEmployee.toLowerCase();
      list = list.filter((l) => {
        const ownerName = String(
          l.owner || l.assignee || l.employeeName || l.assigned_employee || (typeof l.assignedTo === "object" ? l.assignedTo?.name : "") || ""
        ).toLowerCase();
        return ownerName.includes(empLower) || empLower.includes(ownerName);
      });
    }
    return list;
  }, [leads, search, selectedService, selectedEmployee]);

  const deferredFiltered = useDeferredValue(filtered);

  const {
    callScopedOnly,
    grouped,
    stageDisplayCounts,
    syncedConversationCalls,
    syncedShortCalls,
    syncedNotPickupCalls,
    periodMeetings,
    moveLeadLocally,
  } = usePipelineBoard({
    leads,
    period: deferredPeriod,
    periodCalls,
    callsLoading: boardLoading,
    callyzerStats: null,
    meetings,
    adminScope: false,
    includeUncontactedAssignments: true,
    scopeCallsByAssignee: true,
    visibleLeads: deferredFiltered,
    groupRev,
  });

  const activityLabelMap = useMemo(
    () => buildLeadActivityLabelMap(grouped, periodCalls),
    [grouped, periodCalls],
  );

  const kanbanLeads = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const stage of PIPELINE_STAGES) {
      for (const lead of grouped[stage.id] || []) {
        const id = String(lead.id);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(lead);
      }
    }
    return out;
  }, [grouped]);

  const summaryLeads = useMemo(
    () => (period === "all" ? filtered : (kanbanLeads.length > 0 ? kanbanLeads : filterLeadsByActivityPeriod(filtered, period))),
    [period, filtered, kanbanLeads],
  );

  const summary = useMemo(
    () => getPipelineSummary(summaryLeads),
    [summaryLeads],
  );

  const getColumnCount = (stageId, columnLeads) => columnLeads.length;

  const getStagePillCount = (stageId, columnLeads) => getPipelineStagePillCount(stageId, { grouped }) || columnLeads.length;

  const scrollToStage = (stageId) => {
    setActiveStage(stageId);
    columnRefs.current[stageId]?.scrollIntoView({
      behavior: "smooth",
      inline: isMobile ? "nearest" : "start",
      block: isMobile ? "start" : "nearest",
    });
  };

  const applyLeadUpdate = (updated) => {
    markLocalLeadChange();
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    setSelectedLead((current) => (current?.id === updated.id ? updated : current));
  };

  const handleUpdateLead = (updated) => {
    applyLeadUpdate(updated);
  };

  const moveLeadToStage = async (leadId, stageId, { scroll = true } = {}) => {
    const id = String(leadId);
    let lead = leads.find((l) => String(l.id) === id || String(l._dbId) === id);
    if (!lead) {
      for (const stage of PIPELINE_STAGES) {
        const fromCol = (grouped[stage.id] || []).find(
          (l) => String(l.id) === id || String(l._dbId) === id,
        );
        if (fromCol) {
          lead = fromCol;
          break;
        }
      }
    }
    if (!lead) {
      toast.error("This card can't be moved — it isn't linked to a CRM lead yet.");
      return;
    }
    if (!isDraggablePipelineLead(lead)) {
      toast.error("Link this Callyzer call to a lead before moving it.");
      return;
    }
    const currentStageId = resolveLeadKanbanColumn(lead, periodCalls, { scopeByAssignee: true });
    if (currentStageId === stageId) {
      if (scroll) scrollToStage(stageId);
      return;
    }
    const target = getStageMeta(stageId);
    const prevSnapshot = lead;
    const updated = patchLead(
      lead,
      { stage: stageId, pipelineStage: stageId, stageOverride: true },
      `Moved to ${target.label}`,
      stageId === "payment_complete" ? "won" : "note",
    );
    applyLeadUpdate(updated);
    if (moveLeadLocally) {
      moveLeadLocally(leadId, stageId);
    }
    if (scroll) scrollToStage(stageId);

    const dbId = lead._dbId || leadId;
    if (!dbId || !String(dbId).match(/^\d+$/)) {
      toast.success(`Moved to ${target.label}`);
      return;
    }

    const stageLabel = adminPipelineIdToDbStage(stageId);
    try {
      await apiPatch(`/api/v1/leads/${dbId}/stage`, { stage: stageLabel, status: stageLabel }, {
        headers: getAdminCrmHeaders(),
      });
      invalidateCache("/api/v1");
      invalidatePipelineBoardCache("admin");
      toast.success(`Moved to ${target.label}`);
    } catch {
      try {
        await apiPatch(`/api/dashboard/pipeline/leads/${dbId}`, { stage: stageId });
        invalidateCache("/api/dashboard");
        invalidatePipelineBoardCache("admin");
        toast.success(`Moved to ${target.label}`);
      } catch (err) {
        applyLeadUpdate(prevSnapshot);
        if (moveLeadLocally) {
          moveLeadLocally(leadId, currentStageId);
        }
        toast.error(err?.message || "Couldn't save the move — reverted. Check your connection and try again.");
      }
    }
  };

  return (
    <div className="space-y-4 page-shell min-w-0">

      <GlassCard className="p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <StatCard
            label="Pipeline Value"
            value={formatPipelineValue(summary.value)}
            icon={TrendingUp}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
            change=""
            sub=""
          />
          <StatCard
            label="Total Leads"
            value={leadsLoading && !leads.length ? "…" : String(summary.total)}
            icon={Kanban}
            iconBg="bg-rose-50"
            iconColor="text-rose-600"
            change={leadsLoading && !leads.length ? "Loading" : ""}
            sub={leadsLoading && !leads.length ? "fetching leads" : ""}
            corner={
              summary.hot > 0 ? (
                <span className="sm:hidden inline-flex items-center gap-0.5 text-[9px] font-black text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full shadow-sm">
                  🔥 {summary.hot}
                </span>
              ) : null
            }
          />
          <div className="hidden sm:block">
            <StatCard
              label="Hot Leads"
              value={String(summary.hot)}
              icon={Flame}
              iconBg="bg-red-50"
              iconColor="text-red-600"
              change="High intent"
              sub=""
            />
          </div>
          <StatCard
            label="Warm Leads"
            value={String(summary.warm)}
            icon={Thermometer}
            iconBg="bg-amber-50"
            iconColor="text-amber-500"
            change="Medium intent"
            sub=""
          />
          <StatCard
            label="Cold Leads"
            value={String(summary.cold)}
            icon={Snowflake}
            iconBg="bg-sky-50"
            iconColor="text-sky-500"
            change="Low intent"
            sub=""
          />
          <StatCard
            label="Not Interested"
            value={String(summary.notInterested)}
            icon={ThumbsDown}
            iconBg="bg-slate-50"
            iconColor="text-slate-500"
            change="Closed lost"
            sub=""
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 pt-1 border-t border-rose-50">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-300 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name, phone, or company..."
              className="w-full h-10 pl-9 pr-8 rounded-xl border border-rose-100 bg-white text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-bold transition"
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <div className="relative w-full sm:w-44 shrink-0">
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="w-full h-10 bg-white border border-rose-200 hover:border-rose-400 text-xs font-bold text-slate-800 px-3 rounded-xl outline-none transition cursor-pointer appearance-none pr-8 shadow-xs"
              style={{
                background: "url(\"data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23be123c' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\") no-repeat right 10px center/14px"
              }}
            >
              {(employeesList?.length ? employeesList : ["All Employees", "Ritik Verma", "Sarita", "Sushmit Verma", "Piyush Dhingra"]).map((empName) => (
                <option key={empName} value={empName}>{empName}</option>
              ))}
            </select>
          </div>

          <div className="relative w-full sm:w-44 shrink-0">
            <select
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              className="w-full h-10 bg-white border border-rose-200 hover:border-rose-400 text-xs font-bold text-slate-800 px-3 rounded-xl outline-none transition cursor-pointer appearance-none pr-8 shadow-xs truncate"
              style={{
                background: "url(\"data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23be123c' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\") no-repeat right 10px center/14px"
              }}
            >
              {(servicesList?.length ? servicesList : CANONICAL_SERVICES).map((s) => (
                <option key={s} value={s}>{s.length > 24 ? s.slice(0, 22) + "..." : s}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-full bg-rose-700 text-white text-xs font-bold hover:bg-rose-800 shadow-sm shrink-0 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Lead
          </button>
        </div>

        <div className={`${SEGMENT_WRAP} w-full -mx-0.5`}>
          {PIPELINE_STAGES.map((stage) => {
            const columnLeads = grouped[stage.id] || [];
            const count = getStagePillCount(stage.id, columnLeads);
            const active = activeStage === stage.id;
            let callHint = null;
            if (stage.id === "conversation_2min") {
              callHint = `${syncedConversationCalls} calls ${CALL_CONVERSATION_LABEL} · ${columnLeads.length} leads with 2 min+`;
            } else if (stage.id === "short_call") {
              callHint = `${syncedShortCalls} connected calls ${CALL_SHORT_LABEL} · ${columnLeads.length} leads in Short Call`;
            } else if (stage.id === "not_pick") {
              callHint = `${syncedNotPickupCalls} client no pickup · ${columnLeads.length} leads in Not Pick`;
            } else if (stage.id === "meeting_booked") {
              callHint = `${periodMeetings.filter((m) => m.status !== "completed" && m.status !== "cancelled").length} scheduled`;
            } else if (stage.id === "meeting_done") {
              callHint = `${periodMeetings.filter((m) => m.status === "completed").length} completed`;
            }
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => scrollToStage(stage.id)}
                title={callHint || undefined}
                className={`flex items-center gap-1 ${SEGMENT_BTN} ${
                  active ? SEGMENT_BTN_ACTIVE : SEGMENT_BTN_INACTIVE
                }`}
              >
                <span className="sm:hidden">{stage.label.split(" ")[0]}</span>
                <span className="hidden sm:inline">{stage.label}</span>
                <span className={`tabular-nums ${active ? "text-rose-600" : "text-slate-400"}`}>{count}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-400 px-0.5">
          {periodLabel} · Callyzer synced · {syncedShortCalls} short calls {CALL_SHORT_LABEL} ({grouped.short_call?.length || 0} leads) · {syncedConversationCalls} calls {CALL_CONVERSATION_LABEL} ({grouped.conversation_2min?.length || 0} leads) · {syncedNotPickupCalls} client no pickup ({grouped.not_pick?.length || 0} leads) · {periodMeetings.length} meetings
          {(callsSyncing) ? " · syncing in background…" : ""}
        </p>
      </GlassCard>

      <GlassCard className={`p-3 sm:p-4 overflow-hidden transition-opacity ${isBoardStale ? "opacity-70" : ""}`}>
        <p className="text-[10px] text-slate-400 mb-2.5 px-0.5">
          <span className="sm:hidden">Each stage is a row · swipe cards horizontally · tap for details</span>
          <span className="hidden sm:inline">Drag cards between columns · tap card for details</span>
        </p>

        {/* Mobile — one row per stage, horizontal card scroll within each row */}
        <div className="sm:hidden space-y-4">
          {PIPELINE_STAGES.map((stage) => {
            const columnLeads = grouped[stage.id] || [];
            const columnExpanded = Boolean(expandedColumns[stage.id]);
            const visibleLeads = visibleKanbanColumnLeads(columnLeads, columnExpanded);
            const hiddenCount = hiddenKanbanColumnCount(columnLeads, columnExpanded);
            const isDropTarget = dropStageId === stage.id;
            return (
              <section
                key={stage.id}
                ref={(el) => { columnRefs.current[stage.id] = el; }}
                className="min-w-0"
              >
                <button
                  type="button"
                  onClick={() => scrollToStage(stage.id)}
                  className="flex items-start justify-between gap-2 mb-2 px-0.5 text-left w-full min-h-[40px] hover:opacity-80 transition"
                >
                  <div className="min-w-0">
                    <Badge tone={stage.badgeTone}>{stage.label}</Badge>
                    <p className="text-[9px] text-slate-400 tabular-nums mt-0.5 h-[14px] leading-[14px]">
                      {columnLeads.length} leads
                    </p>
                  </div>
                  <span className="w-6 h-6 rounded-lg bg-rose-50 border border-rose-100 text-[10px] font-black text-rose-700 grid place-items-center tabular-nums shrink-0">
                    {getColumnCount(stage.id, columnLeads)}
                  </span>
                </button>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropStageId(stage.id);
                  }}
                  onDragLeave={() => setDropStageId(null)}
                  onDrop={(e) => handleDrop(e, stage.id)}
                  className={`rounded-xl border p-2 transition ${
                    isDropTarget
                      ? "border-rose-400 bg-rose-50/80 ring-2 ring-rose-200"
                      : "border-rose-100 bg-[#fffbfb]/80"
                  } flex flex-row gap-2 overflow-x-auto overflow-y-hidden snap-x snap-mandatory scrollbar-thin min-h-[108px] -mx-0.5 px-0.5`}
                >
                  {columnLeads.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-rose-200 bg-white/60 p-4 text-center shrink-0 w-[min(72vw,200px)] min-h-[88px] flex items-center justify-center">
                      <p className="text-[11px] text-slate-400">No leads here</p>
                    </div>
                  ) : (
                    <>
                    {visibleLeads.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        currentStage={stage.id}
                        lastLabel={activityLabelMap.get(lead.id) ?? "—"}
                        isDragging={String(dragLeadId) === String(lead.id)}
                        onOpen={() => openLeadDetail(lead)}
                        onDragStart={() => setDragLeadId(lead.id)}
                        onDragEnd={() => setDragLeadId(null)}
                        onMoveStage={moveLeadToStage}
                      />
                    ))}
                    {hiddenCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandedColumns((prev) => ({ ...prev, [stage.id]: true }))}
                        className="shrink-0 w-[min(72vw,200px)] rounded-xl border border-dashed border-rose-200 bg-white/80 px-3 py-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 transition"
                      >
                        Show {hiddenCount} more
                      </button>
                    )}
                    </>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        {/* Desktop — horizontal kanban columns, vertical card stack */}
        <div className="hidden sm:block overflow-x-auto pb-1 scrollbar-thin -mx-1 px-1 snap-x snap-mandatory">
          <div className="flex items-start gap-3 min-w-max">
            {PIPELINE_STAGES.map((stage) => {
              const columnLeads = grouped[stage.id] || [];
              const columnExpanded = Boolean(expandedColumns[stage.id]);
              const visibleLeads = visibleKanbanColumnLeads(columnLeads, columnExpanded);
              const hiddenCount = hiddenKanbanColumnCount(columnLeads, columnExpanded);
              const isDropTarget = dropStageId === stage.id;
              return (
                <div
                  key={stage.id}
                  ref={(el) => { columnRefs.current[stage.id] = el; }}
                  className="w-[252px] shrink-0 snap-start flex flex-col"
                >
                  <button
                    type="button"
                    onClick={() => scrollToStage(stage.id)}
                    className="flex items-start justify-between gap-2 mb-2.5 px-0.5 text-left min-h-[40px] hover:opacity-80 transition"
                  >
                    <div className="min-w-0">
                      <Badge tone={stage.badgeTone}>{stage.label}</Badge>
                      <p className="text-[9px] text-slate-400 tabular-nums mt-0.5 h-[14px] leading-[14px]">
                        {columnLeads.length} leads
                      </p>
                    </div>
                    <span className="w-6 h-6 rounded-lg bg-rose-50 border border-rose-100 text-[10px] font-black text-rose-700 grid place-items-center tabular-nums shrink-0">
                      {getColumnCount(stage.id, columnLeads)}
                    </span>
                  </button>

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      handleDragEnter(stage.id);
                    }}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, stage.id)}
                    className={`rounded-xl border p-2 space-y-2 max-h-[calc(100dvh-400px)] min-h-[320px] overflow-y-auto overscroll-contain scrollbar-thin transition ${
                      isDropTarget
                        ? "border-rose-400 bg-rose-50/80 ring-2 ring-rose-200"
                        : "border-rose-100 bg-[#fffbfb]/80"
                    }`}
                  >
                    {columnLeads.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-rose-200 bg-white/60 p-4 text-center">
                        <p className="text-[11px] text-slate-400">Drop leads here</p>
                      </div>
                    ) : (
                      <>
                      {visibleLeads.map((lead) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          currentStage={stage.id}
                          lastLabel={activityLabelMap.get(lead.id) ?? "—"}
                          isDragging={String(dragLeadId) === String(lead.id)}
                          onOpen={() => openLeadDetail(lead)}
                          onDragStart={() => setDragLeadId(lead.id)}
                          onDragEnd={() => setDragLeadId(null)}
                          onMoveStage={moveLeadToStage}
                        />
                      ))}
                      {hiddenCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpandedColumns((prev) => ({ ...prev, [stage.id]: true }))}
                          className="w-full rounded-xl border border-dashed border-rose-200 bg-white/80 px-3 py-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 transition"
                        >
                          Show {hiddenCount} more
                        </button>
                      )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </GlassCard>

      <PipelineLeadDrawer
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        lead={selectedLead}
        calls={periodCalls}
        onMoveStage={moveLeadToStage}
      />

      <AddLeadDrawer
        open={addOpen}
        onClose={handleAddClose}
        showToast={showToast}
        title="New Lead"
        subtitle="Add a lead directly to your pipeline board."
      />
    </div>
  );
}
