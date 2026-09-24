import { useState, useEffect  } from "react";
import { Download, Sparkles, TrendingUp, DollarSign, Users, Activity, FileText } from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { GlassCard, SectionHeader, StatCard, Badge } from "../components/Primitives.jsx";
import { motion } from "framer-motion";
import { useDateRange } from "../context/DateRangeContext.jsx";
import { buildPeriodQueryParams } from "../lib/periodQuery.js";
import { apiGet, readCachedJson } from "../lib/api.js";
import { formatINR } from "../lib/indianFormat.js";

/* ─── global style injections ─────────────────────────────────── */
const globalStyles = `
  /* rose scrollbar */
  * {
    scrollbar-width: thin;
    scrollbar-color: #f43f5e transparent;
  }
  *::-webkit-scrollbar { width: 6px; height: 6px; }
  *::-webkit-scrollbar-track { background: transparent; }
  *::-webkit-scrollbar-thumb {
    background-color: #f43f5e;
    border-radius: 999px;
  }
  *::-webkit-scrollbar-thumb:hover { background-color: #e11d48; }

  /* KPI card hover — bottom bar + border + shadow */
  .kpi-card {
    position: relative;
    border-radius: 1rem;
    overflow: hidden;
    cursor: pointer;
    background: white;
    border: 1.5px solid #fecdd3;
    box-shadow: 0 1px 6px rgba(0,0,0,0.04);
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .kpi-card:hover {
    border-color: #f43f5e;
    box-shadow: 0 8px 28px rgba(244,63,94,0.18);
  }
  .kpi-card .bottom-bar {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 3px;
    border-radius: 0 0 1rem 1rem;
    background: linear-gradient(90deg, #f43f5e, #fb7185);
    opacity: 0;
    transition: opacity 0.2s;
  }
  .kpi-card:hover .bottom-bar { opacity: 1; }

  /* GlassCard section hover */
  .section-card {
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .section-card:hover {
    border-color: #f43f5e !important;
    box-shadow: 0 0 0 1px #f43f5e22, 0 8px 32px rgba(244,63,94,0.13) !important;
  }

  /* Goal item hover — rose tint instead of gray */
  .goal-item {
    border-radius: 0.75rem;
    padding: 0.75rem;
    cursor: pointer;
    transition: background 0.15s;
  }
  .goal-item:hover {
    background: rgba(244, 63, 94, 0.07);
  }
`;

const EMPTY_KPI_CARDS = [
  { label: "Total Revenue", value: "—", Icon: DollarSign },
  { label: "Conversion Rate", value: "—", Icon: Activity },
  { label: "MoM Growth", value: "—", Icon: TrendingUp },
  { label: "Forecast Q3", value: "—", Icon: FileText },
];
function TeamTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const d = payload[0]?.payload;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #fecdd3",
        borderRadius: 12,
        padding: "12px 16px",
        minWidth: 190,
        boxShadow: "0 8px 28px rgba(244,63,94,0.15)",
      }}
    >
      {/* Name header */}
      <p
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: "#7f1d1d",
          marginBottom: 10,
          paddingBottom: 8,
          borderBottom: "1px solid #fecdd3",
        }}
      >
        {d?.fullName || label}
      </p>

      {/* Rows */}
      {[
        {
          label: "Productivity",
          value: `${d?.productivity ?? "—"}%`,
          color: "oklch(0.58 0.22 18)",
          dot:   "oklch(0.58 0.22 18)",
        },
        {
          label: "Revenue",
          value: d?.revenue != null ? formatINR(d.revenue) : "—",
          color: "oklch(0.7 0.14 230)",
          dot:   "oklch(0.7 0.14 230)",
        },
        {
          label: "Converted Leads",
          value: d?.convertedLeads ?? "—",
          color: "#16a34a",
          dot:   "#16a34a",
        },
        {
          label: "Calls Done",
          value: d?.callsDone ?? "—",
          color: "#2563eb",
          dot:   "#2563eb",
        },
      ].map(({ label, value, color, dot }) => (
        <div
          key={label}
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            gap:            12,
            marginBottom:   6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width:        8,
                height:       8,
                borderRadius: "50%",
                background:   dot,
                flexShrink:   0,
              }}
            />
            <span style={{ fontSize: 11, color: "#9f1239" }}>{label}</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, color }}>{value}</span>
        </div>
      ))}
    </div>
  );
}
export default function Reports() {
  const { preset, bounds } = useDateRange();
  const [exportFormat, setExportFormat] = useState("PDF");
  const [chartRevenue, setChartRevenue] = useState([]);
  const [leadSources, setLeadSources] = useState([]);
  const [reportKpis, setReportKpis] = useState(EMPTY_KPI_CARDS);
  const [aiSummaryLines, setAiSummaryLines] = useState([]);
  const [conversionByStage, setConversionByStage] = useState([]);
  const [teamMembers,  setTeamMembers]  = useState(() => {
    const cached = readCachedJson("/api/team/employees");
    return cached?.success ? cached.employees : [];
  });

  // ── fetch team members ──────────────────────────────────────
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const data = await apiGet("/api/team/employees");
        if (data.success) {
          setTeamMembers(data.employees.map((e) => ({
            ...e,
            productivity: e.productivity ?? 0,
            convertedLeads: e.convertedLeads ?? 0,
            callsDone: e.callsDone ?? 0,
          })));
        }
      } catch (err) {
        console.error("Failed to fetch employees:", err);
      }
    };
    fetchEmployees();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const periodQuery = buildPeriodQueryParams({ preset, bounds }).toString();

    (async () => {
      try {
        const [dash, analytics] = await Promise.all([
          apiGet(`/api/reports/dashboard?${periodQuery}`, { skipCache: true, cacheTtl: 0 }),
          apiGet(`/api/reports/analytics?${periodQuery}`, { skipCache: true, cacheTtl: 0 }),
        ]);
        if (cancelled) return;
        if (dash.kpis) {
          setReportKpis([
            { label: "Total Revenue", value: dash.kpis.totalRevenue?.value || "—", Icon: DollarSign },
            { label: "Conversion Rate", value: dash.kpis.conversionRate?.value || "—", Icon: Activity },
            { label: "MoM Growth", value: dash.kpis.momGrowth?.value || "—", Icon: TrendingUp },
            { label: "Forecast Q3", value: dash.kpis.forecastQ3?.value || "—", Icon: FileText },
          ]);
        }
        if (dash.aiSummary?.length) setAiSummaryLines(dash.aiSummary);
        if (analytics.conversionByStage?.length) {
          setConversionByStage(analytics.conversionByStage.map((r) => ({
            name: r.stage || r.name || "—",
            value: Number(r.count ?? r.value) || 0,
          })));
        }
        if (analytics.leadSources?.length) {
          setLeadSources(analytics.leadSources.map((s) => ({
            name: s.source,
            value: Number(s.leads) || 0,
          })));
        }
        if (analytics.revenueAnalytics?.length) {
          setChartRevenue(analytics.revenueAnalytics.map((r) => ({
            month: r.month,
            revenue: Math.round(Number(r.revenue) / 10000),
            forecast: Math.round(Number(r.revenue) / 12000),
          })));
        }
      } catch {
        if (!cancelled) {
          // keep prior values on error
        }
      }
    })();

    return () => { cancelled = true; };
  }, [preset, bounds?.start, bounds?.end]);

  const leadSourceTotal = leadSources.reduce((sum, s) => sum + (Number(s.value) || 0), 0);

  const downloadReport = (format) => {
    setExportFormat(format);
    if (format === "CSV") {
      const header = ["Month", "Revenue", "Forecast"];
      const rows = chartRevenue.map((row) => [row.month, row.revenue, row.forecast]);
      const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "revenue-report.csv";
      link.click();
      URL.revokeObjectURL(url);
    } else if (format === "PDF") {
      alert("PDF export placeholder: Generate a styled PDF using a reporting library or server-side PDF service.");
    } else {
      alert(`Exporting to ${format} is not yet enabled in this preview.`);
    }
  };

  return (
    <div className="space-y-6 page-shell min-w-0">
      <style>{globalStyles}</style>

      {/* ── export bar ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-sm" style={{ color: "oklch(0.52 0.02 280)" }}>
          Export the current report in PDF, CSV, or XLSX format.
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {["PDF", "CSV", "XLSX"].map((fmt) => (
            <button
              key={fmt}
              onClick={() => downloadReport(fmt)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition flex items-center gap-2 ${
                exportFormat === fmt
                  ? "gradient-primary text-primary-foreground"
                  : "border border-border hover:text-foreground"
              }`}
              style={exportFormat !== fmt ? { color: "oklch(0.52 0.02 280)" } : {}}
            >
              <Download className="w-3.5 h-3.5" />
              {fmt}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {reportKpis.map(({ label, value, Icon }, i) => (
          <motion.div
            key={i}
            whileHover={{ y: -3 }}
            transition={{ duration: 0.2 }}
            className="kpi-card"
          >
            {/* subtle rose tint bg */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: "linear-gradient(135deg, #fff5f6 0%, #ffffff 60%)" }}
            />

            {/* bottom bar — visible only on hover via CSS */}
            <div className="bottom-bar" />

            <div className="relative p-5">
              {/* label + icon row */}
              <div className="flex items-start justify-between mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#f43f5e" }}>
                  {label}
                </p>
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ border: "1.5px solid #fda4af", background: "#fff1f2", color: "#f43f5e" }}
                >
                  <Icon className="w-4 h-4" />
                </div>
              </div>

              {/* value */}
              <div className="text-3xl font-bold tracking-tight" style={{ color: "#1a1a1a" }}>
                {value}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── AI summary ──────────────────────────────────────────── */}
      <GlassCard className="section-card p-6 relative overflow-hidden border border-rose-500">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary/20 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <div className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">
              AI Summary
            </div>
          </div>
          {/* title — explicit white so it's always visible */}
          <div className="font-display text-sm font-semibold mb-2 text-gray-700">
            {aiSummaryLines[0] || "No AI summary available yet"}
          </div>
          <p className="text-sm max-w-3xl text-gray-500">
            {aiSummaryLines.slice(1).join(" ") || "Connect your CRM data to generate insights from real pipeline activity."}
          </p>
        </div>
      </GlassCard>

      {/* ── revenue + lead sources ──────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <GlassCard className="section-card p-6 xl:col-span-2">
          <SectionHeader title="Revenue analytics" subtitle="Monthly performance vs forecast" />
          <div className="mt-4 px-2 xl:px-4">
  <style>{`
    .rev-analytics-scroll::-webkit-scrollbar { height: 4px; }
    .rev-analytics-scroll::-webkit-scrollbar-track { background: #fff1f2; border-radius: 9999px; }
    .rev-analytics-scroll::-webkit-scrollbar-thumb { background: #f43f5e; border-radius: 9999px; }
    .rev-analytics-scroll::-webkit-scrollbar-thumb:hover { background: #be123c; }
  `}</style>
  <div className="rev-analytics-scroll" style={{ overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
    <div style={{ minWidth:600, height:336 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartRevenue} margin={{ top: 10, right: 25, left: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="r1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.58 0.22 18)" stopOpacity={0.65} />
                    <stop offset="100%" stopColor="oklch(0.58 0.22 18)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="oklch(0.28 0.014 25 / 0.35)" vertical={false} />
                <XAxis dataKey="month" stroke="oklch(0.55 0.02 280)" fontSize={11} tickLine={false} axisLine={false} padding={{ left: 12, right: 12 }} />
                <YAxis stroke="oklch(0.55 0.02 280)" fontSize={11} tickLine={false} axisLine={false} width={35} />
                <Tooltip contentStyle={{ background: "oklch(0.18 0.014 25)", border: "1px solid oklch(0.28 0.014 25)", borderRadius: 14, color: "#fff" }} />
                <Area type="monotone" dataKey="revenue" stroke="oklch(0.65 0.26 20)" strokeWidth={3} fill="url(#r1)" />
                <Area type="monotone" dataKey="forecast" stroke="oklch(0.72 0.16 240)" strokeWidth={2} strokeDasharray="5 5" fill="transparent" />
                </AreaChart>
            </ResponsiveContainer>
    </div>
  </div>
</div>
          <div className="mt-5 pt-4 border-t border-border/60 flex flex-wrap items-center gap-5 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span style={{ color: "oklch(0.52 0.02 280)" }}>Revenue growth accelerated after Q2</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: "oklch(0.72 0.16 240)" }} />
              <span style={{ color: "oklch(0.52 0.02 280)" }}>Forecast trend remains stable</span>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="section-card p-6 flex flex-col justify-between">
          <SectionHeader title="Lead Sources" subtitle="Where your leads are coming from" />
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-[320px] h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={leadSources}
                    dataKey="value"
                    cx="50%" cy="45%"
                    innerRadius={52} outerRadius={78} paddingAngle={3}
                  >
                    {["oklch(0.68 0.22 18)","oklch(0.72 0.18 240)","oklch(0.72 0.18 140)","oklch(0.74 0.18 70)","oklch(0.7 0.18 320)"].map((color, i) => (
                      <Cell key={i} fill={color} />
                    ))}
                  </Pie>

                  {/* center label — explicit SVG attributes, no Tailwind classes */}
                  <text x="50%" y="40%" textAnchor="middle" dominantBaseline="middle"  fill="#FF4D8D" fontSize={22} fontWeight="700">
                    {leadSourceTotal || "—"}
                  </text>
                  <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" fill="#FF4D8D" fontSize={11}>
                    Leads
                  </text>

                  <Tooltip contentStyle={{ background: "oklch(0.18 0.014 25)", border: "1px solid oklch(0.28 0.014 25)", borderRadius: 12, color: "#fff" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-y-3 gap-x-4">
            {leadSources.length ? leadSources.map((item, i) => (
              <div key={item.name} className="flex items-center gap-2 text-sm" style={{ color: "oklch(0.52 0.02 280)" }}>
                <div className="w-3 h-3 rounded-full" style={{ background: ["oklch(0.68 0.22 18)","oklch(0.72 0.18 240)","oklch(0.72 0.18 140)","oklch(0.74 0.18 70)","oklch(0.7 0.18 320)"][i % 5] }} />
                <span>{item.name}</span>
              </div>
            )) : (
              <p className="text-xs text-slate-400 col-span-2">No lead source data yet.</p>
            )}
          </div>
          <div className="mt-5 pt-4 border-t border-border/60">
            <p className="text-xs leading-relaxed" style={{ color: "oklch(0.52 0.02 280)" }}>
              {leadSources.length
                ? `${leadSources[0]?.name || "Top source"} is the largest lead source in the current period.`
                : "Lead source breakdown will appear when leads are captured in the database."}
            </p>
          </div>
        </GlassCard>
      </div>

      {/* ── conversion + goal completion ────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <GlassCard className="section-card p-6">
          <SectionHeader title="Conversion by stage" />
          <div className="h-64 overflow-x-auto">
            <div className="h-64" style={{ minWidth: 560 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={conversionByStage}>
                  <CartesianGrid stroke="oklch(0.28 0.014 25 / 0.4)" vertical={false} />
                  <XAxis dataKey="name" stroke="oklch(0.55 0.02 280)" fontSize={11} />
                  <YAxis stroke="oklch(0.55 0.02 280)" fontSize={11} />
                  <Tooltip contentStyle={{ background: "oklch(0.18 0.014 25)", border: "1px solid oklch(0.28 0.014 25)", borderRadius: 12, color: "#fff" }} />
                  <Bar dataKey="value" fill="oklch(0.58 0.22 18)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="section-card p-6">
          <SectionHeader title="Goal completion" subtitle="Targets require configuration in settings" />
          <div className="space-y-2">
            {conversionByStage.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-8">No goal data configured yet.</p>
            )}
            {conversionByStage.slice(0, 4).map((g) => {
              const pct = Math.min(100, g.value);
              return (
                <div key={g.name} className="goal-item">
                  <div className="flex justify-between text-xs mb-2" style={{ color: "oklch(0.52 0.02 280)" }}>
                    <span>{g.name}</span>
                    <span className="font-medium">{g.value} leads</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "oklch(0.28 0.014 25 / 0.4)" }}>
                    <div className="h-full gradient-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>

   {/* ── team comparison ─────────────────────────────────────── */}
{/* ── team comparison ─────────────────────────────────────── */}
<GlassCard className="section-card p-6">
  <SectionHeader
    title="Team Comparison"
    subtitle="Productivity and activity across all team members"
  />

  {/* ── summary metric cards ── */}
  <div style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: 10,
    margin: "16px 0 20px",
  }}>
    {[
      { label: "Team members",    value: teamMembers.length || "—" },
      {
        label: "Avg productivity",
        value: teamMembers.length
          ? Math.round(teamMembers.reduce((s, e) => s + (e.productivity || 75), 0) / teamMembers.length) + "%"
          : "—",
      },
      { label: "Total converted", value: teamMembers.reduce((s, e) => s + (e.convertedLeads || 0), 0) || "—" },
      { label: "Total calls",     value: teamMembers.reduce((s, e) => s + (e.callsDone || 0), 0) || "—" },
    ].map(({ label, value }) => (
      <div key={label} style={{
        background: "#fff5f7",
        border: "1px solid #fecdd3",
        borderRadius: 10,
        padding: "12px 14px",
      }}>
        <p style={{ fontSize: 11, color: "#be123c", marginBottom: 4 }}>{label}</p>
        <p style={{ fontSize: 22, fontWeight: 700, color: "#7f1d1d" }}>{value}</p>
      </div>
    ))}
  </div>

  {/* ── legend ── */}
  <div style={{ display: "flex", flexWrap: "wrap", gap: 18, fontSize: 12,
    color: "#be123c", marginBottom: 14 }}>
    {[
      { label: "Productivity %", color: "#f43f5e", dash: false },
      { label: "Calls Done",     color: "#3b82f6", dash: true  },
      { label: "Converted",      color: "#22c55e", dash: false },
    ].map(({ label, color, dash }) => (
      <span key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          width: 18, height: 2, borderRadius: 2,
          background: dash ? "transparent" : color,
          backgroundImage: dash
            ? `repeating-linear-gradient(90deg,${color} 0 5px,transparent 5px 9px)`
            : undefined,
          flexShrink: 0,
        }}/>
        {label}
      </span>
    ))}
  </div>

  {/* ── chart — scrollable on small screens ── */}
  {teamMembers.length === 0 ? (
    <div style={{
      height: 280, display: "flex", alignItems: "center",
      justifyContent: "center", flexDirection: "column", gap: 8,
    }}>
      <Users style={{ width: 32, height: 32, color: "#fca5a5" }} />
      <p style={{ fontSize: 13, color: "#be123c" }}>No team members found</p>
      <p style={{ fontSize: 11, color: "#fca5a5" }}>Add members in Team Management</p>
    </div>
  ) : (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <style>{`
        .team-chart-scroll::-webkit-scrollbar { height: 4px; }
        .team-chart-scroll::-webkit-scrollbar-track { background: #fff1f2; border-radius: 999px; }
        .team-chart-scroll::-webkit-scrollbar-thumb { background: #f43f5e; border-radius: 999px; }
      `}</style>
      <div
        className="team-chart-scroll"
        style={{
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* min-width grows with more members so it stays readable */}
        <div style={{ minWidth: Math.max(480, teamMembers.length * 120), height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={teamMembers.map((e) => ({
                name:           e.name.split(" ")[0],
                fullName:       e.name,
                productivity:   e.productivity,
                callsDone:      e.callsDone,
                convertedLeads: e.convertedLeads,
                revenue:        e.revenue || 0,
              }))}
              margin={{ top: 10, right: 16, left: -4, bottom: 0 }}
              barCategoryGap="30%"
            >
              <CartesianGrid stroke="#fecdd3" vertical={false} strokeDasharray="3 4" />
              <XAxis
                dataKey="name"
                tick={{ fill: "#be123c", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: "#be123c", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={36}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div style={{
                      background: "#fff",
                      border: "1px solid #fecdd3",
                      borderRadius: 12,
                      padding: "12px 16px",
                      minWidth: 180,
                      boxShadow: "0 8px 24px rgba(244,63,94,0.15)",
                    }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#7f1d1d",
                        marginBottom: 10, paddingBottom: 8,
                        borderBottom: "1px solid #fecdd3" }}>
                        {d.fullName}
                      </p>
                      {[
                        { label: "Productivity",    value: d.productivity + "%", dot: "#f43f5e" },
                        { label: "Calls done",      value: d.callsDone,          dot: "#3b82f6" },
                        { label: "Converted leads", value: d.convertedLeads,     dot: "#22c55e" },
                        { label: "Revenue",         value: formatINR(d.revenue), dot: "#a855f7" },
                      ].map(({ label, value, dot }) => (
                        <div key={label} style={{
                          display: "flex", justifyContent: "space-between",
                          alignItems: "center", gap: 12, marginBottom: 5, fontSize: 12,
                        }}>
                          <span style={{ display: "flex", alignItems: "center",
                            gap: 6, color: "#9f1239" }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%",
                              background: dot, flexShrink: 0 }} />
                            {label}
                          </span>
                          <span style={{ fontWeight: 700, color: "#7f1d1d" }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              <Bar dataKey="productivity" fill="#f43f5e" radius={[6,6,0,0]} maxBarSize={40} />
              <Bar dataKey="callsDone"    fill="#3b82f6" radius={[6,6,0,0]} maxBarSize={40} />
              <Bar dataKey="convertedLeads" fill="#22c55e" radius={[6,6,0,0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )}

  <p style={{ fontSize: 10, color: "#fca5a5", textAlign: "center", marginTop: 8 }}>
    ← scroll to see all members →
  </p>
</GlassCard>
    </div>
  );
}