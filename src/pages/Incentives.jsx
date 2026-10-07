import { useState, useMemo, useEffect, useRef } from "react";
import {
  Calculator, Calendar, Target, Users, Kanban, Award,
  Clock, Phone, TrendingUp, MessageSquare, Repeat, Mail, Tag, Download,
} from "lucide-react";
import {
  Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from "recharts";
import { GlassCard, Drawer, Badge } from "../components/Primitives.jsx";
import {
  PRIORITY_BADGE,
  formatPipelineValue,
} from "../data/pipelineMock.js";
import { useIsMobile } from "../hooks/use-mobile.tsx";
import toast from "react-hot-toast";
import { apiGet } from "../lib/api.js";
import { apiLeadToEmployee } from "../lib/leadSync.js";
import { useEmployeeKraMetrics } from "../lib/useEmployeeKraMetrics.js";
import { useEmployeeCompetencyScores } from "../lib/useEmployeeCompetencyScores.js";
import { CALL_CONVERSATION_LABEL } from "../lib/callMetrics.js";
import { KRA_PERIODS, kraPeriodLabel, isTimestampInKraPeriod, computeLeadKraForPeriod } from "../lib/kraPeriod.js";
import { CustomSelect } from "../components/CustomSelect.jsx";
import { downloadEmployeeIncentiveReport } from "../lib/incentiveReportExport.js";
import {
  computeRemunerationBreakdown,
  computeWeightedKraScore,
  resolveIncentiveSlabRate,
  DEFAULT_INCENTIVE_SETTINGS,
} from "../lib/incentiveCalculator.js";
import { formatRelativeAge } from "../lib/relativeAge.js";
import { roleLabel } from "../lib/roleLabel.js";
import { formatINR } from "../lib/indianFormat.js";
import { kpiWeightsToIncentiveRows, validateIncentiveConfig } from "../lib/incentiveSettings.js";

const MONTH_OPTION_COUNT = 12;

function monthValueOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Current month first, then the previous 11 months. */
function buildMonthOptions(now = new Date()) {
  return Array.from({ length: MONTH_OPTION_COUNT }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      value: monthValueOf(d),
      label: `${d.toLocaleString("en", { month: "long" })}, ${d.getFullYear()}`,
    };
  });
}

const LEAD_TABS = ["Converted", "Qualified", "Un-Qualified", "Not Interested"];

/** 2-col grid: visible row count × card height + gaps (card height unchanged) */
const LEAD_CARD_ROW_PX = 84;
const LEAD_GRID_GAP_PX = 6;
const LEAD_VISIBLE_ROWS = 4;
const LEAD_GRID_VIEWPORT_PX =
  LEAD_VISIBLE_ROWS * LEAD_CARD_ROW_PX + (LEAD_VISIBLE_ROWS - 1) * LEAD_GRID_GAP_PX;

const LEAD_STATUS_TONE = {
  Converted: "success",
  Qualified: "info",
  "Un-Qualified": "warning",
  "Not Interested": "danger",
};

const LEAD_SERVICES = [
  "AI Automation Suite",
  "CRM Setup & Onboarding",
  "Lead Gen Engine",
  "Custom Software Dev",
  "Strategic Consulting",
];

const LEAD_SOURCES = ["Website", "Meta Ads", "Referral", "Google Ads", "WhatsApp"];

function readLeadText(lead, ...keys) {
  for (const key of keys) {
    const val = lead[key];
    if (val != null && val !== "") return String(val).toLowerCase().trim();
  }
  return "";
}

/** Map employee/team lead rows to incentive Lead Status tabs (synced from employee panel). */
function classifyIncentiveLeadTab(lead) {
  const stage = readLeadText(lead, "pipeline_stage", "pipelineStage", "stage").replace(/_/g, " ");
  const status = readLeadText(lead, "status", "employeeStatus").replace(/_/g, " ");
  const temp = readLeadText(lead, "temperature");

  if (
    stage.includes("converted")
    || status === "converted"
    || stage.includes("won")
    || status === "won"
    || temp === "converted"
  ) {
    return "Converted";
  }

  if (
    stage.includes("not interested")
    || status === "ni"
    || status.includes("not interested")
    || temp.includes("not interested")
  ) {
    return "Not Interested";
  }

  const qualifiedKeys = [
    "booked",
    "call booked",
    "showed up",
    "show up",
  ];
  if (qualifiedKeys.some((k) => stage.includes(k) || status.includes(k))) {
    return "Qualified";
  }

  return "Un-Qualified";
}

function tempToPriorityLabel(temp) {
  const t = String(temp || "").toLowerCase();
  if (t.includes("hot")) return "HOT";
  if (t.includes("warm")) return "WARM";
  return "COLD";
}

function getLeadWeekIndex(dateIso, monthValue) {
  if (!dateIso) return 0;
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return 0;
  const [y, m] = monthValue.split("-").map(Number);
  if (d.getFullYear() !== y || d.getMonth() + 1 !== m) return -1;
  const day = d.getDate();
  if (day <= 7) return 0;
  if (day <= 14) return 1;
  if (day <= 21) return 2;
  return 3;
}

function buildLeadStatusSnapshot(leads, monthValue, weekRanges) {
  const leadStatus = Object.fromEntries(LEAD_TABS.map((tab) => [tab, 0]));
  const weeklyLeads = Object.fromEntries(LEAD_TABS.map((tab) => [tab, [0, 0, 0, 0]]));

  for (const lead of leads) {
    const tab = classifyIncentiveLeadTab(lead);
    leadStatus[tab] += 1;
    const weekIdx = getLeadWeekIndex(
      lead.updated_at || lead.updatedAt || lead.created_at || lead.createdAt,
      monthValue,
    );
    const bucket = weekIdx >= 0 ? weekIdx : 0;
    weeklyLeads[tab][bucket] += 1;
  }

  // When no leads fall in the selected month, spread totals across weeks for chart visibility
  LEAD_TABS.forEach((tab) => {
    const monthTotal = weeklyLeads[tab].reduce((sum, n) => sum + n, 0);
    const tabTotal = leadStatus[tab] || 0;
    if (tabTotal > 0 && monthTotal === 0) {
      const perWeek = Math.floor(tabTotal / weekRanges.length);
      const remainder = tabTotal % weekRanges.length;
      weeklyLeads[tab] = weekRanges.map((_, i) => perWeek + (i < remainder ? 1 : 0));
    }
  });

  return { leadStatus, weeklyLeads };
}

function mapTeamLeadToStatusCardWithWeek(lead, tab, employee, monthLabel, weekRanges, monthValue) {
  const mapped = apiLeadToEmployee(lead);
  const updatedAt = lead.updated_at || lead.updatedAt || lead.created_at || lead.createdAt;
  const weekIdx = getLeadWeekIndex(updatedAt, monthValue);
  // A lead updated outside the selected month must not be pinned to "Week 1" of it - show its real date.
  const updatedDate = updatedAt ? new Date(updatedAt) : null;
  const weekMeta = weekIdx >= 0
    ? (weekRanges[weekIdx] || weekRanges[0] || { key: "W1", label: "Week 1", range: "—" })
    : {
        key: "",
        label: "",
        range: updatedDate && !Number.isNaN(updatedDate.getTime())
          ? updatedDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
          : "—",
      };

  return {
    id: String(mapped.id ?? lead.id),
    name: mapped.name,
    company: mapped.company,
    value: Number(mapped.expectedRevenue ?? lead.expected_revenue ?? 0),
    priority: tempToPriorityLabel(lead.temperature || mapped.temperature),
    status: tab,
    week: weekMeta.key,
    weekLabel: weekMeta.label,
    weekRange: weekMeta.range,
    owner: employee.name,
    employeeId: employee.id,
    month: monthLabel,
    service: lead.form_name || mapped.service || "—",
    source: mapped.source || lead.source || "—",
    phone: mapped.phone || lead.phone || "—",
    email: mapped.email || lead.email || "—",
    updatedAt: updatedAt || new Date().toISOString(),
    notes: `${tab} · ${mapped.stage || lead.pipeline_stage || lead.status || "—"}`,
    pipelineStage: mapped.stage || lead.pipeline_stage || "—",
  };
}

function buildRealFilteredLeads(employeeLeads, leadTab, employee, monthLabel, weekRanges, monthValue) {
  return employeeLeads
    .filter((lead) => classifyIncentiveLeadTab(lead) === leadTab)
    .map((lead) => mapTeamLeadToStatusCardWithWeek(lead, leadTab, employee, monthLabel, weekRanges, monthValue))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function getLeadSnapshot() {
  return {
    leadStatus: Object.fromEntries(LEAD_TABS.map((tab) => [tab, 0])),
    weeklyLeads: Object.fromEntries(LEAD_TABS.map((tab) => [tab, [0, 0, 0, 0]])),
  };
}

function buildFilteredLeads() {
  return [];
}

function LeadStatusCard({ lead, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg border border-rose-100 bg-white p-2 shrink-0 hover:border-rose-300 hover:shadow-sm transition group"
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="min-w-0">
          <p className="text-[10px] font-black text-slate-900 truncate group-hover:text-rose-800 transition">{lead.name}</p>
          <p className="text-[8px] text-slate-500 truncate">{lead.company}</p>
        </div>
        <Badge tone={PRIORITY_BADGE[lead.priority] || "muted"}>{lead.priority}</Badge>
      </div>
      <div className="flex items-center justify-between pt-1 border-t border-rose-50">
        <span className="text-[10px] font-black text-rose-700 tabular-nums">{formatPipelineValue(lead.value)}</span>
        <span className="text-[8px] font-medium text-slate-400">{formatRelativeAge(lead.updatedAt)}</span>
      </div>
      <p className="text-[8px] text-slate-400 mt-1 truncate">{lead.pipelineStage || lead.week || "—"} · {lead.weekRange}</p>
    </button>
  );
}

function LeadStatusDetailDrawer({ open, onClose, lead, monthLabel }) {
  if (!lead) return null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Lead Information"
      width="drawer-panel sm:max-w-md"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-900">{lead.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{lead.company}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Badge tone={LEAD_STATUS_TONE[lead.status] || "muted"}>{lead.status}</Badge>
              <Badge tone={PRIORITY_BADGE[lead.priority] || "muted"}>{lead.priority}</Badge>
            </div>
          </div>
          <p className="text-lg font-black text-rose-700 tabular-nums mt-3">{formatPipelineValue(lead.value)}</p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {[
            { label: lead.week ? "Week" : "Updated on", value: lead.week ? `${lead.week} · ${lead.weekRange}` : lead.weekRange },
            { label: "Month", value: lead.month || monthLabel },
            { label: "Service", value: lead.service },
            { label: "Source", value: lead.source },
            { label: "Owner", value: lead.owner },
            { label: "Last Update", value: formatRelativeAge(lead.updatedAt) },
          ].map((row) => (
            <div key={row.label} className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{row.label}</p>
              <p className="text-[11px] font-semibold text-slate-800 mt-0.5 leading-snug">{row.value}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Contact</p>
          <div className="rounded-lg border border-slate-100 bg-white px-3 py-2 flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span className="text-xs font-semibold text-slate-700 tabular-nums">{lead.phone}</span>
          </div>
          <div className="rounded-lg border border-slate-100 bg-white px-3 py-2 flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span className="text-xs font-semibold text-slate-700 truncate">{lead.email}</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Tag className="w-3.5 h-3.5 text-slate-400" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Notes</p>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">{lead.notes}</p>
        </div>
      </div>
    </Drawer>
  );
}

const DEFAULT_INCENTIVE_METRICS = [
  { key: "calls", label: `Call Conversations (${CALL_CONVERSATION_LABEL})`, weight: 20 },
  { key: "qualified", label: "Qualified Leads", weight: 20 },
  { key: "meetings", label: "Meetings Scheduled", weight: 20 },
  { key: "cash", label: "Cash Collection", weight: 25 },
  { key: "conversion", label: "Call Conversion (%)", weight: 15 },
];

function getSafeNum(val) {
  const num = Number(val);
  return Number.isNaN(num) ? 0 : num;
}

function pct(actual, target) {
  const t = getSafeNum(target) || 1;
  return Math.round((getSafeNum(actual) / t) * 1000) / 10;
}

function formatCash(val) {
  return formatINR(getSafeNum(val));
}

/** Competency / weight source label under the performance card. */
function withIncentiveLabel(row) {
  return row.key === "calls"
    ? { ...row, label: `Call Conversations (${CALL_CONVERSATION_LABEL})` }
    : row;
}

function getWeekRanges(monthValue) {
  const [y, m] = monthValue.split("-").map(Number);
  const ranges = [];
  const daysInMonth = new Date(y, m, 0).getDate();
  const chunks = [
    [1, 7],
    [8, 14],
    [15, 21],
    [22, daysInMonth],
  ];
  const monthShort = new Date(y, m - 1).toLocaleString("en", { month: "short" });
  chunks.forEach(([start, end], i) => {
    ranges.push({
      key: `W${i + 1}`,
      label: `Week ${i + 1}`,
      range: `${monthShort} ${start}–${end}`,
    });
  });
  return ranges;
}

function getInsightValues(emp, key) {
  switch (key) {
    case "calls": return { actual: emp.callsCompleted, target: emp.callsTarget };
    case "qualified": return { actual: emp.qualifiedLeads, target: emp.qualifiedTarget };
    case "meetings": return { actual: emp.meetingsScheduled, target: emp.meetingsTarget };
    case "cash": return { actual: emp.cashCollected, target: emp.cashTarget };
    case "conversion":
      return {
        actual: getSafeNum(emp.conversionRate),
        target: getSafeNum(emp.conversionTarget) || 100,
      };
    default: return { actual: 0, target: 1 };
  }
}

function formatTargetDisplay(key, actual, target) {
  if (key === "cash") return `${formatCash(actual)}/${formatCash(target)}`;
  if (key === "conversion") return `${actual}%/${target}%`;
  return `${actual}/${target}`;
}

function computeKraEarned(actual, target, weight) {
  const achievement = pct(actual, target);
  return Math.round((achievement / 100) * weight * 10) / 10;
}

function computeWeightedScore(emp, kraRows) {
  return computeWeightedKraScore(emp, kraRows);
}

function buildRemunerationOptions({
  kraRows,
  selected,
  weightedPerformance,
  incentiveSettings,
  calcDraft,
  useManualCashRate = false,
}) {
  return {
    kraRows,
    employee: selected,
    weightedPerformance,
    baseIncentiveRate: incentiveSettings.baseIncentiveRate,
    targetBonusAmount: incentiveSettings.targetBonusAmount,
    incentiveSlabs: incentiveSettings.incentiveSlabs,
    useManualCashRate,
  };
}

function incentiveStatusTone(status) {
  if (status === "PAID") return "success";
  if (status === "APPROVED") return "info";
  if (status === "REJECTED") return "danger";
  return "warning";
}

function SelectField({ label, value, onChange, options, icon: Icon, compact = false, searchable = false, showAvatars = false }) {
  return (
    <CustomSelect
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      icon={Icon}
      compact={compact}
      searchable={searchable}
      showAvatars={showAvatars}
    />
  );
}

const STATUS_PILL_CLASS = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  muted: "bg-slate-100 text-slate-600 border-slate-200",
};

function MetricTile({ label, value, score, icon: Icon, suffix = "%" }) {
  const scored = score != null;
  const barPct = Math.min(100, getSafeNum(score));
  const displayValue = suffix === "%" && typeof value === "number" ? `${value}%` : value;

  return (
    <div className="rounded-xl border border-rose-100 bg-white/90 p-2.5 sm:p-3 flex flex-col justify-between h-full min-h-[88px]">
      <div className="flex items-start justify-between gap-2">
        <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 grid place-items-center shrink-0">
          <Icon className="w-3.5 h-3.5" />
        </div>
        <p className="text-base sm:text-lg font-black text-slate-900 tabular-nums leading-none">{displayValue}</p>
      </div>
      <div className="mt-2">
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide truncate">{label}</p>
        <div className="mt-1.5 h-1 rounded-full bg-slate-100 overflow-hidden">
          {scored && (
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-500 to-rose-600 transition-all duration-500"
              style={{ width: `${barPct}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function IncentiveMetricRow({ row, onWeightChange }) {
  const achievement = row.weight ? Math.min(100, Math.round((row.earned / row.weight) * 1000) / 10) : 0;

  return (
    <div className="rounded-xl border border-slate-100 bg-white/80 px-3 py-2.5 grid grid-cols-[minmax(0,1fr)_72px_56px] sm:grid-cols-[minmax(0,1fr)_88px_64px] gap-2 sm:gap-3 items-center">
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-[11px] font-bold text-slate-800 truncate">{row.label}</p>
          <span className="text-[10px] font-bold text-slate-500 tabular-nums shrink-0">{row.display}</span>
        </div>
        <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-rose-500 to-rose-600"
            style={{ width: `${achievement}%` }}
          />
        </div>
      </div>
      <div className="text-center">
        <p className="text-[8px] font-bold text-slate-400 uppercase">Earned</p>
        <p className="text-[11px] font-black text-rose-700 tabular-nums mt-0.5">
          {row.earned}%
          <span className="text-slate-400 font-semibold"> / {row.weight}%</span>
        </p>
      </div>
      <div>
        <p className="text-[8px] font-bold text-slate-400 uppercase text-center mb-1">Weight</p>
        <input
          type="number"
          min={0}
          max={100}
          value={row.weight}
          onChange={(e) => onWeightChange(row.key, e.target.value)}
          className="w-full text-center rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-800 py-1 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400"
        />
      </div>
    </div>
  );
}

function buildDraftFromEmployee(emp) {
  return {
    baseSalary: emp.baseSalary,
    callsCompleted: emp.callsCompleted,
    callsTarget: emp.callsTarget,
    qualifiedLeads: emp.qualifiedLeads,
    qualifiedTarget: emp.qualifiedTarget,
    meetingsScheduled: emp.meetingsScheduled,
    meetingsTarget: emp.meetingsTarget,
    cashCollected: emp.cashCollected,
    cashTarget: emp.cashTarget,
    conversionRate: emp.conversionRate ?? 0,
    conversionTarget: emp.conversionTarget ?? 25,
    incRate: emp.incRate,
    manualIncentive: "",
    incBonus: emp.incBonus,
    penaltyDeduction: emp.penaltyDeduction,
  };
}

function buildBlankTeammate(emp) {
  return {
    id: emp.id,
    name: emp.name,
    role: roleLabel(emp.role || emp.department, "Sales"),
    team: emp.department || "Sales & Growth",
    status: "PENDING",
    baseSalary: emp.salary || 0,
    callsCompleted: 0,
    callsTarget: emp.call_target || 50,
    qualifiedLeads: 0,
    qualifiedTarget: emp.qualified_lead_target || 20,
    meetingsScheduled: 0,
    meetingsTarget: emp.meeting_target || 15,
    cashCollected: 0,
    cashTarget: emp.cash_target || 100000,
    conversionRate: 0,
    conversionTarget: 25,
    incRate: 3.0,
    manualIncentive: "",
    incBonus: 0,
    penaltyDeduction: 0,
    responseTimeMin: 0,
    pickupRate: 0,
    qualificationRate: 0,
    objectionHandling: 0,
    followUpQuality: 0,
    leadStatus: { Converted: 0, Qualified: 0, "Un-Qualified": 0, "Not Interested": 0 },
    weeklyLeads: {
      Converted: [0, 0, 0, 0],
      Qualified: [0, 0, 0, 0],
      "Un-Qualified": [0, 0, 0, 0],
      "Not Interested": [0, 0, 0, 0],
    },
    competency: {
      "Product Value Alignment": 0,
      "Call Control": 0,
      "Listening Skills": 0,
      "KYC Questioning": 0,
      "Objection Handling": 0,
    },
  };
}

export default function Incentives() {
  const isMobile = useIsMobile();
  const [teammates, setTeammates] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(() => monthValueOf(new Date()));
  const [kraPeriod, setKraPeriod] = useState("month");
  const [leadTab, setLeadTab] = useState("Converted");
  const [activeLead, setActiveLead] = useState(null);
  const [kraRows, setKraRows] = useState(DEFAULT_INCENTIVE_METRICS.map((r) => ({ ...r })));
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcDraft, setCalcDraft] = useState(null);
  const [calcResult, setCalcResult] = useState(null);
  const [incentiveSettings, setIncentiveSettings] = useState(DEFAULT_INCENTIVE_SETTINGS);
  // Where the metric weights / targets came from (saved Settings config vs built-in defaults).
  const [weightSource, setWeightSource] = useState({ fromSettings: false, version: null, edited: false });
  const weightsEditedRef = useRef(false);
  const settingsRowsRef = useRef(DEFAULT_INCENTIVE_METRICS.map((r) => ({ ...r })));
  const [employeeLeads, setEmployeeLeads] = useState([]);
  const [employeeLeadsOwner, setEmployeeLeadsOwner] = useState(null);
  const [loadingEmployeeLeads, setLoadingEmployeeLeads] = useState(false);
  const { metrics: kraMetrics } = useEmployeeKraMetrics(selectedId, {
    enabled: Boolean(selectedId),
    period: kraPeriod,
    month: kraPeriod === "month" ? selectedMonth : null,
  });
  const { competency: liveCompetency, callsScored: competencyCallsScored } = useEmployeeCompetencyScores(selectedId, {
    enabled: Boolean(selectedId),
    period: kraPeriod,
    month: kraPeriod === "month" ? selectedMonth : null,
  });

  useEffect(() => {
    (async () => {
      setLoadingEmployees(true);
      try {
        // First try incentives dashboard (has performance data)
        const incData = await apiGet(`/api/incentives/dashboard?month=${selectedMonth}`, { skipCache: true, cacheTtl: 0 });
        setIncentiveSettings({
          baseIncentiveRate: incData.baseIncentiveRate ?? DEFAULT_INCENTIVE_SETTINGS.baseIncentiveRate,
          targetBonusAmount: incData.targetBonusAmount ?? DEFAULT_INCENTIVE_SETTINGS.targetBonusAmount,
          incentiveSlabs: incData.incentiveSlabs?.length
            ? incData.incentiveSlabs
            : DEFAULT_INCENTIVE_SETTINGS.incentiveSlabs,
        });
        // KPI weights come from the saved Settings config; defaults only when Settings is empty.
        const { rows: weightRows, source: weightRowsSource } = kpiWeightsToIncentiveRows(incData.kpiWeights);
        const settingsRows = weightRows.map(withIncentiveLabel);
        settingsRowsRef.current = settingsRows;
        if (!weightsEditedRef.current) setKraRows(settingsRows.map((r) => ({ ...r })));
        setWeightSource((prev) => ({
          ...prev,
          fromSettings: incData.settingsSource === "settings" && weightRowsSource === "settings",
          version: incData.settingsVersion || null,
        }));
        if (incData.teammates?.length) {
          const mapped = incData.teammates.map((t) => ({
            ...buildBlankTeammate(t),
            callsCompleted: t.callsCompleted ?? 0,
            callsTarget: t.callsTarget ?? 50,
            qualifiedLeads: t.qualifiedLeads ?? 0,
            qualifiedTarget: t.qualifiedTarget ?? 20,
            meetingsScheduled: t.meetingsScheduled ?? 0,
            meetingsTarget: t.meetingsTarget ?? 15,
            cashCollected: t.cashCollected ?? 0,
            cashTarget: t.cashTarget ?? 100000,
            incRate: t.incRate ?? 3.0,
            incBonus: t.incBonus ?? 0,
            penaltyDeduction: t.penaltyDeduction ?? 0,
            status: t.status || "PENDING",
            responseTimeMin: t.responseTimeMin ?? 1.8,
            pickupRate: t.pickupRate ?? 0,
            qualificationRate: t.qualificationRate ?? 0,
            objectionHandling: t.objectionHandling ?? 0,
            conversionRate: t.conversionRate ?? 0,
            followUpQuality: t.followUpQuality ?? 0,
          }));
          setTeammates(mapped);
          setSelectedId((prev) => {
            const exists = mapped.some((m) => m.id === prev);
            return exists ? prev : mapped[0].id;
          });
          setLoadingEmployees(false);
          return;
        }
      } catch {
        // fall through to team employees
      }

      try {
        // Fall back to /api/team/employees — real employees with blank metrics
        const teamData = await apiGet("/api/team/employees", { skipCache: true, cacheTtl: 0 });
        if (teamData?.success && Array.isArray(teamData.employees) && teamData.employees.length) {
          const mapped = teamData.employees.map(buildBlankTeammate);
          setTeammates(mapped);
          setSelectedId((prev) => {
            const exists = mapped.some((m) => m.id === prev);
            return exists ? prev : mapped[0].id;
          });
        } else {
          setTeammates([]);
          setSelectedId(null);
        }
      } catch {
        setTeammates([]);
        setSelectedId(null);
      } finally {
        setLoadingEmployees(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  // Sync 2 min+ call conversations for every employee (not only the selected one)
  const teammateIdsKey = useMemo(
    () => teammates.map((t) => t.id).sort((a, b) => a - b).join(","),
    [teammates],
  );

  useEffect(() => {
    if (!teammateIdsKey || loadingEmployees) return;

    let cancelled = false;
    const ids = teammateIdsKey.split(",").map((id) => Number(id)).filter(Boolean);

    (async () => {
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const callyzerQuery =
              kraPeriod === "day"
                ? "period=today"
                : kraPeriod === "week"
                  ? "period=week"
                  : `month=${selectedMonth}`;
            const data = await apiGet(
              `/api/team/employees/${id}/callyzer-stats?${callyzerQuery}`,
              { skipCache: true, cacheTtl: 0 },
            );
            return {
              id,
              calls5Min: data?.stats?.conversations5MinPlus ?? 0,
            };
          } catch {
            return { id, calls5Min: null };
          }
        }),
      );

      if (cancelled) return;

      const callsById = Object.fromEntries(
        results.filter((r) => r.calls5Min != null).map((r) => [r.id, r.calls5Min]),
      );

      setTeammates((prev) =>
        prev.map((t) =>
          callsById[t.id] != null ? { ...t, callsCompleted: callsById[t.id] } : t,
        ),
      );
    })();

    return () => { cancelled = true; };
  }, [teammateIdsKey, selectedMonth, kraPeriod, loadingEmployees]);

  // Sync real leads from employee panel (same source as Team Management)
  useEffect(() => {
    if (!selectedId) {
      setEmployeeLeads([]);
      setEmployeeLeadsOwner(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoadingEmployeeLeads(true);
      try {
        const params = new URLSearchParams({ employee_id: String(selectedId) });
        const data = await apiGet(`/api/team/employees/leads?${params.toString()}`, {
          skipCache: true,
          cacheTtl: 0,
        });
        if (cancelled || !data?.success) return;
        const leads = Array.isArray(data.leads) ? data.leads : [];
        setEmployeeLeads(leads);
        setEmployeeLeadsOwner(selectedId);
      } catch {
        if (!cancelled) {
          setEmployeeLeads([]);
          setEmployeeLeadsOwner(selectedId);
        }
      } finally {
        if (!cancelled) setLoadingEmployeeLeads(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedId]);

  // One lead list drives BOTH the Lead Status panel and the KRA numbers: the selected employee's
  // leads that fall inside the selected month (or Today / This week).
  const kraMonthOption = kraPeriod === "month" ? selectedMonth : null;
  const ownedLeads = useMemo(
    () => (employeeLeadsOwner === selectedId ? employeeLeads : []),
    [employeeLeads, employeeLeadsOwner, selectedId],
  );
  const periodLeads = useMemo(
    () => ownedLeads.filter((lead) =>
      isTimestampInKraPeriod(
        lead.updated_at || lead.updatedAt || lead.created_at,
        kraPeriod,
        { month: kraMonthOption },
      ),
    ),
    [ownedLeads, kraPeriod, kraMonthOption],
  );
  const periodStats = useMemo(() => {
    const leadKra = computeLeadKraForPeriod(ownedLeads, kraPeriod, { month: kraMonthOption });
    return {
      total: periodLeads.length,
      qualified: leadKra.qualified,
      meetings: leadKra.meetings,
      converted: periodLeads.filter((lead) => classifyIncentiveLeadTab(lead) === "Converted").length,
    };
  }, [ownedLeads, periodLeads, kraPeriod, kraMonthOption]);
  const leadsReady = employeeLeadsOwner === selectedId;

  // Sync KRA metrics for the selected employee (calls + cash from the API, lead counts from the lead list)
  const kraMetricsPeriodKey = kraMetrics?.periodKey;
  useEffect(() => {
    if (!selectedId || !kraMetrics) return;
    // ignore metrics that still belong to the previous employee / month
    if (kraMetrics.employeeId !== selectedId || kraMetricsPeriodKey !== `${kraPeriod}|${kraMonthOption || ""}`) return;
    setTeammates((prev) =>
      prev.map((t) =>
        t.id === selectedId
          ? {
              ...t,
              callsCompleted: kraMetrics.calls5Min,
              qualifiedLeads: leadsReady ? periodStats.qualified : kraMetrics.qualified,
              meetingsScheduled: leadsReady ? periodStats.meetings : kraMetrics.meetings,
              cashCollected: kraMetrics.cash,
              pickupRate: kraMetrics.pickupRate ?? t.pickupRate,
              responseTimeMin:
                kraMetrics.avgDurationSec != null
                  ? Math.round((kraMetrics.avgDurationSec / 60) * 10) / 10
                  : t.responseTimeMin,
              conversionRate: periodStats.total
                ? Math.round((periodStats.converted / periodStats.total) * 1000) / 10
                : 0,
              qualificationRate: periodStats.total
                ? Math.min(100, Math.round((periodStats.qualified / periodStats.total) * 100))
                : 0,
            }
          : t,
      ),
    );
  }, [selectedId, selectedMonth, kraPeriod, kraMonthOption, kraMetrics, kraMetricsPeriodKey, periodStats, leadsReady]);

  const selected = useMemo(
    () => teammates.find((t) => t.id === selectedId) || teammates[0],
    [teammates, selectedId],
  );

  const employeeOptions = teammates.map((t) => ({
    value: String(t.id),
    label: t.name,
    subtitle: roleLabel(t.department || t.team || t.role),
  }));
  const weekRanges = useMemo(() => getWeekRanges(selectedMonth), [selectedMonth]);
  const totalKraWeight = useMemo(() => kraRows.reduce((s, r) => s + getSafeNum(r.weight), 0), [kraRows]);

  const insightRows = useMemo(() => {
    if (!selected) return kraRows.map((row) => ({ ...row, actual: 0, target: 0, display: "0/0", earned: 0 }));
    return kraRows.map((row) => {
      const { actual, target } = getInsightValues(selected, row.key);
      const earned = computeKraEarned(actual, target, row.weight);
      return {
        ...row,
        actual,
        target,
        display: formatTargetDisplay(row.key, actual, target),
        earned,
      };
    });
  }, [selected, kraRows]);

  const serviceMetrics = useMemo(() => {
    if (!selected) return [];
    return [
      // Informational only (score: null): a shorter or longer call is not automatically better, so it gets no bar and is left out of the average.
      { label: "Avg Call Duration", shortLabel: "Call Dur.", value: `${selected.responseTimeMin} min`, score: null, icon: Clock, suffix: "" },
      { label: "Pickup Rate", shortLabel: "Pickup", value: selected.pickupRate, score: selected.pickupRate, icon: Phone },
      { label: "Qualification Rate", shortLabel: "Qualify", value: Math.min(99, selected.qualificationRate), score: Math.min(100, selected.qualificationRate), icon: Target },
      { label: "Objection Handling", shortLabel: "Objection", value: selected.objectionHandling, score: selected.objectionHandling, icon: MessageSquare },
      { label: "Conversion Rate", shortLabel: "Convert", value: selected.conversionRate, score: selected.conversionRate, icon: TrendingUp },
      { label: "Follow-up Quality", shortLabel: "Follow-up", value: selected.followUpQuality, score: selected.followUpQuality, icon: Repeat },
    ];
  }, [selected]);

  const monthLabel = monthOptions.find((m) => m.value === selectedMonth)?.label ?? selectedMonth;
  const periodLabel = kraPeriod === "month" ? monthLabel : kraPeriodLabel(kraPeriod);

  const leadSnapshot = useMemo(() => {
    if (!selected) return { leadStatus: {}, weeklyLeads: {} };
    if (periodLeads.length) {
      return buildLeadStatusSnapshot(periodLeads, selectedMonth, weekRanges);
    }
    return getLeadSnapshot();
  }, [selected, selectedMonth, weekRanges, periodLeads]);

  // Header total = sum of every status tab (not just the active one)
  const leadStatusTotal = useMemo(
    () => LEAD_TABS.reduce((sum, tab) => sum + (leadSnapshot.leadStatus?.[tab] ?? 0), 0),
    [leadSnapshot],
  );

  const leadChartData = useMemo(() => {
    const values = leadSnapshot.weeklyLeads?.[leadTab] || [0, 0, 0, 0];
    return weekRanges.map((w, i) => ({
      week: w.key,
      weekLabel: w.label,
      range: w.range,
      count: values[i] ?? 0,
    }));
  }, [leadSnapshot, leadTab, weekRanges]);

  const filteredLeads = useMemo(() => {
    if (!selected) return [];
    if (periodLeads.length) {
      return buildRealFilteredLeads(
        periodLeads,
        leadTab,
        selected,
        monthLabel,
        weekRanges,
        selectedMonth,
      );
    }
    return [];
  }, [periodLeads, leadTab, selected, monthLabel, weekRanges, selectedMonth]);

  // Average of the scored KPIs only (informational tiles such as Avg Call Duration have score: null).
  const avgServiceScore = useMemo(() => {
    const scored = serviceMetrics.filter((m) => m.score != null);
    return scored.length
      ? Math.round(scored.reduce((sum, m) => sum + Math.min(100, getSafeNum(m.score)), 0) / scored.length)
      : 0;
  }, [serviceMetrics]);

  const radarData = useMemo(
    () => selected ? Object.entries(liveCompetency).map(([skill, score]) => ({ skill, score })) : [],
    [selected, liveCompetency],
  );

  const avgCompetency = useMemo(
    () => (radarData.length
      ? Math.round(radarData.reduce((sum, d) => sum + d.score, 0) / radarData.length)
      : 0),
    [radarData],
  );

  // No AI-scored calls yet -> every score is 0; strongest / needs-focus would be meaningless.
  const hasCompetencyData = useMemo(() => radarData.some((d) => d.score > 0), [radarData]);

  const topCompetency = useMemo(
    () => (hasCompetencyData ? [...radarData].sort((a, b) => b.score - a.score)[0] : null),
    [radarData, hasCompetencyData],
  );

  // Never the same skill as the strongest one; hidden when every skill scores the same.
  const weakestCompetency = useMemo(() => {
    if (!hasCompetencyData || !topCompetency) return null;
    return (
      [...radarData]
        .sort((a, b) => a.score - b.score)
        .find((d) => d.skill !== topCompetency.skill && d.score < topCompetency.score) || null
    );
  }, [radarData, hasCompetencyData, topCompetency]);

  const focusSkills = useMemo(
    () => (hasCompetencyData ? radarData.filter((d) => d.score < 80).sort((a, b) => a.score - b.score) : []),
    [radarData, hasCompetencyData],
  );

  const weightedPerformance = useMemo(
    () => selected ? computeWeightedScore(selected, kraRows) : 0,
    [selected, kraRows],
  );

  useEffect(() => {
    setActiveLead(null);
  }, [leadTab, selectedId, selectedMonth]);

  useEffect(() => {
    if (calcOpen && selected) {
      const draft = buildDraftFromEmployee(selected);
      draft.incRate = resolveIncentiveSlabRate(
        draft.cashCollected,
        incentiveSettings.incentiveSlabs,
        incentiveSettings.baseIncentiveRate,
      );
      setCalcDraft(draft);
      setCalcResult(null);
    }
  }, [calcOpen, selected, incentiveSettings]);

  const handleCalculateOpen = () => {
    setCalcOpen(true);
  };

  const handleRunCalculation = () => {
    if (!calcDraft) return;
    if (totalKraWeight !== 100) {
      toast.error("Incentive metric weights must total 100%");
      return;
    }
    const performance = computeWeightedScore({ ...selected, ...calcDraft }, kraRows);
    const breakdown = computeRemunerationBreakdown(
      calcDraft,
      buildRemunerationOptions({
        kraRows,
        selected,
        weightedPerformance: performance,
        incentiveSettings,
        calcDraft,
        useManualCashRate: true,
      }),
    );
    setCalcResult({
      ...breakdown,
      incentiveAmount: breakdown.incentiveTotal,
      performance,
      totalRemuneration: breakdown.totalMoney,
    });
    toast.success(`Calculated for ${selected.name}`);
  };

  const handleEmployeeChange = (id) => {
    setSelectedId(Number(id));
    setCalcResult(null);
    setCalcOpen(false);
  };

  const handleMonthChange = (month) => {
    setSelectedMonth(month);
    setCalcResult(null);
  };

  const updateKraWeight = (key, val) => {
    const w = Math.max(0, Math.min(100, getSafeNum(val)));
    weightsEditedRef.current = true;
    setWeightSource((prev) => (prev.edited ? prev : { ...prev, edited: true }));
    setKraRows((prev) => prev.map((r) => (r.key === key ? { ...r, weight: w } : r)));
  };

  const resetKraWeights = () => {
    weightsEditedRef.current = false;
    setWeightSource((prev) => ({ ...prev, edited: false }));
    setKraRows(settingsRowsRef.current.map((r) => ({ ...r })));
  };

  const weightSourceLabel = weightSource.fromSettings
    ? `Settings${weightSource.version ? ` (${weightSource.version})` : ""}`
    : "built-in defaults (nothing saved in Settings yet)";
  const settingsIssue = validateIncentiveConfig(incentiveSettings).messages[0] || null;

  const updateDraft = (field, val) => {
    if (field === "manualIncentive") {
      setCalcDraft((prev) => ({ ...prev, manualIncentive: val }));
      return;
    }
    setCalcDraft((prev) => ({ ...prev, [field]: val === "" ? "" : getSafeNum(val) || val }));
  };

  const remunerationPreview = useMemo(() => {
    if (!selected) return null;
    const draft = calcDraft || buildDraftFromEmployee(selected);
    const performance = calcResult?.performance ?? weightedPerformance;
    return computeRemunerationBreakdown(
      draft,
      buildRemunerationOptions({
        kraRows,
        selected,
        weightedPerformance: performance,
        incentiveSettings,
        calcDraft: draft,
        useManualCashRate: Boolean(calcDraft),
      }),
    );
  }, [calcDraft, selected, calcResult, weightedPerformance, kraRows, incentiveSettings]);

  const reportLeads = useMemo(() => {
    if (!selected || !periodLeads.length) return [];
    return periodLeads
      .map((lead) => {
        const tab = classifyIncentiveLeadTab(lead);
        return mapTeamLeadToStatusCardWithWeek(
          lead,
          tab,
          selected,
          monthLabel,
          weekRanges,
          selectedMonth,
        );
      })
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [selected, periodLeads, monthLabel, weekRanges, selectedMonth]);

  const buildReportPayload = () => ({
    employee: selected,
    monthValue: selectedMonth,
    monthLabel,
    kraPeriod,
    kraRows,
    insightRows,
    kraMetrics,
    serviceMetrics,
    leadSnapshot,
    competency: radarData,
    remunerationDraft: calcDraft || buildDraftFromEmployee(selected),
    calcResult,
    leads: reportLeads,
    weightedPerformance,
    incentiveSettings,
  });

  const handleDownloadReport = (format = "csv") => {
    if (!selected) return;
    downloadEmployeeIncentiveReport(buildReportPayload(), format);
    toast.success(
      format === "csv"
        ? `Report downloaded for ${selected.name}`
        : `Opening printable report for ${selected.name}`,
    );
  };

  if (loadingEmployees) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-rose-300 border-t-rose-700 animate-spin mx-auto" />
          <p className="text-sm text-slate-400 font-medium">Loading employees…</p>
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <p className="text-base font-bold text-slate-700">No employees found</p>
          <p className="text-sm text-slate-400">Add team members from the Team page to view incentives.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 page-shell min-w-0">

      <GlassCard className="p-2.5 sm:p-4">
        <div className="flex flex-col gap-2.5 sm:gap-4 lg:flex-row lg:items-end lg:justify-between min-w-0">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 flex-1 lg:max-w-lg min-w-0 w-full">
            <SelectField
              label="Employee"
              value={String(selectedId)}
              onChange={handleEmployeeChange}
              options={employeeOptions}
              icon={Users}
              compact={isMobile}
              searchable
              showAvatars
            />
            <SelectField
              label="Month"
              value={selectedMonth}
              onChange={handleMonthChange}
              options={monthOptions}
              icon={Calendar}
              compact={isMobile}
            />
          </div>

          <div className="flex items-stretch gap-2 w-full lg:w-auto min-w-0">
            <span
              className={`inline-flex items-center justify-center h-9 sm:h-10 px-2.5 sm:px-3 rounded-lg sm:rounded-xl border text-[9px] sm:text-[10px] font-bold uppercase tracking-wide shrink-0 ${
                STATUS_PILL_CLASS[incentiveStatusTone(selected.status)] || STATUS_PILL_CLASS.muted
              }`}
            >
              {selected.status}
            </span>
            <button
              type="button"
              onClick={() => handleDownloadReport("csv")}
              className="inline-flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2.5 sm:px-3 rounded-lg sm:rounded-xl border border-slate-200 bg-white hover:border-rose-300 hover:bg-rose-50 text-slate-700 text-[11px] sm:text-xs font-bold transition shrink-0"
              title="Download employee report (CSV)"
            >
              <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="hidden sm:inline">Report</span>
            </button>
            <button
              type="button"
              onClick={handleCalculateOpen}
              className="flex-1 min-w-0 lg:flex-initial inline-flex items-center justify-center gap-1.5 h-9 sm:h-10 px-3 sm:px-4 rounded-lg sm:rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-[11px] sm:text-xs font-bold shadow-sm transition whitespace-nowrap"
            >
              <Calculator className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              Calculate
            </button>
          </div>
        </div>

        <div className="mt-2.5 sm:mt-3 pt-2.5 sm:pt-3 border-t border-rose-50 min-w-0 shrink-0">
          <p className="text-[10px] sm:text-[11px] font-semibold text-slate-700 truncate">
            {selected.name} · {roleLabel(selected.role)}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5 truncate">
            {selected.team} · {monthLabel}
          </p>
        </div>
      </GlassCard>

      {/* ── Top row: Performance + Service Metrics ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 xl:items-stretch min-h-0">
        <GlassCard className="p-4 xl:col-span-3 flex flex-col h-full min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3 border-b border-rose-50 pb-2">
            <div className="flex items-start justify-between gap-3 w-full">
              <div className="min-w-0">
                <h3 className="text-[13px] font-black text-slate-800 uppercase tracking-wide">
                  Performance & Incentive
                </h3>
                <p className="text-[11px] font-semibold text-slate-550 mt-0.5 truncate">
                  {selected.name} · {kraPeriod === "month" ? monthLabel : kraPeriodLabel(kraPeriod)}
                </p>
              </div>
              <div className="rounded-xl bg-rose-50 border border-[#FFE4E1] px-2.5 py-1.5 text-center shrink-0">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Score</p>
                <p className="text-sm font-black text-rose-700 tabular-nums leading-none mt-0.5">
                  {calcResult ? calcResult.performance : weightedPerformance}%
                </p>
              </div>
            </div>
            <div className="flex gap-1 shrink-0 w-full sm:w-auto">
              {KRA_PERIODS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setKraPeriod(p.id)}
                  className={`flex-1 sm:flex-none px-2.5 py-1.5 sm:py-1 rounded-lg text-[10px] font-black border transition-all ${
                    kraPeriod === p.id
                      ? "bg-rose-50 border-rose-250 text-rose-700 font-black shadow-sm"
                      : "bg-white border-slate-200/80 text-slate-555 hover:border-rose-200"
                  }`}
                >
                  {p.id === "month" && selectedMonth !== monthOptions[0].value ? monthLabel : p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-evenly gap-2 min-h-0">
            {insightRows.map((row) => (
              <IncentiveMetricRow key={row.key} row={row} onWeightChange={updateKraWeight} />
            ))}
          </div>

          <div className="mt-2 space-y-1 text-[10px] leading-snug">
            <p className="text-slate-500">
              Weights &amp; targets from <span className="font-semibold text-slate-700">{weightSourceLabel}</span>
              {weightSource.edited && (
                <>
                  {" "}· edited here (not saved){" "}
                  <button type="button" onClick={resetKraWeights} className="font-bold text-rose-700 hover:underline">
                    Reset to Settings
                  </button>
                </>
              )}
            </p>
            {totalKraWeight !== 100 && (
              <p className="text-rose-600 font-semibold">
                Metric weights total {totalKraWeight}% - they must add up to 100%. Change them in Settings, KPI Weightages.
              </p>
            )}
            {settingsIssue && (
              <p className="text-amber-700 font-semibold">Settings issue: {settingsIssue}</p>
            )}
          </div>

          <div className="mt-auto pt-3 border-t border-rose-50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase">Metric Weight</p>
                <p className={`text-sm font-black tabular-nums ${totalKraWeight === 100 ? "text-emerald-600" : "text-rose-600"}`}>
                  {totalKraWeight}%
                </p>
              </div>
              {remunerationPreview && (
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Incentive</p>
                  <p className="text-sm font-black text-rose-700 tabular-nums">
                    {formatCash(calcResult?.incentiveAmount ?? remunerationPreview.incentiveTotal)}
                  </p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleCalculateOpen}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold transition shrink-0"
            >
              <Calculator className="w-3.5 h-3.5" />
              {calcResult ? "Recalculate" : "Calculate"}
            </button>
          </div>
        </GlassCard>

        {/* Service Metrics */}
        <GlassCard className="p-4 xl:col-span-2 flex flex-col h-full min-w-0">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Service Metrics</h3>
              <p className="text-[10px] text-slate-500 mt-0.5 truncate">{selected.name} · {monthLabel}</p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-2.5 py-1.5 text-center shrink-0">
              <p className="text-[8px] font-bold text-slate-400 uppercase">Avg</p>
              <p className="text-sm font-black text-slate-800 tabular-nums leading-none mt-0.5">{avgServiceScore}%</p>
            </div>
          </div>

          <div className="grid grid-cols-2 grid-rows-3 gap-2 flex-1 min-h-0 auto-rows-fr">
            {serviceMetrics.map((m) => (
              <MetricTile key={m.label} {...m} />
            ))}
          </div>

          <div className="mt-auto pt-3 border-t border-rose-50 flex items-center justify-between gap-2">
            <p className="text-[9px] text-slate-500 leading-snug">
              Tracking <span className="font-semibold text-slate-700">{serviceMetrics.length} service KPIs</span> for {selected.name}
            </p>
            <span className={`text-[10px] font-bold shrink-0 ${avgServiceScore >= 80 ? "text-emerald-600" : "text-amber-600"}`}>
              {avgServiceScore >= 80 ? "On track" : "Needs focus"}
            </span>
          </div>
        </GlassCard>
      </div>

      {/* ── Bottom row: Lead Status + Competency ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-start min-h-0">
        {/* Lead Status */}
        <GlassCard className="p-4 flex flex-col min-h-0">
          <div className="flex items-start justify-between gap-3 mb-3 shrink-0">
            <div className="min-w-0">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Lead Status</h3>
              <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                {selected.name} · {periodLabel}
                {periodLeads.length > 0 && (
                  <span className="text-emerald-600 font-semibold"> · {periodLeads.length} synced</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-bold text-slate-600 tabular-nums">{leadStatusTotal} total</span>
              <Kanban className="w-4 h-4 text-rose-500/70" />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3 shrink-0">
            {LEAD_TABS.map((tab) => {
              const count = leadSnapshot.leadStatus[tab] ?? 0;
              const active = leadTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setLeadTab(tab)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
                    active
                      ? "bg-rose-700 text-white border-rose-700"
                      : "bg-slate-100 text-slate-600 border-slate-200 hover:border-rose-300"
                  }`}
                >
                  {tab}
                  <span className={`ml-1 ${active ? "text-rose-100" : "text-slate-400"}`}>({count})</span>
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-2 flex flex-col shrink-0">
            <div className="flex items-center justify-between gap-2 mb-2 px-0.5 shrink-0">
              <p className="text-[9px] text-slate-400">
                {loadingEmployeeLeads ? (
                  "Syncing leads from employee panel…"
                ) : (
                  <>
                    Showing <span className="font-bold text-slate-600">{filteredLeads.length}</span> {leadTab.toLowerCase()} leads for {selected.name}
                  </>
                )}
              </p>
              <Badge tone={LEAD_STATUS_TONE[leadTab] || "muted"}>{leadTab}</Badge>
            </div>
            {loadingEmployeeLeads ? (
              <div className="min-h-[80px] rounded-lg border border-dashed border-rose-200 bg-white/60 flex items-center justify-center px-3 text-center">
                <p className="text-[10px] text-slate-400">Loading employee leads…</p>
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="min-h-[80px] rounded-lg border border-dashed border-rose-200 bg-white/60 flex items-center justify-center px-3 text-center">
                <p className="text-[10px] text-slate-400">
                  No {leadTab.toLowerCase()} leads for {selected.name} in {periodLabel}
                  {ownedLeads.length > periodLeads.length ? ` (${ownedLeads.length - periodLeads.length} more outside this period)` : ""}
                </p>
              </div>
            ) : (
              <div
                className="overflow-y-auto overscroll-contain scrollbar-thin shrink-0"
                style={{ maxHeight: LEAD_GRID_VIEWPORT_PX }}
              >
                <div className="grid grid-cols-2 gap-1.5 content-start">
                  {filteredLeads.map((lead) => (
                    <LeadStatusCard
                      key={lead.id}
                      lead={lead}
                      onClick={() => setActiveLead(lead)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </GlassCard>

        {/* Competency Breakdown */}
        <GlassCard className="p-4 flex flex-col min-h-0">
          <div className="flex items-start justify-between gap-3 mb-3 shrink-0">
            <div className="min-w-0">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Competency Breakdown</h3>
              <p className="text-[10px] text-slate-500 mt-0.5 truncate">Skill radar · {selected.name}</p>
            </div>
            <Award className="w-4 h-4 text-amber-500/80 shrink-0" />
          </div>

          <div
            className={`flex flex-row gap-2 items-stretch min-w-0 shrink-0 ${
              isMobile ? "h-[170px]" : "h-[150px]"
            }`}
          >
            <div
              className={`rounded-xl border border-slate-200 bg-slate-50/50 p-1.5 flex-1 min-w-0 h-full`}
            >
              <ResponsiveContainer width="100%" height={isMobile ? 156 : 140}>
                <RadarChart
                  cx="50%"
                  cy="52%"
                  outerRadius={isMobile ? "58%" : "68%"}
                  data={radarData}
                >
                  <PolarGrid stroke="#cbd5e1" />
                  <PolarAngleAxis
                    dataKey="skill"
                    tick={{ fontSize: isMobile ? 7 : 8, fill: "#64748b" }}
                  />
                  <Radar name="Score" dataKey="score" stroke="#be123c" fill="#be123c" fillOpacity={0.22} strokeWidth={2} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: "1px solid #fecdd3", fontSize: 11 }}
                    formatter={(v) => [`${v}%`, "Score"]}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div
              className={`shrink-0 flex flex-col gap-1 min-w-0 ${
                isMobile ? "w-[118px] h-[170px]" : "sm:w-[156px] h-[150px]"
              }`}
            >
              {radarData.map((d) => (
                <div
                  key={d.skill}
                  className="flex-1 min-h-0 flex flex-col justify-center rounded-lg bg-slate-50 border border-slate-100 px-2 py-1"
                >
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <span className="text-[8px] text-slate-500 leading-tight line-clamp-2 flex-1 min-w-0">{d.skill}</span>
                    <span className="text-[10px] font-black text-rose-700 tabular-nums shrink-0">{d.score}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-rose-500 to-rose-600"
                      style={{ width: `${d.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {!hasCompetencyData ? (
            <div className="mt-2.5 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-3 text-center shrink-0">
              <p className="text-[11px] font-semibold text-slate-600">No competency data yet</p>
              <p className="text-[9px] text-slate-400 mt-0.5">
                Scores appear once this employee's calls are AI-scored for {periodLabel}.
              </p>
            </div>
          ) : (
            <div className={`mt-2.5 grid gap-2 shrink-0 ${weakestCompetency ? "grid-cols-2" : "grid-cols-1"}`}>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-2.5">
                <p className="text-[8px] font-bold text-emerald-700 uppercase tracking-wide">Strongest</p>
                <p className="text-[10px] font-semibold text-slate-800 mt-1 truncate">{topCompetency.skill}</p>
                <p className="text-base font-black text-emerald-700 tabular-nums leading-none mt-1">{topCompetency.score}%</p>
              </div>
              {weakestCompetency && (
                <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-2.5">
                  <p className="text-[8px] font-bold text-amber-700 uppercase tracking-wide">Needs Focus</p>
                  <p className="text-[10px] font-semibold text-slate-800 mt-1 truncate">{weakestCompetency.skill}</p>
                  <p className="text-base font-black text-amber-700 tabular-nums leading-none mt-1">{weakestCompetency.score}%</p>
                </div>
              )}
            </div>
          )}

          {focusSkills.length > 0 && (
            <div className="mt-2 rounded-lg border border-rose-100 bg-rose-50/30 p-2.5 shrink-0">
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Coaching priorities</p>
              <div className="flex flex-wrap gap-1">
                {focusSkills.map((d) => (
                  <span
                    key={d.skill}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-rose-100 text-[9px] font-semibold text-slate-700"
                  >
                    {d.skill}
                    <span className="text-rose-700 tabular-nums">{d.score}%</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-auto pt-2.5 border-t border-rose-50 flex items-center justify-between gap-2">
            <p className="text-[9px] text-slate-500 leading-snug min-w-0">
              Avg score <span className="font-black text-rose-800 tabular-nums">{hasCompetencyData ? `${avgCompetency}%` : "-"}</span>
              {topCompetency && (
                <>
                  {" "}· Strongest: <span className="font-semibold text-slate-700">{topCompetency.skill}</span>
                </>
              )}
            </p>
            <span className={`text-[10px] font-bold shrink-0 tabular-nums ${hasCompetencyData ? "text-emerald-700" : "text-slate-400"}`}>
              {!hasCompetencyData ? "No data yet" : avgCompetency >= 80 ? "Above target" : "Needs coaching"}
            </span>
          </div>
        </GlassCard>
      </div>

      {/* ── Incentive Calculator Drawer ── */}
      <LeadStatusDetailDrawer
        open={!!activeLead}
        onClose={() => setActiveLead(null)}
        lead={activeLead}
        monthLabel={monthLabel}
      />

      <Drawer
        open={calcOpen}
        onClose={() => setCalcOpen(false)}
        title={`Incentive Calculator · ${selected.name}`}
        width="drawer-panel sm:max-w-lg"
      >
        {calcDraft && (
          <div className="space-y-5">
            <div className="rounded-xl bg-rose-50/60 border border-rose-100 p-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">{selected.name}</p>
              <p className="mt-0.5">{roleLabel(selected.role)} · {selected.team}</p>
              <p className="mt-1 text-slate-500">{monthLabel} · Status: {selected.status}</p>
            </div>

            <div>
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Performance Inputs</h4>
              <div className="space-y-3">
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Base Salary (₹)</label>
                  <input
                    type="number"
                    value={calcDraft.baseSalary}
                    onChange={(e) => updateDraft("baseSalary", e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-bold outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400"
                  />
                </div>

                {[
                  {
                    label: "Calls",
                    left: { field: "callsCompleted", label: "Calls Completed" },
                    right: { field: "callsTarget", label: "Calls Target" },
                  },
                  {
                    label: "Qualified Leads",
                    left: { field: "qualifiedLeads", label: "Qualified Leads" },
                    right: { field: "qualifiedTarget", label: "Qualified Target" },
                  },
                  {
                    label: "Meetings",
                    left: { field: "meetingsScheduled", label: "Meetings Scheduled" },
                    right: { field: "meetingsTarget", label: "Meetings Target" },
                  },
                  {
                    label: "Cash",
                    left: { field: "cashCollected", label: "Cash Collected (₹)" },
                    right: { field: "cashTarget", label: "Cash Target (₹)" },
                  },
                  {
                    label: "Conversion",
                    left: { field: "conversionRate", label: "Conversion Rate (%)" },
                    right: { field: "conversionTarget", label: "Conversion Target (%)" },
                  },
                ].map(({ label, left, right }) => (
                  <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/40 p-3">
                    <p className="text-[9px] font-bold text-rose-700 uppercase tracking-wide mb-2">{label}</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[left, right].map(({ field, label: fieldLabel }) => (
                        <div key={field}>
                          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wide block mb-1">{fieldLabel}</label>
                          <input
                            type="number"
                            value={calcDraft[field]}
                            onChange={(e) => updateDraft(field, e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-800 text-xs font-bold outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Incentive Settings</h4>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { field: "incRate", label: "Cash Commission Rate (%)" },
                  { field: "manualIncentive", label: "Manual Incentive (₹)", text: true, placeholder: "Auto-calculated if empty" },
                  { field: "incBonus", label: "Bonus (₹)" },
                  { field: "penaltyDeduction", label: "Penalty (₹)" },
                ].map(({ field, label, text, placeholder }) => (
                  <div key={field} className={field === "manualIncentive" ? "col-span-2" : ""}>
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wide block mb-1">{label}</label>
                    <input
                      type={text ? "text" : "number"}
                      placeholder={placeholder}
                      value={calcDraft[field] ?? ""}
                      onChange={(e) => updateDraft(field, e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-bold outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400"
                    />
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 mt-2 leading-snug">
                Incentive is calculated from performance score, cash collection, and conversion metrics. Enter a manual amount to override.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 bg-slate-100 text-[10px] font-bold text-slate-500 uppercase">Incentive Metrics</div>
              {kraRows.map((row) => {
                const { actual, target } = getInsightValues({ ...selected, ...calcDraft }, row.key);
                const earned = computeKraEarned(actual, target, row.weight);
                return (
                  <div key={row.key} className="flex justify-between px-3 py-2 border-t border-slate-100 text-xs">
                    <span className="text-slate-600">{row.label}</span>
                    <span>
                      <span className="font-bold text-rose-700">{earned}%</span>
                      <span className="text-slate-400"> / {row.weight}%</span>
                    </span>
                  </div>
                );
              })}
              <div className="flex justify-between px-3 py-2 border-t border-slate-200 bg-slate-50 text-xs font-bold">
                <span className="text-slate-600">Total Weight</span>
                <span className={totalKraWeight === 100 ? "text-emerald-600" : "text-rose-600"}>{totalKraWeight}%</span>
              </div>
            </div>

            {remunerationPreview && (
              <div className="rounded-xl border border-emerald-200 bg-gradient-to-b from-emerald-50/70 to-white overflow-hidden">
                <div className="px-3 py-2 bg-emerald-100/80 text-[10px] font-bold text-emerald-800 uppercase tracking-wide">
                  Total Money
                </div>
                <div className="px-3 py-3 space-y-2 text-xs">
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-600">Base Salary</span>
                    <span className="font-bold text-slate-800 tabular-nums">{formatCash(remunerationPreview.baseSalary)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-600">
                      Incentive
                      {remunerationPreview.manualIncentiveOverride ? (
                        " (manual)"
                      ) : (
                        <>
                          {" "}
                          ({remunerationPreview.performanceScore ?? remunerationPreview.kraScore}% performance
                          {calcDraft?.incRate ? ` · ${calcDraft.incRate}% on cash` : ""})
                        </>
                      )}
                    </span>
                    <span className="font-bold text-rose-700 tabular-nums">
                      {formatCash(remunerationPreview.incentiveCore ?? remunerationPreview.commission)}
                    </span>
                  </div>
                  {!remunerationPreview.manualIncentiveOverride && (
                    <p className="text-[10px] text-slate-500 pl-0.5">
                      Performance {formatCash(remunerationPreview.performanceIncentive)}
                      {" + "}
                      Cash {formatCash(remunerationPreview.cashCommission)}
                    </p>
                  )}
                  {(remunerationPreview.bonus > 0 || remunerationPreview.autoTargetBonus > 0) && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-600">
                        Bonus
                        {remunerationPreview.autoTargetBonus > 0 ? " (target reached)" : ""}
                      </span>
                      <span className="font-bold text-emerald-700 tabular-nums">{formatCash(remunerationPreview.bonus)}</span>
                    </div>
                  )}
                  {remunerationPreview.penalty > 0 && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-600">Penalty</span>
                      <span className="font-bold text-red-600 tabular-nums">−{formatCash(remunerationPreview.penalty)}</span>
                    </div>
                  )}
                  <div className="border-t border-emerald-100 pt-2.5 flex justify-between items-center gap-3">
                    <span className="text-sm font-semibold text-slate-800">Total</span>
                    <span className="text-xl font-black text-emerald-700 tabular-nums">
                      {formatCash(remunerationPreview.totalMoney)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleRunCalculation}
                className="w-full py-3 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-sm font-bold shadow-md flex items-center justify-center gap-2 transition"
              >
                <Calculator className="w-4 h-4" />
                Calculate Incentive
              </button>
              <button
                type="button"
                onClick={() => handleDownloadReport("csv")}
                className="w-full py-3 rounded-xl border border-slate-200 bg-white hover:border-rose-300 hover:bg-rose-50 text-slate-700 text-sm font-bold flex items-center justify-center gap-2 transition"
              >
                <Download className="w-4 h-4" />
                Download Report
              </button>
            </div>
            <button
              type="button"
              onClick={() => handleDownloadReport("html")}
              className="w-full py-2 rounded-xl border border-dashed border-slate-200 text-slate-500 hover:text-rose-700 hover:border-rose-200 text-xs font-semibold transition"
            >
              Download PDF Report
            </button>

            {calcResult && (
              <div className="rounded-xl border border-rose-200 bg-gradient-to-b from-rose-50/80 to-white p-4 space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Base Salary</span>
                  <span className="font-bold">{formatCash(calcResult.baseSalary)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">
                    Incentive
                    {calcResult.manualIncentiveOverride
                      ? " (manual)"
                      : ` (${calcResult.performance ?? calcResult.performanceScore}% performance · ${calcDraft.incRate}% cash)`}
                  </span>
                  <span className="font-bold text-rose-700">
                    {formatCash(calcResult.incentiveCore ?? calcResult.commission)}
                  </span>
                </div>
                {calcResult.bonus > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Bonus</span>
                    <span className="font-bold text-emerald-700">{formatCash(calcResult.bonus)}</span>
                  </div>
                )}
                {calcResult.penalty > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Penalty</span>
                    <span className="font-bold text-red-600">−{formatCash(calcResult.penalty)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Performance Score</span>
                  <span className="font-bold">{calcResult.performance ?? calcResult.performanceScore}%</span>
                </div>
                <div className="border-t border-rose-100 pt-3 flex justify-between items-center">
                  <span className="text-sm font-semibold text-slate-700">Total Money</span>
                  <span className="text-2xl font-black text-rose-700">{formatCash(calcResult.totalRemuneration)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
