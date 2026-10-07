import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Ban, CheckCircle2, Clock, MessageCircle,
  Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, PhoneOff,
  Search, Star, TrendingUp, UserPlus, Pencil, ChevronDown, Shield,
} from "lucide-react";
import { GlassCard, StatCard, Badge } from "../../components/Primitives.jsx";
import SaveContactModal from "../../components/SaveContactModal.jsx";
import MetricInfoTip from "../../components/MetricInfoTip.jsx";
import PrivateContactsModal from "../components/PrivateContactsModal.jsx";
import {
  computeCallStatsFromCalls,
  formatDurationFromSeconds,
} from "../../data/employeeMock.js";
import { useEmployee } from "../../context/EmployeeContext.jsx";
import {
  CALL_CONVERSATION_LABEL,
  CALL_SHORT_LABEL,
  callStatusMeta,
  dedupePeriodCalls,
  formatCallsAndLeads,
  isOutboundCall,
} from "../../lib/callMetrics.js";
import { callMetricTooltip } from "../../lib/metricInfo.js";
import { filterCallsForPeriod, resolveCallDateKey } from "../../lib/periodFilter.js";
import { otherPresetPeriods, periodWords, resolvePeriodSelection } from "../../lib/periodSelection.js";
import { useCallyzerStats } from "../../lib/useCallyzerStats.js";
import { useEmployeeSyncedPeriodCalls } from "../../lib/useEmployeeSyncedPeriodCalls.js";
import {
  AvatarCircle, EmpEmptyState,
} from "../components/EmpUI.jsx";
import { SEGMENT_WRAP, SEGMENT_BTN, SEGMENT_BTN_ACTIVE, SEGMENT_BTN_INACTIVE } from "../../lib/segmentPills.js";
import { formatCallDisplayDate, formatCallDurationLabel, parseCallDate } from "../../lib/callDisplay.js";
import { formatIndianPhone } from "../../lib/indianFormat.js";
import PercentRing from "../../components/PercentRing.jsx";

// Labels for the preset links in the empty-state hint ("This Week: 12"); the selected period's own label,
// including Yesterday and Custom ranges, comes from resolvePeriodSelection (lib/periodSelection.js).
const PERIOD_LABEL = { today: "Today", week: "This Week", month: "This Month" };

/** Call log "Show more" reveals this many rows per click (a row = one number on one day). */
const ITEMS_PER_PAGE = 50;

/**
 * Call status colours (semantic, not brand): connected = green, Not pick / Missed = amber, Rejected = red.
 * The status itself comes from callStatusMeta() (lib/callMetrics.js, the one shared call definition):
 *   connected     = answered (Conversation > 2 min, Short call, Incoming short)
 *   Not pick      = outgoing call the client did not answer
 *   Rejected      = rejected call (never counted inside Not pick)
 *   Missed        = incoming call that was not answered
 * (ring seconds on an unanswered dial are not talk time, so no duration is shown)
 */
const STATUS_BOX = {
  success: "bg-emerald-50 text-emerald-600 border-emerald-100",
  warning: "bg-amber-50 text-amber-700 border-amber-100",
  danger: "bg-red-50 text-red-600 border-red-100",
};

const CALL_TYPE_FILTERS = [
  { id: "all", label: "All" },
  { id: "connected", label: "Connected" },
  { id: "notConnected", label: "Not connected" },
  { id: "notPick", label: "Not pick" },
  { id: "rejected", label: "Rejected" },
  { id: "missed", label: "Missed (incoming)" },
  { id: "out", label: "Outgoing" },
  { id: "in", label: "Incoming" },
];

function matchesTypeFilter(call, filter) {
  if (filter === "all") return true;
  const status = callStatusMeta(call);
  if (filter === "connected") return status.connected;
  if (filter === "notConnected") return !status.connected;
  if (filter === "notPick") return status.bucket === "no_pickup";
  if (filter === "rejected") return status.bucket === "rejected";
  if (filter === "missed") return status.bucket === "missed_incoming";
  if (filter === "out") return isOutboundCall(call);
  if (filter === "in") return !isOutboundCall(call);
  return true;
}

function phoneKey10(value) {
  return String(value || "").replace(/\D/g, "").slice(-10);
}

/** Same number on the same day -> ONE row (individual calls stay in `calls`, newest first). */
function groupCallsByNumberAndDay(calls = []) {
  const byKey = new Map();
  const groups = [];
  for (const call of calls) {
    const day = resolveCallDateKey(call) || "";
    const who = phoneKey10(call.phone || call.clientPhone) || (call.leadId != null ? `lead:${call.leadId}` : `call:${call.id}`);
    const key = `${day}|${who}`;
    let group = byKey.get(key);
    if (!group) {
      group = { key, calls: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.calls.push(call);
  }
  const ts = (c) => parseCallDate(c.callAt || c.startedAt || c.date)?.getTime() ?? 0;
  for (const group of groups) {
    if (group.calls.length > 1) group.calls.sort((a, b) => ts(b) - ts(a));
    group.latest = group.calls[0];
  }
  return groups;
}

function looksLikePhoneNumber(value) {
  const text = String(value || "").trim();
  return text.length >= 7 && /^[+\d\s()-]+$/.test(text);
}

/** Outcome text for the badge: the status label, unless the rep logged a custom connected outcome. */
function statusBadgeText(call, status) {
  const raw = String(call.outcome || "").trim();
  if (status.connected && raw && !/^(connected|call logged)$/i.test(raw)) return raw;
  return status.label;
}

function MetricRingChart({ value, color, sizeClass = "w-10 h-10 sm:w-14 sm:h-14", labelClass = "text-[9px] sm:text-[11px]" }) {
  return <PercentRing value={value} color={color} sizeClass={sizeClass} labelClass={labelClass} />;
}

function RingMini({ value, color, label, shortLabel, info }) {
  return (
    <div className="flex flex-col items-center text-center gap-1 sm:flex-row sm:items-center sm:text-left sm:gap-3 min-w-0">
      <MetricRingChart value={value} color={color} />
      <div className="min-w-0 w-full">
        <p className="text-[8px] sm:text-xs font-bold text-slate-900 leading-tight flex items-center justify-center sm:justify-start gap-1">
          <span className="sm:hidden">{shortLabel || label}</span>
          <span className="hidden sm:inline">{label}</span>
          <MetricInfoTip text={info} align="left" />
        </p>
        <p className="hidden sm:block text-[10px] text-slate-500 mt-0.5">Target benchmark</p>
      </div>
    </div>
  );
}

function CallMetricCard({ value, color, label, shortLabel, footer, accentRgb, info }) {
  return (
    <GlassCard className="p-2 sm:p-4 min-w-0 lg:p-0 lg:relative lg:flex lg:flex-col">
      {/* Mobile / tablet — unchanged compact layout */}
      <div className="lg:hidden">
        <RingMini value={value} color={color} label={label} shortLabel={shortLabel} info={info} />
        <p className="hidden sm:block text-[10px] text-slate-500 mt-3 font-medium">{footer}</p>
      </div>

      {/* Web — compact horizontal card with pinned footer */}
      <div className="hidden lg:flex lg:flex-col lg:flex-1 lg:min-h-[108px]">
        <div
          className="pointer-events-none absolute inset-0 rounded-[24px] opacity-90"
          style={{
            background: `radial-gradient(ellipse 120% 80% at 100% 100%, rgba(${accentRgb}, 0.08) 0%, transparent 55%), linear-gradient(180deg, #fffafa 0%, #ffffff 100%)`,
          }}
        />
        <div className="relative flex items-center gap-3.5 px-4 pt-3.5 pb-3 flex-1 min-h-0">
          <MetricRingChart value={value} color={color} sizeClass="w-[62px] h-[62px]" labelClass="text-sm" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900 leading-tight flex items-center gap-1.5">
              {label}
              <MetricInfoTip text={info} align="left" />
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Target benchmark</p>
          </div>
        </div>
        <p className="relative shrink-0 px-4 py-2 border-t border-rose-100/80 text-[11px] text-slate-500 font-medium bg-white/70 rounded-b-[24px]">
          {footer}
        </p>
      </div>
    </GlassCard>
  );
}

/** One line of the expanded "×N calls" list. */
function GroupedCallLine({ call, onOpen }) {
  const status = callStatusMeta(call);
  const durationLabel = formatCallDurationLabel(call);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(call); }}
      className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-rose-50/60 text-left transition"
    >
      <span className="text-[10px] font-semibold text-slate-500 truncate">{formatCallDisplayDate(call.callAt || call.startedAt || call.date)}</span>
      <span className="flex items-center gap-2 shrink-0">
        <Badge tone={status.tone}>{statusBadgeText(call, status)}</Badge>
        <span className="text-[11px] font-black text-slate-800 tabular-nums w-10 text-right">{durationLabel || "—"}</span>
      </span>
    </button>
  );
}

function CallLogItem({ group, onSelect, onSaveName }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const call = group.latest;
  const count = group.calls.length;
  const status = callStatusMeta(call);
  const outbound = isOutboundCall(call);
  const Icon = status.bucket === "missed_incoming" ? PhoneMissed : (outbound ? PhoneOutgoing : PhoneIncoming);
  const boxClass = STATUS_BOX[status.tone] || STATUS_BOX.warning;
  const displayDate = formatCallDisplayDate(call.callAt || call.startedAt || call.date);
  const durationLabel = formatCallDurationLabel(call);
  const badgeText = statusBadgeText(call, status);

  const phoneNum = call.phone || call.clientPhone || "";
  const rawName = String(call.name || "").trim();
  const isUnknownName =
    !rawName ||
    rawName.toLowerCase() === "unknown" ||
    rawName.toLowerCase() === "unknown lead" ||
    rawName === phoneNum ||
    looksLikePhoneNumber(rawName) ||
    rawName.replace(/\D/g, "") === phoneNum.replace(/\D/g, "");

  const formattedPhone = formatIndianPhone(phoneNum || rawName);
  const displayName = !isUnknownName ? rawName : (phoneNum || looksLikePhoneNumber(rawName) ? formattedPhone : "No Number");

  const handleOpenModal = (e) => {
    e.stopPropagation();
    setModalOpen(true);
  };

  const handleSavedName = (cleanName, savedLead) => {
    group.calls.forEach((c) => {
      c.name = cleanName;
      if (savedLead?.id) c.leadId = savedLead.id;
    });
    if (onSaveName) onSaveName(call, cleanName);
  };

  const toggleExpanded = (e) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  };

  const countChip = count > 1 ? (
    <button
      type="button"
      onClick={toggleExpanded}
      title={`${count} calls to this number today — click to ${expanded ? "hide" : "show"}`}
      aria-expanded={expanded}
      className="inline-flex items-center gap-0.5 shrink-0 px-1.5 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-[10px] font-extrabold tabular-nums transition"
    >
      ×{count}
      <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
    </button>
  ) : null;

  const addAsLeadButton = isUnknownName ? (
    <button
      type="button"
      onClick={handleOpenModal}
      title="Add as lead — save a name for this number"
      className="inline-flex items-center gap-1 shrink-0 h-6 px-2 rounded-full bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-[10px] font-bold transition"
    >
      <UserPlus className="w-3 h-3" />
      <span className="hidden sm:inline">Add as lead</span>
    </button>
  ) : null;

  const openCall = (c) => onSelect(c);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(call)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(call); } }}
        className="w-full text-left border border-rose-100/80 bg-white hover:border-rose-200 hover:bg-rose-50/30 transition-all duration-200 min-w-0 p-2 rounded-lg sm:p-4 sm:rounded-xl group/card cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-200"
      >
        {/* Mobile — compact row */}
        <div className="flex items-center gap-2 min-w-0 sm:hidden">
          <div className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 border ${boxClass}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1.5">
              <div className="min-w-0 flex-1 flex items-center gap-1.5">
                <p className="text-xs font-bold text-slate-900 truncate leading-tight">{displayName}</p>
                {countChip}
                {addAsLeadButton}
              </div>
              {durationLabel ? (
                <span className="text-[11px] font-black text-slate-900 tabular-nums shrink-0">{durationLabel}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-1 mt-1 min-w-0">
              <span className={`text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border truncate block max-w-[45%] ${boxClass}`}>
                {badgeText}
              </span>
              <span className="text-[9px] font-semibold text-slate-400 truncate ml-auto shrink-0 min-w-0">
                {displayDate}
              </span>
            </div>
          </div>
        </div>

        {/* Desktop / web — card layout */}
        <div className="hidden sm:flex items-start gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 border ${boxClass}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-bold text-slate-900 truncate leading-tight">{displayName}</p>
                  {countChip}
                  {isUnknownName ? addAsLeadButton : (
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
                  {!isUnknownName && <span className="font-semibold text-slate-400">{formattedPhone}</span>}
                </p>
              </div>
              {durationLabel ? (
                <span className="text-sm font-black text-slate-900 tabular-nums shrink-0">{durationLabel}</span>
              ) : (
                <span className="text-sm font-bold text-slate-300 tabular-nums shrink-0" title="No talk time — the call was not connected">—</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone={status.tone}>{badgeText}</Badge>
              <span className="text-[10px] font-semibold text-slate-400">{outbound ? "Outgoing" : "Incoming"}</span>
              {call.rating > 0 && status.connected && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {call.rating}
                </span>
              )}
              <span className="text-[10px] font-semibold text-slate-400 ml-auto">{displayDate}</span>
            </div>
          </div>
        </div>

        {expanded && count > 1 && (
          <div className="mt-2 pt-2 border-t border-rose-100/70 space-y-0.5" onClick={(e) => e.stopPropagation()}>
            {group.calls.map((c) => (
              <GroupedCallLine key={c.id} call={c} onOpen={openCall} />
            ))}
          </div>
        )}
      </div>

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
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  // Today | Yesterday | Week | Month | Custom — same URL contract as the Pipeline (?period=&from=&to=).
  // `period` is the encoded period every helper understands: today | week | month | custom:FROM:TO
  // (Yesterday is a one-day custom range).
  const selection = useMemo(() => resolvePeriodSelection(searchParams, { defaultPeriod: "today" }), [searchParams]);
  const period = selection.period;
  const periodLabel = selection.label;
  const periodPhrase = periodWords(selection).when;
  const { employee, leads = [] } = useEmployee();
  const { stats: callyzerStats, configured: callyzerConfigured, syncing: statsSyncing } = useCallyzerStats(
    employee?.id,
    period,
    Boolean(employee?.id),
  );
  // The month window feeds Today / Week / Month and the empty-state counts. Yesterday / Custom can fall outside
  // it (e.g. yesterday on the 1st, a range in an earlier month), so those fetch the exact range on top.
  const {
    calls: monthCalls,
    loading: monthCallsLoading,
    syncing: monthCallsSyncing,
  } = useEmployeeSyncedPeriodCalls(employee?.id, "month", leads, Boolean(employee?.id));
  const {
    calls: rangeCalls,
    loading: rangeCallsLoading,
    syncing: rangeCallsSyncing,
  } = useEmployeeSyncedPeriodCalls(employee?.id, period, leads, Boolean(employee?.id) && selection.needsExactFetch);
  const callsLoading = selection.needsExactFetch ? rangeCallsLoading : monthCallsLoading;
  const callsSyncing = selection.needsExactFetch ? rangeCallsSyncing : monthCallsSyncing;

  const periodCalls = useMemo(
    () => dedupePeriodCalls(filterCallsForPeriod((selection.needsExactFetch ? rangeCalls : monthCalls) || [], period)),
    [selection.needsExactFetch, rangeCalls, monthCalls, period],
  );

  // Call counts for every preset period, from the same fetched data (used by the empty-state hint).
  const periodCounts = useMemo(() => ({
    today: dedupePeriodCalls(filterCallsForPeriod(monthCalls || [], "today")).length,
    week: dedupePeriodCalls(filterCallsForPeriod(monthCalls || [], "week")).length,
    month: dedupePeriodCalls(filterCallsForPeriod(monthCalls || [], "month")).length,
  }), [monthCalls]);

  const switchPeriod = (next) => {
    const params = new URLSearchParams(searchParams);
    params.set("period", next);
    params.delete("from");
    params.delete("to");
    setSearchParams(params);
  };

  const callsLoaded = !callsLoading || periodCalls.length > 0;
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [privateModalOpen, setPrivateModalOpen] = useState(false);

  const stats = useMemo(() => {
    const fromCalls = computeCallStatsFromCalls(periodCalls, period);
    if (callsLoaded) {
      return fromCalls;
    }
    if (callyzerConfigured && callyzerStats) {
      const total = callyzerStats.totalCalls ?? 0;
      const notConnected = callyzerStats.notConnectedCalls ?? Math.max(0, total - (callyzerStats.connectedCalls ?? 0));
      return {
        dials: total,
        connected: callyzerStats.connectedCalls ?? 0,
        notConnected,
        missed: notConnected,
        short: callyzerStats.shortCalls ?? 0,
        incomingShort: callyzerStats.incomingShortCalls ?? 0,
        noPickup: callyzerStats.notPickupByClient ?? 0,
        missedIncoming: callyzerStats.missedCalls ?? 0,
        rejected: callyzerStats.rejectedCalls ?? 0,
        outboundDials: callyzerStats.outgoingCalls ?? 0,
        connectedOutbound: callyzerStats.connectedOutbound ?? 0,
        leads: callyzerStats.leads || {},
        pickupRate: callyzerStats.pickupRate ?? 0,
        missRate: total ? Math.round((notConnected / total) * 100) : 0,
        avgDuration: callyzerStats.avgDurationSec ? formatDurationFromSeconds(callyzerStats.avgDurationSec) : "—",
        totalTalk: callyzerStats.workingHours,
        hotLeads: 0,
        callbacks: 0,
        quality: callyzerStats.pickupRate ?? 0,
        conversations: callyzerStats.conversations5MinPlus ?? 0,
      };
    }
    return fromCalls;
  }, [callyzerConfigured, callyzerStats, callsLoaded, periodCalls, period]);

  const calls = useMemo(() => {
    let list = periodCalls;

    if (typeFilter !== "all") list = list.filter((c) => matchesTypeFilter(c, typeFilter));
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

  const groups = useMemo(() => groupCallsByNumberAndDay(calls), [calls]);

  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [typeFilter, search, period]);

  const visibleGroups = useMemo(() => groups.slice(0, visibleCount), [groups, visibleCount]);
  const shownCallCount = useMemo(
    () => visibleGroups.reduce((sum, g) => sum + g.calls.length, 0),
    [visibleGroups],
  );
  const remainingGroups = groups.length - visibleGroups.length;
  const hasMoreCalls = remainingGroups > 0;

  const tip = (key) => <MetricInfoTip text={callMetricTooltip(key, period)} />;
  const otherPeriods = otherPresetPeriods(selection);
  const filtersActive = typeFilter !== "all" || Boolean(search.trim());

  return (
    <div className="space-y-3 sm:space-y-4 page-shell min-w-0 animate-fade-in">
      {(callsLoading || callsSyncing || statsSyncing) && (
        <p className="text-[10px] font-semibold text-slate-400 px-1">
          {callsLoading ? "Loading call data…" : "Syncing latest calls from Callyzer…"}
        </p>
      )}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
        <StatCard
          compact
          label="Total Calls"
          value={String(stats.dials)}
          icon={Phone}
          tone="primary"
          change={`${stats.connected} connected · ${stats.notConnected} not`}
          changeTone="muted"
          sub=""
          corner={tip("total")}
        />
        <StatCard
          compact
          label={`Conversation (${CALL_CONVERSATION_LABEL})`}
          value={String(stats.conversations)}
          icon={MessageCircle}
          tone="success"
          change={formatCallsAndLeads(stats.conversations, stats.leads?.conversation)}
          changeTone="muted"
          sub=""
          corner={tip("conversation")}
        />
        <StatCard
          compact
          label="Pickup Rate"
          value={`${stats.pickupRate}%`}
          icon={TrendingUp}
          tone="warning"
          change={`${stats.connectedOutbound} answered of ${stats.outboundDials} outgoing dials`}
          changeTone="muted"
          sub=""
          corner={tip("pickupRate")}
        />
        <StatCard
          compact
          label="Avg Call Duration"
          value={stats.avgDuration}
          icon={Clock}
          tone="info"
          change={stats.totalTalk && stats.totalTalk !== "—" ? `${stats.totalTalk} talk time` : "No connected calls"}
          changeTone="muted"
          sub=""
          corner={tip("avgDuration")}
        />
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:gap-3 lg:gap-4 lg:items-stretch">
        <CallMetricCard
          value={stats.pickupRate}
          color="#e11d48"
          label="Pickup Rate"
          shortLabel="Pickup"
          accentRgb="225,29,72"
          info={callMetricTooltip("pickupRate", period)}
          footer={`${stats.connectedOutbound} answered / ${stats.outboundDials} outgoing dials · ${periodLabel}`}
        />
        <CallMetricCard
          value={stats.quality}
          color="#10b981"
          label="Quality Score"
          shortLabel="Quality"
          accentRgb="16,185,129"
          info={`Quality score = average call rating when calls are rated, otherwise conversations (${CALL_CONVERSATION_LABEL}) / total calls.\nDate range: ${periodLabel}.`}
          footer={`Avg ${stats.avgDuration} · ${stats.conversations} conversation ${CALL_CONVERSATION_LABEL}`}
        />
        <CallMetricCard
          value={stats.missRate}
          color="#f59e0b"
          label="Not Connected"
          shortLabel="Not conn."
          accentRgb="245,158,11"
          info={callMetricTooltip("notConnected", period)}
          footer={`${stats.notConnected} = ${stats.noPickup} not pick + ${stats.rejected} rejected + ${stats.missedIncoming} missed (incoming)`}
        />
      </div>

      <GlassCard className="p-3 sm:p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className={SEGMENT_WRAP}>
            {CALL_TYPE_FILTERS.map(({ id, label }) => (
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
        <p className="text-[10px] sm:text-[11px] font-semibold text-slate-400 mt-2">
          {periodLabel} · Showing {shownCallCount} of {calls.length} calls
          {groups.length !== calls.length ? ` · repeated calls to the same number on the same day are grouped (${groups.length} rows)` : ""}
        </p>
      </GlassCard>

      <div className="grid grid-cols-1 gap-3">
        <GlassCard className="p-2.5 sm:p-5 flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-2 mb-1.5 sm:mb-4 shrink-0 px-0.5">
            <h3 className="font-display font-bold text-slate-900 text-xs sm:text-base">Call Log</h3>
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[9px] sm:text-[11px] font-bold tabular-nums shrink-0">
              {shownCallCount} / {calls.length}
            </span>
          </div>
          {calls.length === 0 ? (
            <>
              <EmpEmptyState
                icon=""
                title={callsLoading ? "Loading calls…" : (filtersActive && periodCalls.length > 0 ? "No calls match your filters" : `No calls ${periodPhrase}`)}
                subtitle={callsLoading ? "Fetching your call history" : (filtersActive && periodCalls.length > 0 ? "Clear the search or pick another type" : "")}
              />
              {!callsLoading && !(filtersActive && periodCalls.length > 0) && (
                <p className="text-center text-xs text-slate-500 -mt-6 pb-8 px-4">
                  No calls {periodPhrase}
                  {otherPeriods.map((p) => (
                    <span key={p}>
                      {" — "}
                      <button
                        type="button"
                        onClick={() => switchPeriod(p)}
                        className="font-bold text-rose-700 hover:text-rose-800 underline underline-offset-2"
                      >
                        {PERIOD_LABEL[p]}: {periodCounts[p]}
                      </button>
                    </span>
                  ))}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-4 items-start">
                {visibleGroups.map((g) => (
                  <CallLogItem
                    key={g.key}
                    group={g}
                    onSelect={(call) => navigate(`/employee/call-detail?id=${call.id}`)}
                  />
                ))}
              </div>
              <div className="flex flex-col items-center gap-2 pt-4 pb-2 border-t border-rose-100/60 mt-4">
                <p className="text-[11px] font-semibold text-slate-500">
                  Showing {shownCallCount} of {calls.length} calls
                </p>
                {hasMoreCalls && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => prev + ITEMS_PER_PAGE)}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs shadow-sm hover:shadow-md transition active:scale-95 cursor-pointer"
                  >
                    <ChevronDown className="w-4 h-4 text-rose-600" />
                    <span>Show {Math.min(ITEMS_PER_PAGE, remainingGroups)} more ({remainingGroups} remaining)</span>
                  </button>
                )}
              </div>
            </>
          )}
        </GlassCard>
      </div>

      <div className="hidden sm:grid sm:grid-cols-4 gap-2">
        {[
          { key: "total", val: stats.dials, lbl: "Total Calls", sub: "connected + not connected", color: "#e11d48", icon: Phone },
          { key: "connected", val: stats.connected, lbl: "Connected", sub: `${stats.conversations} conversation + ${stats.short} short + ${stats.incomingShort ?? 0} incoming short`, color: "#10b981", icon: CheckCircle2 },
          { key: "conversation", val: stats.conversations, lbl: `Conversation (${CALL_CONVERSATION_LABEL})`, sub: formatCallsAndLeads(stats.conversations, stats.leads?.conversation), color: "#7c3aed", icon: MessageCircle },
          { key: "short", val: stats.short, lbl: `Short call (${CALL_SHORT_LABEL})`, sub: formatCallsAndLeads(stats.short, stats.leads?.short), color: "#0ea5e9", icon: Clock },
          { key: "incomingShort", val: stats.incomingShort ?? 0, lbl: `Incoming short (${CALL_SHORT_LABEL})`, sub: formatCallsAndLeads(stats.incomingShort ?? 0, stats.leads?.incomingShort), color: "#0d9488", icon: PhoneIncoming },
          { key: "noPickup", val: stats.noPickup, lbl: "Not pick", sub: formatCallsAndLeads(stats.noPickup, stats.leads?.noPickup), color: "#f59e0b", icon: PhoneOff },
          { key: "rejected", val: stats.rejected, lbl: "Rejected", sub: formatCallsAndLeads(stats.rejected, stats.leads?.rejected), color: "#dc2626", icon: Ban },
          { key: "missed", val: stats.missedIncoming, lbl: "Missed (incoming)", sub: formatCallsAndLeads(stats.missedIncoming, stats.leads?.missedIncoming), color: "#d97706", icon: PhoneMissed },
        ].map(({ key, val, lbl, sub, color, icon: Icon }) => (
          <GlassCard key={key} className="p-2.5 sm:p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xl font-black tabular-nums" style={{ color }}>{val}</p>
              <div className="w-7 h-7 rounded-lg grid place-items-center" style={{ background: `${color}15`, color }}>
                <Icon className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-500 flex items-center gap-1">{lbl}{tip(key)}</p>
            <p className="text-[10px] text-slate-400 mt-0.5 truncate" title={sub}>{sub}</p>
            <div className="h-1 rounded-full bg-rose-50 mt-1.5 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${stats.dials ? Math.min(100, (val / stats.dials) * 100) : 0}%`, background: color }} />
            </div>
          </GlassCard>
        ))}
      </div>

      {stats.dials > 0 && (
      <GlassCard className="p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="font-display font-bold text-slate-900 text-sm">Your Call Performance</h3>
            <p className="text-[11px] text-slate-500">{periodLabel} · your stats</p>
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
