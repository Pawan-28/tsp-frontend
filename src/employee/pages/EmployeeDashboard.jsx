import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus, Users, Flame, CheckCircle2, ClipboardList, TrendingUp,
  Phone, Calendar, ArrowRight, Zap, Target, ChevronRight, MessageCircle, Pencil, Shield,
} from "lucide-react";
import toast from "react-hot-toast";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Badge, StatCard, GlassCard } from "../../components/Primitives.jsx";
import PrivateContactsModal from "../components/PrivateContactsModal.jsx";
import { useEmployee } from "../../context/EmployeeContext.jsx";
import {
  buildDashboardAgenda,
  getEmpAppToday,
  filterCallsForPeriod,
  LEAD_STATUS_LABELS,
  EMP_KANBAN_STAGES,
} from "../../data/employeeMock.js";
import { isHotLead } from "../../data/pipelineMock.js";
import {
  groupEmpLeadsKanban,
  countPipelineCallMetrics,
  filterMeetingsForPeriod,
  getPipelineStageDisplayCounts,
  resolveLeadForCall,
} from "../../lib/leadKanban.js";
import { AvatarCircle } from "../components/EmpUI.jsx";
import { EMP_PAGE } from "../../lib/employeeLayout.js";
import useIsMobile from "../../lib/useIsMobile.js";
import { formatGreeting } from "../../lib/greeting.js";
import { SEGMENT_WRAP, SEGMENT_BTN, SEGMENT_BTN_ACTIVE, SEGMENT_BTN_INACTIVE } from "../../lib/segmentPills.js";
import CallyzerStatsPanel from "../../components/CallyzerStatsPanel.jsx";
import { useCallyzerStats } from "../../lib/useCallyzerStats.js";
import { useEmployeeSyncedPeriodCalls } from "../../lib/useEmployeeSyncedPeriodCalls.js";
import { periodWords, periodQueryString, resolvePeriodSelection, workingDaysForSelection } from "../../lib/periodSelection.js";
import { CALL_CONVERSATION_LABEL, countConversationCalls } from "../../lib/callMetrics.js";
import { apiGet } from "../../lib/api.js";
import { getCrmHeaders } from "../../lib/crmContext.js";
import { mapStageToId } from "../../lib/pipelineStages.js";
import { formatActivityDate } from "../../lib/formatActivityDate.js";
import { formatDialerPhone } from "../../lib/phoneUtils.js";
import { sourceLabel } from "../../lib/sourceLabels.js";
import { useCallHistory } from "../../lib/useCallHistory.js";
import { MEETING_METRIC_INFO } from "../../lib/metricInfo.js";
import { computeFollowUpCounts, computeTaskCounts } from "../../lib/followUpCounts.js";
import { StatValueSkeleton } from "../../components/Skeleton.jsx";
import { isDateKeyInPeriod, localDateKey } from "../../lib/periodFilter.js";
import { parseAppDateTime } from "../../lib/timezone.js";

// Period wording (today / yesterday / this week / this month / "1 Oct – 6 Oct") and the Mon–Fri working-day count
// the daily call target is scaled by come from lib/periodSelection.js, shared with Call Reporting and the Pipeline.

const ACTIVITY_EMOJI = {
  call: "📞", email: "✉️", whatsapp: "💬", meeting: "📅", note: "📝", proposal: "📄",
};
const DAY_MS = 24 * 60 * 60 * 1000;
const isUnknownName = (name) => !name || /^unknown/i.test(String(name).trim());

/** Lead tiles for the selected period (leads created in it) — same endpoint the Employee Pipeline summary uses. */
function useEmployeeLeadSummary(employeeId, periodKey, service, leadCount) {
  const key = employeeId ? `${employeeId}|${periodKey}|${service || ""}` : null;
  const [state, setState] = useState({ key: null, data: null, error: false });

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    // periodKey is "today" | "week" | "month" | "custom:FROM:TO" (Yesterday is a one-day custom range).
    const qs = new URLSearchParams(periodQueryString(periodKey));
    if (service) qs.set("service", service);
    apiGet(`/api/v1/employee/${employeeId}/lead-summary?${qs.toString()}`, {
      headers: getCrmHeaders("employee"),
      cacheTtl: 15_000,
    })
      .then((res) => {
        if (!cancelled) setState({ key, data: res?.data ?? res, error: false });
      })
      .catch(() => {
        if (!cancelled) setState({ key, data: null, error: true });
      });
    return () => { cancelled = true; };
    // leadCount: refetch when the employee adds/receives a lead so the tiles don't lag the list.
  }, [key, employeeId, periodKey, service, leadCount]);

  // Never show another period's numbers while this one loads.
  const ready = state.key === key;
  return {
    summary: ready ? state.data : null,
    loading: Boolean(key) && (!ready || (!state.data && !state.error)),
    error: ready && state.error,
  };
}

const SOURCE_COLORS = ["#3b82f6", "#7c3aed", "#0ea5e9", "#10b981", "#f59e0b", "#f97316"];

/** Lead-source split of the given leads: top 5 channels + "Other", labelled via sourceLabel. */
function buildSourceChart(leads) {
  if (!leads.length) return [];
  const counts = new Map();
  for (const lead of leads) {
    const label = sourceLabel(lead.source) || "Other";
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5).reduce((s, [, n]) => s + n, 0);
  if (rest) top.push(["Other", rest]);
  return top.map(([label, count], i) => ({
    label,
    count,
    pct: Math.round((count / leads.length) * 100),
    color: SOURCE_COLORS[i % SOURCE_COLORS.length],
  }));
}

const PIPE_FILTERS = [
  { id: "all", label: "All" },
  { id: "hot", label: "Hot", icon: Flame },
  { id: "warm", label: "Warm" },
  { id: "cold", label: "Cold" },
];

function SectionHead({ icon: Icon, title, sub, action, stackAction }) {
  return (
    <div className={`flex ${stackAction ? "flex-col sm:flex-row" : ""} items-start justify-between gap-2 sm:gap-3 mb-2 sm:mb-4`}>
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
        <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-slate-50 border border-slate-200 grid place-items-center shrink-0">
          <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display font-bold text-slate-900 text-xs sm:text-sm">{title}</h3>
          {sub && <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 leading-tight">{sub}</p>}
        </div>
      </div>
      {action && (
        <div className={`${stackAction ? "w-full sm:w-auto overflow-x-auto scrollbar-none" : ""} shrink-0`}>
          {action}
        </div>
      )}
    </div>
  );
}

export default function EmployeeDashboard() {
  const {
    employee,
    tasks,
    followUps,
    meetingsUpcoming,
    meetingsHistory,
    calls,
    activities,
    loading,
    leads: rawLeads,
    selectedService,
  } = useEmployee();

  const leads = useMemo(() => {
    if (!selectedService || selectedService === "All Services") return rawLeads;
    return rawLeads.filter((l) => l.service === selectedService || l.requirements === selectedService);
  }, [rawLeads, selectedService]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile(640);
  // Today | Yesterday | Week | Month | Custom — same URL contract as the Pipeline (?period=&from=&to=).
  // `periodKey` is the encoded period every helper understands: today | week | month | custom:FROM:TO.
  const selection = useMemo(() => resolvePeriodSelection(searchParams, { defaultPeriod: "today" }), [searchParams]);
  const periodKey = selection.period;
  const [pipeFilter, setPipeFilter] = useState("all");
  const [agendaDone, setAgendaDone] = useState({});
  const [privateModalOpen, setPrivateModalOpen] = useState(false);

  const { stats: callyzerStats, loading: callyzerLoading, syncing: callyzerSyncing, configured: callyzerConfigured, message: callyzerMessage, lastUpdated: callyzerLastUpdated, refresh: refreshCallyzerStats } =
    useCallyzerStats(employee?.id, periodKey, Boolean(employee?.id));

  // Today / Week / Month are sliced from the month window; Yesterday / Custom can fall outside it, so they are
  // fetched as the exact range (and sliced again below, which is a no-op for an exact fetch).
  const { calls: monthCallsFromApi } = useEmployeeSyncedPeriodCalls(
    employee?.id,
    selection.needsExactFetch ? periodKey : "month",
    rawLeads,
    Boolean(employee?.id),
  );
  const periodCalls = useMemo(
    () => filterCallsForPeriod(monthCallsFromApi || [], periodKey),
    [monthCallsFromApi, periodKey],
  );
  const allMeetings = useMemo(
    () => [...(meetingsUpcoming || []), ...(meetingsHistory || [])],
    [meetingsUpcoming, meetingsHistory],
  );
  const words = useMemo(() => periodWords(selection), [selection]);
  const serviceFilter = selectedService && selectedService !== "All Services" ? selectedService : "";
  const { summary: leadSummary, loading: leadSummaryLoading, error: leadSummaryError } = useEmployeeLeadSummary(
    employee?.id,
    periodKey,
    serviceFilter,
    rawLeads?.length || 0,
  );

  // Pipeline bars: the same board grouping the Employee Pipeline uses, but ONLY cards active in the selected
  // period. Manually staged leads stay on the board for every period (tagged `_outsidePeriod`); counting them
  // made "Today" show last month's Meeting Booked / Not Interested totals while every call tile read 0.
  const { callHistory } = useCallHistory({ scope: "employee", employeeId: employee?.id, enabled: Boolean(employee?.id), refreshKey: String(periodCalls?.length || 0) });
  const { pipeline, olderStagedCount } = useMemo(() => {
    const grouped = groupEmpLeadsKanban(leads, periodCalls, {
      period: periodKey,
      meetings: allMeetings,
      visibleLeads: leads,
      callHistory, // same Lead / Not Pick / Short Call / Conversation rule as the Pipeline
    });
    let older = 0;
    const inPeriod = {};
    for (const [stageId, list] of Object.entries(grouped)) {
      const arr = Array.isArray(list) ? list : [];
      const kept = arr.filter((l) => !l?._outsidePeriod);
      older += arr.length - kept.length;
      inPeriod[stageId] = kept;
    }
    const counts = getPipelineStageDisplayCounts(inPeriod, {
      callyzerStats,
      callMetrics: countPipelineCallMetrics(periodCalls),
      periodMeetings: filterMeetingsForPeriod(allMeetings, periodKey),
    });
    const max = Math.max(1, ...Object.values(counts));
    return {
      olderStagedCount: older,
      pipeline: EMP_KANBAN_STAGES.map((s) => ({
        id: s.id,
        label: s.shortLabel || s.label,
        fullLabel: s.label,
        count: counts[s.id] || 0,
        pct: Math.round(((counts[s.id] || 0) / max) * 100),
        color: s.color,
      })),
    };
  }, [leads, periodCalls, periodKey, allMeetings, callyzerStats, callHistory]);

  // Lead sources follow the period too: leads created in it (same basis as the Total Leads tile).
  const periodLeads = useMemo(
    () => leads.filter((l) => {
      const raw = l.createdAt || l.created_at;
      if (!raw) return false;
      const at = parseAppDateTime(raw) || new Date(raw);
      return !Number.isNaN(at.getTime()) && isDateKeyInPeriod(localDateKey(at), periodKey);
    }),
    [leads, periodKey],
  );
  const sourceChart = useMemo(() => buildSourceChart(periodLeads), [periodLeads]);
  const agenda = useMemo(
    () => buildDashboardAgenda({ meetingsUpcoming, tasks, followUps }),
    [meetingsUpcoming, tasks, followUps],
  );

  // Recent Activity is a fixed "last 24 hours" window — it deliberately ignores the period filter.
  const activityFeed = useMemo(() => {
    const items = [];
    const activityMap = activities && typeof activities === "object" && !Array.isArray(activities) ? activities : {};
    for (const events of Object.values(activityMap)) {
      if (!Array.isArray(events)) continue;
      for (const e of events) items.push({ emoji: ACTIVITY_EMOJI[e.type] || "•", text: e.text, time: e.time, ms: Date.now() });
    }
    const nowMs = Date.now();
    const recentCalls = [];
    for (const c of Array.isArray(calls) ? calls : []) {
      const at = parseAppDateTime(c.callAt || c.startedAt || c.createdAt);
      const ms = at ? at.getTime() : NaN;
      if (Number.isNaN(ms) || nowMs - ms > DAY_MS || ms > nowMs + 5 * 60 * 1000) continue;
      recentCalls.push({ call: c, ms });
    }
    recentCalls.sort((a, b) => b.ms - a.ms);
    for (const { call: c, ms } of recentCalls) {
      const kind = c.type === "miss" ? "Missed call" : c.type === "in" ? "Inbound call" : "Outbound call";
      // Calls to saved numbers can arrive without a name: join the lead, else show the formatted number.
      let name = isUnknownName(c.name) ? "" : c.name;
      if (!name) {
        const lead = resolveLeadForCall(c, rawLeads || []);
        const leadName = lead?.name || lead?.leadName;
        name = isUnknownName(leadName) ? "" : leadName;
      }
      if (!name) name = formatDialerPhone(c.phone || c.clientPhone) || "Unknown number";
      const dur = c.duration && c.duration !== "—" ? ` (${c.duration})` : "";
      items.push({ emoji: "📞", text: `${kind}: ${name}${dur}`, time: formatActivityDate(new Date(ms)), ms });
    }
    return items.sort((a, b) => b.ms - a.ms).slice(0, 5);
  }, [activities, calls, rawLeads]);

  // Task + follow-up workload come from ONE shared helper (lib/followUpCounts.js), the same one the Follow-Up
  // and My Tasks pages use, so the three pages can never describe different workloads.
  const taskCounts = useMemo(
    () => computeTaskCounts({ tasks, employeeName: employee?.name }),
    [tasks, employee?.name],
  );
  const followUpCounts = useMemo(
    () => computeFollowUpCounts({ followUps, leads: rawLeads, calls, employeeId: employee?.id }),
    [followUps, rawLeads, calls, employee?.id],
  );
  const tasksDue = taskCounts.dueToday;
  const tasksDone = taskCounts.doneToday;
  // Follow-ups due (overdue + today) are real scheduled follow-ups; they are NOT the same set as the "Hot Leads"
  // tile (hot leads created in the period), so the greeting shows them as two separate, honestly named chips.
  const dueFollowUps = followUpCounts.actionable;
  const periodMeetingCount = useMemo(
    () => filterMeetingsForPeriod(allMeetings, periodKey).length,
    [allMeetings, periodKey],
  );
  const [customCallsTarget, setCustomCallsTarget] = useState(() => {
    try {
      const saved = window.localStorage.getItem("emp_calls_target");
      if (saved && !isNaN(Number(saved)) && Number(saved) > 0) return Number(saved);
    } catch {}
    return employee?.callsTarget || 60;
  });

  // The call figure follows the selected period, so the target scales with it: daily target x Mon–Fri days.
  const callsDone = callyzerStats?.totalCalls ?? filterCallsForPeriod(calls || [], periodKey).length;
  const dailyCallsTarget = customCallsTarget || employee?.callsTarget || 60;
  const workingDays = workingDaysForSelection(selection);
  // A range with no Mon–Fri day in it (yesterday = Sunday, a Saturday/Sunday-only custom range) has no target:
  // show "—" instead of dividing by zero.
  const callsTarget = workingDays > 0 ? dailyCallsTarget * workingDays : null;
  const callPct = callsTarget ? Math.round((callsDone / callsTarget) * 100) : null; // not capped: 470% is real
  const callsTargetTip = callsTarget == null
    ? `No working days (Mon–Fri) ${words.when}, so there is no call target for this range`
    : selection.key === "today"
      ? `Daily call target: ${dailyCallsTarget}`
      : `${dailyCallsTarget} calls/day x ${workingDays} working ${workingDays === 1 ? "day" : "days"} (Mon–Fri) ${words.when} = ${callsTarget}`;
  const callRingCirc = 2 * Math.PI * 15.5;
  const callRingDash = (Math.min(100, callPct ?? 0) / 100) * callRingCirc; // the ring itself stops at full

  const handleEditCallsTarget = () => {
    const entered = window.prompt("Set your daily call target:", String(dailyCallsTarget));
    if (entered && !isNaN(Number(entered)) && Number(entered) > 0) {
      const newTarget = Math.round(Number(entered));
      setCustomCallsTarget(newTarget);
      try {
        window.localStorage.setItem("emp_calls_target", String(newTarget));
      } catch {}
      toast.success(`Daily call target updated to ${newTarget}`);
    }
  };

  const conversations5MinPlus = useMemo(() => {
    if (callyzerStats?.conversations5MinPlus != null) {
      return callyzerStats.conversations5MinPlus;
    }
    return countConversationCalls(calls, {
      periodFilter: (list) => filterCallsForPeriod(list, periodKey),
    });
  }, [callyzerStats, calls, periodKey]);

  // Lead tiles: leads CREATED in the selected period (backend lead-summary). Footnote colours are semantic:
  // green = good, amber = needs attention, slate = neutral / empty.
  const statCards = useMemo(() => {
    const s = leadSummary;
    const basis = `leads ${words.created}`;
    const pending = leadSummaryLoading;
    const failed = leadSummaryError;
    const num = (n) => (pending ? <StatValueSkeleton className="h-6 w-12" /> : failed || n == null ? "—" : String(n));
    const unavailable = failed ? { change: "Couldn't load", changeTone: "muted" } : null;
    const closedRate = s?.total ? Math.round((s.closed / s.total) * 100) : 0;
    return [
      {
        label: "Total Leads",
        value: num(s?.total),
        change: unavailable?.change ?? (pending ? "Loading…" : s?.total ? `${s.openLeads} open` : "No leads in period"),
        changeTone: unavailable?.changeTone ?? "muted",
        sub: words.created,
        icon: Users,
        tone: "info",
        link: "/employee/leads",
        tip: `Total Leads: ${s?.definitions?.totalLeads || `all ${basis} to you`}. "Open" = not closed and not Not Interested.`,
      },
      {
        label: "Hot Leads",
        value: num(s?.hot),
        change: unavailable?.change ?? (pending ? "Loading…" : s?.hot ? "Needs attention" : "None right now"),
        changeTone: unavailable?.changeTone ?? (s?.hot ? "warning" : "muted"),
        sub: words.created,
        icon: Flame,
        tone: "warning",
        filter: "hot",
        tip: `Hot Leads: ${basis} with temperature Hot. Click to list them.`,
      },
      {
        label: "Converted",
        value: num(s?.closed),
        change: unavailable?.change ?? (pending ? "Loading…" : s?.total ? `${closedRate}% rate` : "—"),
        changeTone: unavailable?.changeTone ?? (s?.closed ? "success" : "muted"),
        sub: words.created,
        icon: CheckCircle2,
        tone: "success",
        filter: "converted",
        tip: `Converted: ${basis} that reached Payment Complete. Rate = converted / total leads ${words.created}.`,
      },
      {
        label: "Tasks Due",
        value: String(tasksDue),
        change: tasksDone ? `${tasksDone} done today` : tasksDue ? "None done yet" : "No tasks due",
        changeTone: tasksDone ? "success" : tasksDue ? "warning" : "muted",
        sub: "today",
        icon: ClipboardList,
        tone: "primary",
        link: "/employee/tasks",
        tip: "Tasks Due: your tasks scheduled for today that are not done yet. Not affected by the period filter.",
      },
      {
        label: `Conversations (${CALL_CONVERSATION_LABEL})`,
        value: String(conversations5MinPlus),
        change: callyzerStats?.conversations5MinDuration
          ? `${callyzerStats.conversations5MinDuration} talk time`
          : `Connected calls ${CALL_CONVERSATION_LABEL}`,
        changeTone: "muted",
        icon: MessageCircle,
        tone: "success",
        link: "/employee/calls",
        tip: `Conversations: connected calls of ${CALL_CONVERSATION_LABEL} made ${words.when}.`,
      },
    ];
  }, [leadSummary, leadSummaryLoading, leadSummaryError, words, tasksDue, tasksDone, conversations5MinPlus, callyzerStats]);

  const oddStatCount = statCards.length % 2 === 1;

  // Tile click-through list: same basis as the tiles (leads created in the selected period).
  const filteredPipeLeads = useMemo(() => {
    if (pipeFilter === "all") return null;
    if (pipeFilter === "hot") return periodLeads.filter(isHotLead);
    if (pipeFilter === "converted") {
      return periodLeads.filter((l) => mapStageToId(l.pipelineStage || l.stage, l.status) === "payment_complete" || l.status === "converted");
    }
    return periodLeads.filter((l) => l.status === pipeFilter);
  }, [pipeFilter, periodLeads]);

  const pendingAgenda = agenda.filter((a) => !agendaDone[a.id]).length;
  const pipelineTotal = pipeline.reduce((s, p) => s + p.count, 0);
  const proposalSentCount = pipeline.find((p) => p.id === "proposal_sent" || p.fullLabel === "Proposal Sent" || p.label === "Proposal Sent" || p.label === "Proposal")?.count ?? 0;
  const convertedCount = pipeline.filter((p) => p.id === "advance_paid" || p.id === "payment_complete" || p.fullLabel === "Advance Paid" || p.fullLabel === "Payment Complete").reduce((s, p) => s + p.count, 0);
  const convRate = pipelineTotal ? `${Math.round(((proposalSentCount + convertedCount) / pipelineTotal) * 100)}%` : "—";

  const markAgendaDone = (itemId) => {
    setAgendaDone((prev) => ({ ...prev, [itemId]: true }));
    toast.success("Marked complete");
  };

  const dateLabel = new Date().toLocaleDateString("en-IN", {
    weekday: isMobile ? "short" : "long",
    day: "numeric",
    month: "short",
  });
  // Header chip: "Today · Tuesday, 7 Oct" | "Yesterday · Monday, 6 Oct" | "1 Oct – 6 Oct 2026" (the range is the date).
  const headerDate = selection.key === "yesterday" && selection.range
    ? new Date(`${selection.range.startDate}T12:00:00Z`).toLocaleDateString("en-IN", {
      weekday: isMobile ? "short" : "long", day: "numeric", month: "short", timeZone: "UTC",
    })
    : selection.key === "custom" ? "" : dateLabel;


  const pipeFilters = (
    <div className={`${SEGMENT_WRAP} max-w-full`}>
      {PIPE_FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => setPipeFilter(f.id)}
          className={`flex items-center gap-0.5 sm:gap-1 ${SEGMENT_BTN} ${
            pipeFilter === f.id ? SEGMENT_BTN_ACTIVE : SEGMENT_BTN_INACTIVE
          }`}
        >
          {f.icon && <f.icon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
          {f.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className={EMP_PAGE}>
      <GlassCard className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {selection.label}{headerDate ? ` · ${headerDate}` : ""}
            </p>
            <h1 className="font-display text-base sm:text-xl font-black text-slate-900 tracking-tight mt-0.5">
              {formatGreeting(employee?.name || "Employee")}
            </h1>
            <div className="flex gap-1.5 mt-2 overflow-x-auto scrollbar-none">
              {[
                // Hot-lead chip uses the same summary as the Hot Leads tile, so the two can never disagree.
                ...(leadSummary && !leadSummaryError
                  ? [{ label: `${leadSummary.hot} hot leads`, to: "/employee/leads?filter=hot", tip: `Hot leads ${words.created} (same as the Hot Leads tile)` }]
                  : []),
                { label: `${dueFollowUps} follow-ups due`, to: "/employee/follow-ups", tip: "Open follow-ups that are overdue or due today" },
                { label: `${periodMeetingCount} ${periodMeetingCount === 1 ? "meeting" : "meetings"} scheduled ${words.when}`, to: "/employee/meetings", tip: `Scheduled in period: ${MEETING_METRIC_INFO.scheduledInPeriod}` },
                { label: `${pendingAgenda} on today's agenda`, to: null, tip: "Meetings, tasks and follow-ups on today's agenda that are not marked done" },
              ].map((chip) => (
                chip.to ? (
                  <Link
                    key={chip.label}
                    to={chip.to}
                    title={chip.tip}
                    className="inline-flex items-center gap-0.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-rose-50/70 border border-rose-100 text-[10px] sm:text-[11px] font-semibold text-[#be123c] hover:bg-rose-50 transition shrink-0"
                  >
                    {chip.label}
                    <ChevronRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 opacity-50" />
                  </Link>
                ) : (
                  <span key={chip.label} title={chip.tip} className="inline-flex px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-slate-50 border border-slate-200 text-[10px] sm:text-[11px] font-semibold text-slate-600 shrink-0">
                    {chip.label}
                  </span>
                )
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPrivateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-rose-50 hover:bg-rose-100 text-[#be123c] border border-rose-200 text-xs sm:text-sm font-bold transition shadow-sm shrink-0"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Private Contacts</span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/employee/leads?action=add")}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#be123c] hover:bg-[#a20f32] text-white text-xs sm:text-sm font-bold transition shadow-md shrink-0"
            >
              <Plus className="w-4 h-4" /> Add Lead
            </button>
          </div>
        </div>
      </GlassCard>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
        {statCards.map((s, i) => (
          <button
            key={s.label}
            type="button"
            title={s.tip}
            onClick={() => {
              if (s.link) navigate(s.link);
              else if (s.filter) setPipeFilter(s.filter);
            }}
            className={`text-left w-full min-w-0 ${oddStatCount && i === 0 ? "col-span-2 sm:col-span-1" : "col-span-1"}`}
          >
            <StatCard
              label={s.label}
              value={s.value}
              change={s.change}
              changeTone={s.changeTone}
              sub={s.sub ? `· ${s.sub}` : ""}
              icon={s.icon}
              tone={s.tone}
              compact
              hover
            />
          </button>
        ))}
      </div>

      {callyzerConfigured && (
        <CallyzerStatsPanel
          stats={callyzerStats}
          loading={callyzerLoading}
          syncing={callyzerSyncing}
          lastUpdated={callyzerLastUpdated}
          onRefresh={refreshCallyzerStats}
          configured={callyzerConfigured}
          message={callyzerMessage}
          period={periodKey}
          subtitle={`${selection.label} · auto-syncs every 15s from Callyzer`}
        />
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_minmax(0,_36%)] gap-3 sm:gap-4 items-start">
        <div className="space-y-3 sm:gap-4 min-w-0">
          {/* Pipeline */}
          <GlassCard className="p-3 sm:p-4 md:p-5 min-w-0 overflow-hidden !bg-white !border-slate-200/80 !from-white !via-white !to-white">
            <SectionHead
              icon={Target}
              title="Lead Pipeline"
              sub={`${isMobile ? "Stage breakdown" : "Stage-wise breakdown"} · activity ${words.when}`}
              stackAction
              action={pipeFilters}
            />

            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mb-3 sm:mb-4">
              {[
                { label: "In pipeline", val: pipelineTotal },
                { label: "Proposal Sent", val: proposalSentCount },
                { label: "Close rate", val: convRate },
              ].map((s) => (
                <div key={s.label} className="rounded-lg sm:rounded-xl bg-slate-50 border border-slate-100 px-2 py-1.5 sm:px-3 sm:py-2 text-center min-w-0">
                  <p className="text-sm sm:text-base font-black text-slate-900 tabular-nums">{s.val}</p>
                  <p className="text-[8px] sm:text-[10px] font-medium text-slate-500 leading-tight">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="w-full min-w-0 flex flex-col gap-0.5 sm:gap-1">
              {pipelineTotal === 0 && !loading ? (
                <p className="text-center text-sm text-slate-400 py-8">No pipeline activity {words.when}</p>
              ) : (
                pipeline.map((s) => (
                  <div
                    key={s.fullLabel || s.label}
                    className="flex items-center gap-1.5 sm:gap-2 min-h-[14px] sm:min-h-[16px]"
                    title={
                      s.id === "meeting_booked" ? `${s.fullLabel} (booked cards): ${MEETING_METRIC_INFO.bookedCards}`
                        : s.id === "meeting_done" ? `${s.fullLabel} (cards): ${MEETING_METRIC_INFO.doneCards}`
                          : (s.fullLabel || s.label)
                    }
                  >
                    <span className="text-[8px] sm:text-[9px] font-semibold text-slate-500 w-[54px] sm:w-[64px] shrink-0 truncate leading-tight">
                      {s.label}
                    </span>
                    <div className="flex-1 h-[4px] sm:h-[5px] bg-slate-100 rounded-full overflow-hidden min-w-0">
                      <div
                        className="h-full rounded-full opacity-90"
                        style={{
                          width: `${Math.max(s.count > 0 ? 2 : 0, s.pct)}%`,
                          backgroundColor: s.color,
                        }}
                      />
                    </div>
                    <span className="text-[8px] sm:text-[9px] font-bold text-slate-700 w-6 sm:w-7 text-right tabular-nums shrink-0">
                      {s.count}
                    </span>
                  </div>
                ))
              )}
            </div>
            {olderStagedCount > 0 && (
              <p className="mt-2 text-[9px] sm:text-[10px] text-slate-400">
                {olderStagedCount} older manually-staged {olderStagedCount === 1 ? "lead is" : "leads are"} not counted {words.when}. See the Pipeline page for the full board.
              </p>
            )}

            {pipeFilter !== "all" && filteredPipeLeads && (
              <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[11px] sm:text-xs font-bold text-slate-900">{LEAD_STATUS_LABELS[pipeFilter]} Leads</h4>
                  <Link to={`/employee/leads?filter=${pipeFilter}`} className="text-[10px] sm:text-[11px] font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-0.5">
                    View all <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {filteredPipeLeads.slice(0, 4).map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => navigate("/employee/leads")}
                      className="inline-flex items-center gap-1.5 pl-1 pr-2 sm:pr-3 py-0.5 sm:py-1 rounded-full border border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 transition text-left max-w-full"
                    >
                      <AvatarCircle initials={l.av} color={l.color} size={isMobile ? 20 : 24} />
                      <span className="text-[10px] sm:text-[11px] font-semibold text-slate-800 max-w-[72px] sm:max-w-[90px] truncate">{l.name}</span>
                      <span className="text-[9px] sm:text-[10px] font-bold text-slate-500">{l.budget}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </GlassCard>

          {/* Sources + Activity */}
          <GlassCard className="overflow-hidden min-w-0 !bg-white !border-slate-200/80 !from-white !via-white !to-white">
            <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-slate-100">
              <div className="p-3 sm:p-4 md:p-5">
                <SectionHead icon={TrendingUp} title="Lead Sources" sub={`Top channels · leads ${words.created}`} />
                <div className="flex flex-col items-center py-1 sm:py-2">
                  {sourceChart.length === 0 ? (
                    <p className="text-sm text-slate-400 py-8">No leads {words.created}</p>
                  ) : (
                  <>
                  <div className={`relative ${isMobile ? "w-[112px] h-[112px]" : "w-[148px] h-[148px]"}`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={sourceChart.map((s) => ({ name: s.label, value: s.count, pct: s.pct, color: s.color }))}
                          dataKey="value"
                          cx="50%"
                          cy="50%"
                          innerRadius={isMobile ? 32 : 44}
                          outerRadius={isMobile ? 50 : 68}
                          paddingAngle={3}
                          stroke="#fff"
                          strokeWidth={2}
                        >
                          {sourceChart.map((s) => (
                            <Cell key={s.label} fill={s.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val, _n, props) => [`${val} ${val === 1 ? "lead" : "leads"} (${props.payload.pct}%)`, props.payload.name]}
                          contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 11 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className={`${isMobile ? "text-base" : "text-xl"} font-black text-slate-900 tabular-nums`}>{periodLeads.length}</span>
                      <span className="text-[9px] sm:text-[10px] text-slate-400 font-medium">{periodLeads.length === 1 ? "lead" : "leads"}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 sm:gap-x-4 gap-y-1 mt-3 sm:mt-4 w-full max-w-[240px]">
                    {sourceChart.map((s) => (
                      <div key={s.label} className="flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-[10px] text-slate-600 min-w-0">
                        <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0" style={{ background: s.color }} />
                        <span className="truncate flex-1" title={`${s.label}: ${s.count} ${s.count === 1 ? "lead" : "leads"}`}>{s.label}</span>
                        <span className="font-bold text-slate-800 shrink-0">{s.pct}%</span>
                      </div>
                    ))}
                  </div>
                  </>
                  )}
                </div>
              </div>

              <div className="p-3 sm:p-4 md:p-5 border-t md:border-t-0 border-slate-100">
                <SectionHead
                  icon={Zap}
                  title="Recent Activity"
                  sub="Last 24 hours · not affected by the period filter"
                  action={<Badge tone="muted">Live</Badge>}
                />
                <ul className="space-y-1 sm:space-y-1.5">
                  {activityFeed.length === 0 ? (
                    <li className="text-sm text-slate-400 py-4 text-center">No recent activity</li>
                  ) : activityFeed.map((a) => (
                    <li key={a.text + a.time}>
                      <div className="flex items-center gap-2 sm:gap-2.5 p-1.5 sm:p-2 rounded-lg sm:rounded-xl hover:bg-slate-50 transition">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md sm:rounded-lg grid place-items-center text-xs sm:text-sm shrink-0 bg-slate-100 border border-slate-200">
                          {a.emoji}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] sm:text-[11px] font-semibold text-slate-800 leading-snug line-clamp-2">{a.text}</p>
                          <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5">{a.time}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Agenda sidebar */}
        <div className="space-y-2 sm:space-y-3 xl:sticky xl:top-24 min-w-0">
          <GlassCard className="p-3 sm:p-4 md:p-5 !bg-white !border-slate-200/80 !from-white !via-white !to-white">
            <SectionHead
              icon={Calendar}
              title="Today's Agenda"
              sub={`${pendingAgenda} remaining`}
              action={(
                <Link to="/employee/meetings" className="text-[10px] sm:text-[11px] font-semibold text-slate-600 hover:text-slate-900 shrink-0">
                  + Meeting
                </Link>
              )}
            />

            <div className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-slate-50 border border-slate-100 mb-3 sm:mb-4">
              <div className="relative w-10 h-10 sm:w-12 sm:h-12 shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.5" fill="none" stroke="#f43f5e" strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${callRingDash} ${callRingCirc}`}
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 grid place-items-center">
                  <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600" />
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-base sm:text-lg font-black text-slate-900 tabular-nums leading-none flex items-center gap-1">
                  <span title={callsTargetTip}>{callsDone}</span>
                  <span className="text-xs sm:text-sm text-slate-400 font-semibold" title={callsTargetTip}>/{callsTarget ?? "—"}</span>
                  <button
                    type="button"
                    onClick={handleEditCallsTarget}
                    title={`Edit daily call target (now ${dailyCallsTarget}/day)`}
                    className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </p>
                <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 mt-0.5 leading-tight" title={callsTargetTip}>
                  {words.calls} · {callPct == null ? "no target" : `${callPct}% of target`}
                </p>
              </div>
            </div>

            <div className={`space-y-1.5 sm:space-y-2 ${isMobile ? "max-h-[240px]" : "max-h-[340px]"} overflow-y-auto pr-0.5`}>
              {agenda.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Nothing scheduled for today</p>
              ) : agenda.map((a) => {
                const done = Boolean(agendaDone[a.id]);
                return (
                <div
                  key={a.id}
                  className={`rounded-lg sm:rounded-xl border p-2.5 sm:p-3 transition ${
                    done
                      ? "border-slate-100 bg-slate-50/50 opacity-60"
                      : a.hot
                        ? "border-rose-100 bg-rose-50/30"
                        : "border-slate-100 bg-white hover:border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                        <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 tabular-nums">{a.time}</span>
                        {a.kind === "meeting" && !done && <Badge tone="info">Scheduled</Badge>}
                        {a.hot && !done && <Badge tone="danger">Hot</Badge>}
                        {done && <Badge tone="success">Completed</Badge>}
                      </div>
                      <p className={`text-[11px] sm:text-xs font-bold mt-0.5 sm:mt-1 leading-snug ${done ? "line-through text-slate-400" : "text-slate-900"}`}>
                        {a.title}
                      </p>
                      <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5 line-clamp-1">{a.sub}</p>
                    </div>
                    {!done && a.kind === "meeting" && a.meetLink && (
                      <a
                        href={a.meetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-[9px] sm:text-[10px] font-semibold text-rose-700 bg-rose-50 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg border border-rose-100 hover:bg-rose-100 transition"
                      >
                        Join
                      </a>
                    )}
                    {!done && a.kind !== "meeting" && (
                      <button
                        type="button"
                        onClick={() => markAgendaDone(a.id)}
                        className="shrink-0 text-[9px] sm:text-[10px] font-semibold text-slate-600 bg-slate-50 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg border border-slate-200 hover:bg-slate-100 transition"
                      >
                        Mark done
                      </button>
                    )}
                  </div>
                </div>
              );})}
            </div>
          </GlassCard>

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {[
              { label: "Follow-ups", to: "/employee/follow-ups", icon: Zap, count: followUpCounts.totalOpen },
              { label: "All Leads", to: "/employee/leads", icon: Target, count: leads.length },
            ].map((q) => (
              <Link key={q.to} to={q.to} className="min-w-0">
                <GlassCard hover className="flex items-center gap-2 sm:gap-2.5 p-2.5 sm:p-3 !bg-white !border-slate-200/80 !from-white !via-white !to-white group min-w-0">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-slate-50 border border-slate-200 grid place-items-center group-hover:bg-slate-100 transition shrink-0">
                  <q.icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-[11px] font-bold text-slate-900 truncate">{q.label}</p>
                  <p className="text-[9px] sm:text-[10px] text-slate-400">{q.count} items</p>
                </div>
                </GlassCard>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <PrivateContactsModal
        isOpen={privateModalOpen}
        onClose={() => setPrivateModalOpen(false)}
        employeeId={employee?.id}
        employeeName={employee?.name}
      />
    </div>
  );
}
