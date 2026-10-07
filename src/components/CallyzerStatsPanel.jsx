import { useEffect, useState } from "react";
import {
  Ban,
  Clock,
  MessageCircle,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  RefreshCw,
  UserX,
  Users,
} from "lucide-react";
import { GlassCard, StatCard } from "./Primitives.jsx";
import MetricInfoTip from "./MetricInfoTip.jsx";
import { CALL_CONVERSATION_LABEL, CALL_SHORT_LABEL, formatCallsAndLeads } from "../lib/callMetrics.js";
import { callMetricTooltip, CALL_METRIC_INFO } from "../lib/metricInfo.js";

function formatLastUpdated(date) {
  if (!date) return "Syncing…";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 5) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

function LiveStatusBadge({ syncing, lastUpdated, onRefresh }) {
  const [, tick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 5000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <button
      type="button"
      onClick={() => onRefresh?.()}
      className="inline-flex items-center gap-1.5 self-start sm:self-auto px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition"
      title="Refresh Callyzer stats"
    >
      <span className={`w-1.5 h-1.5 rounded-full bg-emerald-500 ${syncing ? "animate-pulse" : ""}`} />
      <span className="text-[10px] font-bold uppercase tracking-wide">
        {syncing ? "Syncing…" : "Live"}
      </span>
      <span className="text-[10px] font-semibold text-emerald-600/80 hidden sm:inline">
        · {formatLastUpdated(lastUpdated)}
      </span>
      <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
    </button>
  );
}

/**
 * Tiles follow ONE partition (definitions: lib/callMetrics.js / backend utils/callMetrics.js):
 *   Total = Connected + Not connected;  Connected = Conversation + Short call + Incoming short;
 *   Not connected = Not pick + Rejected + Missed (incoming).
 * Counts are CALLS; the "leads" figures are DISTINCT leads - both are always labelled.
 */
function buildMetrics(stats) {
  const leads = stats.leads || {};
  const total = Number(stats.totalCalls) || 0;
  const connected = Number(stats.connectedCalls) || 0;
  const notConnected = stats.notConnectedCalls ?? Math.max(0, total - connected);
  const conversations = Number(stats.conversations5MinPlus) || 0;
  const incomingShort = Number(stats.incomingShortCalls) || 0;
  const short = stats.shortCalls ?? Math.max(0, connected - conversations - incomingShort);
  const pctOfCalls = (n) => (total ? `${Math.round(((Number(n) || 0) / total) * 100)}% of calls` : "—");
  return [
    {
      key: "total",
      label: "Total Calls",
      value: String(total),
      change: `${stats.incomingCalls ?? 0} in · ${stats.outgoingCalls ?? 0} out`,
      icon: Phone,
      tone: "primary",
    },
    {
      key: "connected",
      label: "Connected",
      value: String(connected),
      change: `${conversations} conv. + ${short} short + ${incomingShort} in. short`,
      icon: PhoneCall,
      tone: "success",
    },
    {
      key: "conversation",
      label: `Conversation (${CALL_CONVERSATION_LABEL})`,
      value: String(conversations),
      change: formatCallsAndLeads(conversations, leads.conversation),
      icon: MessageCircle,
      tone: "success",
    },
    {
      key: "short",
      label: `Short call (${CALL_SHORT_LABEL})`,
      value: String(short),
      change: formatCallsAndLeads(short, leads.short),
      icon: Clock,
      tone: "info",
    },
    {
      key: "incomingShort",
      label: `Incoming short (${CALL_SHORT_LABEL})`,
      value: String(incomingShort),
      change: formatCallsAndLeads(incomingShort, leads.incomingShort),
      icon: PhoneIncoming,
      tone: "info",
      changeTone: "muted",
    },
    {
      key: "notConnected",
      label: "Not connected",
      value: String(notConnected),
      change: pctOfCalls(notConnected),
      icon: PhoneOff,
      tone: "warning",
      changeTone: "warning",
    },
    {
      key: "noPickup",
      label: "Not pick",
      value: String(stats.notPickupByClient ?? 0),
      change: formatCallsAndLeads(stats.notPickupByClient, leads.noPickup),
      icon: UserX,
      tone: "warning",
      changeTone: "muted",
    },
    {
      key: "missed",
      label: "Missed (incoming)",
      value: String(stats.missedCalls ?? 0),
      change: formatCallsAndLeads(stats.missedCalls, leads.missedIncoming),
      icon: PhoneMissed,
      tone: "warning",
      changeTone: "muted",
    },
    {
      key: "rejected",
      label: "Rejected",
      value: String(stats.rejectedCalls ?? 0),
      change: formatCallsAndLeads(stats.rejectedCalls, leads.rejected),
      icon: Ban,
      tone: "danger",
      changeTone: "muted",
    },
    {
      key: "neverAttended",
      label: "Never attended",
      value: String(stats.neverAttended ?? 0),
      change: `subset of Missed · of ${stats.missedCalls ?? 0}`,
      icon: PhoneOff,
      tone: "purple",
      changeTone: "muted",
    },
    {
      key: "unique",
      label: "Unique Leads",
      value: String(stats.uniqueClients ?? 0),
      change: "Distinct leads · all calls",
      icon: Users,
      tone: "info",
      changeTone: "muted",
    },
  ];
}

/** One-line reconciliation so the tiles can be checked at a glance. */
function buildReconciliation(stats) {
  const total = Number(stats.totalCalls) || 0;
  const connected = Number(stats.connectedCalls) || 0;
  const conversations = Number(stats.conversations5MinPlus) || 0;
  const incomingShort = Number(stats.incomingShortCalls) || 0;
  const notConnected = stats.notConnectedCalls ?? Math.max(0, total - connected);
  const short = stats.shortCalls ?? Math.max(0, connected - conversations - incomingShort);
  return `Total ${total} = Connected ${connected} (${conversations} conversation + ${short} short + ${incomingShort} incoming short) + Not connected ${notConnected} (${stats.notPickupByClient ?? 0} not pick + ${stats.rejectedCalls ?? 0} rejected + ${stats.missedCalls ?? 0} missed incoming)`;
}

export default function CallyzerStatsPanel({
  stats,
  loading,
  syncing = false,
  lastUpdated = null,
  onRefresh,
  configured,
  message,
  title = "Callyzer Call Analytics",
  subtitle,
  compact = false,
  period = null,
}) {
  if (!configured) return null;

  if (loading && !stats) {
    return (
      <GlassCard className="p-4 !bg-white !border-slate-200/80">
        <p className="text-sm text-slate-500">Loading Callyzer call data…</p>
      </GlassCard>
    );
  }

  if (!stats) {
    return (
      <GlassCard className="p-4 border-amber-200 bg-amber-50/50">
        <p className="text-xs font-bold text-amber-900">Callyzer</p>
        <p className="text-sm text-amber-800 mt-1">
          {message || "No Callyzer stats yet. Set the employee Callyser ID (e.g. 91-9462265230) in Team settings."}
        </p>
      </GlassCard>
    );
  }

  const metrics = buildMetrics(stats);
  const gridClass = compact
    ? "grid grid-cols-2 lg:grid-cols-5 gap-2"
    : "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3";

  return (
    <GlassCard className="p-3 sm:p-4 space-y-3 sm:space-y-4 !bg-white !border-slate-200/80 !from-white !via-white !to-white !shadow-[0_2px_12px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-rose-600 text-white grid place-items-center shrink-0 shadow-sm shadow-rose-200">
            <Phone className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-slate-900 tracking-tight">{title}</h3>
            {subtitle && <p className="text-[11px] font-medium text-slate-500 mt-0.5">{subtitle}</p>}
            {stats.empName && (
              <p className="text-[11px] font-semibold text-slate-700 mt-1 truncate">
                {stats.empName}
                {stats.empNumber ? ` · +${stats.empCountryCode || "91"}-${stats.empNumber}` : ""}
              </p>
            )}
          </div>
        </div>
        <LiveStatusBadge syncing={syncing || loading} lastUpdated={lastUpdated} onRefresh={onRefresh} />
      </div>

      <div className={gridClass}>
        {metrics.map((metric) => (
          <StatCard
            key={metric.key}
            compact
            hover={false}
            label={metric.label}
            value={metric.value}
            change={metric.change}
            changeTone={metric.changeTone || "muted"}
            sub=""
            icon={metric.icon}
            tone={metric.tone}
            corner={(
              <MetricInfoTip
                text={period ? callMetricTooltip(metric.key, period) : CALL_METRIC_INFO[metric.key]}
              />
            )}
            className="!min-h-[96px] sm:!min-h-[108px]"
          />
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600 space-y-1">
        <p className="font-semibold text-slate-700">{buildReconciliation(stats)}</p>
        <p>
          <span className="font-semibold text-slate-700">Pickup rate {stats.pickupRate ?? 0}%</span>
          {` (${stats.connectedOutbound ?? 0} answered outgoing / ${stats.outgoingCalls ?? 0} outgoing dials)`}
          {" · "}
          <span className="font-semibold text-slate-700">Avg call duration {stats.avgDurationSec ? `${Math.floor(stats.avgDurationSec / 60)}:${String(stats.avgDurationSec % 60).padStart(2, "0")}` : "—"}</span>
          {` · Talk time ${stats.workingHours || "—"} (connected calls only)`}
        </p>
      </div>

      {!compact && stats.lastCallLog?.client_name && (
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] text-slate-600">
          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          <p>
            <span className="font-bold text-slate-800">Last call:</span>{" "}
            {stats.lastCallLog.client_name} · {stats.lastCallLog.call_type} · {stats.lastCallLog.call_date}{" "}
            {stats.lastCallLog.call_time}
          </p>
        </div>
      )}
    </GlassCard>
  );
}

export function CallyzerTeamTable({ stats, loading, onSelectEmployee }) {
  if (loading && !stats?.length) {
    return <p className="text-sm text-slate-500 py-4">Loading team call stats from Callyzer…</p>;
  }
  if (!stats?.length) {
    return (
      <p className="text-sm text-slate-500 py-4">
        No Callyzer team stats. Map each employee&apos;s Callyser ID in Team (phone from Callyzer, e.g. 91-9462265230).
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full text-left text-[11px]">
        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2.5 font-bold">Employee</th>
            <th className="px-3 py-2.5 font-bold">Total</th>
            <th className="px-3 py-2.5 font-bold">Duration</th>
            <th className="px-3 py-2.5 font-bold text-emerald-700">Incoming</th>
            <th className="px-3 py-2.5 font-bold text-amber-600">Outgoing</th>
            <th className="px-3 py-2.5 font-bold text-rose-600">Missed</th>
            <th className="px-3 py-2.5 font-bold">Connected</th>
            <th className="px-3 py-2.5 font-bold">Unique Clients</th>
            <th className="px-3 py-2.5 font-bold text-emerald-700">{CALL_CONVERSATION_LABEL}</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((row, idx) => (
            <tr
              key={`${row.employeeId || row.empNumber || row.empName}-${idx}`}
              className={`border-t border-slate-100 hover:bg-slate-50/80 ${onSelectEmployee ? "cursor-pointer" : ""}`}
              onClick={() => onSelectEmployee?.(row)}
            >
              <td className="px-3 py-2.5 font-semibold text-slate-800">
                {row.empName || "—"}
                <span className="block text-[10px] text-slate-400 font-normal">
                  {row.empCode ? `Code ${row.empCode} · ` : ""}
                  {row.empNumber ? `+${row.empCountryCode || "91"}-${row.empNumber}` : ""}
                </span>
              </td>
              <td className="px-3 py-2.5 font-bold tabular-nums text-slate-900">{row.totalCalls}</td>
              <td className="px-3 py-2.5 tabular-nums text-slate-600">{row.totalDuration}</td>
              <td className="px-3 py-2.5 text-emerald-700 font-semibold tabular-nums">{row.incomingCalls}</td>
              <td className="px-3 py-2.5 text-amber-600 font-semibold tabular-nums">{row.outgoingCalls}</td>
              <td className="px-3 py-2.5 text-rose-600 font-semibold tabular-nums">{row.missedCalls}</td>
              <td className="px-3 py-2.5 tabular-nums text-slate-700">{row.connectedCalls}</td>
              <td className="px-3 py-2.5 tabular-nums text-slate-700">{row.uniqueClients}</td>
              <td className="px-3 py-2.5 text-emerald-700 font-bold tabular-nums">{row.conversations5MinPlus ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
