import { useEffect, useMemo, useRef, useState, useDeferredValue, memo } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Plus, Kanban, Flame, TrendingUp, ThumbsDown, Wallet, Phone } from "lucide-react";
import toast from "react-hot-toast";
import { GlassCard, Badge, StatCard } from "../../components/Primitives.jsx";
import AddLeadDrawer from "../../components/AddLeadDrawer.jsx";
import { formatTelUrl } from "../../lib/phoneUtils.js";
import { useEmployee } from "../../context/EmployeeContext.jsx";
import {
  EMP_KANBAN_STAGES,
  LEAD_STATUS_LABELS,
  formatEmpPipelineValue,
  getEmpPipelineSummary,
  getEmpStageMeta,
} from "../../data/employeeMock.js";
import { leadHasOutboundCalls, resolveLeadKanbanColumn, getPipelineStagePillCount, isAdminPanelAssignedLead, isLeadAssignedInPeriod } from "../../lib/leadKanban.js";
import { buildLeadActivityLabelMap } from "../../lib/callDisplay.js";
import { CALL_CONVERSATION_LABEL, CALL_SHORT_LABEL } from "../../lib/callMetrics.js";
import { usePipelineBoard, visibleKanbanColumnLeads, hiddenKanbanColumnCount } from "../../lib/usePipelineBoard.js";
import { usePipelineSync } from "../../lib/usePipelineSync.js";
import { SEGMENT_WRAP, SEGMENT_BTN, SEGMENT_BTN_ACTIVE, SEGMENT_BTN_INACTIVE } from "../../lib/segmentPills.js";
import { filterLeadsByActivityPeriod } from "../../lib/periodFilter.js";
import useIsMobile from "../../lib/useIsMobile.js";
import EmployeeLeadDrawer from "../components/EmployeeLeadDrawer.jsx";
import { LeadStatusBadge } from "../components/EmpUI.jsx";


function startLeadCardDrag(e, leadId, onDragStart) {
  e.dataTransfer.setData("text/plain", String(leadId));
  e.dataTransfer.setData("text/lead-id", String(leadId));
  e.dataTransfer.effectAllowed = "move";
  onDragStart?.();
}

function isDraggablePipelineLead(lead) {
  if (!lead || lead._fromCall || lead._fromMeeting) return false;
  return /^\d+$/.test(String(lead.id));
}

const LeadCard = memo(function LeadCard({ lead, lastLabel, onOpen, isDragging, onDragStart, onDragEnd, isNewAssigned, onMoveStage, currentStage }) {
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
        startLeadCardDrag(e, lead.id, onDragStart);
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
        {isNewAssigned && (
          <span className="inline-block mb-1.5 text-[8px] font-black uppercase tracking-wider text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
            Admin assigned
          </span>
        )}
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
            <LeadStatusBadge status={lead.status} label={LEAD_STATUS_LABELS[lead.status] || lead.stage || "Lead"} />
          </div>
        </div>

        {canDrag && onMoveStage && (
          <div className="block sm:hidden mb-2">
            <select
              value={currentStage || lead.pipelineStage || lead.stage || ""}
              onChange={(e) => {
                e.stopPropagation();
                onMoveStage(lead.id, e.target.value);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-rose-50/50 hover:bg-rose-50 text-[9px] font-black text-rose-700 border border-rose-200/80 rounded px-1.5 py-0.5 outline-none appearance-none pr-4"
              style={{
                background: 'url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23be123c\' stroke-width=\'3.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E") no-repeat right 3px center/8px',
                paddingRight: '12px'
              }}
            >
              <option value="" disabled style={{ color: '#64748b', backgroundColor: '#ffffff' }}>Move stage...</option>
              {EMP_KANBAN_STAGES.map((s) => (
                <option key={s.id} value={s.id} style={{ color: '#1e293b', backgroundColor: '#ffffff' }}>
                  {s.id === "conversation_2min" ? "Convo" : s.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-rose-50">
          <span className="text-xs font-black text-rose-700 tabular-nums">{lead.budget}</span>
          <span className="text-[9px] font-medium text-slate-400">{lastLabel}</span>
        </div>
      </div>
    </div>
  );
});

export default function EmployeeLeads() {
  const {
    leads,
    loading: leadsLoading,
    addLead,
    updateLeadStage,
    employee,
    selectedService,
    meetingsUpcoming = [],
    meetingsHistory = [],
  } = useEmployee();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("filter");
  const [search, setSearch] = useState("");
  const [activeStage, setActiveStage] = useState(null);
  const [selected, setSelected] = useState(null);
  const [modalOpen, setModalOpen] = useState(searchParams.get("action") === "add");
  const [dragLeadId, setDragLeadId] = useState(null);
  const [dropStageId, setDropStageId] = useState(null);
  const [cashCollections, setCashCollections] = useState([]);
  const columnRefs = useRef({});
  const dropDepthRef = useRef(0);
  const period = String(searchParams.get("period") || "month").toLowerCase();
  const deferredPeriod = useDeferredValue(period);
  const isBoardStale = deferredPeriod !== period;
  const periodLabel = period === "today" ? "Today" : period === "week" ? "This Week" : "This Month";
  const [groupRev, setGroupRev] = useState(0);
  const [expandedColumns, setExpandedColumns] = useState({});

  const {
    meetings: boardMeetings,
    calls: boardCalls,
    syncing: boardSyncing,
    remapCallsForLeads,
  } = usePipelineSync({
    scope: "employee",
    employeeId: employee?.id,
    period: deferredPeriod,
    enabled: Boolean(employee?.id),
    mapLeads: false,
    attachLeads: leads,
  });

  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  const remapTimerRef = useRef(null);
  useEffect(() => {
    if (!leads?.length || !boardCalls?.length) return undefined;
    if (remapTimerRef.current) window.clearTimeout(remapTimerRef.current);
    remapTimerRef.current = window.setTimeout(() => {
      remapCallsForLeads(leadsRef.current);
    }, 400);
    return () => {
      if (remapTimerRef.current) window.clearTimeout(remapTimerRef.current);
    };
  }, [leads?.length, employee?.id, remapCallsForLeads, boardCalls?.length]);

  const periodCalls = boardCalls || [];

  useEffect(() => {
    setExpandedColumns({});
  }, [period]);

  const isPipelineNewAssigned = (lead) => {
    if (!isAdminPanelAssignedLead(lead, employee?.id)) return false;
    if (leadHasOutboundCalls(lead, periodCalls, {
      outboundOnly: true,
      scopeByAssignee: true,
      sinceAssignment: true,
    })) return false;
    const periodKey = String(period).toLowerCase();
    if (periodKey === "today" || periodKey === "week" || periodKey === "month") {
      return isLeadAssignedInPeriod(lead, periodKey, undefined, { assignedOnly: true });
    }
    return isLeadAssignedInPeriod(lead, "today", undefined, { assignedOnly: true });
  };

  const allMeetings = useMemo(() => {
    if (boardMeetings?.length) return boardMeetings;
    return [...meetingsUpcoming, ...meetingsHistory];
  }, [boardMeetings, meetingsUpcoming, meetingsHistory]);

  useEffect(() => {
    if (searchParams.get("action") === "add") setModalOpen(true);
  }, [searchParams]);

  useEffect(() => {
    if (!employee?.id) return;
    let cancelled = false;
    import("../../lib/api.js").then(({ apiGet }) => {
      apiGet(`/api/v1/employees/${employee.id}/cash-collections`, { skipCache: true, cacheTtl: 0 })
        .then((res) => {
          if (!cancelled && res?.success) {
            setCashCollections(Array.isArray(res.data) ? res.data : []);
          }
        })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [employee?.id]);

  const totalCash = useMemo(() => {
    const list = Array.isArray(cashCollections) ? cashCollections : [];
    const filteredList = list.filter((cc) => {
      const dateStr = cc.paymentAt || cc.createdAt;
      if (!dateStr) return false;
      const payDate = new Date(dateStr);
      if (Number.isNaN(payDate.getTime())) return false;

      const now = new Date();
      const nowClone = new Date(now);
      const startOfToday = new Date(nowClone.getFullYear(), nowClone.getMonth(), nowClone.getDate());

      if (period === "today") {
        return payDate >= startOfToday;
      }
      if (period === "week") {
        const day = nowClone.getDay();
        const diff = nowClone.getDate() - day + (day === 0 ? -6 : 1);
        const startOfWeek = new Date(nowClone.setDate(diff));
        startOfWeek.setHours(0, 0, 0, 0);
        return payDate >= startOfWeek;
      }
      if (period === "month") {
        const startOfMonth = new Date(nowClone.getFullYear(), nowClone.getMonth(), 1);
        return payDate >= startOfMonth;
      }
      return true;
    });

    return filteredList.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [cashCollections, period]);

  function formatCashCard(val) {
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
    if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`;
    return `₹${val.toLocaleString("en-IN")}`;
  }



  const statusFiltered = useMemo(() => {
    let list = leads;
    if (!statusFilter || statusFilter === "all") return list;
    const sf = statusFilter.toLowerCase();
    return list.filter((l) => {
      const status = String(l.status || "").toLowerCase();
      const temp = String(l.temperature || "").toLowerCase();
      return status === sf || temp.includes(sf);
    });
  }, [leads, statusFilter]);

  const filtered = useMemo(() => {
    let list = statusFiltered;
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    if (q) {
      list = list.filter((l) => {
        const name = String(l?.name || "").toLowerCase();
        const company = String(l?.company || "").toLowerCase();
        const phone = String(l?.phone || "").toLowerCase();
        const phoneDigits = phone.replace(/\D/g, "");
        const source = String(l?.source || "").toLowerCase();

        if (name.includes(q) || company.includes(q) || source.includes(q)) return true;
        if (phone && phone.includes(q)) return true;
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
    return list;
  }, [statusFiltered, search, selectedService]);

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
    callsLoading: false,
    callyzerStats: null,
    meetings: allMeetings,
    visibleLeads: deferredFiltered,
    employeeId: employee?.id ?? null,
    scopeCallsByAssignee: true,
    groupRev,
  });

  const activityLabelMap = useMemo(
    () => buildLeadActivityLabelMap(grouped, periodCalls),
    [grouped, periodCalls],
  );

  const summaryLeads = useMemo(() => {
    if (deferredPeriod === "all") return filtered;
    const kanbanList = Object.values(grouped).flat();
    return kanbanList.length > 0 ? kanbanList : filterLeadsByActivityPeriod(filtered, deferredPeriod);
  }, [deferredPeriod, filtered, grouped]);

  const summary = useMemo(() => getEmpPipelineSummary(summaryLeads), [summaryLeads]);

  const scrollToStage = (stageId) => {
    setActiveStage(stageId);
    columnRefs.current[stageId]?.scrollIntoView({
      behavior: "smooth",
      inline: isMobile ? "nearest" : "start",
      block: isMobile ? "start" : "nearest",
    });
  };

  const resolvePipelineLead = (leadId) => {
    const id = String(leadId);
    const hit = leads.find((l) => String(l.id) === id);
    if (hit) return hit;
    for (const stage of EMP_KANBAN_STAGES) {
      const fromCol = (grouped[stage.id] || []).find((l) => String(l.id) === id);
      if (fromCol) return fromCol;
    }
    return null;
  };

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

  const moveLeadToStage = (leadId, stageId, { scroll = true } = {}) => {
    const lead = resolvePipelineLead(leadId);
    if (!lead) {
      toast.error("This card can't be moved — it isn't linked to a CRM lead yet.");
      return;
    }
    if (!isDraggablePipelineLead(lead)) {
      toast.error("Link this Callyzer call to a lead before moving it.");
      return;
    }
    const target = getEmpStageMeta(stageId);
    const currentStageId = resolveLeadKanbanColumn(lead, periodCalls, { scopeByAssignee: true });
    if (currentStageId === stageId) {
      if (scroll) scrollToStage(stageId);
      return;
    }
    updateLeadStage(lead.id, target.label, { fromNewAssigned: isPipelineNewAssigned(lead) });
    if (moveLeadLocally) {
      moveLeadLocally(lead.id, stageId);
    }
    if (scroll) scrollToStage(stageId);
    toast.success(
      isPipelineNewAssigned(lead)
        ? `Accepted · moved to ${target.label}`
        : `Moved to ${target.label}`,
      { id: `lead-move-${lead.id}-${stageId}` },
    );
  };

  const closeModal = () => {
    setModalOpen(false);
    if (searchParams.get("action") === "add") {
      setSearchParams({}, { replace: true });
    }
  };

  const handleAddClose = (newLead) => {
    if (newLead && typeof newLead === "object") {
      const lead = addLead(newLead);
      toast.success(`${lead.name} added to pipeline`);
      scrollToStage(resolveLeadKanbanColumn(lead, periodCalls, { scopeByAssignee: true }));
    }
    closeModal();
  };

  const showToast = (message, type = "success") => {
    if (type === "error") toast.error(message);
    else toast.success(message);
  };

  const getColumnCount = (stageId, columnLeads) => columnLeads.length;

  const getStagePillCount = (stageId, columnLeads) => getPipelineStagePillCount(stageId, { grouped }) || columnLeads.length;

  const leadStatSpan = () => "col-span-1";

  return (
    <div className="space-y-3 sm:space-y-4 page-shell min-w-0 animate-fade-in">
      <GlassCard className="p-3 sm:p-4 space-y-3 sm:space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-2.5">
          <div className="min-w-0 col-span-1">
          <StatCard
            label="Pipeline Value"
            value={formatEmpPipelineValue(summary.value)}
            icon={TrendingUp}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
            change={periodLabel}
            sub=""
          />
          </div>
          <div className="min-w-0 col-span-1">
          <StatCard
            label="Total Leads"
            value={String(summary.total)}
            icon={Kanban}
            iconBg="bg-rose-50"
            iconColor="text-rose-600"
            change={`${summary.active} active`}
            sub=""
            corner={
              summary.hot > 0 ? (
                <span className="sm:hidden inline-flex items-center gap-0.5 text-[9px] font-black text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full shadow-sm">
                  🔥 {summary.hot}
                </span>
              ) : null
            }
          />
          </div>
          <div className="min-w-0 hidden sm:block col-span-1">
          <StatCard
            label="Hot Leads"
            value={String(summary.hot)}
            icon={Flame}
            iconBg="bg-red-50"
            iconColor="text-red-600"
            change={summary.hot ? "High intent" : "None"}
            sub=""
          />
          </div>
          <div className="min-w-0 col-span-1">
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
          <div className="min-w-0 col-span-1">
          <StatCard
            label="Total Cash Collected"
            value={formatCashCard(totalCash)}
            icon={Wallet}
            iconBg="bg-green-50"
            iconColor="text-green-600"
            change={period === "today" ? "Today" : period === "week" ? "This week" : "This month"}
            sub=""
          />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 pt-1 border-t border-rose-50">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-300 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name, company, or source..."
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-rose-100 bg-white text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
            />
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-full bg-rose-700 text-white text-xs font-bold hover:bg-rose-800 shadow-sm shrink-0 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Lead
          </button>
        </div>

        <div className={`${SEGMENT_WRAP} w-full -mx-0.5`}>
          {EMP_KANBAN_STAGES.map((stage) => {
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
          {(boardSyncing) ? " · syncing in background…" : ""}
        </p>
      </GlassCard>

      <GlassCard className={`p-3 sm:p-4 overflow-hidden transition-opacity ${isBoardStale ? "opacity-70" : ""}`}>
        {(leadsLoading) && leads.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-12">Loading your pipeline…</p>
        ) : (
        <>
        <p className="text-[10px] text-slate-400 mb-2.5 px-0.5">
          <span className="sm:hidden">Each stage is a row · swipe cards horizontally · tap for details</span>
          <span className="hidden sm:inline">Drag cards between columns · tap card for details</span>
        </p>

        {/* Mobile — one row per stage, horizontal card scroll within each row */}
        <div className="sm:hidden space-y-4">
          {EMP_KANBAN_STAGES.map((stage) => {
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
                  onDragEnter={() => handleDragEnter(stage.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDropStageId(stage.id);
                  }}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, stage.id)}
                  className={`rounded-xl border p-2 transition ${
                    isDropTarget
                      ? "border-rose-400 bg-rose-50/80 ring-2 ring-rose-200"
                      : "border-rose-100 bg-[#fffbfb]/80"
                  } flex flex-row gap-2 overflow-x-auto overflow-y-hidden snap-x snap-mandatory scrollbar-thin min-h-[108px] -mx-0.5 px-0.5`}
                >
                  {columnLeads.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-rose-200 bg-white/60 p-4 text-center shrink-0 w-[min(72vw,200px)] min-h-[88px] flex items-center justify-center">
                      <p className="text-[11px] text-slate-400">
                        {stage.id === "lead"
                          ? "New admin assignments appear here"
                          : stage.id === "not_pick"
                            ? "Leads with not-picked calls"
                            : stage.id === "short_call"
                              ? "Leads with connected calls under 2 min"
                              : stage.id === "conversation_2min"
                                ? "Leads with 2 min+ connected calls"
                              : stage.id === "meeting_booked"
                                ? "Meetings scheduled this period"
                                : stage.id === "meeting_done"
                                  ? "Meetings completed this period"
                                  : "No leads here"}
                      </p>
                    </div>
                  ) : (
                    <>
                    {visibleLeads.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        currentStage={stage.id}
                        lastLabel={activityLabelMap.get(lead.id) ?? "—"}
                        isNewAssigned={isPipelineNewAssigned(lead)}
                        isDragging={dragLeadId === lead.id}
                        onOpen={() => setSelected(lead)}
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
            {EMP_KANBAN_STAGES.map((stage) => {
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
                    onDragEnter={() => handleDragEnter(stage.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDropStageId(stage.id);
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
                        <p className="text-[11px] text-slate-400">
                          {stage.id === "lead"
                            ? "New leads appear here"
                            : stage.id === "not_pick"
                              ? "Leads with not-picked calls"
                              : stage.id === "short_call"
                                ? "Leads with connected calls under 2 min"
                                : stage.id === "conversation_2min"
                                  ? "Leads with 2 min+ connected calls"
                                : stage.id === "meeting_booked"
                                  ? "Meetings scheduled this period"
                                  : stage.id === "meeting_done"
                                    ? "Meetings completed this period"
                                    : "No leads here"}
                        </p>
                      </div>
                    ) : (
                      <>
                      {visibleLeads.map((lead) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          lastLabel={activityLabelMap.get(lead.id) ?? "—"}
                          isNewAssigned={isPipelineNewAssigned(lead)}
                          isDragging={dragLeadId === lead.id}
                          onOpen={() => setSelected(lead)}
                          onDragStart={() => setDragLeadId(lead.id)}
                          onDragEnd={() => setDragLeadId(null)}
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
        </>
        )}
      </GlassCard>

      <AddLeadDrawer
        open={modalOpen}
        onClose={handleAddClose}
        showToast={showToast}
        title="New Lead"
        subtitle="Add a lead directly to your pipeline board."
        pipelineStages={EMP_KANBAN_STAGES.map((s) => s.label)}
        defaultStage="Lead"
      />

      <EmployeeLeadDrawer lead={selected} periodCalls={periodCalls} onClose={() => setSelected(null)} onMoveStage={moveLeadToStage} />
    </div>
  );
}
