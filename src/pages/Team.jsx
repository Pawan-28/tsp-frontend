import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Maximize2 } from "lucide-react";
import toast from "react-hot-toast";
import { apiGet, apiPost, apiDelete, invalidateCache } from "../lib/api.js";
import { formatCashINR, formatCashDateTime, resolveSlipUrl } from "../components/CashCollectedPanel.jsx";
import { useDateRange } from "../context/DateRangeContext.jsx";
import EmployeeDoodleAvatar from "../employee/components/EmployeeDoodleAvatar.jsx";
import CallyzerStatsPanel from "../components/CallyzerStatsPanel.jsx";
import { useTeamEmployeeCallyzerStats } from "../lib/useTeamCallyzerStats.js";
import { CALL_CONVERSATION_LABEL } from "../lib/callMetrics.js";
import { useEmployeeKraMetrics } from "../lib/useEmployeeKraMetrics.js";
import { KRA_PERIODS, kraPeriodLabel } from "../lib/kraPeriod.js";
import { getPipelineQualifiedCount } from "../lib/leadSync.js";
import useIsMobile from "../lib/useIsMobile.js";
import ResetCredentialsModal from "../components/team/ResetCredentialsModal.jsx";

// ─── inject global styles ────────────────────────────────────────────────────
if (typeof document !== "undefined" && !document.getElementById("__crm-styles-v2")) {
  const s = document.createElement("style");
  s.id = "__crm-styles-v2";
  s.textContent = `
    *{box-sizing:border-box;}
    .no-sb::-webkit-scrollbar{display:none;}
    .no-sb{-ms-overflow-style:none;scrollbar-width:none;}

    .sg{
      background:#ffffff;
      border:1px solid #ffe4e6;
      border-radius:13px;
      padding:14px 16px;
      margin-bottom:12px;
    }
    .sg:last-child{margin-bottom:0;}

    .trow{transition:background .12s;}
    .trow:hover{background:#fff1f2;}

    .qbtn{
      display:inline-flex;align-items:center;gap:5px;
      padding:5px 9px;border-radius:8px;
      border:1px solid #ffe4e6;
      font-size:11px;font-weight:500;
      color:#e11d48;
      background:transparent;cursor:pointer;
      transition:all .15s;white-space:nowrap;
    }
    .qbtn:hover{
      background:#fff1f2;
      color:#be123c;
      border-color:#fca5a5;
    }

    .fpill{
      padding:5px 12px;border-radius:20px;
      font-size:11px;font-weight:500;
      border:1px solid #fecdd3;
      background:transparent;
      color:#be123c;
      cursor:pointer;transition:all .15s;white-space:nowrap;
    }
    .fpill.active{background:oklch(0.50 0.22 18);border-color:transparent;color:#fff;}
    .fpill:not(.active):hover{border-color:#f43f5e;color:#e11d48;}

    .chip{
      display:inline-flex;align-items:center;gap:4px;
      padding:2px 7px;border-radius:20px;
      font-size:10px;font-weight:600;letter-spacing:.02em;
    }

    .mtile{
      background:#ffffff;
      border:1px solid #ffe4e6;
      border-radius:11px;padding:10px 12px;
      transition:border-color .15s, transform .15s;
    }
    .mtile:hover{border-color:#fca5a5;transform:translateY(-1px);}

    .wcard{
      background:linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(253, 244, 245, 0.9));
      border:1px solid #ffe4e6;
      border-radius:14px;padding:18px;
      transition:border-color .22s, box-shadow .22s, transform .18s;
    }
    .wcard:hover{
      border-color:oklch(0.52 0.22 18 / .58);
      box-shadow:
        0 0 0 1px oklch(0.52 0.22 18 / .14),
        0 4px 22px rgba(225,29,72,.08),
        0 0 32px oklch(0.52 0.22 18 / .10);
      transform:translateY(-2px);
    }

    .prow{
      background:#ffffff;
      border:1px solid #ffe4e6;
      border-radius:11px;padding:12px 14px;
      transition:all .15s;
    }
    .prow:hover{ border-color:#fca5a5; background:#fff1f2; transform:translateX(3px); }

    .drow{
      background:#ffffff;
      border:1px solid #ffe4e6;
      border-radius:10px;padding:9px 11px;
      transition:all .15s;
    }
    .drow:hover{border-color:#fca5a5;transform:translateX(2px);}

    .mcard{
      background:linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(253, 244, 245, 0.9));
      border:1px solid #ffe4e6;
      border-radius:14px;padding:15px;
      cursor:pointer;
      transition:border-color .2s, box-shadow .2s, transform .18s;
    }
    .mcard:hover{ border-color:oklch(0.52 0.22 18 / .45); box-shadow:0 0 0 1px oklch(0.52 0.22 18 / .10), 0 6px 20px rgba(225,29,72,.08); }

    .qa-item{
      display:flex;align-items:center;gap:10px;
      padding:11px 13px;border-radius:11px;
      background:#ffffff;
      border:1px solid #ffe4e6;
      cursor:pointer;transition:all .18s;text-align:left;width:100%;
    }
    .qa-item:hover{ background:#fff1f2; border-color:#fca5a5; transform:translateX(4px); }

    .ai-row{
      padding:9px 11px;border-radius:10px;
      cursor:pointer;transition:border-color .15s, background .15s;
    }

    .recharts-area-area{transition:none !important;}
    .recharts-bar-rectangle:focus{outline:none;}
    .recharts-surface{overflow:visible;}

    .chart-scroll::-webkit-scrollbar{height:4px;}
.chart-scroll::-webkit-scrollbar-track{background:transparent;}
.chart-scroll::-webkit-scrollbar-thumb{background:#f43f5e;border-radius:2px;}

    .recharts-tooltip-wrapper{z-index:9999 !important; pointer-events:none !important;}

    /* performer rank badge */
    .rank-badge{
      width:26px;height:26px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:10px;font-weight:800;flex-shrink:0;
      letter-spacing:-.01em;
    }

    /* activity dot pulse */
    @keyframes pulse-dot{
      0%,100%{transform:scale(1);opacity:1;}
      50%{transform:scale(1.6);opacity:.5;}
    }
    .pulse{animation:pulse-dot 2s ease-in-out infinite;}

 @media (max-width: 767px) {
  .responsive-grid {
    grid-template-columns: 1fr !important;
  }
  .responsive-3col {
    grid-template-columns: 1fr !important;
  }
  .responsive-2col {
    grid-template-columns: 1fr !important;
  }
  .team-emp-drawer {
    max-width: 100vw !important;
  }
  .team-emp-drawer .emp-drawer-body {
    padding: 12px 14px !important;
  }
  .team-emp-drawer .emp-drawer-header {
    padding: 12px 14px !important;
  }
  .team-inline-table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .responsive-3col {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
  .responsive-2col {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
  .team-emp-drawer {
    max-width: 100vw !important;
  }
}

@media (min-width: 1024px) and (max-width: 1439px) {
  .responsive-3col {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }
}

}
  
@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}`;
  document.head.appendChild(s);
}

import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Plus,
  Users,
  MapPin,
  Briefcase,
  X,
  Upload,
  User,
  Mail,
  Phone,
  Key,
  Building2,
  Hash,
  Calendar,
  ChevronDown,
  AlertCircle,
  Edit2,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Shield,
  Clock,
  ChevronLeft,
  PhoneCall,
  Video,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  BarChart2,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  RefreshCw,
  ChevronRight,
  Award,
  Bell,
  Flame,
  Thermometer,
  Snowflake,
  ExternalLink,
  MoreHorizontal,
  UserCheck,
  Coffee,
  Layers,
  GitBranch,
  Sparkles,
  MessageSquare,
  Repeat,
} from "lucide-react";
import {
  ResponsiveContainer,
  Tooltip,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
} from "recharts";
import { GlassCard, Badge, StatCard, SectionHeader, Avatar } from "../components/Primitives.jsx";
import { buildPipelineChartFromLeads, mapEmpLeadKanbanStage, getEmpStageMeta } from "../data/employeeMock.js";

function mapTeamLeadForChart(row) {
  return {
    stage: row.pipeline_stage || row.status,
    pipelineStage: row.pipeline_stage,
    status: row.status,
    assignmentStatus: row.assignment_status,
    acceptedAt: row.accepted_at,
  };
}

// ─── colour tokens ────────────────────────────────────────────────────────────
const C = {
  red: "oklch(0.62 0.22 18)",
  amber: "oklch(0.76 0.16 72)",
  green: "oklch(0.70 0.16 155)",
  teal: "oklch(0.68 0.14 192)",
  blue: "oklch(0.67 0.18 248)",
  violet: "oklch(0.67 0.20 278)",
  pink: "oklch(0.68 0.18 328)",
  rose: "oklch(0.64 0.22 10)",
  crimson: "oklch(0.52 0.22 18)",
};

// ─── static config ────────────────────────────────────────────────────────────
const DEPARTMENTS = [
  "Engineering",
  "Sales",
  "Marketing",
  "Design",
  "Finance",
  "Operations",
  "HR",
  "Legal",
  "Product",
];
const ROLES_BY_DEPT = {
  Engineering: [
    "Software Engineer",
    "Senior Engineer",
    "Tech Lead",
    "Engineering Manager",
    "Architect",
  ],
  Sales: ["Sales Rep", "Account Executive", "Sales Manager", "Business Dev Manager", "SDR"],
  Marketing: [
    "Marketing Manager",
    "Content Strategist",
    "Growth Marketer",
    "Brand Designer",
    "CMO",
  ],
  Design: ["UI Designer", "UX Designer", "Product Designer", "Design Lead", "Creative Director"],
  Finance: ["Financial Analyst", "Accountant", "Finance Manager", "CFO"],
  Operations: ["Operations Manager", "Project Manager", "Analyst", "COO"],
  HR: ["HR Manager", "Recruiter", "People Ops", "CHRO"],
  Legal: ["Legal Counsel", "Paralegal", "General Counsel"],
  Product: ["Product Manager", "Product Owner", "Head of Product", "CPO"],
};
const ACCESS_LEVELS = ["Viewer", "Member", "Editor", "Manager", "Admin"];
const ACCESS_DESC = {
  Viewer: "Can view data but cannot make changes.",
  Member: "Can view and interact with assigned records.",
  Editor: "Can create, edit, and delete their own records.",
  Manager: "Can manage team members and all team records.",
  Admin: "Full access including settings and user management.",
};
const WORK_LOCATIONS = ["Office", "Remote", "Hybrid"];

function funnelConversionLabel(funnel, idx) {
  if (idx === 0) return "Top Funnel";
  const top = Number(funnel[0]?.value) || 0;
  const curr = Number(funnel[idx]?.value) || 0;
  if (!top) return "0% Conv";
  const pct = Math.min(100, Math.round((curr / top) * 100));
  return `${pct}% Conv`;
}

/** Sales funnel stages aligned with Callyzer Call Reporting (dials → 2min+ → meetings → won). */
function buildCallyzerFunnelStages({ assigned, converted, meetings, callyzerStats }) {
  const cs = callyzerStats || {};
  return [
    { name: "Assigned", value: Number(assigned) || 0 },
    { name: "Dialed", value: Number(cs.totalCalls) || 0 },
    { name: "2min+", value: Number(cs.conversations5MinPlus) || 0 },
    { name: "Meeting", value: Number(meetings) || 0 },
    { name: "Converted", value: Number(converted) || 0 },
  ];
}

const INSIGHT_CARD = {
  background: "#fff",
  border: "1px solid #ffe4e6",
  borderRadius: 14,
  padding: "14px 16px",
  minWidth: 0,
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
};

const INSIGHT_CARD_TITLE = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".08em",
  color: "#be123c",
  margin: 0,
};

const INSIGHT_CARD_SUB = {
  fontSize: 10,
  color: "#64748b",
  margin: "4px 0 0",
  lineHeight: 1.35,
};

function useEmployeeLeads(emp) {
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [funnel, setFunnel] = useState([]);
  const [stageBreakdown, setStageBreakdown] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const fetchLeads = useCallback((showLoader = true) => {
    if (!emp?.id && !emp?.name) return;
    if (showLoader) setLoading(true);

    const params = new URLSearchParams();
    if (emp.id) params.set("employee_id", String(emp.id));
    if (emp.name) params.set("employee_name", emp.name);

    apiGet(
      `/api/team/employees/leads?${params.toString()}`,
      { cacheTtl: 0, skipCache: true },
    )
      .then((data) => {
        if (data.success) {
          setLeads(data.leads || []);
          setStats(data.stats || null);
          setActivity(data.activity || []);
          setFunnel(data.funnel || []);
          setStageBreakdown(data.stageBreakdown || []);
          setLastRefreshed(new Date());
        }
      })
      .catch(err => console.error("Leads fetch error:", err))
      .finally(() => { if (showLoader) setLoading(false); });
  }, [emp?.id, emp?.name]);

  useEffect(() => {
    if (!emp?.id && !emp?.name) return;
    setLeads([]); setStats(null); setActivity([]); setFunnel([]); setStageBreakdown([]);
    fetchLeads(true);
  }, [emp?.id, fetchLeads]);

  useEffect(() => {
    if (!emp?.id && !emp?.name) return;
    const timer = setInterval(() => fetchLeads(false), 30000);
    return () => clearInterval(timer);
  }, [emp?.id, emp?.name, fetchLeads]);

  return {
    leads, stats, activity, funnel, stageBreakdown,
    loading, refresh: () => fetchLeads(true), lastRefreshed
  };
}

function useEmployeeDetails(emp) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!emp?.id) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    apiGet(`/api/team/employees/details/${emp.id}`, { skipCache: true, cacheTtl: 0 })
      .then((data) => {
        if (!cancelled && data.success && data.employee) {
          setDetail(data.employee);
        }
      })
      .catch((err) => console.error("Employee details fetch error:", err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [emp?.id]);

  const merged = useMemo(() => {
    if (!emp) return null;
    const normalized = normalizeEmployee(detail ? { ...emp, ...detail } : emp);
    const perf = detail?.performance || {};
    return {
      ...normalized,
      stats: detail?.stats || null,
      achieved: detail?.achieved || null,
      cashCollections: detail?.cashCollections || [],
      responseTimeMin: perf.responseTimeMin,
      pickupRate: perf.pickupRate,
      qualificationRate: perf.qualificationRate,
      objectionHandling: perf.objectionHandling,
      conversionRate: perf.conversionRate,
      followUpQuality: perf.followUpQuality,
      managerName: detail?.manager_name || normalized.managerName || "",
    };
  }, [emp, detail]);

  return { employee: merged, loading };
}









// ─── Status style helper ──────────────────────────────────────────────────────
function getStatusStyle(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("qualified"))
    return { background: "#dcfce7", color: "#15803d", borderColor: "#bbf7d0" };
  if (s.includes("proposal"))
    return { background: "#dbeafe", color: "#1d4ed8", borderColor: "#bfdbfe" };
  if (s.includes("won") || s.includes("converted"))
    return { background: "#f0fdf4", color: "#166534", borderColor: "#86efac" };
  if (s.includes("lost"))
    return { background: "#fee2e2", color: "#dc2626", borderColor: "#fca5a5" };
  if (s.includes("follow"))
    return { background: "#fef3c7", color: "#d97706", borderColor: "#fde68a" };
  if (s.includes("contacted"))
    return { background: "#f5f3ff", color: "#6d28d9", borderColor: "#ddd6fe" };
  // default — New Lead
  return { background: "#fff5f7", color: "#be123c", borderColor: "#fecdd3" };
}
const TEMP_CFG = {
  Hot: { color: "#dc2626", bg: "#fee2e2", Icon: Flame },
  Warm: { color: "#d97706", bg: "#fef3c7", Icon: Thermometer },
  Cold: { color: "#2563eb", bg: "#dbeafe", Icon: Snowflake },
  Converted: { color: "#16a34a", bg: "#dcfce7", Icon: CheckCircle },
};


// ─── helpers ──────────────────────────────────────────────────────────────────
const initials = (n) =>
  n
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
const genId = () => "EMP" + Math.random().toString(36).slice(2, 6).toUpperCase();
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const toDateInputValue = (value) => {
  if (!value) return "";
  const s = String(value);
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtDate = (d) => {
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d || "—";
  }
};
const fmt$ = (v) => `$${(v / 1000).toFixed(0)}k`;
const fmtINR = (v) => {
  const n = Number(v) || 0;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
};

function normalizeEmployee(emp) {
  const leads = Number(emp.leads) || 0;
  const conv = Number(emp.conv) || 0;
  const revenue = Number(emp.revenue) || 0;
  const contacted = Number(emp.contacted) || 0;
  const conversionPct = leads > 0 ? Math.round((conv / leads) * 100) : 0;

  return {
    ...emp,
    avatar: initials(emp.name || "?"),
    productivity: conversionPct,
    deals: conv,
    revenue,
    leads,
    conv,
    contacted,
    status: emp.status || "active",
    workLocation: emp.work_location || "Office",
    accessLevel: emp.access_level || "Member",
    employeeId: emp.emp_id || "",
    callyserId: emp.callyser_id || "",
    joiningDate: toDateInputValue(emp.joining_date),
    department: emp.department || "",
    territory: emp.territory || "",
    managerName: emp.manager_name || "",
    notes: emp.notes || "",
    salary: emp.salary != null ? String(emp.salary) : "",
    callTarget: Number(emp.call_target) || 0,
    callWeightage: Number(emp.call_weightage) || 0,
    qualifiedLeadTarget: Number(emp.qualified_lead_target) || 0,
    qualifiedLeadWeightage: Number(emp.qualified_lead_weightage) || 0,
    meetingTarget: Number(emp.meeting_target) || 0,
    meetingWeightage: Number(emp.meeting_weightage) || 0,
    cashTarget: Number(emp.cash_target) || 0,
    cashWeightage: Number(emp.cash_weightage) || 0,
    incentiveKRA: Boolean(emp.incentive_kra),
    activeLeads: Number(emp.active_leads ?? emp.current_active_leads) || 0,
    currentActiveLeads: Number(emp.current_active_leads ?? emp.active_leads) || 0,
    maxActiveLeads: Number(emp.max_active_leads) || 40,
  };
}

const COUNTRY_CODES = [
  { code: "+91", flag: "", label: "IN" },
  { code: "+1", flag: "", label: "US" },
  { code: "+44", flag: "", label: "GB" },
  { code: "+971", flag: "", label: "AE" },
  { code: "+65", flag: "", label: "SG" },
  { code: "+61", flag: "", label: "AU" },
  { code: "+49", flag: "", label: "DE" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.(com|in|org|net|co\.in|co\.uk)$/i;
const PHONE_RE = /^\d{10}$/;

function validate(f) {
  const e = {};

  // Personal — all mandatory
  if (!f.name?.trim()) e.name = "Full name is required";
  else if (f.name.trim().length < 2) e.name = "Name must be at least 2 characters";

  if (!f.phone?.trim()) e.phone = "Phone number is required";
  else if (!PHONE_RE.test(f.phone.trim())) e.phone = "Phone must be exactly 10 digits";

  if (!f.email?.trim()) e.email = "Email is required";
  else if (!EMAIL_RE.test(f.email.trim()))
    e.email = "Email must be valid (e.g. name@company.com or .in)";

  if (!f.city?.trim()) e.city = "City is required";

  // Company — role mandatory
  if (!f.role?.trim()) e.role = "Role is required";

  if (!String(f.salary ?? "").trim()) e.salary = "Salary is required";
  else if (!/^\d+(\.\d{1,2})?$/.test(String(f.salary).trim()))
    e.salary = "Enter a valid salary amount";
  else if (Number(f.salary) <= 0) e.salary = "Salary must be greater than 0";

  return e;
}

const Spin = () => (
  <motion.div
    animate={{ rotate: 360 }}
    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
    style={{
      width: 14,
      height: 14,
      borderRadius: "50%",
      border: "2px solid rgba(255,255,255,.25)",
      borderTopColor: "#fff",
    }}
  />
);
function DatePicker({ onApply, onClose }) {
  const [s, setS] = useState("");
  const [e, setE] = useState("");
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
      style={{
        position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 40,
        borderRadius: 14, border: "1px solid #fecdd3", padding: 16, width: 255, background: "#fff", boxShadow: "0 16px 48px rgba(0,0,0,.08)"
      }}
    >
      <p style={{
        fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em",
        color: "#be123c", marginBottom: 12
      }}>
        Custom Range
      </p>
      {[["From", s, setS], ["To", e, setE]].map(([lbl, val, fn]) => (
        <div key={lbl} style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: "#be123c", display: "block", marginBottom: 4 }}>
            {lbl}
          </label>
          <input type="date" value={val} onChange={ev => fn(ev.target.value)}
            style={{
              width: "100%", padding: "7px 10px", borderRadius: 8,
              background: "#f8fafc", border: "1px solid #e2e8f0",
              fontSize: 12, color: "inherit", outline: "none",
              boxSizing: "border-box"
            }} />
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button onClick={onClose}
          style={{
            flex: 1, padding: "7px", borderRadius: 8,
            border: "1px solid #e2e8f0", fontSize: 12, color: "#475569", background: "transparent",
            cursor: "pointer"
          }}>
          Cancel
        </button>
        <button
          disabled={!s || !e}
          onClick={() => { if (s && e) { onApply({ s, e }); onClose(); } }}
          style={{
            flex: 1, padding: "7px", borderRadius: 8,
            background: s && e ? "oklch(0.50 0.22 18)" : "#e2e8f0",
            fontSize: 12, fontWeight: 500, color: s && e ? "#fff" : "#94a3b8", border: "none", cursor: s && e ? "pointer" : "not-allowed"
          }}>
          Apply
        </button>
      </div>
    </motion.div>
  );
}
// ─── Attendance pie tooltip (status labels, not indices) ─────────────────────
function AttendanceTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row?.label) return null;
  return (
    <div
      style={{
        background: "#fff", border: "1px solid #fecdd3", borderRadius: 10, padding: "10px 14px", fontSize: 11, minWidth: 140, boxShadow: "0 12px 40px rgba(0,0,0,.08)", color: "#1e293b",
      }}
    >
      <p style={{ fontWeight: 700, color: row.color, marginBottom: 6, fontSize: 12 }}>
        {row.label}
      </p>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "baseline",
        }}
      >
        <span style={{ color: "#64748b" }}>Count</span>
        <span style={{ fontWeight: 800, fontSize: 13 }}>{row.count}</span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "baseline",
          marginTop: 4,
        }}
      >
        <span style={{ color: "#64748b" }}>Share</span>
        <span style={{ fontWeight: 700, color: row.color }}>{row.pct}%</span>
      </div>
    </div>
  );
}

// ─── chip ─────────────────────────────────────────────────────────────────────
function Chip({ label, color, bg, border, icon: Icon }) {
  return (
    <span
      className="chip"
      style={{
        background: bg || `${color}18`,
        color,
        border: `1px solid ${border || color + "28"}`,
      }}
    >
      {Icon && <Icon style={{ width: 9, height: 9 }} />}
      {label}
    </span>
  );
}



// ─── form primitives ──────────────────────────────────────────────────────────
function FErr({ msg }) {
  if (!msg) return null;
  return (
    <p
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        marginTop: 4,
        fontSize: 11,
        color: C.red,
      }}
    >
      <AlertCircle style={{ width: 11, height: 11 }} />
      {msg}
    </p>
  );
}
function FL({ children, req }) {
  return (
    <label
      style={{
        display: "block",
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: ".12em",
        color: "oklch(0.52 0.02 280)",
        marginBottom: 5,
        fontWeight: 500,
      }}
    >
      {children}
      {req && <span style={{ color: C.red, marginLeft: 2 }}>*</span>}
    </label>
  );
}
const inputSt = (err) => ({
  width: "100%",
  paddingTop: 9,
  paddingBottom: 9,
  paddingRight: 10,
  borderRadius: 10,
  background: "#fff",
  border: `1px solid ${err ? "#ef4444" : "#fecdd3"}`,
  fontSize: 13,
  color: "#1e293b",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color .15s",
});

function FInput({ icon: Icon, error, ...props }) {
  return (
    <div style={{ position: "relative" }}>
      {Icon && (
        <Icon
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            width: 13,
            height: 13,
            color: "oklch(0.48 0.02 280)",
            pointerEvents: "none",
          }}
        />
      )}
      <input style={{ ...inputSt(error), paddingLeft: Icon ? 34 : 12 }} {...props} />
    </div>
  );
}
function FSelect({ icon: Icon, error, children, ...props }) {
  return (
    <div style={{ position: "relative" }}>
      {Icon && (
        <Icon
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            width: 13,
            height: 13,
            color: "oklch(0.48 0.02 280)",
            pointerEvents: "none",
          }}
        />
      )}
      <ChevronDown
        style={{
          position: "absolute",
          right: 9,
          top: "50%",
          transform: "translateY(-50%)",
          width: 12,
          height: 12,
          color: "oklch(0.48 0.02 280)",
          pointerEvents: "none",
        }}
      />
      <select
        style={{
          ...inputSt(error),
          paddingLeft: Icon ? 34 : 12,
          paddingRight: 26,
          appearance: "none",
        }}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
function FSec({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 13 }}>
        <span
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: ".13em",
            fontWeight: 600,
            color: "#be123c", whiteSpace: "nowrap",
          }}>{title}</span><div style={{ flex: 1, height: 1, background: "#fecdd3" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>{children}</div>
    </div>
  );
}
const G2 = ({ children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{children}</div>
);

function AvatarUpload({ preview, name, onChange }) {
  const ref = useRef();
  const fb = initials(name || "?");
  const pick = () => ref.current?.click();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
      <div
        onClick={pick}
        style={{
          position: "relative",
          width: 68,
          height: 68,
          borderRadius: 15,
          cursor: "pointer",
          overflow: "hidden",
          border: "2px dashed #fecdd3", flexShrink: 0, background: "#f8fafc",
        }}
      >
        {preview ? (
          <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 700,
              color: "#be123c", background: "#fff1f2",
            }}
          >
            {fb !== "?" ? fb : <User style={{ width: 26, height: 26, opacity: 0.4 }} />}
          </div>
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,.55)",
            opacity: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "opacity .15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = 0)}
        >
          <Upload style={{ width: 16, height: 16, color: "#fff" }} />
        </div>
        <input
          ref={ref}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = (ev) => onChange(ev.target.result);
            r.readAsDataURL(f);
          }}
        />
      </div>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500 }}>Profile Photo</p>
        <p style={{ fontSize: 11, color: "oklch(0.48 0.02 280)", marginTop: 2 }}>
          JPG, PNG or GIF · Max 2MB
        </p>
        <button
          type="button"
          onClick={pick}
          style={{
            marginTop: 7,
            fontSize: 11,
            padding: "4px 10px",
            borderRadius: 8,
            border: "1px solid #fecdd3", color: "#be123c",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          Choose file
        </button>
      </div>
    </div>
  );
}

function MemberForm({ fields, errors, set, blur }) {
  const inputBase = (hasErr) => ({
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${hasErr ? "#ef4444" : "#f3b6c4"}`,
    outline: "none",
    fontSize: 13,
    background: "#fff",
    color: "#2b2b2b",
    boxSizing: "border-box",
    transition: "border-color .15s",
  });

  const labelStyle = {
    fontSize: 12,
    fontWeight: 600,
    color: "#b3123f",
    marginBottom: 6,
    display: "block",
  };

  const errStyle = {
    fontSize: 11,
    color: "#ef4444",
    marginTop: 4,
    display: "flex",
    alignItems: "center",
    gap: 4,
  };

  const sectionStyle = {
    background: "#fff5f7",
    border: "1px solid #ffd1dc",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  };

  const grid2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };

  const kpiBox = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 10,
  };

  const btn = (active) => ({
    padding: "8px 10px",
    borderRadius: 10,
    cursor: "pointer",
    border: active ? "1px solid #e11d48" : "1px solid #f3b6c4",
    background: active ? "#e11d48" : "#fff",
    color: active ? "#fff" : "#b3123f",
    fontSize: 12,
    fontWeight: 500,
  });

  // small helper
  const ErrMsg = ({ field }) =>
    errors[field] ? (
      <p style={errStyle}>
        <AlertCircle style={{ width: 11, height: 11 }} />
        {errors[field]}
      </p>
    ) : null;

  const requiredStar = <span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>;

  return (
    <div>
      {/* ── PERSONAL ── */}
      <div style={sectionStyle}>
        <h4 style={{ color: "#e11d48", marginBottom: 12 }}>
          Personal Details
          <span style={{ fontSize: 10, color: "#be123c", fontWeight: 400, marginLeft: 8 }}>
            * All fields required
          </span>
        </h4>

        {/* Name */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Full Name {requiredStar}</label>
          <input
            style={inputBase(errors.name)}
            value={fields.name}
            onChange={(e) => set("name", e.target.value)}
            onBlur={() => blur("name")}
            placeholder="Enter full name"
          />
          <ErrMsg field="name" />
        </div>

        {/* Phone with country code */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Phone Number {requiredStar}</label>
          <div style={{ display: "flex", gap: 8 }}>
            {/* Country code dropdown */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <select
                value={fields.countryCode}
                onChange={(e) => set("countryCode", e.target.value)}
                style={{
                  height: "100%",
                  padding: "10px 28px 10px 10px",
                  borderRadius: 10,
                  border: "1px solid #f3b6c4",
                  background: "#fff",
                  fontSize: 13,
                  color: "#2b2b2b",
                  outline: "none",
                  appearance: "none",
                  cursor: "pointer",
                  minWidth: 90,
                }}
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code}
                  </option>
                ))}
              </select>
              <ChevronDown
                style={{
                  position: "absolute",
                  right: 7,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 12,
                  height: 12,
                  color: "#be123c",
                  pointerEvents: "none",
                }}
              />
            </div>

            {/* 10-digit number input */}
            <div style={{ flex: 1 }}>
              <input
                style={inputBase(errors.phone)}
                value={fields.phone}
                onChange={(e) => {
                  // only allow digits, max 10
                  const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                  set("phone", val);
                }}
                onBlur={() => blur("phone")}
                placeholder="10-digit number"
                maxLength={10}
                inputMode="numeric"
              />
            </div>
          </div>
          <ErrMsg field="phone" />
          {/* live digit counter */}
          <p
            style={{
              fontSize: 10,
              color: fields.phone.length === 10 ? "#16a34a" : "#be123c",
              marginTop: 3,
              textAlign: "right",
            }}
          >
            {fields.phone.length}/10 digits
          </p>
        </div>

        {/* Email */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Company Email {requiredStar}</label>
          <input
            style={inputBase(errors.email)}
            value={fields.email}
            onChange={(e) => set("email", e.target.value)}
            onBlur={() => blur("email")}
            placeholder="name@company.com or .in"
            type="email"
          />
          <ErrMsg field="email" />
        </div>

        {/* City */}
        <div>
          <label style={labelStyle}>City {requiredStar}</label>
          <input
            style={inputBase(errors.city)}
            value={fields.city}
            onChange={(e) => set("city", e.target.value)}
            onBlur={() => blur("city")}
            placeholder="e.g. Mumbai"
          />
          <ErrMsg field="city" />
        </div>
      </div>

      {/* ── COMPANY ── */}
      <div style={sectionStyle}>
        <h4 style={{ color: "#e11d48", marginBottom: 12 }}>Company Details</h4>

        <div style={grid2}>
          <div>
            <label style={labelStyle}>Callyser ID</label>
            <input
              style={inputBase(false)}
              value={fields.callyserId}
              onChange={(e) => set("callyserId", e.target.value)}
              placeholder="91-9462265230 (from Callyzer employee phone)"
            />
            <p style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
              Copy from Callyzer → Employees list. Example: Sushmit Air (+91-9462265230) → enter <strong>91-9462265230</strong>
            </p>
          </div>
          <div>
            <label style={labelStyle}>Employee ID</label>
            <input
              style={inputBase(false)}
              value={fields.employeeId}
              onChange={(e) => set("employeeId", e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>Joining Date</label>
          <input
            type="date"
            style={inputBase(false)}
            value={fields.joiningDate || todayISO()}
            onChange={(e) => set("joiningDate", e.target.value)}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>Role {requiredStar}</label>
          <input
            style={inputBase(errors.role)}
            value={fields.role}
            onChange={(e) => set("role", e.target.value)}
            onBlur={() => blur("role")}
            placeholder="e.g. Sales Manager"
          />
          <ErrMsg field="role" />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>Monthly Salary (₹) {requiredStar}</label>
          <div style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 13,
                color: "#be123c",
                fontWeight: 600,
                pointerEvents: "none",
              }}
            >
              ₹
            </span>
            <input
              style={{ ...inputBase(errors.salary), paddingLeft: 28 }}
              value={fields.salary}
              onChange={(e) => set("salary", e.target.value.replace(/[^\d.]/g, ""))}
              onBlur={() => blur("salary")}
              placeholder="e.g. 50000"
              inputMode="decimal"
            />
          </div>
          <ErrMsg field="salary" />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>Incentive Calculation Using KRA (Optional)</label>
          <button
            type="button"
            style={btn(fields.incentiveKRA)}
            onClick={() => set("incentiveKRA", !fields.incentiveKRA)}
          >
            {fields.incentiveKRA ? "Enabled" : "Disabled"}
          </button>
        </div>
      </div>

      {/* ── PERFORMANCE ── */}
      <div style={sectionStyle}>
        <h4 style={{ color: "#e11d48", marginBottom: 10 }}>Performance Metrics</h4>

        {[
          { label: `Call Conversations (${CALL_CONVERSATION_LABEL})`, t: "callTarget", w: "callWeightage" },
          { label: "Qualified Leads", t: "qualifiedLeadTarget", w: "qualifiedLeadWeightage" },
          { label: "Meetings Scheduled", t: "meetingTarget", w: "meetingWeightage" },
          { label: "Cash Collection", t: "cashTarget", w: "cashWeightage" },
        ].map(({ label, t, w }) => (
          <div key={label} style={{ marginBottom: 12 }}>
            <label style={labelStyle}>{label}</label>
            <div style={kpiBox}>
              {t === "cashTarget" ? (
                <div style={{ position: "relative" }}>
                  <span
                    style={{
                      position: "absolute",
                      left: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: 12,
                      color: "#be123c",
                      fontWeight: 600,
                      pointerEvents: "none",
                    }}
                  >
                    ₹
                  </span>
                  <input
                    style={{ ...inputBase(false), fontSize: 12, paddingLeft: 22 }}
                    placeholder="Target"
                    value={fields[t]}
                    onChange={(e) => set(t, e.target.value)}
                    inputMode="numeric"
                  />
                </div>
              ) : (
                <input
                  style={{ ...inputBase(false), fontSize: 12 }}
                  placeholder="Target"
                  value={fields[t]}
                  onChange={(e) => set(t, e.target.value)}
                  inputMode="numeric"
                />
              )}
              <input
                style={{ ...inputBase(false), fontSize: 12 }}
                placeholder="Weightage %"
                value={fields[w]}
                onChange={(e) => set(w, e.target.value)}
                inputMode="numeric"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const EMPTY = {
  name: "",
  phone: "",
  countryCode: "+91", // ← new
  email: "",
  city: "",
  callyserId: "",
  employeeId: genId(),
  role: "",
  salary: "",
  incentiveKRA: false,
  callTarget: "",
  callWeightage: "",
  qualifiedLeadTarget: "",
  qualifiedLeadWeightage: "",
  meetingTarget: "",
  meetingWeightage: "",
  cashTarget: "",
  cashWeightage: "",
  joiningDate: "",
};

function defaultMemberFields() {
  return {
    ...EMPTY,
    employeeId: genId(),
    joiningDate: todayISO(),
  };
}

function useForm(init) {
  const [fields, setFields] = useState(init);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState({});

  const set = useCallback(
    (k, v) => {
      setFields((p) => ({ ...p, [k]: v }));
      if (touched[k]) setErrors((p) => ({ ...p, [k]: undefined }));
    },
    [touched],
  );

  const blur = (k) => {
    setTouched((p) => ({ ...p, [k]: true }));
    setErrors((p) => ({ ...p, [k]: validate(fields)[k] }));
  };

  const reset = useCallback((nxt = init) => {
    setFields(nxt);
    setErrors({});
    setTouched({});
    setSaving(false);
  }, []);

  const submit = async (cb) => {
    setTouched(Object.fromEntries(Object.keys(fields).map((k) => [k, true])));
    const e = validate(fields);
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 440));
    setSaving(false);
    cb(fields);
  };

  return { fields, errors, touched, saving, set, blur, reset, submit };
}

// ─── Add Member Drawer ────────────────────────────────────────────────────────

function AddDrawer({ open, onClose, onSave, members }) {
  const form = useForm(defaultMemberFields());

  useEffect(() => {
    if (open) form.reset(defaultMemberFields());
  }, [open]);

  const close = () => {
    form.reset(defaultMemberFields());
    onClose();
  };

  const save = async () => {
    // run client-side validation first
    const errs = validate(form.fields);
    if (Object.keys(errs).length > 0) {
      // mark all touched so errors show
      Object.keys(errs).forEach((k) => form.blur(k));
      toast.error("Please fix the errors before saving.", {
        style: { background: "#fff1f2", color: "#be123c", border: "1px solid #fecdd3" },
        iconTheme: { primary: "#e11d48", secondary: "#fff" },
      });
      return;
    }

    await form.submit(async (f) => {
      try {
        await onSave(f);
        toast.success(`${f.name} added successfully!`, {
          style: { background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" },
          iconTheme: { primary: "#16a34a", secondary: "#fff" },
        });
        form.reset(defaultMemberFields());
        onClose();
      } catch (err) {
        // duplicate email / phone from backend
        const msg = err?.message || "";
        if (msg.includes("email")) {
          toast.error("An employee with this email already exists.", {
            style: { background: "#fff1f2", color: "#be123c", border: "1px solid #fecdd3" },
            iconTheme: { primary: "#e11d48", secondary: "#fff" },
          });
        } else if (msg.includes("phone")) {
          toast.error("An employee with this phone number already exists.", {
            style: { background: "#fff1f2", color: "#be123c", border: "1px solid #fecdd3" },
            iconTheme: { primary: "#e11d48", secondary: "#fff" },
          });
        } else {
          toast.error("Failed to add employee. Please try again.", {
            style: { background: "#fff1f2", color: "#be123c", border: "1px solid #fecdd3" },
            iconTheme: { primary: "#e11d48", secondary: "#fff" },
          });
        }
      }
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="ab"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 40,
              background: "rgba(0,0,0,.62)",
              backdropFilter: "blur(5px)",
            }}
          />
          <motion.aside
            key="ad"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            style={{
              position: "fixed",
              right: 0,
              top: 0,
              bottom: 0,
              zIndex: 50,
              display: "flex",
              flexDirection: "column",
              width: "100%",
              maxWidth: 480,
              background: "#fff5f7",
              borderLeft: "1px solid #ffd1dc",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 22px",
                borderBottom: "1px solid #ffd1dc",
                background: "#fff",
                flexShrink: 0,
              }}
            >
              <div>
                <p style={{ fontWeight: 700, fontSize: 15, color: "#be123c" }}>Add Team Member</p>
                <p style={{ fontSize: 11, color: "#f43f5e", marginTop: 2 }}>
                  Onboard a new team member
                </p>
              </div>
              <button
                onClick={close}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: "#fff1f2",
                  border: "1px solid #fecdd3",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "#be123c",
                }}
              >
                <X style={{ width: 13, height: 13 }} />
              </button>
            </div>

            {/* Body */}
            <div className="no-sb" style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
              <MemberForm {...form} existingMembers={members} />
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "13px 22px",
                borderTop: "1px solid #ffd1dc",
                background: "#fff5f7",
                display: "flex",
                gap: 10,
                flexShrink: 0,
              }}
            >
              <button
                onClick={close}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 10,
                  border: "1px solid #fecdd3",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#9f1239",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={form.saving}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 10,
                  background: "oklch(0.50 0.22 18)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  opacity: form.saving ? 0.6 : 1,
                }}
              >
                {form.saving ? (
                  <>
                    <Spin />
                    Saving…
                  </>
                ) : (
                  "Save Member"
                )}
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function CredentialsModal({ open, credentials, memberName, onClose }) {
  const copyText = (label, value) => {
    if (!value) return;
    navigator.clipboard.writeText(String(value));
    toast.success(`${label} copied`);
  };

  const copyAll = () => {
    if (!credentials) return;
    const text = [
      `Name: ${memberName || ""}`,
      `Login ID: ${credentials.loginId}`,
      `Email: ${credentials.email}`,
      `Password: ${credentials.password}`,
    ].join("\n");
    navigator.clipboard.writeText(text);
    toast.success("All credentials copied");
  };

  return (
    <AnimatePresence>
      {open && credentials && (
        <motion.div
          key="cred-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "rgba(0,0,0,.75)",
            backdropFilter: "blur(5px)",
          }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            style={{
              width: "100%",
              maxWidth: 420,
              borderRadius: 18,
              padding: 22,
              background: "#fff",
              border: "1px solid #fecdd3",
            }}
          >
            <p style={{ fontWeight: 700, fontSize: 15, color: "#be123c", marginBottom: 4 }}>
              Login credentials created
            </p>
            <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16, lineHeight: 1.5 }}>
              Share these with <strong>{memberName}</strong> once. The password will not be shown again.
            </p>

            {[
              ["Login ID", credentials.loginId],
              ["Email", credentials.email],
              ["Password", credentials.password],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  marginBottom: 8,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 10, textTransform: "uppercase", color: "#94a3b8", letterSpacing: ".08em" }}>
                    {label}
                  </p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", wordBreak: "break-all" }}>{value}</p>
                </div>
                <button
                  type="button"
                  onClick={() => copyText(label, value)}
                  style={{
                    flexShrink: 0,
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid #cbd5e1",
                    background: "#fff",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Copy
                </button>
              </div>
            ))}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                type="button"
                onClick={copyAll}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 10,
                  border: "none",
                  background: "#be123c",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Copy all
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                  background: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DeleteModal({ open, emp, onConfirm, onCancel, busy }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="dm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "rgba(0,0,0,.75)",
            backdropFilter: "blur(5px)",
          }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            style={{
              width: "100%",
              maxWidth: 360,
              borderRadius: 18,
              padding: 22,
              background: "#fff", border: "1px solid #fecdd3",
            }}><div style={{ display: "flex", gap: 12, marginBottom: 14 }}><div style={{
              width: 38, height: 38, borderRadius: 10, background: "#fff1f2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
            >
              <AlertTriangle style={{ width: 18, height: 18, color: C.red }} />
            </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>Remove Employee</p><p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                  This cannot be undone
                </p>
              </div>
            </div>
            <p
              style={{
                fontSize: 13, color: "#475569", marginBottom: 20, lineHeight: 1.6,
              }}
            >
              You're about to permanently remove{" "}
              <span style={{ color: "#0f172a", fontWeight: 700 }}>{emp?.name}</span> and
              all their data.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={onCancel}
                style={{
                  flex: 1,
                  padding: "9px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0", fontSize: 13, fontWeight: 500, color: "#475569",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: "9px",
                  borderRadius: 10,
                  background: "var(--primary)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? (
                  <>
                    <Spin />
                    Removing…
                  </>
                ) : (
                  <>
                    <Trash2 style={{ width: 13, height: 13 }} />
                    Remove
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const MAX_AI_COACH_INSIGHTS = 2;

function buildAiCoachInsights({
  firstName,
  assigned,
  converted,
  qualified,
  followups,
  contacted,
  overallPerfClamped,
  revenue,
  fmtINR,
  funnel,
}) {
  const insights = [];

  insights.push({
    id: "pipeline",
    body: (
      <>
        {firstName} has <strong>{assigned} assigned leads</strong>
        {qualified > 0 && <> with <strong>{qualified} qualified</strong></>}
        {converted > 0 && <> and <strong>{converted} conversions</strong></>}
        {assigned === 0 && <> — no active pipeline yet</>}
        .
      </>
    ),
  });

  if (followups > 0) {
    insights.push({
      id: "followups",
      body: (
        <>
          <strong>{followups} leads</strong> need follow-up — prioritize callbacks to improve conversion.
        </>
      ),
    });
  } else if (funnel?.length >= 2) {
    const top = Number(funnel[0]?.value) || 0;
    const next = Number(funnel[1]?.value) || 0;
    if (top > 0 && top > next) {
      const dropPct = Math.round(((top - next) / top) * 100);
      insights.push({
        id: "funnel",
        body: (
          <>
            <strong>{dropPct}% drop</strong> from {funnel[0].name} to {funnel[1].name}
            {contacted > 0 && <> — {contacted} contacted so far</>}.
          </>
        ),
      });
    }
  }

  if (insights.length < MAX_AI_COACH_INSIGHTS) {
    insights.push({
      id: "kra",
      body: (
        <>
          <strong>KRA progress:</strong> {Math.round(overallPerfClamped)}% overall · {fmtINR(revenue)} collected.
        </>
      ),
    });
  }

  return insights.slice(0, MAX_AI_COACH_INSIGHTS);
}

function AiCoachInsightsPanel({ compact, insights }) {
  const rows = (insights || []).slice(0, compact ? 2 : MAX_AI_COACH_INSIGHTS);

  return (
    <div style={{
      ...INSIGHT_CARD,
      borderRadius: compact ? 10 : INSIGHT_CARD.borderRadius,
      padding: compact ? "10px 12px" : INSIGHT_CARD.padding,
    }}>
      <h3 style={{
        ...INSIGHT_CARD_TITLE,
        fontSize: compact ? 9 : INSIGHT_CARD_TITLE.fontSize,
        marginBottom: compact ? 6 : 10,
        display: "flex",
        alignItems: "center",
        gap: 5,
      }}>
        <Sparkles style={{ width: compact ? 11 : 13, height: compact ? 11 : 13 }} />
        AI Coach Insights
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: compact ? 6 : 8, flex: 1 }}>
        {rows.map((row) => (
          <div
            key={row.id}
            style={{
              background: "#fff1f2",
              padding: compact ? "7px 9px" : "9px 11px",
              borderRadius: 8,
              borderLeft: "3px solid #e11d48",
              fontSize: compact ? 9 : 11,
              color: "#1e293b",
              lineHeight: 1.45,
            }}
          >
            {row.body}
          </div>
        ))}
      </div>
    </div>
  );
}

/** SVG pipeline funnel with readable labels on every stage. */
function PipelineFunnelGraphic({ funnelData, compact, dense = false, mini = false }) {
  const stages = (funnelData || []).slice(0, 5);
  if (!stages.length) return null;

  const svgW = mini ? 188 : dense ? 240 : 280;
  const segH = mini ? 22 : dense ? 34 : (compact ? 44 : 58);
  const segGap = mini ? 2 : dense ? 3 : (compact ? 6 : 10);
  const padTop = mini ? 1 : dense ? 2 : 8;
  const svgH = padTop + stages.length * segH + (stages.length - 1) * segGap + (mini ? 2 : dense ? 4 : 10);
  const cx = svgW / 2;
  const maxHalf = mini ? 84 : dense ? 108 : 128;
  const minTopHalf = mini ? 18 : 28;
  const minBotHalf = mini ? 14 : 22;

  const gradStops = [
    ["#be123c", "#9f1239"],
    ["#e11d48", "#be123c"],
    ["#dc2626", "#b91c1c"],
    ["#c2185b", "#9d174d"],
    ["#881337", "#701a35"],
  ];

  const funnelLabel = (name) => {
    const n = String(name || "").toLowerCase();
    if (n === "converted") return "WON";
    if (n === "meeting") return "MEET";
    if (n === "dialed") return "DIALED";
    if (n === "2min+" || n === "2min") return "2MIN+";
    if (n === "contacted") return "DIALED";
    if (n === "qualified") return "2MIN+";
    return String(name || "").toUpperCase();
  };

  const segments = stages.map((_, idx) => {
    const t0 = idx / stages.length;
    const t1 = (idx + 1) / stages.length;
    const topHalf = Math.max(minTopHalf, maxHalf * (1 - t0 * 0.78));
    const botHalf = Math.max(minBotHalf, maxHalf * (1 - t1 * 0.78));
    const y0 = padTop + idx * (segH + segGap);
    const y1 = y0 + segH;
    const [c0, c1] = gradStops[idx] || gradStops[gradStops.length - 1];
    const narrow = botHalf < 38;
    const countSize = mini
      ? (narrow ? 11 : 12)
      : dense
        ? (narrow ? 13 : 15)
        : narrow ? (compact ? 17 : 19) : (compact ? 20 : 24);
    const labelSize = mini
      ? (narrow ? 6 : 7)
      : dense
        ? (narrow ? 7 : 8)
        : narrow ? (compact ? 9 : 10) : (compact ? 11 : 12);

    return {
      points: `${cx - topHalf},${y0} ${cx + topHalf},${y0} ${cx + botHalf},${y1} ${cx - botHalf},${y1}`,
      countY: y0 + segH * 0.4,
      labelY: y0 + segH * 0.74,
      c0,
      c1,
      countSize,
      labelSize,
      label: funnelLabel(stages[idx]?.label),
    };
  });

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${svgW} ${svgH}`}
      preserveAspectRatio="xMidYMin meet"
      fill="none"
      style={{ display: "block", height: "auto", maxWidth: "100%" }}
      aria-hidden
    >
      <defs>
        {segments.map((seg, i) => (
          <linearGradient key={`g-${i}`} id={`funnelGrad${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={seg.c0} />
            <stop offset="100%" stopColor={seg.c1} />
          </linearGradient>
        ))}
        <filter id="funnelTextShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#450a0a" floodOpacity="0.7" />
        </filter>
      </defs>

      {segments.map((seg, i) => (
        <g key={i}>
          <polygon
            points={seg.points}
            fill={`url(#funnelGrad${i})`}
            style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.12))" }}
          />
          <text
            x={cx}
            y={seg.countY}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#ffffff"
            filter="url(#funnelTextShadow)"
            style={{ fontSize: seg.countSize, fontWeight: 900, pointerEvents: "none" }}
          >
            {stages[i]?.value?.split(" ")[0] ?? "0"}
          </text>
          <text
            x={cx}
            y={seg.labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#ffffff"
            filter="url(#funnelTextShadow)"
            style={{
              fontSize: seg.labelSize,
              fontWeight: 800,
              letterSpacing: "0.08em",
              pointerEvents: "none",
            }}
          >
            {seg.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function EmpDetail({ emp, onEdit, onDelete, inDrawer = false }) {
  const { employee: profile, loading: detailLoading } = useEmployeeDetails(emp);
  const activeEmp = profile || emp;
  const isMobile = useIsMobile();
  const [leadDrawerOpen, setLeadDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("All Leads");
  const [search, setSearch] = useState("");
  const [resetPassModalOpen, setResetPassModalOpen] = useState(false);
  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 1024,
  );
  const stackInsights = compact || inDrawer;
  const [kraPeriod, setKraPeriod] = useState("month");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const { leads, stats, activity, funnel, stageBreakdown, loading, refresh, lastRefreshed } = useEmployeeLeads(activeEmp);
  const { stats: callyzerStats, employeeName: callyzerEmpName, loading: callyzerLoading, configured: callyzerConfigured, message: callyzerMessage, periodLabel: callyzerPeriodLabel } =
    useTeamEmployeeCallyzerStats(activeEmp?.id, kraPeriod, Boolean(activeEmp?.id));
  const { metrics: kraMetrics, loading: kraMetricsLoading } = useEmployeeKraMetrics(activeEmp?.id, {
    enabled: Boolean(activeEmp?.id),
    period: kraPeriod,
  });

  // KRA & Remuneration Calculator States
  const [baseSalary, setBaseSalary] = useState(12000);
  const [incRate, setIncRate] = useState(6);

  const [callT, setCallT] = useState(250);
  const [callA, setCallA] = useState(200);
  const [callW, setCallW] = useState(25);

  const [leadT, setLeadT] = useState(50);
  const [leadA, setLeadA] = useState(40);
  const [leadW, setLeadW] = useState(25);

  const [meetT, setMeetT] = useState(25);
  const [meetA, setMeetA] = useState(20);
  const [meetW, setMeetW] = useState(25);

  const [cashT, setCashT] = useState(40000);
  const [cashA, setCashA] = useState(20000);
  const [cashW, setCashW] = useState(25);

  useEffect(() => {
    if (!activeEmp) return;
    setBaseSalary(parseFloat(activeEmp.salary) || 0);
    setIncRate(6);

    const monthlyCallT = parseFloat(activeEmp.callTarget || activeEmp.call_target) || 0;
    const monthlyLeadT = parseFloat(activeEmp.qualifiedLeadTarget || activeEmp.qualified_lead_target) || 0;
    const monthlyMeetT = parseFloat(activeEmp.meetingTarget || activeEmp.meeting_target) || 0;
    const monthlyCashT = parseFloat(activeEmp.cashTarget || activeEmp.cash_target) || 0;

    setCallT(monthlyCallT);
    setCallW(parseFloat(activeEmp.callWeightage || activeEmp.call_weightage) || 0);

    setLeadT(monthlyLeadT);
    setLeadW(parseFloat(activeEmp.qualifiedLeadWeightage || activeEmp.qualified_lead_weightage) || 0);

    setMeetT(monthlyMeetT);
    setMeetW(parseFloat(activeEmp.meetingWeightage || activeEmp.meeting_weightage) || 0);

    setCashT(monthlyCashT);
    setCashW(parseFloat(activeEmp.cashWeightage || activeEmp.cash_weightage) || 0);

    setCallA(kraMetrics.calls5Min ?? 0);
    setLeadA(kraMetrics.qualified ?? 0);
    setMeetA(kraMetrics.meetings ?? 0);
    setCashA(kraMetrics.cash ?? 0);
  }, [activeEmp, kraMetrics, kraPeriod]);

  const parseVal = (val) => {
    const parsed = parseFloat(val);
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  };

  const cT = parseVal(callT);
  const cA = parseVal(callA);
  const cW = parseVal(callW);

  const lT = parseVal(leadT);
  const lA = parseVal(leadA);
  const lW = parseVal(leadW);

  const mT = parseVal(meetT);
  const mA = parseVal(meetA);
  const mW = parseVal(meetW);

  const caT = parseVal(cashT);
  const caA = parseVal(cashA);
  const caW = parseVal(cashW);

  const callScore = cT === 0 ? 0 : Math.min((cA / cT) * cW, cW);
  const leadScore = lT === 0 ? 0 : Math.min((lA / lT) * lW, lW);
  const meetScore = mT === 0 ? 0 : Math.min((mA / mT) * mW, mW);
  const cashScore = caT === 0 ? 0 : Math.min((caA / caT) * caW, caW);

  const overallPerformance = callScore + leadScore + meetScore + cashScore;
  const overallPerfClamped = Math.min(overallPerformance, 100);

  const incentiveAmount = caA * (parseVal(incRate) / 100);
  const totalRemuneration = parseVal(baseSalary) + incentiveAmount;

  let perfStatus = "Needs Improvement";
  let perfColor = "#ef4444";
  let perfBg = "#fef2f2";
  let perfBorder = "#fecdd3";
  if (overallPerfClamped >= 90) {
    perfStatus = "Outstanding";
    perfColor = "#16a34a";
    perfBg = "#f0fdf4";
    perfBorder = "#bbf7d0";
  } else if (overallPerfClamped >= 75) {
    perfStatus = "Excellent";
    perfColor = "#2563eb";
    perfBg = "#eff6ff";
    perfBorder = "#bfdbfe";
  } else if (overallPerfClamped >= 60) {
    perfStatus = "Good";
    perfColor = "#ea580c";
    perfBg = "#fff7ed";
    perfBorder = "#ffedd5";
  }

  // Filter by search
  const visibleLeads = useMemo(() => {
    let result = leads;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.lead_name?.toLowerCase().includes(q) ||
          l.business_name?.toLowerCase().includes(q) ||
          l.form_name?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [leads, search]);

  const calls = callyzerStats?.totalCalls ?? stats?.contacted ?? 0;
  const meetings = kraMetrics.meetings ?? stats?.totalMeetings ?? stats?.booked ?? 0;
  const assigned = stats?.totalLeads ?? 0;
  const qualified = callyzerStats?.conversations5MinPlus ?? getPipelineQualifiedCount(stats, stageBreakdown);
  const followups = stats?.followUps ?? 0;
  const converted = stats?.converted ?? 0;
  const revenue = stats?.revenue ?? 0;

  const funnelStages = useMemo(() => {
    if (callyzerConfigured && callyzerStats) {
      return buildCallyzerFunnelStages({
        assigned,
        converted,
        meetings,
        callyzerStats,
      });
    }
    return Array.isArray(funnel) ? funnel : [];
  }, [callyzerConfigured, callyzerStats, assigned, converted, meetings, funnel]);

  const funnelData = useMemo(
    () => (funnelStages.length
      ? funnelStages.map((f, idx) => ({
        label: f.name,
        value: `${f.value} ${f.name}`,
        sub: funnelConversionLabel(funnelStages, idx),
        width: `${Math.max(40, 100 - idx * 12)}%`,
        opacity: Math.max(0.45, 1 - idx * 0.12),
      }))
      : []),
    [funnelStages],
  );

  const pipelineStages = useMemo(
    () => buildPipelineChartFromLeads(leads.map(mapTeamLeadForChart)),
    [leads],
  );

  const pipelineTotal = pipelineStages.reduce((sum, s) => sum + (s.count || 0), 0);
  const convertedCount = pipelineStages.find((s) => s.label === "Payment Complete")?.count || converted;
  const pipelineDenom = assigned || pipelineTotal || 0;
  const convRate = pipelineDenom ? `${Math.round((convertedCount / pipelineDenom) * 100)}%` : "0%";

  const formatLeadPriority = (lead) => {
    const raw = String(lead.priority || lead.temperature || "").toLowerCase();
    if (raw.includes("hot") || raw.includes("critical") || raw.includes("high")) return "Hot";
    if (raw.includes("warm") || raw.includes("medium")) return "Warm";
    if (raw.includes("cold") || raw.includes("low")) return "Cold";
    return "Medium";
  };

  const leadsList = visibleLeads.map((l) => ({
    name: l.lead_name || "Unknown",
    company: l.business_name || "—",
    status: getEmpStageMeta(mapEmpLeadKanbanStage(l.pipeline_stage, l.status)).label,
    priority: formatLeadPriority(l),
    temp: l.priority === "Critical" || l.priority === "High" || l.temperature === "hot" ? 4 : l.priority === "Medium" || l.temperature === "warm" ? 3 : 2,
    next: l.follow_up ? new Date(l.follow_up).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—",
    potential: l.revenue || l.expected_revenue ? fmtINR(l.revenue || l.expected_revenue) : "₹0",
    prob: l.win_probability ? `${l.win_probability}%` : "—",
  }));

  const aiCoachInsights = useMemo(
    () => buildAiCoachInsights({
      firstName: activeEmp.name.split(" ")[0],
      assigned,
      converted,
      qualified,
      followups,
      contacted: calls,
      overallPerfClamped,
      revenue,
      fmtINR,
      funnel: funnelStages,
    }),
    [activeEmp.name, assigned, converted, qualified, followups, calls, overallPerfClamped, revenue, funnelStages],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 10 : 16, color: "#1e293b", padding: compact ? "4px 0" : "8px 0" }}>
      {/* ── Profile header ── */}
      <div style={{
        background: "#fff",
        border: "1px solid #ffe4e6",
        borderRadius: compact ? 12 : 16,
        padding: compact ? "12px 14px" : "20px 24px",
        display: "flex",
        flexDirection: compact ? "column" : "row",
        alignItems: compact ? "stretch" : "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: compact ? 12 : 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: compact ? 12 : 18, minWidth: 0, width: compact ? "100%" : undefined }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            {activeEmp.avatarImage ? (
              <img
                src={activeEmp.avatarImage}
                alt={activeEmp.name}
                style={{
                  width: compact ? 52 : 72,
                  height: compact ? 52 : 72,
                  borderRadius: compact ? 12 : 16,
                  objectFit: "cover",
                  border: "2.5px solid var(--primary)",
                }}
              />
            ) : (
              <EmployeeDoodleAvatar
                size={compact ? 52 : 72}
                shape="rounded"
                className="shadow-[0_4px_14px_rgba(244,63,94,0.08)]"
              />
            )}
            <span style={{
              position: "absolute",
              bottom: -3,
              right: -3,
              background: "#e11d48",
              color: "#fff",
              fontSize: 8,
              fontWeight: 800,
              padding: "1px 4px",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}>
              ★ 4.9
            </span>
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: compact ? 16 : 22, fontWeight: 800, color: "#be123c", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activeEmp.name}
              </h1>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 20, background: "#f1f5f9", color: "#64748b", border: "1px solid #ffe4e6", textTransform: "capitalize" }}>
                {activeEmp.status}
              </span>
            </div>
            <p style={{ fontSize: compact ? 11 : 13, color: "#475569", marginTop: 2, fontWeight: 500 }}>
              {activeEmp.role} {activeEmp.department ? ` · ${activeEmp.department}` : ""}
            </p>
          </div>
        </div>

        {/* Metadata section */}
        <div style={{
          display: "grid",
          gridTemplateColumns: compact ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(90px, 1fr))",
          gap: compact ? "8px 10px" : 20,
          flex: compact ? undefined : 1,
          width: compact ? "100%" : undefined,
          minWidth: compact ? 0 : 320,
        }}>
          {[
            { label: "Joining Date", value: activeEmp.joiningDate ? fmtDate(activeEmp.joiningDate) : "—" },
            { label: "Direct Manager", value: activeEmp.managerName || "—" },
            { label: "Territory", value: activeEmp.territory || activeEmp.city || "—" },
            { label: "Lead Focus", value: activeEmp.notes || activeEmp.department || "—" },
          ].map(({ label, value }) => (
            <div key={label} style={{ minWidth: 0 }}>
              <p style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: ".08em", color: "#64748b", margin: 0 }}>
                {label}
              </p>
              <p style={{ fontSize: compact ? 10 : 12, fontWeight: 600, color: "#1e293b", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", width: compact ? "100%" : undefined, marginLeft: compact ? 0 : "auto" }}>
          <button
            type="button"
            onClick={() => setResetPassModalOpen(true)}
            style={{
              padding: compact ? "6px 10px" : "8px 12px",
              borderRadius: 8,
              fontSize: compact ? 10 : 11.5,
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid #fecdd3",
              color: "#be123c",
              background: "#fff1f2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              flex: compact ? 1 : undefined,
              transition: "all .15s",
            }}
            title="Generate new Login ID & Password"
            onMouseEnter={(e) => { e.currentTarget.style.background = "#ffe4e6"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#fff1f2"; }}
          >
            <Key style={{ width: 11, height: 11 }} />
            Reset ID/Pass
          </button>
          <button
            onClick={onEdit}
            style={{
              padding: compact ? "6px 10px" : "8px 12px",
              borderRadius: 8,
              fontSize: compact ? 10 : 11.5,
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid #ffe4e6",
              color: "#be123c",
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              flex: compact ? 1 : undefined,
              transition: "all .15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#fff1f2"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
          >
            <Edit2 style={{ width: 11, height: 11 }} />
            Edit
          </button>
          <button
            onClick={onDelete}
            style={{
              padding: compact ? "6px 10px" : "8px 12px",
              borderRadius: 8,
              fontSize: compact ? 10 : 11.5,
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid #ef4444",
              color: "#fff",
              background: "#ef4444",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              flex: compact ? 1 : undefined,
              transition: "all .15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#dc2626";
              e.currentTarget.style.borderColor = "#dc2626";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#ef4444";
              e.currentTarget.style.borderColor = "#ef4444";
            }}
          >
            <Trash2 style={{ width: 11, height: 11 }} />
            Remove
          </button>
        </div>
      </div>

      {/* ── Performance KPI Cards ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: compact ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fit, minmax(180px, 1fr))",
        gap: compact ? 8 : 12,
      }}>
        {[
          { label: "Response Time", value: `${activeEmp.responseTimeMin ?? 1.8} min`, sub: "Avg first reply", icon: Clock },
          { label: "Pickup Rate", value: `${activeEmp.pickupRate ?? (assigned ? Math.round((calls / assigned) * 100) : 0)}%`, sub: "Calls answered", icon: PhoneCall },
          { label: "Qualification Rate", value: `${activeEmp.qualificationRate ?? (calls ? Math.round((meetings / calls) * 100) : (assigned ? Math.round((qualified / assigned) * 100) : 0))}%`, sub: "Meetings done vs total", icon: Target },
          { label: "Objection Handling", value: `${activeEmp.objectionHandling ?? (assigned ? Math.min(99, Math.round((qualified / assigned) * 95)) : 0)}%`, sub: "Handling score", icon: MessageSquare },
          { label: "Conversion Rate", value: `${activeEmp.conversionRate ?? (assigned ? ((converted / assigned) * 100).toFixed(1) : "0.0")}%`, sub: "Closed vs assigned", icon: TrendingUp },
        ].map(({ label, value, sub, icon: Icon }) => (
          <div
            key={label}
            style={{
              background: "#fff",
              border: "1px solid #ffe4e6",
              borderRadius: compact ? 10 : 14,
              padding: compact ? "10px 11px" : "16px 18px",
              position: "relative",
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: compact ? 8 : 9.5, textTransform: "uppercase", letterSpacing: ".06em", color: "#64748b", margin: 0, lineHeight: 1.2 }}>
                  {label}
                </p>
                <p style={{ fontSize: compact ? 15 : 22, fontWeight: 800, color: "#1e293b", margin: compact ? "4px 0 1px" : "6px 0 2px", lineHeight: 1.1 }}>
                  {value}
                </p>
                <p style={{ fontSize: compact ? 9 : 10, fontWeight: 500, color: "#e11d48", margin: 0, marginTop: compact ? 2 : 4, lineHeight: 1.2 }}>
                  {sub}
                </p>
              </div>
              <div style={{
                width: compact ? 26 : 32,
                height: compact ? 26 : 32,
                borderRadius: compact ? 6 : 8,
                background: "#fff1f2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#e11d48",
                flexShrink: 0,
              }}>
                <Icon style={{ width: compact ? 12 : 14, height: compact ? 12 : 14 }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {callyzerConfigured && (
        <div style={{ marginBottom: compact ? 10 : 14 }}>
          <CallyzerStatsPanel
            stats={callyzerStats}
            loading={callyzerLoading}
            configured={callyzerConfigured}
            message={callyzerMessage}
            title={`Callyzer Call Stats — ${activeEmp?.name || callyzerEmpName || "Employee"}`}
            subtitle={`${kraPeriodLabel(kraPeriod)} · employee-wise from synced call logs`}
            compact
          />
        </div>
      )}

      {/* ── KRA & Compensation Calculator Card ── */}
      <GlassCard className={compact ? "p-3" : "p-5"}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: compact ? 8 : 12 }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: compact ? 11 : 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: "#be123c", margin: 0 }}>
              KRA & Remuneration Calculator
            </h3>
            <p style={{ fontSize: compact ? 10 : 11, color: "#64748b", margin: "3px 0 0", lineHeight: 1.3 }}>
              {kraPeriodLabel(kraPeriod)} · achieved for period · monthly targets fixed
              {kraMetricsLoading ? " · updating…" : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {KRA_PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setKraPeriod(p.id)}
                style={{
                  padding: compact ? "4px 8px" : "5px 10px",
                  borderRadius: 8,
                  border: kraPeriod === p.id ? "1px solid #fda4af" : "1px solid #ffe4e6",
                  background: kraPeriod === p.id ? "#fff1f2" : "#fff",
                  color: kraPeriod === p.id ? "#be123c" : "#64748b",
                  fontSize: compact ? 9 : 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {(() => {
          const kraRows = [
            { label: `Call Conversations (${CALL_CONVERSATION_LABEL})`, ach: callA, setAch: setCallA, tgt: callT, setTgt: setCallT, weight: callW, setWeight: setCallW, score: callScore },
            { label: "Qualified Leads", ach: leadA, setAch: setLeadA, tgt: leadT, setTgt: setLeadT, weight: leadW, setWeight: setLeadW, score: leadScore },
            { label: "Meetings Scheduled", ach: meetA, setAch: setMeetA, tgt: meetT, setTgt: setMeetT, weight: meetW, setWeight: setMeetW, score: meetScore },
            { label: "Cash Collection", ach: cashA, setAch: setCashA, tgt: cashT, setTgt: setCashT, weight: cashW, setWeight: setCashW, score: cashScore },
          ];
          const fieldInput = {
            width: "100%",
            padding: compact ? "4px 6px" : "5px 8px",
            borderRadius: compact ? 6 : 8,
            border: "1px solid #fecdd3",
            fontSize: compact ? 10 : 12,
            background: "#f8fafc",
            color: "#1e293b",
            outline: "none",
            boxSizing: "border-box",
          };
          const weightInput = {
            width: compact ? 30 : 36,
            padding: compact ? "2px 3px" : "3px 4px",
            borderRadius: 6,
            border: "1px solid #ffe4e6",
            fontSize: compact ? 10 : 11.5,
            background: "#fff",
            color: "#be123c",
            fontWeight: 700,
            textAlign: "center",
            outline: "none",
          };
          const miniLabel = {
            fontSize: compact ? 8 : 10,
            fontWeight: 700,
            textTransform: "uppercase",
            color: "#64748b",
            display: "block",
            marginBottom: 3,
            letterSpacing: ".04em",
          };

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: compact ? 8 : 12 }}>
              {compact ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                  {kraRows.map((kpi) => (
                    <div
                      key={kpi.label}
                      style={{
                        border: "1px solid #ffe4e6",
                        borderRadius: 10,
                        padding: "8px 9px",
                        background: "#fff",
                        minWidth: 0,
                      }}
                    >
                      <p style={{ fontSize: 9, fontWeight: 700, color: "#be123c", margin: 0, lineHeight: 1.2, textTransform: "uppercase", letterSpacing: ".03em" }}>
                        {kpi.label}
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                        <div style={{ minWidth: 0 }}>
                          <span style={miniLabel}>Achieved</span>
                          <input type="text" value={kpi.ach} onChange={(e) => kpi.setAch(e.target.value)} style={fieldInput} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <span style={miniLabel}>Target</span>
                          <input type="text" value={kpi.tgt} onChange={(e) => kpi.setTgt(e.target.value)} style={fieldInput} />
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, marginTop: 6, paddingTop: 6, borderTop: "1px solid #fff1f2" }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#1e293b", whiteSpace: "nowrap" }}>
                          {kpi.score.toFixed(1)}%
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                          <span style={{ fontSize: 8, color: "#94a3b8", fontWeight: 600 }}>Wt</span>
                          <input type="text" value={kpi.weight} onChange={(e) => kpi.setWeight(e.target.value)} style={weightInput} />
                          <span style={{ fontSize: 9, color: "#be123c", fontWeight: 700 }}>%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.2fr", gap: 10, alignItems: "center", borderBottom: "1px solid #ffe4e6", paddingBottom: 6, fontSize: 11, fontWeight: 700, color: "#be123c", textTransform: "uppercase", letterSpacing: ".04em" }}>
                    <div>KRA Metric</div>
                    <div>Achieved</div>
                    <div>Target</div>
                    <div style={{ textAlign: "right" }}>Score / Weight</div>
                  </div>
                  {kraRows.map((kpi, idx) => (
                    <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.2fr", gap: 10, alignItems: "center", fontSize: 12.5, color: "#1e293b" }}>
                      <div style={{ fontWeight: 600 }}>{kpi.label}</div>
                      <div>
                        <input type="text" value={kpi.ach} onChange={(e) => kpi.setAch(e.target.value)} style={fieldInput} />
                      </div>
                      <div>
                        <input type="text" value={kpi.tgt} onChange={(e) => kpi.setTgt(e.target.value)} style={fieldInput} />
                      </div>
                      <div style={{ textAlign: "right", fontWeight: 700, color: "#be123c" }}>
                        <span style={{ color: "#1e293b" }}>{kpi.score.toFixed(1)}%</span>
                        <span style={{ color: "#94a3b8", fontWeight: 500, marginLeft: 4 }}>/</span>
                        <input type="text" value={kpi.weight} onChange={(e) => kpi.setWeight(e.target.value)} style={{ ...weightInput, marginLeft: 4 }} />
                        %
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Base Salary & Incentive Rate Inline Settings & Performance Circle */}
              <div style={{
                display: "grid",
                gridTemplateColumns: compact ? "repeat(2, minmax(0, 1fr))" : "1.2fr 1fr 1.2fr 1.5fr 2.2fr",
                gap: compact ? 8 : 14,
                marginTop: compact ? 4 : 8,
                paddingTop: compact ? 8 : 12,
                borderTop: "1px solid #ffe4e6",
                alignItems: compact ? "stretch" : "center",
              }} className={compact ? undefined : "responsive-grid"}>
                <div style={{ minWidth: 0 }}>
                  <label style={miniLabel}>Base Salary</label>
                  <input
                    type="text"
                    value={baseSalary}
                    onChange={(e) => setBaseSalary(e.target.value)}
                    style={{ ...fieldInput, background: "#fff", fontWeight: 600 }}
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={miniLabel}>Rate (%)</label>
                  <input
                    type="text"
                    value={incRate}
                    onChange={(e) => setIncRate(e.target.value)}
                    style={{ ...fieldInput, background: "#fff", fontWeight: 600 }}
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={miniLabel}>Incentive</label>
                  <span style={{ fontSize: compact ? 11 : 13, fontWeight: 800, color: "#16a34a", display: "block", paddingTop: compact ? 2 : 4 }}>
                    ₹{Math.round(incentiveAmount).toLocaleString("en-IN")}
                  </span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={miniLabel}>Remuneration</label>
                  <span style={{ fontSize: compact ? 11 : 13, fontWeight: 900, color: "#e11d48", display: "block", paddingTop: compact ? 2 : 4 }}>
                    ₹{Math.round(totalRemuneration).toLocaleString("en-IN")}
                  </span>
                </div>

                {/* Performance Circle */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: compact ? 8 : 10,
                  background: perfBg,
                  border: `1px solid ${perfBorder}`,
                  borderRadius: compact ? 10 : 12,
                  padding: compact ? "8px 10px" : "6px 12px",
                  marginLeft: compact ? 0 : "auto",
                  minWidth: compact ? 0 : 160,
                  gridColumn: compact ? "1 / -1" : undefined,
                }}>
                  <div style={{ position: "relative", width: compact ? 38 : 44, height: compact ? 38 : 44, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width={compact ? 38 : 44} height={compact ? 38 : 44} viewBox="0 0 36 36" style={{ transform: "rotate(-90deg)" }}>
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth="4"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke={perfColor}
                        strokeWidth="4"
                        strokeDasharray={`${overallPerfClamped}, 100`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: compact ? 8.5 : 9.5, fontWeight: 900, color: "#1e293b" }}>
                        {overallPerfClamped.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: "left", minWidth: 0 }}>
                    <h4 style={{ fontSize: compact ? 10 : 11.5, fontWeight: 800, color: perfColor, margin: 0, lineHeight: 1 }}>
                      {perfStatus}
                    </h4>
                    <span style={{ fontSize: compact ? 8 : 8.5, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".02em", display: "block", marginTop: 2 }}>
                      Performance
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </GlassCard>

      {/* ── Cash Collections (all payments recorded by this employee) ── */}
      <GlassCard className={compact ? "p-3" : "p-5"}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: compact ? 8 : 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ fontSize: compact ? 11 : 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: "#047857", margin: 0 }}>
              Cash Collected
            </h3>
            <p style={{ fontSize: compact ? 10 : 11, color: "#64748b", margin: "3px 0 0", lineHeight: 1.3 }}>
              All payments recorded under {activeEmp.name}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em", margin: 0 }}>Total</p>
            <p style={{ fontSize: compact ? 16 : 20, fontWeight: 900, color: "#047857", margin: "2px 0 0", fontVariantNumeric: "tabular-nums" }}>
              {formatCashINR(activeEmp.achieved?.cash ?? cashA ?? 0)}
            </p>
          </div>
        </div>

        {!activeEmp.cashCollections?.length ? (
          <p style={{ fontSize: 12, color: "#94a3b8", margin: 0, padding: compact ? "8px 0" : "12px 0" }}>
            No cash payments recorded yet. Record payments from any lead drawer under this employee.
          </p>
        ) : (
          <div
            style={{
              maxHeight: compact ? 200 : 240,
              overflowY: "auto",
              overflowX: "auto",
              borderRadius: 8,
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: compact ? 10 : 11.5 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #d1fae5", color: "#047857", textTransform: "uppercase", letterSpacing: ".04em", fontSize: compact ? 8.5 : 9.5, position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
                  <th style={{ textAlign: "left", padding: "8px 6px", fontWeight: 800 }}>Lead</th>
                  <th style={{ textAlign: "left", padding: "8px 6px", fontWeight: 800 }}>Amount</th>
                  <th style={{ textAlign: "left", padding: "8px 6px", fontWeight: 800 }}>Mode</th>
                  <th style={{ textAlign: "left", padding: "8px 6px", fontWeight: 800 }}>Date & Time</th>
                  <th style={{ textAlign: "left", padding: "8px 6px", fontWeight: 800 }}>Txn / Slip</th>
                </tr>
              </thead>
              <tbody>
                {activeEmp.cashCollections.map((row) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid #ecfdf5" }}>
                    <td style={{ padding: "10px 6px", minWidth: 120 }}>
                      <p style={{ margin: 0, fontWeight: 700, color: "#1e293b" }}>{row.leadName || "Lead"}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 10, color: "#94a3b8" }}>{row.companyName || "—"}</p>
                    </td>
                    <td style={{ padding: "10px 6px", fontWeight: 800, color: "#047857", fontVariantNumeric: "tabular-nums" }}>
                      {formatCashINR(row.amount)}
                    </td>
                    <td style={{ padding: "10px 6px", color: "#334155", fontWeight: 600 }}>{row.paymentMode}</td>
                    <td style={{ padding: "10px 6px", color: "#64748b", whiteSpace: "nowrap" }}>{formatCashDateTime(row.paymentAt)}</td>
                    <td style={{ padding: "10px 6px" }}>
                      {row.transactionId ? (
                        <span style={{ fontSize: 10, fontWeight: 600, color: "#475569" }}>{row.transactionId}</span>
                      ) : row.slipUrl ? (
                        <a
                          href={resolveSlipUrl(row.slipUrl)}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 10, fontWeight: 700, color: "#047857", textDecoration: "none" }}
                        >
                          View slip
                        </a>
                      ) : (
                        <span style={{ color: "#cbd5e1" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* ── Funnel & Insights Grid ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: stackInsights ? "1fr" : "minmax(0, 1.25fr) minmax(0, 1fr)",
        gap: stackInsights ? 10 : 12,
        alignItems: "start",
        position: "relative",
        zIndex: 0,
      }}>
        {/* Sales Pipeline Funnel */}
        <div style={{
          ...INSIGHT_CARD,
          borderRadius: compact ? 10 : INSIGHT_CARD.borderRadius,
          padding: compact ? "10px 12px" : INSIGHT_CARD.padding,
          gap: 10,
        }}>
          <div>
            <h3 style={{ ...INSIGHT_CARD_TITLE, fontSize: compact ? 9 : INSIGHT_CARD_TITLE.fontSize }}>
              Sales Pipeline Funnel
            </h3>
            {!compact && (
              <p style={INSIGHT_CARD_SUB}>
                {callyzerConfigured && callyzerStats
                  ? `Callyzer call activity${callyzerPeriodLabel ? ` · ${callyzerPeriodLabel}` : ""} (% of assigned leads per stage)`
                  : "Deal conversion progression (% of assigned leads per stage)"}
              </p>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : (compact ? "minmax(88px, 32%) 1fr" : "minmax(100px, 38%) 1fr"),
              gap: isMobile ? 16 : (compact ? 8 : 12),
              alignItems: isMobile ? "center" : "start",
              minWidth: 0,
              flex: 1,
            }}
          >
            <div style={{ width: "100%", maxWidth: compact ? 108 : 160, justifySelf: "center", margin: isMobile ? "0 auto" : "0" }}>
              <PipelineFunnelGraphic
                funnelData={funnelData}
                compact={compact}
                dense={compact}
                mini={compact}
              />
            </div>

            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: compact ? 3 : 5,
              minWidth: 0,
            }}>
              {funnelData.map((item, idx) => {
                const count = item.value.split(" ")[0];
                const stageName = item.label;
                const colors = ["#be123c", "#e11d48", "#dc2626", "#c2185b", "#881337"];
                const bgs = ["#fff1f2", "#fff5f6", "#fff8f8", "#fffafb", "#ffffff"];
                const borders = ["#fecdd3", "#ffe4e6", "#ffe4e6", "#ffe4e6", "#fecdd3"];
                const convLabel = item.sub;

                return (
                  <div key={idx} style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: compact ? "4px 7px" : "6px 9px",
                    borderRadius: 8,
                    background: bgs[idx],
                    border: `1px solid ${borders[idx]}`,
                    minWidth: 0,
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, minWidth: 0, flex: 1 }}>
                      <div style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: colors[idx],
                        flexShrink: 0,
                        marginTop: 5,
                      }} />
                      <div style={{ minWidth: 0, lineHeight: 1.25 }}>
                        <span style={{ fontSize: compact ? 10 : 12, fontWeight: 800, color: "#1e293b" }}>{count}</span>
                        <span style={{ fontSize: compact ? 9 : 11, color: "#64748b", marginLeft: 4 }}>{stageName}</span>
                      </div>
                    </div>
                    <span style={{
                      fontSize: compact ? 8 : 9,
                      fontWeight: 700,
                      color: colors[idx],
                      background: "#ffffff",
                      padding: "2px 6px",
                      borderRadius: 6,
                      border: `1px solid ${borders[idx]}`,
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}>
                      {convLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right column — stage breakdown + coach + activity */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: stackInsights ? 10 : 12,
          minWidth: 0,
        }}>
          {/* Stage-wise breakdown */}
          <div style={{
            ...INSIGHT_CARD,
            borderRadius: compact ? 10 : INSIGHT_CARD.borderRadius,
            padding: compact ? "10px 12px" : INSIGHT_CARD.padding,
            flex: "0 0 auto",
          }}>
            <h3 style={{ ...INSIGHT_CARD_TITLE, fontSize: compact ? 9 : INSIGHT_CARD_TITLE.fontSize, marginBottom: 8 }}>
              Stage-wise Breakdown
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: compact ? 6 : 8, marginBottom: 10 }}>
              {[
                { label: "In pipeline", val: assigned || pipelineTotal },
                { label: "Converted", val: convertedCount },
                { label: "Conv. rate", val: convRate },
              ].map((s) => (
                <div key={s.label} style={{ textAlign: "center", padding: compact ? "5px 4px" : "7px 4px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <p style={{ fontSize: compact ? 11 : 13, fontWeight: 900, color: "#0f172a", margin: 0, lineHeight: 1.2 }}>{s.val}</p>
                  <p style={{ fontSize: compact ? 7 : 8, color: "#64748b", margin: "3px 0 0", lineHeight: 1.2 }}>{s.label}</p>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: compact ? 4 : 5 }}>
              {(pipelineStages.filter((s) => s.count > 0).length ? pipelineStages.filter((s) => s.count > 0) : pipelineStages.slice(0, 4)).map((s) => (
                <div key={s.fullLabel || s.label} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span
                    style={{ fontSize: compact ? 8 : 9, fontWeight: 600, color: "#64748b", width: compact ? 52 : 72, flexShrink: 0, lineHeight: 1.2 }}
                    title={s.fullLabel || s.label}
                  >
                    {s.label}
                  </span>
                  <div style={{ flex: 1, height: compact ? 5 : 6, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${s.pct || 0}%`, height: "100%", background: s.color, borderRadius: 99, minWidth: s.count > 0 ? 3 : 0 }} />
                  </div>
                  <span style={{ fontSize: compact ? 9 : 10, fontWeight: 800, color: "#1e293b", width: 22, textAlign: "right", flexShrink: 0 }}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: stackInsights ? "1fr" : "repeat(2, minmax(0, 1fr))",
            gap: stackInsights ? 10 : 12,
            alignItems: "start",
          }}>
            <AiCoachInsightsPanel compact={stackInsights} insights={aiCoachInsights} />

            <div style={{
              ...INSIGHT_CARD,
              borderRadius: stackInsights ? 10 : INSIGHT_CARD.borderRadius,
              padding: stackInsights ? "10px 12px" : INSIGHT_CARD.padding,
              overflow: "hidden",
            }}>
              <h3 style={{ ...INSIGHT_CARD_TITLE, fontSize: stackInsights ? 9 : INSIGHT_CARD_TITLE.fontSize, marginBottom: 8 }}>
                Daily Activity
              </h3>
              <div style={{ position: "relative", paddingLeft: 14 }}>
                <div style={{ position: "absolute", left: 3, top: 6, bottom: 6, width: 2, background: "#fce7f3", borderRadius: 99 }} />
                {(activity?.length ? activity : []).slice(0, compact ? 3 : 4).map((act, idx, arr) => (
                  <div key={`${act.lead_name}-${idx}`} style={{ position: "relative", paddingBottom: idx < arr.length - 1 ? 10 : 0 }}>
                    <div style={{
                      position: "absolute",
                      left: -13,
                      top: 4,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#e11d48",
                      border: "2px solid #ffffff",
                      boxShadow: "0 0 0 1px #fecdd3",
                    }} />
                    <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                      <PhoneCall style={{ width: 12, height: 12, color: "#be123c", opacity: 0.85, flexShrink: 0, marginTop: 1 }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: compact ? 10 : 11, fontWeight: 600, color: "#1e293b", margin: 0, lineHeight: 1.35 }}>
                          {act.lead_name} · {act.status}
                        </p>
                        <p style={{ fontSize: compact ? 9 : 10, color: "#64748b", margin: "2px 0 0", lineHeight: 1.35 }}>
                          {act.business || "Lead update"} · {act.time ? fmtDate(act.time) : "Recently"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {!activity?.length && (
                  <p style={{ fontSize: compact ? 10 : 11, color: "#64748b", margin: 0 }}>No recent lead activity yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Active Lead Workspace Table ── */}
      <div style={{
        background: "#fff",
        border: "1px solid #ffe4e6",
        borderRadius: inDrawer ? 12 : 16,
        padding: inDrawer ? "12px 14px" : "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: inDrawer ? 10 : 16,
        position: "relative",
        zIndex: 1,
        marginTop: stackInsights ? 4 : 0,
        clear: "both",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ fontSize: inDrawer ? 11 : 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".1em", color: "#be123c", margin: 0 }}>
            Active Lead Workspace
          </h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              placeholder="Search leads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                background: "#f8fafc",
                border: "1px solid #ffe4e6",
                borderRadius: 8,
                padding: "6px 12px",
                fontSize: 11.5,
                color: "#1e293b",
                outline: "none",
                minWidth: 120,
                flex: "1 1 140px",
              }}
            />
            <button style={{
              background: "#f8fafc",
              border: "1px solid #ffe4e6",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 11.5,
              color: "#64748b",
              cursor: "pointer"
            }}>
              Filter
            </button>
          </div>
        </div>

        <div style={{
          overflowX: "auto",
          overflowY: "auto",
          maxHeight: inDrawer ? 280 : (compact ? 320 : 420),
          border: "1px solid #f1f5f9",
          borderRadius: 10,
          WebkitOverflowScrolling: "touch",
        }}>
          <table style={{ width: "100%", minWidth: inDrawer ? 720 : 640, borderCollapse: "collapse", textAlign: "left", fontSize: 11.5 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", color: "#64748b", background: "#fff" }}>
                {["Lead Name", "Company", "Status", "Priority", "Temperature", "Next Follow-Up", "Potential", "Prob."].map(h => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 8px",
                      textTransform: "uppercase",
                      letterSpacing: ".06em",
                      fontSize: 9.5,
                      position: "sticky",
                      top: 0,
                      background: "#fff",
                      zIndex: 1,
                      boxShadow: "0 1px 0 #f1f5f9",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leadsList.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "24px 8px", textAlign: "center", color: "#64748b" }}>
                    {loading || detailLoading ? "Loading assigned leads..." : "No leads assigned to this employee yet."}
                  </td>
                </tr>
              ) : leadsList.map((lead, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9", color: "#334155" }}>
                  <td style={{ padding: "12px 8px", fontWeight: 600 }}>{lead.name}</td>
                  <td style={{ padding: "12px 8px" }}>{lead.company}</td>
                  <td style={{ padding: "12px 8px" }}>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: lead.status === 'Won' ? "#dcfce7" : lead.status === 'Qualified' ? "#ccfbf1" : "#dbeafe",
                      color: lead.status === 'Won' ? "#15803d" : lead.status === 'Qualified' ? "#0f766e" : "#1d4ed8",
                      border: "1.2px solid transparent",
                      textTransform: "capitalize"
                    }}>
                      {lead.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    <span style={{ color: lead.priority === "Hot" ? "#ef4444" : lead.priority === "Warm" ? "#f59e0b" : "#64748b" }}>
                      {lead.priority}
                    </span>
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    {(() => {
                      const temp = String(lead.priority || lead.temperature || "Medium").toLowerCase();
                      const isHot = temp.includes("critical") || temp.includes("high") || temp.includes("hot") || lead.temp === 4;
                      const isWarm = temp.includes("medium") || temp.includes("warm") || lead.temp === 3;

                      let label = "Cold Lead";
                      let color = "#2563eb";
                      let bg = "#eff6ff";
                      let border = "#bfdbfe";

                      if (isHot) {
                        label = "Hot Lead";
                        color = "#be123c";
                        bg = "#fff1f2";
                        border = "#fecdd3";
                      } else if (isWarm) {
                        label = "Warm Lead";
                        color = "#d97706";
                        bg = "#fef3c7";
                        border = "#fde68a";
                      }

                      return (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: 4,
                          color,
                          background: bg,
                          border: `1.2px solid ${border}`,
                          whiteSpace: "nowrap"
                        }}>
                          {label}
                        </span>
                      );
                    })()}
                  </td>
                  <td style={{ padding: "12px 8px" }}>{lead.next}</td>
                  <td style={{ padding: "12px 8px", fontWeight: 700, color: "#1e293b" }}>{lead.potential}</td>
                  <td style={{ padding: "12px 8px", fontWeight: 700, color: lead.status === 'Won' ? "#166534" : "#e11d48" }}>{lead.prob}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10.5, color: "#64748b", paddingTop: 8 }}>
          <span>Showing {leadsList.length} lead{leadsList.length === 1 ? "" : "s"} · scroll for more</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button disabled style={{ background: "#fff1f2", border: "1px solid #ffe4e6", borderRadius: 6, padding: "4px 8px", cursor: "not-allowed", opacity: 0.5 }}>Previous</button>
            <button disabled style={{ background: "#fff1f2", border: "1px solid #ffe4e6", borderRadius: 6, padding: "4px 8px", cursor: "not-allowed", opacity: 0.5 }}>Next</button>
          </div>
        </div>
      </div>

      <ResetCredentialsModal
        isOpen={resetPassModalOpen}
        onClose={() => setResetPassModalOpen(false)}
        employee={activeEmp}
      />
    </div>
  );
}
function EmpDrawer({ employee, onClose, onSaved, onDeleteRequest, members }) {
  const [mode, setMode] = useState("view");
  const form = useForm(employee || EMPTY);
  const prevId = useRef(null);

  useEffect(() => {
    if (employee && employee.id !== prevId.current) {
      prevId.current = employee.id;
      setMode("view");
      form.reset(employee);
    }
  }, [employee?.id]);

  const save = () =>
    form.submit(async (f) => {
      if (onSaved) await onSaved({ ...employee, ...f });
      form.reset({ ...EMPTY, employeeId: genId() });
      onClose();
    });
  const cancelEdit = () => {
    form.reset(employee);
    setMode("view");
  };
  const open = !!employee;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="eb"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 40,
              background: "rgba(0,0,0,.65)",
              backdropFilter: "blur(5px)",
            }}
          />
          <motion.aside
            key="ep"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            style={{
              position: "fixed",
              right: 0,
              top: 0,
              bottom: 0,
              zIndex: 50,
              display: "flex",
              flexDirection: "column",
              width: "100%",
              maxWidth: 1100,
              background: "#fff", borderLeft: "1px solid #fecdd3", boxShadow: "-10px 0 40px rgba(0,0,0,.08)",
            }}
            className="team-emp-drawer"
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "15px 22px",
                borderBottom: "1px solid #fecdd3", background: "#fff",
                flexShrink: 0,
                gap: 10,
              }}
              className="emp-drawer-header"
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                {mode === "edit" && (
                  <button
                    onClick={cancelEdit}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      background: "#fff1f2", border: "1px solid #fecdd3", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#be123c", flexShrink: 0, transition: "all .15s",
                    }} onMouseEnter={(e) => { e.currentTarget.style.background = "#ffe4e6"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "#fff1f2"; }}
                  >
                    <ChevronLeft style={{ width: 12, height: 12 }} />
                  </button>
                )}
                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      fontWeight: 700,
                      fontSize: 15,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: "#1e293b",
                    }} >{mode === "view" ? employee?.name : "Edit Employee"}
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: "#be123c",
                      marginTop: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {mode === "view" ? employee?.role : `Editing ${employee?.name}`}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  background: "#fff1f2", border: "1px solid #fecdd3", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#be123c", flexShrink: 0, transition: "all .15s",
                }} onMouseEnter={(e) => { e.currentTarget.style.background = "#ffe4e6"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "#fff1f2"; }}
              >
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>

            <div className="no-sb emp-drawer-body" style={{ flex: 1, overflowY: "auto", padding: "16px 22px", background: "#fff" }}>
              <AnimatePresence mode="wait" initial={false}>
                {mode === "view" ? (
                  <motion.div
                    key="vc"
                    initial={{ opacity: 0, x: -14 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -14 }}
                    transition={{ duration: 0.16 }}
                  >
                    <EmpDetail
                      emp={employee}
                      onEdit={() => setMode("edit")}
                      onDelete={onDeleteRequest}
                      inDrawer
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="ec"
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 14 }}
                    transition={{ duration: 0.16 }}
                  >
                    <MemberForm {...form} existingMembers={members} isEdit />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {mode === "edit" && (
              <div
                style={{
                  padding: "13px 22px",
                  borderTop: "1px solid #fecdd3", background: "#fff",
                  display: "flex",
                  gap: 10,
                  flexShrink: 0,
                }}
              >
                <button
                  onClick={cancelEdit}
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: 10,
                    border: "1px solid #e2e8f0", fontSize: 13, fontWeight: 500, color: "#475569", background: "#f8fafc", cursor: "pointer", transition: "all .15s",
                  }} onMouseEnter={(e) => { e.currentTarget.style.background = "#f1f5f9"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "#f8fafc"; }}
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: 10,
                    border: "none",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#1e293b",
                    background: "#e11d48",
                    cursor: "pointer",
                    transition: "all .15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.1)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
                >
                  Save Changes
                </button>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function memberActiveLeads(member = {}) {
  return Number(member.activeLeads ?? member.active_leads ?? member.currentActiveLeads ?? member.current_active_leads) || 0;
}

function computeTeamAvgActiveLeads(members = []) {
  if (!members.length) return 0;
  const total = members.reduce((sum, member) => sum + memberActiveLeads(member), 0);
  return total / members.length;
}

function computeRelativeWorkloadPct(activeLeads, teamAvgActiveLeads) {
  if (!teamAvgActiveLeads) return activeLeads > 0 ? 100 : 0;
  return Math.round((activeLeads / teamAvgActiveLeads) * 100);
}

function MemberCard({ p, onClick, compact = false, teamAvgActiveLeads = 0 }) {
  const dotColor = { active: "#22c55e", remote: "#3b82f6", "on-leave": "#f59e0b", inactive: "#94a3b8" };
  const dc = dotColor[p.status] || "#a855f7";
  const statusBg = { active: "#dcfce7", remote: "#dbeafe", "on-leave": "#fef3c7", inactive: "#f1f5f9" };
  const statusText = { active: "#166534", remote: "#1e40af", "on-leave": "#92400e", inactive: "#475569" };
  const statusBorder = { active: "#bbf7d0", remote: "#bfdbfe", "on-leave": "#fde68a", inactive: "#e2e8f0" };
  const statusLabel = { active: "Active", remote: "Remote", "on-leave": "On leave", inactive: "Inactive" };

  const totalLeads = Number(p.leads) || 0;
  const converted = Number(p.conv) || 0;
  const contacted = Number(p.contacted) || 0;
  const conversionPct = totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0;
  const activeLeads = memberActiveLeads(p);
  const workload = computeRelativeWorkloadPct(activeLeads, teamAvgActiveLeads);
  const workloadBarWidth = Math.min(100, workload);
  const revenue = Number(p.revenue) || 0;
  const fmtRev = fmtINR(revenue);
  const avgDeal = converted > 0 ? fmtINR(revenue / converted) : "₹0";

  const perfTag =
    conversionPct >= 25 ? "Top Performer"
      : conversionPct >= 15 ? "Consistent"
        : conversionPct >= 8 ? "Rising Star"
          : "Developing";

  const [hovered, setHovered] = useState(false);
  const colStyle = { display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 };

  const avatarNode = (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {p.avatarImage ? (
        <img
          src={p.avatarImage}
          alt={p.name}
          style={{
            width: compact ? 30 : 36,
            height: compact ? 30 : 36,
            borderRadius: compact ? 8 : 10,
            objectFit: "cover",
            border: "2px solid #fecdd3",
          }}
        />
      ) : (
        <div style={{
          width: compact ? 30 : 36,
          height: compact ? 30 : 36,
          borderRadius: compact ? 8 : 10,
          background: "var(--gradient-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: compact ? 11 : 13,
          fontWeight: 800,
          color: "#fff",
        }}>
          {p.avatar}
        </div>
      )}
      <span style={{ position: "absolute", bottom: -1, right: -1, width: 8, height: 8, borderRadius: "50%", background: dc, border: "1.5px solid #fff" }} />
    </div>
  );

  const cardShell = {
    background: hovered ? "linear-gradient(135deg, #fff 0%, #fff5f6 100%)" : "#fff",
    border: "1.5px solid " + (hovered ? "var(--primary)" : "#fce7f3"),
    borderRadius: compact ? 10 : 12,
    cursor: "pointer",
    boxShadow: hovered ? "0 4px 14px rgba(225,29,72,0.08)" : "0 1px 3px rgba(225,29,72,0.04)",
    transition: "all 0.2s ease",
  };

  if (compact) {
    return (
      <motion.div
        whileTap={{ scale: 0.995 }}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ ...cardShell, padding: "8px 10px", minWidth: 0, overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {avatarNode}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 700, fontSize: 12, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0, lineHeight: 1.2 }}>
              {p.name}
            </p>
            <p style={{ fontSize: 9, color: "#64748b", margin: "1px 0 0", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.role}
            </p>
          </div>
          <span style={{
            fontSize: 8,
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: 999,
            background: statusBg[p.status] || "#f1f5f9",
            color: statusText[p.status] || "#475569",
            border: "1px solid " + (statusBorder[p.status] || "#e2e8f0"),
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}>
            {statusLabel[p.status] || p.status}
          </span>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 6,
          marginTop: 8,
          paddingTop: 8,
          borderTop: "1px solid #fff1f2",
        }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: "#1e293b", margin: 0, lineHeight: 1 }}>{totalLeads}</p>
            <p style={{ fontSize: 8, color: "#64748b", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {contacted} contacted
            </p>
          </div>
          <div style={{ minWidth: 0, textAlign: "center" }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: "var(--primary)", margin: 0, lineHeight: 1 }}>{conversionPct}%</p>
            <p style={{ fontSize: 8, color: "var(--primary)", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {perfTag}
            </p>
          </div>
          <div style={{ minWidth: 0, textAlign: "right" }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: "#1e293b", margin: 0, lineHeight: 1 }}>{fmtRev}</p>
            <p style={{ fontSize: 8, color: "#64748b", margin: "2px 0 0", whiteSpace: "nowrap" }}>
              Avg {avgDeal}
            </p>
          </div>
        </div>

        <div style={{ marginTop: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#64748b", fontWeight: 600, marginBottom: 3 }}>
            <span>{activeLeads} active · {workload}% of avg</span>
            <span style={{ color: workload >= 100 ? "var(--primary)" : "#64748b" }}>{workload}%</span>
          </div>
          <div style={{ height: 3, borderRadius: 20, background: "#f1f5f9", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              borderRadius: 20,
              width: workloadBarWidth + "%",
              background: workload >= 100 ? "var(--primary)" : workload >= 70 ? "#fb7185" : "#fda4af",
            }} />
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.995 }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(160px,1.8fr) minmax(68px,0.7fr) minmax(58px,0.65fr) minmax(72px,0.75fr) minmax(68px,0.7fr) minmax(84px,0.85fr)",
        alignItems: "center",
        gap: "8px 10px",
        padding: "8px 14px",
        minWidth: 0,
        ...cardShell,
      }}
    >
      {/* Member */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {avatarNode}
        <div style={{ minWidth: 0 }}>
          <p style={{ fontWeight: 800, fontSize: 12, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{p.name}</p>
          <p style={{ fontSize: 9, color: "#64748b", margin: "1px 0 0", fontWeight: 500 }}>{p.role}</p>
        </div>
      </div>

      {/* Status */}
      <div style={colStyle}>
        <span style={{ fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 20, background: statusBg[p.status] || "#f1f5f9", color: statusText[p.status] || "#475569", border: "1px solid " + (statusBorder[p.status] || "#e2e8f0"), alignSelf: "flex-start", whiteSpace: "nowrap" }}>
          {statusLabel[p.status] || p.status}
        </span>
      </div>

      {/* Leads */}
      <div style={colStyle}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#1e293b", lineHeight: 1 }}>{totalLeads}</span>
        <span style={{ fontSize: 8, color: "#64748b", marginTop: 2, whiteSpace: "nowrap" }}>{contacted} contacted</span>
      </div>

      {/* Conversion */}
      <div style={colStyle}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--primary)", lineHeight: 1 }}>{conversionPct}%</span>
        <span style={{ fontSize: 7, fontWeight: 700, color: "var(--primary)", background: "#fff1f2", padding: "1px 5px", borderRadius: 5, border: "1px solid #fecdd3", marginTop: 2, alignSelf: "flex-start", textTransform: "uppercase", letterSpacing: ".03em", whiteSpace: "nowrap" }}>
          {perfTag}
        </span>
      </div>

      {/* Revenue */}
      <div style={colStyle}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#1e293b", lineHeight: 1 }}>{fmtRev}</span>
        <span style={{ fontSize: 8, color: "#64748b", marginTop: 2, whiteSpace: "nowrap" }}>Avg {avgDeal}</span>
      </div>

      {/* Workload */}
      <div style={colStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <span style={{ fontSize: 9, color: "#64748b", fontWeight: 600 }}>{activeLeads} active</span>
          <span style={{ fontSize: 9, color: workload >= 100 ? "var(--primary)" : "#64748b", fontWeight: 700 }}>{workload}% of avg</span>
        </div>
        <div style={{ height: 4, borderRadius: 20, background: "#f1f5f9", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 20, width: workloadBarWidth + "%",
            background: workload >= 100 ? "var(--primary)" : workload >= 70 ? "#fb7185" : "#fda4af",
            transition: "width 0.6s ease",
          }} />
        </div>
      </div>
    </motion.div>
  );
}


// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, index, change, sub }) {
  const tones = ["info", "primary", "success", "purple", "warning", "primary"];
  const tone = tones[index % tones.length];

  return (
    <StatCard
      label={label}
      value={value}
      change={change ?? "—"}
      sub={sub ?? "vs last period"}
      icon={Icon}
      tone={tone}
      hover
    />
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function Team() {
  const isMobile = useIsMobile();
  const location = useLocation();
  const [compactMembers, setCompactMembers] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 1024,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setCompactMembers(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const { apiLabel, preset, fromDate, toDate } = useDateRange();
  const [q, setQ] = useState("");
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState(null);
  const [activeEmp, setActiveEmp] = useState(null);
  const [deleteEmp, setDeleteEmp] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newCredentials, setNewCredentials] = useState(null);
  const [newMemberName, setNewMemberName] = useState("");
  const [kpiData, setKpiData] = useState(null);

  useEffect(() => {
    if (new URLSearchParams(location.search).get("action") === "addMember") {
      setAddOpen(true);
    }
  }, [location.search]);

  // ── fetch KPIs (extracted so we can call it anywhere) ──────────────────
  const fetchKPIs = useCallback(async (selectedRange = "month", custom = {}) => {
    try {
      let path = `/api/team/kpis?range=${encodeURIComponent(selectedRange)}`;
      if ((selectedRange === "custom" || selectedRange === "Custom") && custom.s && custom.e) {
        path += `&startDate=${custom.s}&endDate=${custom.e}`;
      }
      const data = await apiGet(path, { skipCache: true, cacheTtl: 0 });
      if (data && (data.kpis || data.success)) {
        setKpiData(data.kpis || data);
      }
    } catch (error) {
      console.error("Failed to fetch KPIs:", error);
    }
  }, []);

  const fetchEmployees = useCallback(async () => {
    setMembersLoading(true);
    setMembersError(null);
    try {
      invalidateCache("/api/team/employees");
      const data = await apiGet("/api/team/employees", { skipCache: true, cacheTtl: 0 });
      if (data?.success && Array.isArray(data.employees)) {
        setMembers(data.employees.map(normalizeEmployee));
      } else {
        setMembers([]);
        setMembersError(data?.message || "Could not load team members");
      }
    } catch (error) {
      console.error("Failed to fetch employees:", error);
      setMembers([]);
      setMembersError(error.message || "Failed to load team members");
    } finally {
      setMembersLoading(false);
    }
  }, []);

  // ── fetch employees on mount ────────────────────────────────────────────
  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // ── fetch KPIs when nav date range changes ─────────────────────────────
  useEffect(() => {
    if (preset === "custom") {
      if (fromDate && toDate) {
        const custom = { s: fromDate, e: toDate };
        fetchKPIs("custom", custom);
      }
      return;
    }
    fetchKPIs(preset || apiLabel || "month");
  }, [preset, apiLabel, fromDate, toDate, fetchKPIs]);


  const teamPerformance = useMemo(() => {
    const periodKey = String(preset || "month").toLowerCase();

    // Period specific metrics tailored to selected date range
    const periodDefaults = {
      today: {
        responseTimeMin: 0.7,
        pickupRate: 60,
        qualificationRate: 68,
        objectionHandling: 78,
        conversionRate: 42,
        followUpQuality: 99,
        comparisonLabel: "vs yesterday",
        trends: { responseTimeMin: "-12s", pickupRate: "+5%", qualificationRate: "+3%", objectionHandling: "+4%", conversionRate: "+2%", followUpQuality: "+1%" },
      },
      week: {
        responseTimeMin: 2.4,
        pickupRate: 52,
        qualificationRate: 72,
        objectionHandling: 78,
        conversionRate: 46,
        followUpQuality: 99,
        comparisonLabel: "vs last week",
        trends: { responseTimeMin: "+6s", pickupRate: "-4%", qualificationRate: "-1%", objectionHandling: "+77%", conversionRate: "—", followUpQuality: "—" },
      },
      month: {
        responseTimeMin: 2.3,
        pickupRate: 53,
        qualificationRate: 74,
        objectionHandling: 78,
        conversionRate: 48,
        followUpQuality: 99,
        comparisonLabel: "vs last month",
        trends: { responseTimeMin: "+12s", pickupRate: "+4%", qualificationRate: "-14%", objectionHandling: "+65%", conversionRate: "-14%", followUpQuality: "+6%" },
      },
      custom: {
        responseTimeMin: 1.8,
        pickupRate: 65,
        qualificationRate: 70,
        objectionHandling: 80,
        conversionRate: 45,
        followUpQuality: 95,
        comparisonLabel: "vs prior period",
        trends: {},
      },
    };

    const fallback = periodDefaults[periodKey] || periodDefaults.month;

    if (kpiData != null) {
      return {
        responseTimeMin: kpiData.responseTimeMin ?? fallback.responseTimeMin,
        pickupRate: kpiData.pickupRate ?? fallback.pickupRate,
        qualificationRate: kpiData.qualificationRate ?? fallback.qualificationRate,
        objectionHandling: kpiData.objectionHandling ?? fallback.objectionHandling,
        conversionRate: kpiData.conversionRate ?? fallback.conversionRate,
        followUpQuality: kpiData.followUpQuality ?? fallback.followUpQuality,
        trends: kpiData.trends || fallback.trends,
        comparisonLabel: kpiData.comparisonLabel || fallback.comparisonLabel,
      };
    }

    return fallback;
  }, [members, kpiData, preset]);



  const kpis = [
    {
      label: "Response Time",
      value: `${teamPerformance.responseTimeMin} min`,
      icon: Clock,
      change: teamPerformance.trends?.responseTimeMin,
      sub: teamPerformance.comparisonLabel,
    },
    {
      label: "Pickup Rate",
      value: `${teamPerformance.pickupRate}%`,
      icon: PhoneCall,
      change: teamPerformance.trends?.pickupRate,
      sub: teamPerformance.comparisonLabel,
    },
    {
      label: "Qualification Rate",
      value: `${teamPerformance.qualificationRate}%`,
      icon: Target,
      change: teamPerformance.trends?.qualificationRate,
      sub: teamPerformance.comparisonLabel,
    },
    {
      label: "Objection Handling",
      value: `${teamPerformance.objectionHandling}%`,
      icon: MessageSquare,
      change: teamPerformance.trends?.objectionHandling,
      sub: teamPerformance.comparisonLabel,
    },
    {
      label: "Conversion Rate",
      value: `${teamPerformance.conversionRate}%`,
      icon: TrendingUp,
      change: teamPerformance.trends?.conversionRate,
      sub: teamPerformance.comparisonLabel,
    },
    {
      label: "Follow-up Quality",
      value: `${teamPerformance.followUpQuality}%`,
      icon: Repeat,
      change: teamPerformance.trends?.followUpQuality,
      sub: teamPerformance.comparisonLabel,
    },
  ];



  const filtered = useMemo(
    () => members.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())),
    [q, members],
  );

  const teamAvgActiveLeads = useMemo(
    () => computeTeamAvgActiveLeads(members),
    [members],
  );

  const addMember = async (formFields) => {
    const payload = {
      name: formFields.name,
      email: formFields.email,
      // send full number with country code stored separately
      phone: `${formFields.countryCode}${formFields.phone}`,
      city: formFields.city,
      department: formFields.department,
      role: formFields.role,
      status: "active",
      work_location: formFields.workLocation || "Office",
      access_level: formFields.accessLevel || "Member",
      notes: formFields.notes || null,
      joining_date: formFields.joiningDate || todayISO(),
      callyser_id: formFields.callyserId || null,
      emp_id: formFields.employeeId || null,
      salary: formFields.salary ? Number(formFields.salary) : null,
      incentive_kra: formFields.incentiveKRA || false,
      call_target: formFields.callTarget || 0,
      call_weightage: formFields.callWeightage || 0,
      qualified_lead_target: formFields.qualifiedLeadTarget || 0,
      qualified_lead_weightage: formFields.qualifiedLeadWeightage || 0,
      meeting_target: formFields.meetingTarget || 0,
      meeting_weightage: formFields.meetingWeightage || 0,
      cash_target: formFields.cashTarget || 0,
      cash_weightage: formFields.cashWeightage || 0,
    };

    const data = await apiPost("/api/team/employees/create", payload);

    if (!data.success) {
      // throw so AddDrawer's catch block can show the right toast
      const msg = data.error || data.message || "";
      if (msg.includes("email")) throw new Error("email");
      if (msg.includes("phone")) throw new Error("phone");
      throw new Error(msg);
    }

    const normalized = normalizeEmployee(data.employee);
    setMembers((prev) => [normalized, ...prev]);
    fetchKPIs();
    fetchEmployees();

    if (data.credentials) {
      setNewMemberName(formFields.name);
      setNewCredentials(data.credentials);
    }
  };

  // ── save edit ───────────────────────────────────────────────────────────
  const saveEdit = async (u) => {
    const payload = {
      name: u.name,
      email: u.email,
      phone: u.phone,
      city: u.city,
      department: u.department,
      role: u.role,
      status: u.status || "active",
      work_location: u.workLocation || u.work_location || "Office",
      access_level: u.accessLevel || u.access_level || "Member",
      notes: u.notes || null,
      joining_date: u.joiningDate || u.joining_date || null,
      callyser_id: u.callyserId || u.callyser_id || null,
      emp_id: u.employeeId || u.emp_id || null,
      salary: u.salary ? Number(u.salary) : null,
      incentive_kra: u.incentiveKRA || u.incentive_kra || false,
      call_target: u.callTarget || u.call_target || 0,
      call_weightage: u.callWeightage || u.call_weightage || 0,
      qualified_lead_target: u.qualifiedLeadTarget || u.qualified_lead_target || 0,
      qualified_lead_weightage: u.qualifiedLeadWeightage || u.qualified_lead_weightage || 0,
      meeting_target: u.meetingTarget || u.meeting_target || 0,
      meeting_weightage: u.meetingWeightage || u.meeting_weightage || 0,
      cash_target: u.cashTarget || u.cash_target || 0,
      cash_weightage: u.cashWeightage || u.cash_weightage || 0,
    };

    try {
      const data = await apiPost("/api/team/employees/update", { id: u.id, ...payload });
      const emp = data?.employee ? data.employee : u;
      const normalized = normalizeEmployee({ ...u, ...emp });
      setMembers((p) => p.map((m) => (m.id === normalized.id ? normalized : m)));
      setActiveEmp(normalized);
    } catch (error) {
      console.error("Update employee error:", error);
      setMembers((p) => p.map((m) => (m.id === u.id ? { ...m, ...u } : m)));
      setActiveEmp((prev) => (prev?.id === u.id ? { ...prev, ...u } : prev));
    }
  };

  // ── delete ──────────────────────────────────────────────────────────────
  const confirmDel = async () => {
    setDeleting(true);
    try {
      const data = await apiDelete(`/api/team/employees/${deleteEmp.id}`);
      if (data.success) {
        setMembers((p) => p.filter((m) => m.id !== deleteEmp.id));
        setActiveEmp(null);
        fetchKPIs(); // ← re-fetch so KPI card updates immediately
      } else {
        console.error("Delete failed:", data.message);
      }
    } catch (error) {
      console.error("Delete error:", error);
    } finally {
      setDeleting(false);
      setDeleteEmp(null);
    }
  };

  return (
    <div className="page-shell min-w-0" style={{ display: "flex", flexDirection: "column", gap: 22 }}>

      {/* ── KPI grid — Dashboard-style cards ── */}
      <div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          {kpis.map((k, i) => (
            <div key={k.label} className="h-full">
              <KpiCard {...k} index={i} isActive={i === 0} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Search / filter bar ── */}
      <GlassCard className="p-2.5 sm:p-4">
        <div className="flex items-center gap-2 flex-nowrap min-w-0">
          <div className="relative flex-1 min-w-0">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search team members…"
              className="w-full h-9 sm:h-10 pl-8 pr-2.5 rounded-lg sm:rounded-[10px] bg-slate-50 border border-slate-200 text-slate-800 text-xs sm:text-[13px] outline-none transition focus:border-primary focus:bg-white box-border"
            />
          </div>

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="shrink-0 inline-flex items-center justify-center gap-1 h-9 sm:h-10 px-2.5 sm:px-4 rounded-lg sm:rounded-[10px] bg-primary text-white text-[11px] sm:text-xs font-semibold border-none cursor-pointer transition hover:opacity-90 active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden min-[380px]:inline">Add Member</span>
            <span className="min-[380px]:hidden">Add</span>
          </button>
        </div>
      </GlassCard>

      {/* ── Member cards list ── */}
      <div
        style={{
          background: "#fff",
          border: "1.5px solid #fce7f3",
          borderRadius: compactMembers ? 12 : 16,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(225,29,72,0.06)",
        }}
      >
        {/* Column headers — desktop/tablet only */}
        {!compactMembers && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "minmax(160px,1.8fr) minmax(68px,0.7fr) minmax(58px,0.65fr) minmax(72px,0.75fr) minmax(68px,0.7fr) minmax(84px,0.85fr)",
            gap: "8px 10px",
            padding: "8px 14px",
            background: "linear-gradient(135deg, #fff5f6 0%, #fecdd3 100%)",
            borderBottom: "1.5px solid #fecdd3",
          }}>
            {["Member", "Status", "Leads", "Conversion", "Revenue", "Workload"].map((h) => (
              <span key={h} style={{ fontSize: 9, fontWeight: 800, color: "#9f1239", textTransform: "uppercase", letterSpacing: ".08em" }}>{h}</span>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: compactMembers ? 4 : 6, padding: compactMembers ? 6 : 8 }}>
          {membersLoading && (
            <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "oklch(0.46 0.02 280)" }}>
              Loading team members…
            </div>
          )}
          {!membersLoading && membersError && (
            <div style={{ padding: "40px 16px", textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "#be123c", marginBottom: 8 }}>{membersError}</p>
              <button
                type="button"
                onClick={fetchEmployees}
                className="text-xs font-semibold text-rose-700 hover:text-rose-900 underline"
              >
                Retry
              </button>
            </div>
          )}
          {!membersLoading && !membersError && filtered.length === 0 && (
            <div
              style={{
                padding: "40px 0",
                textAlign: "center",
                fontSize: 13,
                color: "oklch(0.46 0.02 280)",
              }}
            >
              {q.trim() ? "No team members match your search." : "No team members yet. Use Add Member to create one."}
            </div>
          )}
          {!membersLoading && !membersError && filtered.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.2 }}
            >
              <MemberCard
                p={p}
                compact={compactMembers}
                teamAvgActiveLeads={teamAvgActiveLeads}
                onClick={() => setActiveEmp(p)}
              />
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Leads Section ── */}

      {/* ── Drawers & Modals ── */}
      <EmpDrawer
        employee={activeEmp}
        onClose={() => setActiveEmp(null)}
        onSaved={saveEdit}
        onDeleteRequest={() => setDeleteEmp(activeEmp)}
        members={members}
      />
      <AddDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={addMember}
        members={members}
      />
      <DeleteModal
        open={!!deleteEmp}
        emp={deleteEmp}
        onConfirm={confirmDel}
        onCancel={() => setDeleteEmp(null)}
        busy={deleting}
      />
      <CredentialsModal
        open={!!newCredentials}
        credentials={newCredentials}
        memberName={newMemberName}
        onClose={() => {
          setNewCredentials(null);
          setNewMemberName("");
        }}
      />
    </div>
  );
}
