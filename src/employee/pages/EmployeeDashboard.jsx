import { useMemo, useState } from "react";
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
  buildPipelineChartFromLeads,
  pipelineStageCountsKey,
  buildSourceChartFromLeads,
  buildDashboardAgenda,
  buildRecentActivityFeed,
  getEmpPipelineSummary,
  getEmpAppToday,
  filterCallsForPeriod,
  LEAD_STATUS_LABELS,
} from "../../data/employeeMock.js";
import { AvatarCircle } from "../components/EmpUI.jsx";
import { EMP_PAGE } from "../../lib/employeeLayout.js";
import useIsMobile from "../../lib/useIsMobile.js";
import { formatGreeting } from "../../lib/greeting.js";
import { SEGMENT_WRAP, SEGMENT_BTN, SEGMENT_BTN_ACTIVE, SEGMENT_BTN_INACTIVE } from "../../lib/segmentPills.js";
import CallyzerStatsPanel from "../../components/CallyzerStatsPanel.jsx";
import { useCallyzerStats } from "../../lib/useCallyzerStats.js";
import { useEmployeeSyncedPeriodCalls } from "../../lib/useEmployeeSyncedPeriodCalls.js";
import { periodLabel } from "../../lib/periodQuery.js";
import { CALL_CONVERSATION_LABEL, countConversationCalls } from "../../lib/callMetrics.js";

const PERIOD_TO_CALLYZER = {
  today: "Today",
  week: "This Week",
  month: "This Month",
};

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
  const periodKey = String(searchParams.get("period") || "today").toLowerCase();
  const period = PERIOD_TO_CALLYZER[periodKey] || "Today";
  const [pipeFilter, setPipeFilter] = useState("all");
  const [agendaDone, setAgendaDone] = useState({});
  const [privateModalOpen, setPrivateModalOpen] = useState(false);

  const { stats: callyzerStats, loading: callyzerLoading, syncing: callyzerSyncing, configured: callyzerConfigured, message: callyzerMessage, lastUpdated: callyzerLastUpdated, refresh: refreshCallyzerStats } =
    useCallyzerStats(employee?.id, period, Boolean(employee?.id));

  const { calls: monthCallsFromApi } = useEmployeeSyncedPeriodCalls(
    employee?.id,
    "month",
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
  const pipelineCountsKey = useMemo(
    () => pipelineStageCountsKey(leads, periodCalls, { period: periodKey, meetings: allMeetings }, { callyzerStats }),
    [leads, periodCalls, periodKey, allMeetings, callyzerStats],
  );
  const pipeline = useMemo(
    () => buildPipelineChartFromLeads(
      leads,
      periodCalls,
      { period: periodKey, meetings: allMeetings },
      { callyzerStats },
    ),
    [pipelineCountsKey, leads, periodCalls, periodKey, allMeetings, callyzerStats],
  );
  const sourceChart = useMemo(() => buildSourceChartFromLeads(leads), [leads]);
  const summary = useMemo(() => getEmpPipelineSummary(leads), [leads]);
  const agenda = useMemo(
    () => buildDashboardAgenda({ meetingsUpcoming, tasks, followUps }),
    [meetingsUpcoming, tasks, followUps],
  );
  const activityFeed = useMemo(
    () => buildRecentActivityFeed(activities, calls, 5),
    [activities, calls],
  );

  const todayTasks = (tasks && tasks[getEmpAppToday()]) || [];
  const tasksDue = todayTasks.filter((t) => t.status !== "done" && t.status !== "completed").length;
  const tasksDone = todayTasks.filter((t) => t.status === "done" || t.status === "completed").length;
  const hotFollowUps = (followUps || []).filter((f) => f && !f.done && (f.urgency === "overdue" || f.urgency === "today")).length;
  const [customCallsTarget, setCustomCallsTarget] = useState(() => {
    try {
      const saved = window.localStorage.getItem("emp_calls_target");
      if (saved && !isNaN(Number(saved)) && Number(saved) > 0) return Number(saved);
    } catch {}
    return employee?.callsTarget || 60;
  });

  const callsToday = callyzerStats?.totalCalls ?? filterCallsForPeriod(calls || [], "today").length;
  const callsTarget = customCallsTarget || employee?.callsTarget || 60;
  const callPct = callsTarget ? Math.min(100, Math.round((callsToday / callsTarget) * 100)) : 0;
  const callRingDash = (callPct / 100) * (2 * Math.PI * 15.5);
  const callRingCirc = 2 * Math.PI * 15.5;

  const handleEditCallsTarget = () => {
    const entered = window.prompt("Set your daily call target:", String(callsTarget));
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

  const statCards = useMemo(() => [
    {
      label: "Total Leads",
      value: String(summary.total),
      change: summary.total ? `${summary.active} active` : "No leads yet",
      icon: Users,
      tone: "info",
      link: "/employee/leads",
    },
    {
      label: "Hot Leads",
      value: String(summary.hot),
      change: summary.hot ? "Needs attention" : "None right now",
      icon: Flame,
      tone: "warning",
      filter: "hot",
    },
    {
      label: "Converted",
      value: String(summary.converted ?? leads.filter((l) => l.status === "converted").length),
      change: summary.total ? `${summary.winRate}% rate` : "—",
      icon: CheckCircle2,
      tone: "success",
      filter: "converted",
    },
    {
      label: "Tasks Due",
      value: String(tasksDue),
      change: tasksDone ? `${tasksDone} done today` : "None completed",
      icon: ClipboardList,
      tone: "primary",
      link: "/employee/tasks",
    },
    {
      label: `Conversations (${CALL_CONVERSATION_LABEL})`,
      value: String(conversations5MinPlus),
      change: callyzerStats?.conversations5MinDuration
        ? `${callyzerStats.conversations5MinDuration} talk time`
        : `Connected calls ${CALL_CONVERSATION_LABEL}`,
      icon: MessageCircle,
      tone: "success",
      link: "/employee/calls",
    },
  ], [summary, leads, tasksDue, tasksDone, conversations5MinPlus, callyzerStats]);

  const oddStatCount = statCards.length % 2 === 1;

  const filteredPipeLeads = useMemo(() => {
    if (pipeFilter === "all") return null;
    return leads.filter((l) => l.status === pipeFilter);
  }, [pipeFilter, leads]);

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
              {periodLabel(periodKey)} · {dateLabel}
            </p>
            <h1 className="font-display text-base sm:text-xl font-black text-slate-900 tracking-tight mt-0.5">
              {formatGreeting(employee?.name || "Employee")}
            </h1>
            <div className="flex gap-1.5 mt-2 overflow-x-auto scrollbar-none">
              {[
                { label: `${hotFollowUps} hot follow-ups`, to: "/employee/follow-ups" },
                { label: `${meetingsUpcoming?.length || 0} meetings`, to: "/employee/meetings" },
                { label: `${pendingAgenda} agenda`, to: null },
              ].map((chip) => (
                chip.to ? (
                  <Link
                    key={chip.label}
                    to={chip.to}
                    className="inline-flex items-center gap-0.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-rose-50/70 border border-rose-100 text-[10px] sm:text-[11px] font-semibold text-[#be123c] hover:bg-rose-50 transition shrink-0"
                  >
                    {chip.label}
                    <ChevronRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 opacity-50" />
                  </Link>
                ) : (
                  <span key={chip.label} className="inline-flex px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-slate-50 border border-slate-200 text-[10px] sm:text-[11px] font-semibold text-slate-600 shrink-0">
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
              sub=""
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
          subtitle={`${periodLabel(periodKey)} · auto-syncs every 15s from Callyzer`}
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
              sub={isMobile ? "Stage breakdown" : "Stage-wise breakdown"}
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
                <p className="text-center text-sm text-slate-400 py-8">No leads in pipeline yet</p>
              ) : (
                pipeline.map((s) => (
                  <div
                    key={s.fullLabel || s.label}
                    className="flex items-center gap-1.5 sm:gap-2 min-h-[14px] sm:min-h-[16px]"
                    title={s.fullLabel || s.label}
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
                <SectionHead icon={TrendingUp} title="Lead Sources" sub={isMobile ? "Top channels" : "Top channels this month"} />
                <div className="flex flex-col items-center py-1 sm:py-2">
                  {sourceChart.length === 0 ? (
                    <p className="text-sm text-slate-400 py-8">No lead sources yet</p>
                  ) : (
                  <>
                  <div className={`relative ${isMobile ? "w-[112px] h-[112px]" : "w-[148px] h-[148px]"}`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={sourceChart.map((s) => ({ name: s.label, value: s.pct, color: s.color }))}
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
                          formatter={(val, _n, props) => [`${val}%`, props.payload.name]}
                          contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 11 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className={`${isMobile ? "text-base" : "text-xl"} font-black text-slate-900`}>100%</span>
                      <span className="text-[9px] sm:text-[10px] text-slate-400 font-medium">Total</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 sm:gap-x-4 gap-y-1 mt-3 sm:mt-4 w-full max-w-[240px]">
                    {sourceChart.map((s) => (
                      <div key={s.label} className="flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-[10px] text-slate-600 min-w-0">
                        <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0" style={{ background: s.color }} />
                        <span className="truncate flex-1">{s.label}</span>
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
                  sub="Last 24 hours"
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
                  <span>{callsToday}</span>
                  <span className="text-xs sm:text-sm text-slate-400 font-semibold">/{callsTarget}</span>
                  <button
                    type="button"
                    onClick={handleEditCallsTarget}
                    title="Edit daily call target"
                    className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </p>
                <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 mt-0.5 leading-tight">
                  Calls today · {callPct}% of target
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
              { label: "Follow-ups", to: "/employee/follow-ups", icon: Zap, count: followUps.filter((f) => !f.done).length },
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
