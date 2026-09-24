import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  AlertCircle, CalendarClock, CheckCircle2, Clock, Mail, MessageCircle,
  Pause, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Play, RotateCcw,
  Search, Star, TrendingUp, User, Zap, Sparkles, UserPlus, Pencil, Check, X, Loader2, ChevronDown, Shield,
} from "lucide-react";
import { GlassCard, StatCard, Badge } from "../../components/Primitives.jsx";
import { apiPatch, apiPost } from "../../lib/api.js";
import SaveContactModal, { saveContactNameToDatabase } from "../../components/SaveContactModal.jsx";
import PrivateContactsModal from "../components/PrivateContactsModal.jsx";
import {
  computeCallStatsFromCalls,
  LEAD_STATUS_LABELS,
  resolveEmployeeCallType,
} from "../../data/employeeMock.js";
import { useEmployee } from "../../context/EmployeeContext.jsx";
import { CALL_CONVERSATION_LABEL, countConversationCalls, dedupePeriodCalls } from "../../lib/callMetrics.js";
import { filterCallsForPeriod } from "../../lib/periodFilter.js";
import { useCallyzerStats } from "../../lib/useCallyzerStats.js";
import { useEmployeeSyncedPeriodCalls } from "../../lib/useEmployeeSyncedPeriodCalls.js";
import {
  AvatarCircle, BtnPrimary, BtnSecondary, EmpEmptyState, LeadStatusBadge,
} from "../components/EmpUI.jsx";
import { SEGMENT_WRAP, SEGMENT_BTN, SEGMENT_BTN_ACTIVE, SEGMENT_BTN_INACTIVE } from "../../lib/segmentPills.js";
import { formatCallDisplayDate, formatCallDurationLabel } from "../../lib/callDisplay.js";
import PercentRing from "../../components/PercentRing.jsx";

const PERIOD_LABEL = { today: "Today", week: "This Week", month: "This Month" };

const TYPE_META = {
  in: { icon: PhoneIncoming, label: "Inbound", tone: "success", bg: "bg-emerald-50 text-emerald-600 border-emerald-100" },
  out: { icon: PhoneOutgoing, label: "Outbound", tone: "primary", bg: "bg-rose-50 text-rose-600 border-rose-100" },
  miss: { icon: PhoneMissed, label: "Missed", tone: "warning", bg: "bg-amber-50 text-amber-700 border-amber-100" },
};

const ACTIVITY_ICON = {
  call: Phone,
  email: Mail,
  whatsapp: MessageCircle,
  meeting: CalendarClock,
  note: User,
  proposal: CheckCircle2,
};

function MetricRingChart({ value, color, sizeClass = "w-10 h-10 sm:w-14 sm:h-14", labelClass = "text-[9px] sm:text-[11px]" }) {
  return <PercentRing value={value} color={color} sizeClass={sizeClass} labelClass={labelClass} />;
}

function RingMini({ value, color, label, shortLabel }) {
  return (
    <div className="flex flex-col items-center text-center gap-1 sm:flex-row sm:items-center sm:text-left sm:gap-3 min-w-0">
      <MetricRingChart value={value} color={color} />
      <div className="min-w-0 w-full">
        <p className="text-[8px] sm:text-xs font-bold text-slate-900 leading-tight">
          <span className="sm:hidden">{shortLabel || label}</span>
          <span className="hidden sm:inline">{label}</span>
        </p>
        <p className="hidden sm:block text-[10px] text-slate-500 mt-0.5">Target benchmark</p>
      </div>
    </div>
  );
}

function CallMetricCard({ value, color, label, shortLabel, footer, accentRgb }) {
  return (
    <GlassCard className="p-2 sm:p-4 min-w-0 lg:p-0 lg:overflow-hidden lg:relative lg:flex lg:flex-col">
      {/* Mobile / tablet — unchanged compact layout */}
      <div className="lg:hidden">
        <RingMini value={value} color={color} label={label} shortLabel={shortLabel} />
        <p className="hidden sm:block text-[10px] text-slate-500 mt-3 font-medium">{footer}</p>
      </div>

      {/* Web — compact horizontal card with pinned footer */}
      <div className="hidden lg:flex lg:flex-col lg:flex-1 lg:min-h-[108px]">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background: `radial-gradient(ellipse 120% 80% at 100% 100%, rgba(${accentRgb}, 0.08) 0%, transparent 55%), linear-gradient(180deg, #fffafa 0%, #ffffff 100%)`,
          }}
        />
        <div className="relative flex items-center gap-3.5 px-4 pt-3.5 pb-3 flex-1 min-h-0">
          <MetricRingChart value={value} color={color} sizeClass="w-[62px] h-[62px]" labelClass="text-sm" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900 leading-tight">{label}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Target benchmark</p>
          </div>
        </div>
        <p className="relative shrink-0 px-4 py-2 border-t border-rose-100/80 text-[11px] text-slate-500 font-medium bg-white/70">
          {footer}
        </p>
      </div>
    </GlassCard>
  );
}

function CallLogItem({ call, active, onSelect, onSaveName }) {
  const [modalOpen, setModalOpen] = useState(false);
  const callType = resolveEmployeeCallType(call);
  const meta = TYPE_META[callType] || TYPE_META.out;
  const Icon = meta.icon;
  const displayDate = formatCallDisplayDate(call.callAt || call.startedAt || call.date);
  const durationLabel = formatCallDurationLabel(call);

  const phoneNum = call.phone || call.clientPhone || "";
  const rawName = String(call.name || "").trim();
  const isUnknownName =
    !rawName ||
    rawName.toLowerCase() === "unknown" ||
    rawName.toLowerCase() === "unknown lead" ||
    rawName === phoneNum ||
    rawName.replace(/\D/g, "") === phoneNum.replace(/\D/g, "");

  const displayName = !isUnknownName ? rawName : (phoneNum || "No Number");

  const handleOpenModal = (e) => {
    e.stopPropagation();
    setModalOpen(true);
  };

  const handleSavedName = (cleanName, savedLead) => {
    call.name = cleanName;
    if (savedLead?.id) call.leadId = savedLead.id;
    if (onSaveName) onSaveName(call, cleanName);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(call)}
        className={`w-full text-left border transition-all duration-200 min-w-0 ${
          active
            ? "border-rose-300 bg-rose-50/60 shadow-[0_4px_16px_rgba(244,63,94,0.1)] ring-1 ring-rose-100"
            : "border-rose-100/80 bg-white hover:border-rose-200 hover:bg-rose-50/30"
        } p-2 rounded-lg sm:p-4 sm:rounded-xl group/card`}
      >
        {/* Mobile — compact row */}
        <div className="flex items-center gap-2 min-w-0 sm:hidden">
          <div className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 border ${meta.bg}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1.5">
              <div className="min-w-0 flex-1 flex items-center gap-1.5">
                <p className="text-xs font-bold text-slate-900 truncate leading-tight">{displayName}</p>
                {isUnknownName ? (
                  <button
                    type="button"
                    onClick={handleOpenModal}
                    title="Save contact name"
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 transition shrink-0"
                  >
                    <UserPlus className="w-3 h-3" />
                  </button>
                ) : null}
              </div>
              {durationLabel ? (
                <span className="text-[11px] font-black text-slate-900 tabular-nums shrink-0">{durationLabel}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-1 mt-1 min-w-0">
              <span className="inline-flex max-w-[38%] shrink-0">
                <span className={`text-[7px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border truncate block ${meta.bg}`}>
                  {call.outcome}
                </span>
              </span>
              <span className="text-[9px] font-semibold text-slate-400 truncate ml-auto shrink-0 min-w-0">
                {displayDate}
              </span>
            </div>
          </div>
        </div>

        {/* Desktop / web — card layout */}
        <div className="hidden sm:flex items-start gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 border ${meta.bg}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-bold text-slate-900 truncate leading-tight">{displayName}</p>
                  {isUnknownName ? (
                    <button
                      type="button"
                      onClick={handleOpenModal}
                      title="Save contact name to database"
                      className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 transition shrink-0"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleOpenModal}
                      title="Edit contact name"
                      className="opacity-0 group-hover/card:opacity-100 inline-flex items-center gap-0.5 text-[9px] font-semibold text-slate-400 hover:text-rose-700 transition"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 truncate mt-0.5 flex items-center gap-1.5">
                  {call.company && call.company !== "—" ? `${call.company} · ` : ""}
                  {!isUnknownName && <span className="font-semibold text-slate-400">{phoneNum}</span>}
                </p>
              </div>
              {durationLabel ? (
                <span className="text-sm font-black text-slate-900 tabular-nums shrink-0">{durationLabel}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone={meta.tone}>{call.outcome}</Badge>
              {call.rating > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {call.rating}
                </span>
              )}
              <span className="text-[10px] font-semibold text-slate-400 ml-auto">{displayDate}</span>
            </div>
          </div>
        </div>
      </button>

      <SaveContactModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        phone={phoneNum}
        initialName={isUnknownName ? "" : rawName}
        leadId={call.leadId}
        onSaved={handleSavedName}
      />
    </>
  );
}

export default function EmployeeCalls() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const period = searchParams.get("period") || "today";
  const { employee, leads = [] } = useEmployee();
  const { stats: callyzerStats, configured: callyzerConfigured, syncing: statsSyncing } = useCallyzerStats(
    employee?.id,
    period,
    Boolean(employee?.id),
  );
  const {
    calls: monthCalls,
    loading: callsLoading,
    syncing: callsSyncing,
  } = useEmployeeSyncedPeriodCalls(employee?.id, "month", leads, Boolean(employee?.id));

  const periodCalls = useMemo(
    () => dedupePeriodCalls(filterCallsForPeriod(monthCalls || [], period)),
    [monthCalls, period],
  );

  const callsLoaded = !callsLoading || periodCalls.length > 0;
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [privateModalOpen, setPrivateModalOpen] = useState(false);

  const stats = useMemo(() => {
    const fromCalls = computeCallStatsFromCalls(periodCalls, period);
    if (callsLoaded && periodCalls.length >= 0) {
      return fromCalls;
    }
    if (callyzerConfigured && callyzerStats) {
      const pickupRate = callyzerStats.totalCalls
        ? Math.round((callyzerStats.connectedCalls / callyzerStats.totalCalls) * 100)
        : 0;
      return {
        dials: callyzerStats.totalCalls,
        connected: callyzerStats.connectedCalls,
        missed: callyzerStats.missedCalls,
        pickupRate,
        missRate: callyzerStats.totalCalls
          ? Math.round((callyzerStats.missedCalls / callyzerStats.totalCalls) * 100)
          : 0,
        avgDuration: callyzerStats.totalDuration,
        totalTalk: callyzerStats.workingHours,
        hotLeads: 0,
        callbacks: callyzerStats.notPickupByClient ?? 0,
        quality: pickupRate,
      };
    }
    return fromCalls;
  }, [callyzerConfigured, callyzerStats, callsLoaded, periodCalls, period]);

  const conversationCount = useMemo(() => {
    if (callsLoaded) {
      return countConversationCalls(periodCalls);
    }
    if (callyzerConfigured && callyzerStats?.conversations5MinPlus != null) {
      return callyzerStats.conversations5MinPlus;
    }
    return countConversationCalls(periodCalls);
  }, [callyzerConfigured, callyzerStats, callsLoaded, periodCalls]);

  const calls = useMemo(() => {
    let list = periodCalls;

    if (typeFilter !== "all") list = list.filter((c) => resolveEmployeeCallType(c) === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const qDigits = q.replace(/\D/g, "");
      list = list.filter((c) => {
        const nameMatch = String(c.name || "").toLowerCase().includes(q);
        const companyMatch = String(c.company || "").toLowerCase().includes(q);
        const outcomeMatch = String(c.outcome || "").toLowerCase().includes(q);
        const noteMatch = String(c.note || "").toLowerCase().includes(q);
        const phoneStr = String(c.phone || c.clientPhone || "");
        const phoneMatch = phoneStr.toLowerCase().includes(q);
        const digitMatch = qDigits.length >= 3 && phoneStr.replace(/\D/g, "").includes(qDigits);

        return nameMatch || companyMatch || outcomeMatch || noteMatch || phoneMatch || digitMatch;
      });
    }
    return list;
  }, [periodCalls, typeFilter, search]);

  const ITEMS_PER_PAGE = 21; // 7 rows in 3-column grid
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [typeFilter, search, period]);

  const visibleCalls = useMemo(() => {
    return calls.slice(0, visibleCount);
  }, [calls, visibleCount]);

  const hasMoreCalls = calls.length > visibleCount;

  return (
    <div className="space-y-3 sm:space-y-4 page-shell min-w-0 animate-fade-in">
      {(callsLoading || callsSyncing || statsSyncing) && (
        <p className="text-[10px] font-semibold text-slate-400 px-1">
          {callsLoading ? "Loading call data…" : "Syncing latest calls from Callyzer…"}
        </p>
      )}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
        <StatCard compact label="Total Dials" value={String(stats.dials)} icon={Phone} tone="primary" change={`${stats.connected} connected`} sub="" />
        <StatCard compact label={`Conversations (${CALL_CONVERSATION_LABEL})`} value={String(conversationCount)} icon={MessageCircle} tone="success" change={`${PERIOD_LABEL[period] || period}`} sub="" />
        <StatCard compact label="Pickup Rate" value={`${stats.pickupRate}%`} icon={TrendingUp} tone="warning" change={`${stats.missed} missed`} changeTone="warning" sub="" />
        <StatCard compact label="Avg Duration" value={stats.avgDuration} icon={Clock} tone="info" change={stats.totalTalk} sub="" />
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:gap-3 lg:gap-4 lg:items-stretch">
        <CallMetricCard
          value={stats.pickupRate}
          color="#e11d48"
          label="Pickup Rate"
          shortLabel="Pickup"
          accentRgb="225,29,72"
          footer={`${stats.connected} picked / ${stats.dials} dialed · ${PERIOD_LABEL[period]}`}
        />
        <CallMetricCard
          value={stats.quality}
          color="#10b981"
          label="Quality Score"
          shortLabel="Quality"
          accentRgb="16,185,129"
          footer={`Avg ${stats.avgDuration} · ${stats.conversations} conversations ${CALL_CONVERSATION_LABEL}`}
        />
        <CallMetricCard
          value={stats.missRate}
          color="#f59e0b"
          label="Miss Rate"
          shortLabel="Miss"
          accentRgb="245,158,11"
          footer={`${stats.missed} missed · ${stats.callbacks} re-attempted`}
        />
      </div>

      <GlassCard className="p-3 sm:p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className={SEGMENT_WRAP}>
            {[
              { id: "all", label: "All" },
              { id: "out", label: "Outbound" },
              { id: "in", label: "Inbound" },
              { id: "miss", label: "Missed" },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTypeFilter(id)}
                className={`${SEGMENT_BTN} ${
                  typeFilter === id ? SEGMENT_BTN_ACTIVE : SEGMENT_BTN_INACTIVE
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-500 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search calls, leads, outcomes…"
              className="w-full h-10 pl-9 pr-3 rounded-xl bg-white border border-rose-100 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 transition"
            />
          </div>
          <button
            type="button"
            onClick={() => setPrivateModalOpen(true)}
            className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl bg-white hover:bg-rose-50 border border-rose-200 text-[#DC143C] font-semibold text-xs shadow-sm hover:shadow transition shrink-0"
          >
            <Shield className="w-4 h-4" />
            <span>Private Contacts</span>
          </button>
        </div>
        <p className="text-[10px] font-semibold text-slate-400 mt-2 sm:hidden">
          {PERIOD_LABEL[period]} · Showing {visibleCalls.length} of {calls.length} calls
        </p>
        <p className="text-[11px] font-semibold text-slate-400 mt-2 hidden sm:block">
          {PERIOD_LABEL[period]} · Showing {visibleCalls.length} of {calls.length} calls · {stats.callbacks} callbacks scheduled
        </p>
      </GlassCard>

      <div className="grid grid-cols-1 gap-3">
        <GlassCard className="p-2.5 sm:p-5 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 mb-1.5 sm:mb-4 shrink-0 px-0.5">
            <h3 className="font-display font-bold text-slate-900 text-xs sm:text-base">Call Log</h3>
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[9px] sm:text-[11px] font-bold tabular-nums shrink-0">
              {visibleCalls.length} / {calls.length}
            </span>
          </div>
          {calls.length === 0 ? (
            <EmpEmptyState
              icon=""
              title={callsLoading ? "Loading calls…" : "No calls in this period"}
              subtitle={callsLoading ? "Fetching your call history" : "Try a different filter or time range"}
            />
          ) : (
            <>
              <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-4 max-h-none sm:max-h-[640px] sm:overflow-y-auto sm:overscroll-contain sm:scrollbar-thin sm:pr-1">
                {visibleCalls.map((c) => (
                  <CallLogItem
                    key={c.id}
                    call={c}
                    active={false}
                    onSelect={(call) => navigate(`/employee/call-detail?id=${call.id}`)}
                  />
                ))}
              </div>
              {hasMoreCalls && (
                <div className="flex justify-center pt-4 pb-2 border-t border-rose-100/60 mt-4">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => prev + ITEMS_PER_PAGE)}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs shadow-sm hover:shadow-md transition active:scale-95 cursor-pointer"
                  >
                    <ChevronDown className="w-4 h-4 text-rose-600 animate-bounce" />
                    <span>Show More Calls ({calls.length - visibleCount} remaining)</span>
                  </button>
                </div>
              )}
            </>
          )}
        </GlassCard>
      </div>

      <div className="hidden sm:grid sm:grid-cols-4 gap-2">
        {[
          { val: stats.dials, lbl: "Dials", color: "#e11d48", icon: Phone },
          { val: stats.connected, lbl: "Connected", color: "#10b981", icon: CheckCircle2 },
          { val: stats.missed, lbl: "Missed", color: "#f59e0b", icon: AlertCircle },
          { val: stats.callbacks, lbl: "Callbacks", color: "#7c3aed", icon: RotateCcw },
        ].map(({ val, lbl, color, icon: Icon }) => (
          <GlassCard key={lbl} className="p-2.5 sm:p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xl font-black tabular-nums" style={{ color }}>{val}</p>
              <div className="w-7 h-7 rounded-lg grid place-items-center" style={{ background: `${color}15`, color }}>
                <Icon className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-500">{lbl}</p>
            <div className="h-1 rounded-full bg-rose-50 mt-1.5 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (val / stats.dials) * 100)}%`, background: color }} />
            </div>
          </GlassCard>
        ))}
      </div>

      {stats.dials > 0 && (
      <GlassCard className="p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="font-display font-bold text-slate-900 text-sm">Your Call Performance</h3>
            <p className="text-[11px] text-slate-500">{PERIOD_LABEL[period]} · your stats</p>
          </div>
          <Badge tone="muted">1 rep</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(() => {
            const callsCount = stats.dials;
            const pct = stats.pickupRate;
            const scTone = stats.quality >= 85 ? "success" : stats.quality >= 70 ? "warning" : "danger";
            const initials = String(employee?.name || "You").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
            return (
              <div className="flex items-center gap-3 p-3 rounded-xl border border-rose-100 bg-white/80">
                <AvatarCircle initials={initials} color="#be123c" size={32} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-bold text-slate-800 truncate">{employee?.name || "You"}</span>
                    <Badge tone={scTone}>{stats.quality}</Badge>
                  </div>
                  <div className="h-2 rounded-full bg-rose-50 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-rose-500 to-rose-600" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[10px] font-semibold text-slate-500 mt-1">{callsCount} calls · {pct}% pickup rate</p>
                </div>
              </div>
            );
          })()}
        </div>
      </GlassCard>
      )}

      <PrivateContactsModal
        isOpen={privateModalOpen}
        onClose={() => setPrivateModalOpen(false)}
        employeeId={employee?.id}
        employeeName={employee?.name}
      />
    </div>
  );
}
