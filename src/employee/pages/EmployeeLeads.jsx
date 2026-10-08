import { useEffect, useMemo, useRef, useState, useDeferredValue, memo } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Plus, Kanban, Flame, TrendingUp, ThumbsDown, Wallet, Phone, Eye, EyeOff, Video, AlertTriangle, CheckCircle2, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import { GlassCard, Badge, StatCard } from "../../components/Primitives.jsx";
import AddLeadDrawer from "../../components/AddLeadDrawer.jsx";
import { formatTelUrl } from "../../lib/phoneUtils.js";
import { formatIndianPhone } from "../../lib/indianFormat.js";
import { StatValueSkeleton } from "../../components/Skeleton.jsx";
import { buildOverdueMeetingByLead } from "../../lib/meetingStatus.js";
import { useEmployee } from "../../context/EmployeeContext.jsx";
import {
  EMP_KANBAN_STAGES,
  LEAD_STATUS_LABELS,
  formatEmpPipelineValue,
  getEmpStageMeta,
  getEmpAppToday,
} from "../../data/employeeMock.js";
import { leadHasOutboundCalls, resolveLeadKanbanColumn, getPipelineStagePillCount, isAdminPanelAssignedLead, isLeadAssignedInPeriod } from "../../lib/leadKanban.js";
import { buildLeadActivityLabelMap } from "../../lib/callDisplay.js";
import { CALL_CONVERSATION_LABEL, CALL_SHORT_LABEL, formatCallsAndLeads } from "../../lib/callMetrics.js";
import { MEETING_METRIC_INFO } from "../../lib/metricInfo.js";
import { usePipelineBoard, visibleKanbanColumnLeads, hiddenKanbanColumnCount, KANBAN_SHOW_MORE_STEP } from "../../lib/usePipelineBoard.js";
import { useCallHistory } from "../../lib/useCallHistory.js";
import { usePipelineSync, boardPeriodQuery } from "../../lib/usePipelineSync.js";
import { SEGMENT_WRAP, SEGMENT_BTN, SEGMENT_BTN_ACTIVE, SEGMENT_BTN_INACTIVE } from "../../lib/segmentPills.js";
import { parseCustomPeriod, localDateKey } from "../../lib/periodFilter.js";
import { resolvePeriodSelection } from "../../lib/periodSelection.js";
import useIsMobile from "../../lib/useIsMobile.js";
import EmployeeLeadDrawer from "../components/EmployeeLeadDrawer.jsx";
import MeetingBookedWhatsAppModal from "../components/MeetingBookedWhatsAppModal.jsx";
import {
  EmpModal, BtnPrimary, BtnSecondary, FormGroup, FormLabel, FormInput, FormSelect, AvatarCircle,
} from "../components/EmpUI.jsx";
import { TimeOfDaySelects } from "../components/TimeOfDaySelects.jsx";
import { apiGet } from "../../lib/api.js";
import { getCrmHeaders } from "../../lib/crmContext.js";
import { buildClarityCallTitle, resolveCustomerName, resolveLeadServiceName } from "../../lib/meetingTitle.js";


const SUMMARY_VISIBLE_KEY = "tsp_employee_summary_visible";

function readSummaryVisiblePref() {
  if (typeof window === "undefined" || !window.localStorage) return true;
  try {
    const raw = window.localStorage.getItem(SUMMARY_VISIBLE_KEY);
    if (raw === null) return true;
    return raw !== "false";
  } catch {
    return true;
  }
}

function writeSummaryVisiblePref(value) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(SUMMARY_VISIBLE_KEY, value ? "true" : "false");
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}

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

// Automatic "Book Meeting" title for the Pipeline drag/drop → Meeting Booked flow:
// "{Customer Name} {Service Name} - Clarity Call" (regenerated whenever the service
// changes; the backend generates the same title when it saves the meeting).
function defaultMeetingTitle(lead, service) {
  return buildClarityCallTitle(resolveCustomerName(lead), service);
}

const BOOKING_READONLY_FIELD =
  "h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 font-semibold flex items-center gap-2";

/**
 * Reuses the existing Book Meeting flow (EmployeeContext.createMeeting -> the real backend
 * Google Calendar/Meet + Meeting-Booked stage + n8n webhook pipeline already used by
 * EmployeeMeetings.jsx), triggered from dropping a lead card onto the "Meeting Booked"
 * pipeline column instead of a free-form drawer. Lead + employee are locked; meeting type
 * is always Google Meet (no manual link entry) per spec.
 */
function PipelineBookMeetingModal({
  open, lead, employee, form, setForm, serviceOptions, submitting, onSubmit, onClose,
}) {
  return (
    <EmpModal
      open={open}
      onClose={onClose}
      title="Book Meeting"
      subtitle="Dropped into Meeting Booked — confirm the details to generate a real Google Meet link."
      footer={(
        <>
          <BtnSecondary onClick={onClose} disabled={submitting}>
            Cancel
          </BtnSecondary>
          <BtnPrimary onClick={onSubmit} disabled={submitting}>
            <Video className="w-4 h-4" /> {submitting ? "Booking…" : "Book Meeting"}
          </BtnPrimary>
        </>
      )}
    >
      <FormGroup>
        <FormLabel>Lead</FormLabel>
        <div className={BOOKING_READONLY_FIELD}>
          <AvatarCircle
            initials={(lead?.name || "?").split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
            color="#be123c"
            size={24}
          />
          <span className="truncate">{lead?.name || "—"}</span>
        </div>
      </FormGroup>

      <FormGroup>
        <FormLabel>Employee</FormLabel>
        <div className={BOOKING_READONLY_FIELD}>{employee?.name || "You"}</div>
      </FormGroup>

      <div className="grid grid-cols-2 gap-3 mb-3 sm:mb-4">
        <div>
          <FormLabel>Date</FormLabel>
          <FormInput
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
        </div>
        <div>
          <FormLabel>Time</FormLabel>
          <TimeOfDaySelects value={form.time} onChange={(time) => setForm((f) => ({ ...f, time }))} />
        </div>
      </div>

      <FormGroup>
        <FormLabel>Service</FormLabel>
        <FormSelect
          value={form.service || "—"}
          onChange={(e) => {
            const nextService = e.target.value;
            setForm((f) => ({
              ...f,
              service: nextService,
              title: defaultMeetingTitle(lead, nextService),
            }));
          }}
        >
          {[
            ...(serviceOptions || ["—"]),
            ...(form.service && form.service !== "—" && !(serviceOptions || []).includes(form.service) ? [form.service] : []),
          ].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup>
        <FormLabel>Meeting Title</FormLabel>
        {/* Auto-generated — not typed by the employee. */}
        <div className={BOOKING_READONLY_FIELD} title="Generated automatically from lead + service">
          <span className="truncate">{defaultMeetingTitle(lead, form.service)}</span>
        </div>
      </FormGroup>

      <p className="text-[10px] text-slate-400 mt-1">
        Meeting type is fixed to Google Meet — a real Meet link is generated automatically by the
        server when you click Book Meeting. The lead only moves to Meeting Booked once that succeeds.
      </p>
    </EmpModal>
  );
}

const LeadCard = memo(function LeadCard({
  lead, lastLabel, onOpen, isDragging, onDragStart, onDragEnd, isNewAssigned, onMoveStage, currentStage,
  dialCount = 0, overdueMeeting = null, onMarkHeld, onReschedule,
}) {
  const canDrag = isDraggablePipelineLead(lead);
  const stop = (fn) => (e) => {
    e.stopPropagation();
    e.preventDefault();
    fn?.();
  };

  const rawPhone = lead.phone || lead.phone_number || "";
  const cleanDigits = String(rawPhone).replace(/\D/g, "");
  const formattedPhone = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : (rawPhone || "No Number");

  const rawName = String(lead.name || "").trim();
  const hasValidName = rawName && !/^unknown$/i.test(rawName) && rawName !== "Lead";
  const displayName = hasValidName ? rawName : formattedPhone;
  // Phone under the name (shared Indian phone formatter) — skipped when the name already IS the number.
  const phoneLine = hasValidName && rawPhone ? formatIndianPhone(rawPhone) : "";

  const displayService = resolveLeadServiceName(lead) || "—";

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
            {phoneLine ? (
              <p className="text-[10px] text-slate-500 truncate mt-0.5 tabular-nums" title={rawPhone}>
                {phoneLine}
              </p>
            ) : null}
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
          </div>
        </div>

        {overdueMeeting && (
          <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5">
            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-amber-800" title="The meeting time has passed and it is still marked as booked">
              <AlertTriangle className="w-3 h-3" /> Overdue
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <button
                type="button"
                onClick={stop(() => onMarkHeld?.(overdueMeeting, lead))}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-2 py-1 transition"
              >
                <CheckCircle2 className="w-3 h-3" /> Mark held
              </button>
              <button
                type="button"
                onClick={stop(() => onReschedule?.(overdueMeeting, lead))}
                className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white hover:bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-1 transition"
              >
                <Pencil className="w-3 h-3" /> Reschedule
              </button>
            </div>
          </div>
        )}

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
        <div className="flex items-center justify-between gap-1 pt-2 border-t border-rose-50">
          <span className="text-xs font-black text-rose-700 tabular-nums">{lead.budget}</span>
          <span className="flex items-center gap-1.5 min-w-0">
            {dialCount > 0 && (
              <span
                className="inline-flex items-center gap-0.5 text-[9px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded px-1 tabular-nums"
                title={`Dialed ${dialCount} time${dialCount === 1 ? "" : "s"}`}
              >
                <Phone className="w-2.5 h-2.5" /> {dialCount}×
              </span>
            )}
            <span className="text-[9px] font-medium text-slate-400 truncate">{lastLabel}</span>
          </span>
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
    updateLeadTemperature,
    createMeeting,
    rescheduleMeeting,
    completeMeeting,
    refreshLeads,
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
  const [summaryVisible, setSummaryVisible] = useState(true);
  const columnRefs = useRef({});
  const dropDepthRef = useRef(0);
  // Today | Week | Month | Custom — Custom is carried as "custom:FROM:TO" so the
  // board API (usePipelineSync) and all period helpers get the exact range.
  // Same resolver as the Dashboard and Call Reporting (lib/periodSelection.js): "yesterday" has no backend preset,
  // it is sent as a one-day custom range (yesterday → yesterday); invalid / incomplete custom falls back to Month.
  const periodSelection = resolvePeriodSelection(searchParams, { defaultPeriod: "month" });
  const rawPeriod = periodSelection.key;
  const period = periodSelection.period;
  const customRange = parseCustomPeriod(period);
  const deferredPeriod = useDeferredValue(period);
  const isBoardStale = deferredPeriod !== period;
  const periodLabel = periodSelection.label;
  // Lower-cased for use inside sentences ("created this week") — a date range keeps its capital month names.
  const periodLabelLower = rawPeriod === "custom" ? periodLabel : periodLabel.toLowerCase();
  const [groupRev, setGroupRev] = useState(0);
  // Per column: how many EXTRA cards were revealed beyond the initial cap (see KANBAN_SHOW_MORE_STEP).
  const [expandedColumns, setExpandedColumns] = useState({});

  // Summary tiles come from the SAME backend lead universe as the Dashboard tiles (leads CREATED in the period and
  // assigned to this employee), so Total Leads / Hot / Pipeline Value always match the Dashboard. The board below
  // shows leads WORKED in the period (calls, meetings, assignments), so its card count is a different number by design.
  const [leadSummary, setLeadSummary] = useState(null);
  const [leadSummaryStatus, setLeadSummaryStatus] = useState("loading"); // loading | ready | error
  useEffect(() => {
    if (!employee?.id) return undefined;
    let cancelled = false;
    setLeadSummaryStatus("loading");
    const qs = new URLSearchParams(boardPeriodQuery(deferredPeriod));
    if (selectedService && selectedService !== "All Services") qs.set("service", selectedService);
    apiGet(`/api/v1/employee/${employee.id}/lead-summary?${qs.toString()}`, { headers: getCrmHeaders(), cacheTtl: 30_000 })
      .then((res) => {
        if (cancelled) return;
        if (res?.success === false) throw new Error(res.message || "lead summary failed");
        setLeadSummary(res);
        setLeadSummaryStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setLeadSummary(null);
        setLeadSummaryStatus("error");
      });
    return () => { cancelled = true; };
  }, [employee?.id, deferredPeriod, selectedService]);
  const tileValue = (value, format = String) => {
    if (leadSummaryStatus === "loading") return <StatValueSkeleton />;
    if (leadSummaryStatus === "error" || !leadSummary) return "—";
    return format(value ?? 0);
  };
  const createdLabel = `created ${periodLabelLower}`;

  // Pipeline drag/drop → Meeting Booked interception: dropping a lead onto the
  // Meeting Booked column opens this Book Meeting modal instead of moving the stage
  // immediately. The stage only changes after a real meeting is successfully booked
  // (see moveLeadToStage below and handleBookingSubmit).
  const [bookingModal, setBookingModal] = useState({ open: false, lead: null });
  const [bookingForm, setBookingForm] = useState({
    title: "", date: getEmpAppToday(), time: "14:00", service: "—", titleDirty: false,
  });
  const [bookingServiceOptions, setBookingServiceOptions] = useState(["—"]);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  // Saved meeting + its lead → offers the customer a WhatsApp confirmation right after booking.
  const [bookedPrompt, setBookedPrompt] = useState({ meeting: null, lead: null });

  useEffect(() => {
    setSummaryVisible(readSummaryVisiblePref());
  }, []);

  // Real service catalog (same source as Lead Detail / Employee Meetings) for the
  // Pipeline-triggered Book Meeting modal's Service field.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet("/api/services", { headers: getCrmHeaders(), cacheTtl: 30_000 });
        const names = (data?.services || data?.data || [])
          .map((s) => s.name || s.title)
          .filter(Boolean);
        if (!cancelled && names.length) {
          setBookingServiceOptions(["—", ...names]);
        }
      } catch {
        // keep default
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleSummaryVisible = () => {
    setSummaryVisible((prev) => {
      const next = !prev;
      writeSummaryVisiblePref(next);
      return next;
    });
  };

  const {
    meetings: boardMeetings,
    calls: boardCalls,
    syncing: boardSyncing,
    dialCounts = {},
    remapCallsForLeads,
    refresh: refreshBoard,
    refreshLeadsOnly: refreshBoardFromDb,
  } = usePipelineSync({
    scope: "employee",
    employeeId: employee?.id,
    period: deferredPeriod,
    enabled: Boolean(employee?.id),
    mapLeads: false,
    attachLeads: leads,
  });

  // Full call history per person (all employees, all dates): drives Lead / Not Pick / Short Call / Conversation.
  const { callHistory, callHistoryVersion } = useCallHistory({
    scope: "employee",
    employeeId: employee?.id,
    enabled: Boolean(employee?.id),
    refreshKey: String(boardCalls?.length || 0),
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

  // Keep the board current after a dial: calls land in employee_calls via the
  // Callyzer webhook / sync, so re-read the board when the employee comes back
  // from the phone dialer (throttled Callyzer sync) and poll the DB lightly.
  const lastBoardSyncRef = useRef(0);
  useEffect(() => {
    if (!employee?.id) return undefined;
    const BOARD_SYNC_MIN_GAP_MS = 20_000;
    const onVisible = () => {
      if (document.hidden) return;
      const now = Date.now();
      if (now - lastBoardSyncRef.current < BOARD_SYNC_MIN_GAP_MS) {
        refreshBoardFromDb?.();
        return;
      }
      lastBoardSyncRef.current = now;
      refreshBoard?.();
    };
    const intervalId = window.setInterval(() => {
      if (!document.hidden) refreshBoardFromDb?.();
    }, 30_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.id, deferredPeriod]);

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
    if (periodKey === "today" || periodKey === "week" || periodKey === "month" || parseCustomPeriod(periodKey)) {
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
      if (customRange) {
        const key = localDateKey(payDate);
        return Boolean(key && key >= customRange.startDate && key <= customRange.endDate);
      }
      return true;
    });

    return filteredList.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [cashCollections, period]);

  function formatCashCard(val) {
    return formatEmpPipelineValue(val);
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
      const wanted = selectedService.toLowerCase();
      list = list.filter((l) => resolveLeadServiceName(l).toLowerCase() === wanted
        || String(l.requirements || "").toLowerCase().includes(wanted));
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
    callMetrics,
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
    callHistory,
    callHistoryVersion,
    // NOT PICK is latest-first like every other column (the old "unanswered dial today sinks to the
    // bottom" re-ordering made the visible times look shuffled). Pass notPickAttemptOrdering: true to restore it.
  });

  const activityLabelMap = useMemo(
    () => buildLeadActivityLabelMap(grouped, periodCalls),
    [grouped, periodCalls],
  );

  // Meeting Booked cards whose meeting time has passed (and never got completed/cancelled): flagged Overdue.
  const overdueMeetingByLead = useMemo(() => buildOverdueMeetingByLead(allMeetings), [allMeetings]);

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
    const currentStageId = resolveLeadKanbanColumn(lead, periodCalls, { scopeByAssignee: true, callHistory });
    if (currentStageId === stageId) {
      if (scroll) scrollToStage(stageId);
      return;
    }

    // Meeting Booked is never applied immediately: open the Book Meeting modal with this
    // lead pre-selected and wait for a real meeting to be booked (or cancelled). The stage
    // is only changed server-side, inside handleBookingSubmit, after createMeeting() succeeds
    // — so the card visually/actually stays in its current column until then.
    if (stageId === "meeting_booked") {
      openBookingModal(lead);
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

  // ── Lead card quick actions ──────────────────────────────────────────────
  const handleCardTemperature = (lead, temp) => {
    if (!isDraggablePipelineLead(lead) || !updateLeadTemperature) return;
    updateLeadTemperature(lead.id, temp);
    toast.success(`${lead.name || "Lead"} marked ${temp.charAt(0).toUpperCase()}${temp.slice(1)}`, { id: `temp-${lead.id}` });
  };

  const openBookingModal = (lead) => {
    // Lead's own service (kept even if it isn't in the catalog list, so the title has it).
    const presetService = resolveLeadServiceName(lead) || "—";
    setBookingForm({
      title: defaultMeetingTitle(lead, presetService),
      date: getEmpAppToday(),
      time: "14:00",
      service: presetService,
      titleDirty: false,
    });
    setBookingModal({ open: true, lead });
  };

  const closeBookingModal = () => {
    if (bookingSubmitting) return;
    // No stage change or local move ever happened for this drop, so closing/cancelling
    // here is already an implicit "restore to previous stage" — there is nothing to undo.
    setBookingModal({ open: false, lead: null });
  };

  const handleBookingSubmit = async () => {
    const bookingLead = bookingModal.lead;
    if (!bookingLead) return;
    if (!bookingForm.date || !bookingForm.time) {
      toast.error("Pick a date and time");
      return;
    }
    setBookingSubmitting(true);
    try {
      const chosenService = String(bookingForm.service || "").trim();
      const agenda = chosenService && chosenService !== "—" ? `Service: ${chosenService}` : "";
      const autoTitle = defaultMeetingTitle(bookingLead, chosenService);
      // platform: "google_meet" + no meetLink → backend (operationalServices.createMeeting)
      // generates a real Google Calendar/Meet link server-side. If that fails, createMeeting()
      // returns null and has already shown an error toast — the lead stays in its stage and no
      // stage-update / n8n webhook ever fires, since the backend never reaches those steps.
      const saved = await createMeeting({
        title: autoTitle,
        date: bookingForm.date,
        time: bookingForm.time,
        leadId: String(bookingLead.id),
        platform: "google_meet",
        meetLink: "",
        service: chosenService,
        agenda,
      });
      if (!saved) return;

      // Meeting saved → backend already moved the lead to Meeting Booked and fired the n8n
      // webhook. Pull real server state so the pipeline board reflects the new stage.
      await refreshLeads();
      toast.success(`Google Meet booked — ${bookingLead.name} moved to Meeting Booked`);
      setBookingModal({ open: false, lead: null });
      setBookedPrompt({ meeting: saved, lead: bookingLead });
    } finally {
      setBookingSubmitting(false);
    }
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
      scrollToStage(resolveLeadKanbanColumn(lead, periodCalls, { scopeByAssignee: true, callHistory }));
    }
    closeModal();
  };

  // ── Overdue meeting quick actions (Meeting Booked cards) — never automatic, always the employee's call ──
  const [meetingReschedule, setMeetingReschedule] = useState({ open: false, meeting: null, lead: null, date: "", time: "14:00", saving: false });

  const handleMarkMeetingHeld = async (meeting, lead) => {
    if (!meeting?.id || !completeMeeting) return;
    const done = await completeMeeting(meeting.id);
    if (!done) return;
    await refreshLeads?.();
    refreshBoardFromDb?.();
    toast.success(`Meeting with ${lead?.name || "lead"} marked as held`, { id: `meeting-held-${meeting.id}` });
  };

  const openMeetingReschedule = (meeting, lead) => {
    setMeetingReschedule({ open: true, meeting, lead, date: getEmpAppToday(), time: "14:00", saving: false });
  };

  const closeMeetingReschedule = () => {
    setMeetingReschedule({ open: false, meeting: null, lead: null, date: "", time: "14:00", saving: false });
  };

  const submitMeetingReschedule = async () => {
    const { meeting, date, time } = meetingReschedule;
    if (!meeting?.id) return;
    if (!date || !time) {
      toast.error("Pick a date and time");
      return;
    }
    if (new Date(`${date}T${time}:00`).getTime() < Date.now()) {
      toast.error("Pick a date and time in the future");
      return;
    }
    setMeetingReschedule((m) => ({ ...m, saving: true }));
    try {
      const updated = await rescheduleMeeting?.(meeting.id, { scheduledAt: `${date}T${time}:00` });
      if (!updated) return;
      await refreshLeads?.();
      refreshBoardFromDb?.();
      closeMeetingReschedule();
      toast.success("Meeting rescheduled");
    } finally {
      setMeetingReschedule((m) => ({ ...m, saving: false }));
    }
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
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={toggleSummaryVisible}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 transition"
          >
            {summaryVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {summaryVisible ? "Hide summary" : "Show summary"}
          </button>
        </div>

        {summaryVisible && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-2.5">
            <div className="min-w-0 col-span-1">
            <StatCard
              label="Pipeline Value"
              value={tileValue(leadSummary?.pipelineValue, formatEmpPipelineValue)}
              icon={TrendingUp}
              iconBg="bg-emerald-50"
              iconColor="text-emerald-600"
              change="Open leads"
              sub={createdLabel}
            />
            </div>
            <div className="min-w-0 col-span-1">
            <StatCard
              label="Total Leads"
              value={tileValue(leadSummary?.total)}
              icon={Kanban}
              iconBg="bg-rose-50"
              iconColor="text-rose-600"
              change={leadSummaryStatus === "loading" ? "Loading" : leadSummaryStatus === "error" ? "Unavailable" : `${leadSummary?.openLeads ?? 0} open`}
              sub={createdLabel}
              corner={
                leadSummary?.hot > 0 ? (
                  <span className="sm:hidden inline-flex items-center gap-0.5 text-[9px] font-black text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full shadow-sm">
                    🔥 {leadSummary.hot}
                  </span>
                ) : null
              }
            />
            </div>
            <div className="min-w-0 hidden sm:block col-span-1">
            <StatCard
              label="Hot Leads"
              value={tileValue(leadSummary?.hot)}
              icon={Flame}
              iconBg="bg-red-50"
              iconColor="text-red-600"
              change={leadSummary?.hot ? "High intent" : "None"}
              sub={createdLabel}
            />
            </div>
            <div className="min-w-0 col-span-1">
            <StatCard
              label="Not Interested"
              value={tileValue(leadSummary?.notInterested)}
              icon={ThumbsDown}
              iconBg="bg-slate-50"
              iconColor="text-slate-500"
              change="Closed lost"
              sub={createdLabel}
            />
            </div>
            <div className="min-w-0 col-span-1">
            <StatCard
              label="Total Cash Collected"
              value={formatCashCard(totalCash)}
              icon={Wallet}
              iconBg="bg-green-50"
              iconColor="text-green-600"
              change={period === "today" ? "Today" : period === "week" ? "This week" : rawPeriod === "yesterday" ? "Yesterday" : customRange ? periodLabel : "This month"}
              sub=""
            />
            </div>
          </div>
        )}

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

        {/* Wraps onto extra rows instead of running off the right edge (the old row scrolled with the scrollbar hidden). */}
        <div className="flex flex-wrap items-center gap-1.5 w-full">
          {EMP_KANBAN_STAGES.map((stage) => {
            const columnLeads = grouped[stage.id] || [];
            const count = getStagePillCount(stage.id, columnLeads);
            const active = activeStage === stage.id;
            let callHint = null;
            if (stage.id === "conversation_2min") {
              callHint = `${syncedConversationCalls} calls ${CALL_CONVERSATION_LABEL} · ${columnLeads.length} leads above 2 min`;
            } else if (stage.id === "short_call") {
              callHint = `Short Call column = every answered call of up to 2 min, outgoing or incoming (${syncedShortCalls} outgoing short + ${callMetrics.incomingShort || 0} incoming short calls) · ${columnLeads.length} leads in Short Call`;
            } else if (stage.id === "not_pick") {
              callHint = `Not Pick column = every call that did not connect, incoming or outgoing: ${syncedNotPickupCalls} not answered + ${callMetrics.missed || 0} missed + ${callMetrics.rejected || 0} rejected (counted separately in the call numbers) · ${columnLeads.length} leads in Not Pick`;
            } else if (stage.id === "meeting_booked") {
              callHint = `Booked: ${columnLeads.length} leads in this stage (cards). ${MEETING_METRIC_INFO.bookedCards} Separate number: ${periodMeetings.filter((m) => m.status !== "completed" && m.status !== "cancelled").length} meetings still scheduled in this period.`;
            } else if (stage.id === "meeting_done") {
              callHint = `Held: ${periodMeetings.filter((m) => m.status === "completed").length} meetings marked completed in this period. Separate number: ${columnLeads.length} leads in the Meeting Done stage (cards).`;
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
        {boardSyncing ? <p className="text-[10px] text-slate-400 px-0.5">Syncing in background…</p> : null}
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
            const columnExpanded = expandedColumns[stage.id] || 0;
            const visibleLeads = visibleKanbanColumnLeads(columnLeads, columnExpanded);
            const hiddenCount = hiddenKanbanColumnCount(columnLeads, columnExpanded);
            const isDropTarget = dropStageId === stage.id;
            return (
              <section
                key={stage.id}
                ref={(el) => { columnRefs.current[stage.id] = el; }}
                className="min-w-0"
              >
                <div className="mb-2 px-0.5">
                  <Badge tone={stage.badgeTone}>{stage.label}</Badge>
                </div>

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
                              ? "Leads with answered outbound calls up to 2 min"
                              : stage.id === "conversation_2min"
                                ? "Leads with answered calls above 2 min"
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
                        dialCount={dialCounts[String(lead.id)] || 0}
                        onSetTemperature={handleCardTemperature}
                        overdueMeeting={stage.id === "meeting_booked" ? (overdueMeetingByLead.get(String(lead.id)) || null) : null}
                        onMarkHeld={handleMarkMeetingHeld}
                        onReschedule={openMeetingReschedule}
                      />
                    ))}
                    {hiddenCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandedColumns((prev) => ({ ...prev, [stage.id]: (prev[stage.id] || 0) + KANBAN_SHOW_MORE_STEP }))}
                        className="shrink-0 w-[min(72vw,200px)] rounded-xl border border-dashed border-rose-200 bg-white/80 px-3 py-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 transition"
                      >
                        Show {Math.min(hiddenCount, KANBAN_SHOW_MORE_STEP)} more{hiddenCount > KANBAN_SHOW_MORE_STEP ? ` (${hiddenCount} hidden)` : ""}
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
              const columnExpanded = expandedColumns[stage.id] || 0;
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
                                ? "Leads with answered outbound calls up to 2 min"
                                : stage.id === "conversation_2min"
                                  ? "Leads with answered calls above 2 min"
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
                          currentStage={stage.id}
                          dialCount={dialCounts[String(lead.id)] || 0}
                          onSetTemperature={handleCardTemperature}
                          overdueMeeting={stage.id === "meeting_booked" ? (overdueMeetingByLead.get(String(lead.id)) || null) : null}
                          onMarkHeld={handleMarkMeetingHeld}
                          onReschedule={openMeetingReschedule}
                        />
                      ))}
                      {hiddenCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpandedColumns((prev) => ({ ...prev, [stage.id]: (prev[stage.id] || 0) + KANBAN_SHOW_MORE_STEP }))}
                          className="w-full rounded-xl border border-dashed border-rose-200 bg-white/80 px-3 py-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 transition"
                        >
                          Show {Math.min(hiddenCount, KANBAN_SHOW_MORE_STEP)} more{hiddenCount > KANBAN_SHOW_MORE_STEP ? ` (${hiddenCount} hidden)` : ""}
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

      <PipelineBookMeetingModal
        open={bookingModal.open}
        lead={bookingModal.lead}
        employee={employee}
        form={bookingForm}
        setForm={setBookingForm}
        serviceOptions={bookingServiceOptions}
        submitting={bookingSubmitting}
        onSubmit={handleBookingSubmit}
        onClose={closeBookingModal}
      />

      <EmpModal
        open={meetingReschedule.open}
        onClose={() => { if (!meetingReschedule.saving) closeMeetingReschedule(); }}
        title="Reschedule Meeting"
        subtitle={meetingReschedule.lead?.name || meetingReschedule.meeting?.title || ""}
        footer={(
          <>
            <BtnSecondary onClick={closeMeetingReschedule} disabled={meetingReschedule.saving}>Cancel</BtnSecondary>
            <BtnPrimary onClick={submitMeetingReschedule} disabled={meetingReschedule.saving}>
              {meetingReschedule.saving ? "Saving…" : "Save changes"}
            </BtnPrimary>
          </>
        )}
      >
        <div className="grid grid-cols-2 gap-3">
          <FormGroup>
            <FormLabel>Date</FormLabel>
            <FormInput
              type="date"
              value={meetingReschedule.date}
              onChange={(e) => setMeetingReschedule((m) => ({ ...m, date: e.target.value }))}
            />
          </FormGroup>
          <FormGroup>
            <FormLabel>Time</FormLabel>
            <TimeOfDaySelects value={meetingReschedule.time} onChange={(time) => setMeetingReschedule((m) => ({ ...m, time }))} />
          </FormGroup>
        </div>
      </EmpModal>

      <MeetingBookedWhatsAppModal
        open={Boolean(bookedPrompt.meeting)}
        meeting={bookedPrompt.meeting}
        lead={bookedPrompt.lead}
        employee={employee}
        onClose={() => setBookedPrompt({ meeting: null, lead: null })}
      />
    </div>
  );
}
