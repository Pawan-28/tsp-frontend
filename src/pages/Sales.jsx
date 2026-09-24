import { useState, useMemo, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Sparkles, Phone, Mail, Calendar, Brain,
  AlertTriangle, TrendingUp, TrendingDown, DollarSign, Target,
  Users, Activity, BarChart2, Zap, Clock, Award, Percent,
  CheckCircle2, MessageSquare, UserCheck, PhoneCall, Flame,
  Thermometer, Snowflake, ChevronRight, Star, AlertCircle, X,Trash2
} from "lucide-react";
import {
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
  AreaChart, Area,
} from "recharts";
import {
  GlassCard, Badge, Drawer, SectionHeader,
  priorityTone, stageTone, Avatar, StatCard,
} from "../components/Primitives.jsx";
import { formatIndianNumber } from "../lib/indianFormat.js";
import { formatTelUrl } from "../lib/phoneUtils.js";
import AddLeadDrawer from "../components/AddLeadDrawer.jsx";
import { useAdmin } from "../context/AdminContext.jsx";
import { useDateRange } from "../context/DateRangeContext.jsx";
import { buildPeriodQueryParams } from "../lib/periodQuery.js";
import { apiGet, apiPut, apiDelete } from "../lib/api.js";
import { useIsMobile } from "../hooks/use-mobile.tsx";

function buildSalesQueryParams({ selectedService, selectedEmployee, preset, bounds }) {
  const extra = {};
  if (selectedService && selectedService !== "All Services") extra.service = selectedService;
  if (selectedEmployee && selectedEmployee !== "All Employees") extra.employee = selectedEmployee;
  return buildPeriodQueryParams({ preset, bounds, extra });
}
const cardHoverStyle = {
  transition: "border-color  .2s ease, box-shadow .2s ease, transform .2s ease",
};
const cardBase = {
  background: "#fff",
  border: "1px solid #fda4af",
  borderRadius: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,.04)",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "#fecdd3",
};
const cardHovered = {
  borderColor: "#dc2626",
  boxShadow: "0 8px 24px rgba(220,38,38,.14)",
  transform: "translateY(-2px)",
};

/* ── Section card wrapper with title inside ──────────────── */
function SectionCard({ title, subtitle, children, className = "", action = null, bodyClassName = "" }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ ...cardBase, ...(hov ? cardHovered : {}), ...cardHoverStyle }}
      className={`overflow-hidden ${className}`}
    >
      {/* Card title bar */}
      <div
        className="flex items-center justify-between px-3 sm:px-5 pt-3 sm:pt-5 pb-2 sm:pb-3"
        style={{ borderBottom: "1px solid #fce7f3" }}
      >
        <div className="min-w-0">
          <div className="text-xs sm:text-sm font-bold text-rose-700">{title}</div>
          {subtitle && (
            <div className="text-[10px] sm:text-[11px] text-gray-700 mt-0.5 line-clamp-1 sm:line-clamp-none">
              {subtitle}
            </div>
          )}
        </div>
        {action}
      </div>
      <div className={`p-3 sm:p-5 w-full min-w-0 ${bodyClassName}`}>{children}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   KPI icon map
══════════════════════════════════════════════════════════ */
const kpiIconMap = [
  { keys: ["revenue", "arr", "mrr"], icon: DollarSign },
  { keys: ["sales"], icon: TrendingUp },
  { keys: ["deal", "deals", "won", "closed"], icon: Award },
  { keys: ["lead", "leads", "prospect"], icon: Users },
  { keys: ["qualified", "qualification"], icon: UserCheck },
  { keys: ["conversion", "rate", "win rate"], icon: Percent },
  { keys: ["target", "quota", "goal"], icon: Target },
  { keys: ["pipeline"], icon: BarChart2 },
  { keys: ["activity", "activities"], icon: Activity },
  { keys: ["call", "calls"], icon: PhoneCall },
  { keys: ["meeting", "meetings"], icon: Calendar },
  { keys: ["message", "messages", "chat"], icon: MessageSquare },
  { keys: ["avg", "average", "size"], icon: BarChart2 },
  { keys: ["cycle", "time", "days", "speed"], icon: Clock },
  { keys: ["new", "inbound", "outbound"], icon: Sparkles },
  { keys: ["hot"], icon: Flame },
  { keys: ["warm"], icon: Thermometer },
  { keys: ["cold"], icon: Snowflake },
];

function getKpiIcon(label) {
  const lower = label.toLowerCase();
  for (const e of kpiIconMap) {
    if (e.keys.some((k) => lower.includes(k))) return e.icon;
  }
  return TrendingUp;
}

/* ══════════════════════════════════════════════════════════
   1. KPI CARD — crimson hover border + soft shadow
══════════════════════════════════════════════════════════ */
function PremiumKPICard({ k, index }) {
  const Icon = getKpiIcon(k.label);

  const tones = ["success", "purple", "warning", "info", "primary", "indigo"];
  const tone = tones[index % tones.length];

  return (
    <StatCard
      label={k.label}
      value={k.value}
      change={k.change}
      sub="vs last period"
      icon={Icon}
      tone={tone}
      hover
    />
  );
}


function TaperSegment({ fromH, toH, value, color, gradientId, isLast }) {
  const W = 135;
  const gap = 6;
  const bodyW = isLast ? W * 0.18 : W - gap;
  const fH = Math.max(10, fromH);
  const tH = Math.max(6, toH);
  const svgH = Math.max(fH, tH) + 4;
  const cy = svgH / 2;

  // Trapezoid path: left edge full height, right edge tapered
  const path = isLast
    ? `M0,${cy - fH / 2} L${bodyW},${cy - tH / 2} L${bodyW},${cy + tH / 2} L0,${cy + fH / 2} Z`
    : `M0,${cy - fH / 2} L${bodyW},${cy - tH / 2} L${bodyW},${cy + tH / 2} L0,${cy + fH / 2} Z`;

  return (
    <div style={{ position: "relative", width: W, flexShrink: 0, height: svgH + 8, display: "flex", alignItems: "center" }}>
      <svg width={bodyW} height={svgH} style={{ display: "block" }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.9" />
            <stop offset="100%" stopColor={color} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <path d={path} fill={`url(#${gradientId})`} />
      </svg>
      {/* Value label */}
      <div style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(255,255,255,0.6)",
        borderRadius: 6,
        padding: "2px 7px",
        fontSize: 11,
        fontWeight: 800,
        color: "#1f2937",
        whiteSpace: "nowrap",
        boxShadow: "0 1px 4px rgba(0,0,0,0.10)",
        pointerEvents: "none",
        zIndex: 2,
      }}>
        {value}
      </div>
    </div>
  );
}

function FunnelRow({ row, maxVal }) {
  const BAR_MAX_H = 48;
  const BAR_MIN_H = 10;

  const heights = row.values.map(v =>
    Math.max(BAR_MIN_H, Math.round((v / maxVal) * BAR_MAX_H))
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      style={{
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid #fce7f3",
        padding: "10px 0",
      }}
    >
      {/* Row label */}
      <div style={{
        width: 82,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 6,
        paddingLeft: 12,
      }}>
        <row.Icon size={14} style={{ color: row.color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 800, color: row.color }}>{row.label}</span>
      </div>

      {/* Funnel segments */}
      <div style={{ display: "flex", alignItems: "center", flex: 1, paddingRight: 12 }}>
        {row.values.map((v, i) => {
          const fromH = heights[i];
          const toH = i < heights.length - 1 ? heights[i + 1] : Math.max(6, heights[i] * 0.15);
          const isLast = i === row.values.length - 1;
          const gradId = `grad-${row.label}-${i}`;
          return (
            <TaperSegment
              key={i}
              fromH={fromH}
              toH={toH}
              value={v}
              color={row.color}
              gradientId={gradId}
              isLast={isLast}
            />
          );
        })}
      </div>
    </motion.div>
  );
}
/* ══════════════════════════════════════════════════════════
   2. SALES PIPELINE STATUS
══════════════════════════════════════════════════════════ */
const STAGES = ["Contacted", "Qualified", "Meeting", "Negotiation", "Conversion"];

const TEMP_CONFIG = {
  Hot:  { Icon: Flame,       color: "#dc2626", light: "#fff1f2", border: "#fecdd3", rgb: "220,38,38"  },
  Warm: { Icon: Thermometer, color: "#ea580c", light: "#fff7ed", border: "#fed7aa", rgb: "234,88,12"  },
  Cold: { Icon: Snowflake,   color: "#2563eb", light: "#eff6ff", border: "#bfdbfe", rgb: "37,99,235"  },
};

// ─── Pipeline stage tooltip (portal) ─────────────────────────────────────────
// Renders above the hovered bar via a portal — no flickering, no layout shift
function PipelineTooltip({ stage, count, convPct, dropPct, prevStage, anchorRef, visible }) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!visible || !anchorRef?.current) return;
    const TOOLTIP_W = 192, TOOLTIP_H = 110, MARGIN = 8;
    const update = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const vw = window.innerWidth;
      let left = rect.left + rect.width / 2 - TOOLTIP_W / 2 + window.scrollX;
      left = Math.max(MARGIN, Math.min(left, vw - TOOLTIP_W - MARGIN));
      const top = rect.top + window.scrollY - TOOLTIP_H - 10;
      setPos({ top, left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [visible, anchorRef]);

  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.94 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            zIndex: 99999,
            pointerEvents: "none",
            width: 192,
          }}
        >
          {/* Arrow pointing down */}
          <div className="relative">
            <div className="bg-[oklch(0.13_0.014_25/0.98)] border border-rose-800/30 rounded-xl p-3.5 shadow-2xl shadow-black/70 backdrop-blur-xl">
              <p className="text-[11px] font-bold text-rose-500 mb-2.5">{stage}</p>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-gray-400">Count</span>
                  <span className="text-[11px] font-semibold text-white tabular-nums">{formatIndianNumber(count)}</span>
                </div>
                {convPct !== null && (
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-gray-400">From {prevStage}</span>
                    <span className="text-[11px] font-semibold text-emerald-400 tabular-nums">{convPct}% conv</span>
                  </div>
                )}
                {dropPct !== null && (
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-gray-400">Drop-off</span>
                    <span className="text-[11px] font-semibold text-red-400 tabular-nums">↓ {dropPct}%</span>
                  </div>
                )}
              </div>
            </div>
            {/* Downward arrow */}
            <div
              className="absolute left-1/2 -translate-x-1/2 -bottom-[7px] w-3.5 h-3.5 rotate-45 border-b border-r border-rose-800/30 bg-[oklch(0.13_0.014_25/0.98)]"
              style={{ zIndex: 1 }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function PipelineBubble({ stage, count, convPct, dropOff, prevStage, index, rowKey, bubbleRefs, hoveredBubble, setHoveredBubble }) {
  const isHov = hoveredBubble && hoveredBubble.row === rowKey && hoveredBubble.col === index;
  const bubbleRef = useRef(null);

  useEffect(() => {
    bubbleRefs.current[`${rowKey}-${index}`] = bubbleRef.current;
  }, [rowKey, index, bubbleRefs]);

  return (
    <div
      ref={bubbleRef}
      className="absolute w-6 h-6 sm:w-7 sm:h-7 md:w-9 md:h-9 lg:w-7 lg:h-7 rounded-full bg-white flex items-center justify-center shadow-sm sm:shadow-md border border-rose-100 transition-all duration-200 cursor-pointer z-20 hover:scale-110 hover:shadow-lg"
      style={{
        left: `${10 + index * 20}%`,
        transform: "translate(-50%, -50%)",
        top: "50%",
      }}
      onMouseEnter={() => setHoveredBubble({ row: rowKey, col: index })}
      onMouseLeave={() => setHoveredBubble(null)}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={count}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="text-[8px] sm:text-[10px] md:text-xs lg:text-[10px] font-black text-gray-800 tabular-nums select-none"
        >
          {count}
        </motion.span>
      </AnimatePresence>

      <PipelineTooltip
        stage={stage}
        count={count}
        convPct={convPct}
        dropPct={dropOff}
        prevStage={prevStage}
        anchorRef={{ current: bubbleRefs.current[`${rowKey}-${index}`] }}
        visible={!!isHov}
      />
    </div>
  );
}

function PipelineRow({ rowKey, label, stops, data, bubbleRefs, hoveredBubble, setHoveredBubble }) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 md:gap-4 lg:gap-2.5 group">
      <div className="w-9 sm:w-12 md:w-14 lg:w-11 flex-shrink-0 text-right pr-0.5 sm:pr-1">
        <span className="text-[8px] sm:text-[10px] md:text-xs lg:text-[10px] font-black text-slate-600 tracking-wider uppercase">
          {label}
        </span>
      </div>

      <div className="flex-1 relative h-9 sm:h-12 md:h-16 lg:h-10 bg-[#fdf2f4]/40 border border-rose-100/50 rounded-lg sm:rounded-xl md:rounded-2xl lg:rounded-xl flex items-center shadow-sm hover:shadow-md transition-shadow duration-300">
        {/* Continuous Tapered Gradient Ribbon (SVG) */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`ribbon-grad-${rowKey}`} x1="0%" y1="0%" x2="100%" y2="0%">
              {stops.map((s, idx) => (
                <stop key={idx} offset={s.offset} stopColor={s.color} />
              ))}
            </linearGradient>
          </defs>
          <path
            d="M 0,16 L 50,17 C 75,17, 75,18, 100,18 C 200,18, 200,26, 300,26 C 400,26, 400,34, 500,34 C 600,34, 600,40, 700,40 C 800,40, 800,46, 900,46 C 950,46, 950,47, 1000,47 L 1000,53 C 950,53, 950,54, 900,54 C 800,54, 800,60, 700,60 C 600,60, 600,66, 500,66 C 400,66, 400,74, 300,74 C 200,74, 200,82, 100,82 C 75,82, 75,83, 50,83 L 0,84 Z"
            fill={`url(#ribbon-grad-${rowKey})`}
            opacity={0.85}
          />
        </svg>

        {/* Stage Bubbles */}
        {STAGES.map((stage, i) => {
          const count = data[i] ?? 0;
          const convPct = i > 0 && data[i - 1] > 0 ? Math.round((count / data[i - 1]) * 100) : null;
          const dropOff = i > 0 && data[i - 1] > 0 ? Math.round(((data[i - 1] - count) / data[i - 1]) * 100) : null;
          return (
            <PipelineBubble
              key={stage}
              stage={stage}
              count={count}
              convPct={convPct}
              dropOff={dropOff}
              prevStage={i > 0 ? STAGES[i - 1] : null}
              index={i}
              rowKey={rowKey}
              bubbleRefs={bubbleRefs}
              hoveredBubble={hoveredBubble}
              setHoveredBubble={setHoveredBubble}
            />
          );
        })}
      </div>
    </div>
  );
}

const EMPTY_PIPELINE_STATS = {
  Hot: { Contacted: 0, Qualified: 0, Meeting: 0, Negotiation: 0, Conversion: 0 },
  Warm: { Contacted: 0, Qualified: 0, Meeting: 0, Negotiation: 0, Conversion: 0 },
  Cold: { Contacted: 0, Qualified: 0, Meeting: 0, Negotiation: 0, Conversion: 0 },
};

function SalesPipelineStatus({ service, employee, periodPreset, periodBounds }) {
  const [stats,       setStats]       = useState(EMPTY_PIPELINE_STATS);
  const [stageTotals, setStageTotals] = useState({
    Contacted: 0, Qualified: 0, Meeting: 0, Negotiation: 0, Conversion: 0,
  });
  const [tempTotals,  setTempTotals]  = useState({ Hot: 0, Warm: 0, Cold: 0 });
  const [hoveredBubble, setHoveredBubble] = useState(null);
  const bubbleRefs = useRef({});

  useEffect(() => {
    const q = buildSalesQueryParams({
      selectedService: service,
      selectedEmployee: employee,
      preset: periodPreset,
      bounds: periodBounds,
    });

    apiGet(`/api/sales/emp-leads/pipeline-stats?${q.toString()}`)
      .then(d => {
        if (d.success && d.grid) {
          setStats(d.grid);
          setStageTotals(d.stageTotals || {});
          setTempTotals(d.tempTotals  || {});
        }
      })
      .catch(e => console.error("pipeline-stats failed", e));
  }, [service, employee, periodPreset, periodBounds?.start, periodBounds?.end]);

  const hotData = useMemo(() => STAGES.map(s => stats?.Hot?.[s] ?? 0), [stats]);
  const warmData = useMemo(() => STAGES.map(s => stats?.Warm?.[s] ?? 0), [stats]);
  const coldData = useMemo(() => STAGES.map(s => stats?.Cold?.[s] ?? 0), [stats]);
  const totalData = useMemo(() => {
    return STAGES.map((_, i) => (hotData[i] || 0) + (warmData[i] || 0) + (coldData[i] || 0));
  }, [hotData, warmData, coldData]);

  const hotStops = [
    { offset: "0%", color: "#9f1239" },
    { offset: "40%", color: "#e11d48" },
    { offset: "75%", color: "#f43f5e" },
    { offset: "100%", color: "#fda4af" }
  ];

  const warmStops = [
    { offset: "0%", color: "#ea580c" },
    { offset: "50%", color: "#f97316" },
    { offset: "100%", color: "#fcd34d" }
  ];

  const coldStops = [
    { offset: "0%", color: "#2563eb" },
    { offset: "50%", color: "#3b82f6" },
    { offset: "100%", color: "#93c5fd" }
  ];

  const totalStops = [
    { offset: "0%", color: "#0f766e" },
    { offset: "50%", color: "#14b8a6" },
    { offset: "100%", color: "#5eead4" }
  ];

  // Skeleton
  if (!stats) return (
    <SectionCard title="Sales Pipeline Status" subtitle="Temperature segmented conversion progression and deal flow" bodyClassName="lg:p-4 lg:pt-3">
      <div className="flex-1 overflow-x-auto scrollbar-hide -mx-1 sm:-mx-2 px-1 sm:px-2 pb-1 sm:pb-2">
        <div className="min-w-[460px] sm:min-w-[560px] md:min-w-[640px] space-y-1.5 sm:space-y-3 md:space-y-4 lg:space-y-2">
          <div className="flex items-center">
            <div className="w-9 sm:w-12 md:w-14 lg:w-11 flex-shrink-0" />
            <div className="flex-1 relative h-4 sm:h-5 md:h-6 lg:h-4 text-gray-400 text-[7px] sm:text-[9px] md:text-[10px] lg:text-[9px] font-bold tracking-wider uppercase">
              <span className="absolute left-[10%] -translate-x-1/2">Contacted</span>
              <span className="absolute left-[30%] -translate-x-1/2">Qualified</span>
              <span className="absolute left-[50%] -translate-x-1/2">Meeting</span>
              <span className="absolute left-[70%] -translate-x-1/2">Negotiation</span>
              <span className="absolute left-[90%] -translate-x-1/2">Conversion</span>
            </div>
          </div>

          {["Hot", "Warm", "Cold", "Total"].map((label) => {
            const cfg = TEMP_CONFIG[label] || { color: "#0d9488", light: "#f0fdf4", border: "#a7f3d0", rgb: "13,148,136" };
            return (
              <div key={label} className="flex items-center gap-2 sm:gap-3 md:gap-4 lg:gap-2.5">
                <div className="w-9 sm:w-12 md:w-14 lg:w-11 flex-shrink-0 text-right pr-0.5 sm:pr-1">
                  <span 
                    className="text-[8px] sm:text-[10px] md:text-xs lg:text-[10px] font-black tracking-wider uppercase animate-pulse"
                    style={{ color: cfg.color }}
                  >
                    {label}
                  </span>
                </div>

                <div 
                  className="flex-1 relative h-9 sm:h-12 md:h-16 lg:h-10 rounded-lg sm:rounded-xl md:rounded-2xl lg:rounded-xl flex items-center shadow-sm overflow-hidden border"
                  style={{ background: cfg.light, borderColor: cfg.border }}
                >
                  {/* Shimmer gradient line inside */}
                  <div 
                    className="absolute inset-0 bg-gradient-to-r from-transparent to-transparent animate-[shimmer_1.4s_infinite]"
                    style={{ 
                      backgroundSize: "200% 100%",
                      backgroundImage: `linear-gradient(90deg, transparent, rgba(${cfg.rgb}, 0.15), transparent)`
                    }}
                  />
                  
                  {/* SVG Ribbon Path Placeholder */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-25" viewBox="0 0 1000 100" preserveAspectRatio="none">
                    <path
                      d="M 0,16 L 50,17 C 75,17, 75,18, 100,18 C 200,18, 200,26, 300,26 C 400,26, 400,34, 500,34 C 600,34, 600,40, 700,40 C 800,40, 800,46, 900,46 C 950,46, 950,47, 1000,47 L 1000,53 C 950,53, 950,54, 900,54 C 800,54, 800,60, 700,60 C 600,60, 600,66, 500,66 C 400,66, 400,74, 300,74 C 200,74, 200,82, 100,82 C 75,82, 75,83, 50,83 L 0,84 Z"
                      fill={cfg.color}
                    />
                  </svg>

                  {/* Shimmering Bubbles */}
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="absolute w-6 h-6 sm:w-7 sm:h-7 md:w-9 md:h-9 lg:w-7 lg:h-7 rounded-full bg-white flex items-center justify-center shadow-md border z-20 animate-pulse"
                      style={{
                        left: `${10 + i * 20}%`,
                        transform: "translate(-50%, -50%)",
                        top: "50%",
                        borderColor: cfg.border
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Shimmer */}
      <div className="mt-3 sm:mt-5 lg:mt-3 pt-3 sm:pt-4 lg:pt-2.5 border-t border-rose-100/30 grid grid-cols-3 gap-1.5 sm:gap-3 lg:gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 animate-pulse">
            <div className="w-12 h-5 bg-rose-50 rounded-md" />
            <div className="w-16 h-3 bg-rose-50/60 rounded-md" />
          </div>
        ))}
      </div>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </SectionCard>
  );

  const totalLeads = Object.values(tempTotals).reduce((a, b) => a + b, 0);
  const conversions = stageTotals["Conversion"] ?? 0;
  const overallConv = totalLeads > 0 ? Math.round((conversions / totalLeads) * 100) : 0;

  return (
    <SectionCard title="Sales Pipeline Status" subtitle="Temperature segmented conversion progression and deal flow" bodyClassName="lg:p-4 lg:pt-3">
      <div className="flex-1 overflow-x-auto scrollbar-hide -mx-1 sm:-mx-2 px-1 sm:px-2 pb-1 sm:pb-2 lg:pb-1">
        <div className="min-w-[460px] sm:min-w-[560px] md:min-w-[640px] space-y-1.5 sm:space-y-3 md:space-y-4 lg:space-y-2">
          <div className="flex items-center">
            <div className="w-9 sm:w-12 md:w-14 lg:w-11 flex-shrink-0" />
            <div className="flex-1 relative h-4 sm:h-5 md:h-6 lg:h-4 text-gray-500 text-[7px] sm:text-[9px] md:text-[10px] lg:text-[9px] font-bold tracking-wider uppercase">
              <span className="absolute left-[10%] -translate-x-1/2">Contacted</span>
              <span className="absolute left-[30%] -translate-x-1/2">Qualified</span>
              <span className="absolute left-[50%] -translate-x-1/2">Meeting</span>
              <span className="absolute left-[70%] -translate-x-1/2">Negotiation</span>
              <span className="absolute left-[90%] -translate-x-1/2">Conversion</span>
            </div>
          </div>

          <PipelineRow
            rowKey="hot"
            label="Hot"
            stops={hotStops}
            data={hotData}
            bubbleRefs={bubbleRefs}
            hoveredBubble={hoveredBubble}
            setHoveredBubble={setHoveredBubble}
          />

          <PipelineRow
            rowKey="warm"
            label="Warm"
            stops={warmStops}
            data={warmData}
            bubbleRefs={bubbleRefs}
            hoveredBubble={hoveredBubble}
            setHoveredBubble={setHoveredBubble}
          />

          <PipelineRow
            rowKey="cold"
            label="Cold"
            stops={coldStops}
            data={coldData}
            bubbleRefs={bubbleRefs}
            hoveredBubble={hoveredBubble}
            setHoveredBubble={setHoveredBubble}
          />

          {/* Simple Total Summary Row */}
          <div className="pt-2 sm:pt-2.5 mt-1 border-t border-rose-200/60 flex items-center">
            <div className="w-9 sm:w-12 md:w-14 lg:w-11 flex-shrink-0 text-right pr-0.5 sm:pr-1">
              <span className="text-[8px] sm:text-[10px] md:text-xs lg:text-[10px] font-black tracking-wider uppercase text-slate-900">
                TOTAL
              </span>
            </div>
            <div className="flex-1 relative h-8 sm:h-9 bg-slate-100/80 rounded-lg sm:rounded-xl border border-slate-200 flex items-center">
              {totalData.map((val, idx) => (
                <span
                  key={idx}
                  className={`absolute -translate-x-1/2 px-2 py-0.5 rounded-md text-[9px] sm:text-xs font-black tabular-nums border shadow-2xs ${
                    idx === 0
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : idx === 4
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-white text-slate-800 border-slate-200"
                  }`}
                  style={{ left: `${10 + idx * 20}%` }}
                >
                  {val}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 sm:mt-5 lg:mt-3 pt-3 sm:pt-4 lg:pt-2.5 border-t border-rose-100/50 grid grid-cols-3 gap-1.5 sm:gap-3 lg:gap-2">
        {[
          { label: "Total Leads",  value: formatIndianNumber(totalLeads) },
          { label: "Conversions",  value: formatIndianNumber(conversions) },
          { label: "Overall Conv", value: `${overallConv}%` },
        ].map(({ label, value }) => (
          <div key={label} className="text-center min-w-0 px-0.5">
            <p className="text-xs sm:text-sm md:text-base lg:text-sm font-bold text-gray-800 tabular-nums">{value}</p>
            <p className="text-[8px] sm:text-[10px] lg:text-[9px] text-gray-500 mt-0.5 leading-tight">{label}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

/* ══════════════════════════════════════════════════════════
   3. IMP METRICS — inside SectionCard
══════════════════════════════════════════════════════════ */
function CircleRing({ value, rgb, size = 88 }) {
  const stroke = size <= 56 ? 5 : 8;
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  const fontSize = size <= 56 ? 11 : 18;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} className="block">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fecdd3" strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`rgb(${rgb})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: circ - dash }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span style={{ fontSize, fontWeight: 800, letterSpacing: "-0.04em", color: `rgb(${rgb})` }}>{value}%</span>
      </div>
    </div>
  );
}

function IMMetrics({ metrics }) {
  const isMobile = useIsMobile();
  const ringSize = isMobile ? 56 : 88;
  const displayMetrics = metrics || [];

  if (!displayMetrics.length) {
    return (
      <SectionCard title="IMP Metrics" subtitle={isMobile ? "Messaging funnel" : "Instant messaging funnel performance"} className="flex flex-col min-w-0 w-full">
        <p className="text-xs text-slate-400 text-center py-8">No metrics data yet.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="IMP Metrics" subtitle={isMobile ? "Messaging funnel" : "Instant messaging funnel performance"} className="flex flex-col min-w-0 w-full">
      <div className="grid grid-cols-3 gap-1.5 sm:gap-4 w-full min-w-0">
        {displayMetrics.map((m, i) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 + 0.1 }}
            whileHover={isMobile ? undefined : { y: -2 }}
            className={`relative rounded-lg sm:rounded-xl flex flex-col items-center justify-center text-center overflow-hidden cursor-default border w-full min-w-0 ${
              isMobile ? "p-2 gap-1" : "p-4 gap-3"
            }`}
            style={{ background: "#fff5f5", borderColor: "#fecdd3" }}
          >
            <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 50% 0%, rgba(${m.rgb},.06) 0%, transparent 60%)` }} />
            <CircleRing value={m.value} rgb={m.rgb} size={ringSize} />
            <div className="flex-1 min-w-0 relative flex flex-col items-center w-full">
              <div className="text-[8px] sm:text-sm font-semibold text-gray-800 leading-tight line-clamp-2 w-full">
                {isMobile ? m.shortLabel : m.label}
              </div>
              <div className="text-[10px] mt-1 text-gray-500 leading-normal hidden sm:block">{m.desc}</div>
              <div className="text-[7px] sm:text-[10px] mt-0.5 sm:mt-2 font-semibold leading-tight" style={{ color: `rgb(${m.rgb})` }}>
                {isMobile ? m.trend.replace(" vs last week", "") : m.trend}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </SectionCard>
  );
}

/* ══════════════════════════════════════════════════════════
   4. RECENT ACTIVITY — inside SectionCard
══════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════
   5. REVENUE OPPORTUNITY — no tabs, count values, pipeline+closed only
══════════════════════════════════════════════════════════ */

function RevenueOpportunitySection({ oppData = {}, selectedService, selectedEmployee, periodPreset, periodBounds }) {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState("");
  const [drawerLeads, setDrawerLeads] = useState([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const CATEGORY_KEY = {
    "Not Contacted Leads": "not_contacted",
    "Meeting Not Scheduled": "no_meeting",
    "Stuck In Pipeline": "stuck_pipeline",
  };

  const handleCardClick = async (label) => {
    const category = CATEGORY_KEY[label];
    if (!category) return;
    setDrawerTitle(label);
    setDrawerLeads([]);
    setDrawerOpen(true);
    setDrawerLoading(true);
    try {
      const q = buildSalesQueryParams({
        selectedService,
        selectedEmployee,
        preset: periodPreset,
        bounds: periodBounds,
      });
      q.set("category", category);
      const d = await apiGet(`/api/sales/emp-leads/opp-leads?${q.toString()}`, { skipCache: true, cacheTtl: 0 });
      if (d && d.success) setDrawerLeads(d.leads || []);
    } catch (e) { console.error(e); }
    finally { setDrawerLoading(false); }
  };

  const dynamicCards = [
    { label: "Not Contacted Leads", sublabel: "Not Pick", count: oppData.notContacted ?? 0, rgb: "245,158,11" },
    { label: "Meeting Not Scheduled", sublabel: "Conversation", count: oppData.noMeeting ?? 0, rgb: "124,58,237" },
    { label: "Stuck In Pipeline", sublabel: "Booked · Done · Proposal · Objection", count: oppData.stuckPipeline ?? 0, rgb: "239,68,68" },
  ];

  return (
    <>
      <SectionCard
        title={isMobile ? "Revenue Ops" : "Revenue Opportunities"}
        subtitle={isMobile ? "Deal status counts" : "Smart distribution & deal status"}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3 min-w-0">
          {dynamicCards.map((c, i) => (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 + 0.1 }}
              whileHover={{ y: -2, scale: 1.01 }}
              onClick={() => handleCardClick(c.label)}
              className="p-2.5 sm:p-4 rounded-lg sm:rounded-xl overflow-hidden relative cursor-pointer border min-w-0 select-none"
              style={{ background: "#fff5f5", borderColor: "#fecdd3" }}
            >
              <div className={`font-semibold text-gray-600 leading-tight line-clamp-2 ${isMobile ? "text-[10px] mb-1" : "text-[13px] mb-2"}`}>
                {c.label}
              </div>
              {!isMobile && c.sublabel && (
                <div className="text-[10px] text-gray-400 mb-1">{c.sublabel}</div>
              )}
              <div className={`font-bold tabular-nums ${isMobile ? "text-xl" : "text-2xl"}`} style={{ letterSpacing: "-0.03em", color: "#111827" }}>
                {c.count}
              </div>
              <div className="absolute bottom-2 right-3 text-[10px] text-rose-400 font-semibold">View →</div>
            </motion.div>
          ))}
        </div>
      </SectionCard>

      {/* Leads Drawer */}
      {ReactDOM.createPortal(
        <AnimatePresence>
          {drawerOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setDrawerOpen(false)}
                className="fixed inset-0 bg-black/40 z-[9998]"
              />
              <motion.div
                initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="fixed top-0 right-0 h-full w-full sm:w-[480px] z-[9999] flex flex-col"
                style={{ background: "#fff", boxShadow: "-8px 0 40px rgba(0,0,0,0.15)" }}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#fce7f3" }}>
                  <div>
                    <div className="text-base font-bold text-rose-700">{drawerTitle}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{drawerLeads.length} leads</div>
                  </div>
                  <button onClick={() => setDrawerOpen(false)} className="p-2 rounded-xl hover:bg-rose-50 transition">
                    <X size={18} className="text-rose-500" />
                  </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {drawerLoading ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-3">
                      <div className="w-8 h-8 rounded-full border-4 border-rose-200 border-t-rose-500 animate-spin" />
                      <span className="text-sm text-gray-400">Loading leads…</span>
                    </div>
                  ) : drawerLeads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-2 text-gray-400">
                      <span className="text-3xl"></span>
                      <span className="text-sm font-medium">No leads in this category</span>
                    </div>
                  ) : drawerLeads.map((lead) => {
                    const name = lead.lead_name || "Unknown";
                    const initials = name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
                    return (
                      <motion.div
                        key={lead.id}
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-xl border"
                        style={{ background: "#fff5f5", borderColor: "#fecdd3" }}
                      >
                        <div className="flex items-start gap-3">
                          {/* Avatar */}
                          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white"
                            style={{ background: "linear-gradient(135deg,#be123c,#f43f5e)" }}>
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-gray-900 truncate">{name}</div>
                            <div className="text-xs text-gray-500 truncate">{lead.phone || "—"}</div>
                          </div>
                          {/* Status badge */}
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                            style={{ background: "#fce7f3", color: "#be123c" }}>
                            {lead.pipeline_stage || lead.status || "New"}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {[
                            { k: "City", v: lead.city },
                            { k: "Assigned To", v: lead.assigned_to_name },
                            { k: "Interactions", v: lead.interactions ?? 0 },
                            { k: "Value", v: lead.expected_revenue ? `₹${Number(lead.expected_revenue).toLocaleString("en-IN")}` : "—" },
                          ].map(({ k, v }) => (
                            <div key={k} className="p-2 rounded-lg" style={{ background: "#fff" }}>
                              <div className="text-[9px] text-gray-400 uppercase tracking-wider">{k}</div>
                              <div className="text-xs font-semibold text-gray-800 mt-0.5 truncate">{v || "—"}</div>
                            </div>
                          ))}
                        </div>

                        {lead.email && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
                            <Mail size={11} className="text-rose-400" />
                            <span className="truncate">{lead.email}</span>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}


function SalesAIInsights({ showToast, employee }) {
  const [refreshing, setRefreshing] = useState(false);
  const [cards, setCards] = useState([]);
  const [funnelData, setFunnelData] = useState({
    value: "₹0", growth: "0%", comparison: "0% vs Target", pct: "0%", matchText: "0% target match"
  });

  useEffect(() => {
    const params = new URLSearchParams();
    if (employee) params.set("employee", employee);

    apiGet(`/api/sales/emp-leads/sales-ai-insights?${params.toString()}`, { skipCache: true, cacheTtl: 0 })
      .then((data) => {
        if (data && data.success) {
          setCards(data.cards || []);
          if (data.funnelData) setFunnelData(data.funnelData);
        }
      })
      .catch((err) => console.error("Sales AI Insights fetch error:", err));
  }, [employee]);

  const handleRefresh = () => {
    setRefreshing(true);
    const params = new URLSearchParams();
    if (employee) params.set("employee", employee);

    apiGet(`/api/sales/emp-leads/sales-ai-insights?${params.toString()}`, { skipCache: true, cacheTtl: 0 })
      .then((data) => {
        if (data && data.success) {
          setCards(data.cards || []);
          if (data.funnelData) setFunnelData(data.funnelData);
        }
      })
      .catch((err) => console.error("Sales AI Insights refresh error:", err))
      .finally(() => {
        setRefreshing(false);
        if (showToast) showToast("AI insights re-evaluated successfully!");
      });
  };

  const insightsList = cards;

  return (
    <SectionCard
      title="AI Insights Center"
      subtitle="Smart actions & pipeline predictions"
      className="self-start h-fit"
      bodyClassName="!p-3 !pt-2"
      action={
        <button
          onClick={handleRefresh}
          className="text-xs font-bold text-[#be123c] hover:text-[#9f1239] active:scale-95 transition-all"
        >
          {refreshing ? "Re-evaluating..." : "Refresh"}
        </button>
      }
    >
      <div className="space-y-2">
        {insightsList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50/20 py-3 text-center">
            <Sparkles className="w-5 h-5 text-rose-300 mx-auto mb-1" />
            <p className="text-xs font-semibold text-rose-800">No active insights</p>
            <p className="text-[10px] text-rose-500 mt-0.5">Assign leads to start tracking deal predictions.</p>
          </div>
        ) : (
          insightsList.map((item, idx) => {
            const config = {
              purple: { border: "border-violet-100", bg: "from-violet-50/20 to-indigo-50/20", iconBg: "bg-violet-100/80 border-violet-200 text-violet-600", textBg: "text-violet-600 bg-violet-100/60", icon: Zap },
              warn: { border: "border-rose-100", bg: "from-rose-50/10 to-orange-50/10", iconBg: "bg-rose-50 border-rose-100 text-rose-600", textBg: "text-rose-600 bg-rose-50", icon: AlertTriangle },
              success: { border: "border-emerald-100", bg: "from-emerald-50/10 to-teal-50/10", iconBg: "bg-emerald-50 border-emerald-100 text-emerald-600", textBg: "text-emerald-600 bg-emerald-50", icon: TrendingUp },
              info: { border: "border-sky-100", bg: "from-sky-50/10 to-blue-50/10", iconBg: "bg-sky-50 border-sky-100 text-sky-600", textBg: "text-sky-600 bg-sky-50", icon: Zap }
            }[item.tone] || { border: "border-rose-100", bg: "from-rose-50/10 to-orange-50/10", iconBg: "bg-rose-50 border-rose-100 text-rose-600", textBg: "text-rose-600 bg-rose-50", icon: AlertTriangle };

            const Icon = config.icon;

            return (
              <motion.div
                key={item.title}
                whileHover={{ y: -1.5 }}
                className={`p-3 rounded-xl border ${config.border} flex items-start gap-2.5 shadow-sm bg-gradient-to-r ${config.bg} text-left`}
              >
                <div className={`w-7 h-7 rounded-full ${config.iconBg} flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-gray-800 leading-snug">{item.title}</p>
                      <span className={`text-[9px] font-black uppercase ${config.textBg} px-1.5 py-0.5 rounded-md`}>
                        {item.badge}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => showToast && showToast(item.actionToast, "success")}
                      className={`px-3 py-1 ${item.tone === "warn" ? "border border-rose-600 text-rose-600 hover:bg-rose-50 bg-white" : "bg-rose-700 hover:bg-rose-800 text-white"} text-[10px] font-black rounded-lg transition-all shadow-sm active:scale-95`}
                    >
                      {item.actionText}
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}

        {/* Predictive Win Funnel — compact dark card */}
        <motion.div
          whileHover={{ y: -1.5 }}
          className="p-3 rounded-xl bg-slate-900 text-white shadow-md relative overflow-hidden text-left"
        >
          <div className="absolute -right-10 -top-10 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-start justify-between mb-1.5">
            <div>
              <p className="text-[8px] uppercase tracking-wider text-slate-400 font-extrabold">Predictive Win Funnel</p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-lg font-black tracking-tight text-white">{funnelData.value}</span>
                <span className="text-[9px] text-emerald-400 font-bold flex items-center gap-0.5">
                  <TrendingUp className="w-2.5 h-2.5" />
                  {funnelData.comparison}
                </span>
              </div>
            </div>
            <div className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300">
              <Star className="w-3 h-3 text-rose-400" />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center text-[9px] text-slate-400 font-bold">
              <span>Conversion Rate Prediction</span>
              <span className="text-emerald-400">{funnelData.matchText}</span>
            </div>
            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: funnelData.pct }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-rose-500 to-rose-400 rounded-full"
              />
            </div>
          </div>
        </motion.div>
      </div>
    </SectionCard>
  );
}

/* ══════════════════════════════════════════════════════════
   ROOT PAGE

══════════════════════════════════════════════════════════ */
export default function Sales() {
  const [addOpen, setAddOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [toast, setToast] = useState(null);
  
  const { selectedService, setSelectedService } = useAdmin();
  const { preset: periodPreset, bounds: periodBounds } = useDateRange();
  const [selectedEmployee, setSelectedEmployee] = useState("All Employees");
  
  const [servicesList, setServicesList] = useState([]);
  const [employeesList, setEmployeesList] = useState([]);

  useEffect(() => {
    apiGet("/api/services").then(d => {
      if (d && d.success) setServicesList(d.services || d.data || []);
    }).catch(e => console.error(e));
    apiGet("/api/team/employees").then(d => {
      if (d && d.success) setEmployeesList(d.employees || d.data || []);
    }).catch(e => console.error(e));
  }, []);

  const [kpiData, setKpiData] = useState([]);
  const [oppData, setOppData] = useState({});
  const [metricsData, setMetricsData] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  useEffect(() => {
    if (new URLSearchParams(location.search).get("action") === "addLead") setAddOpen(true);
  }, [location.search]);

  const handleAddClose = () => {
    setAddOpen(false);
    navigate(location.pathname, { replace: true });
  };

  useEffect(() => {
    const q = buildSalesQueryParams({
      selectedService,
      selectedEmployee,
      preset: periodPreset,
      bounds: periodBounds,
    });

    apiGet(`/api/sales/emp-leads/sales-kpis?${q.toString()}`, { skipCache: true, cacheTtl: 0 })
      .then(d => {
        if (d && d.success) {
          setKpiData(d.kpiData || []);
          setOppData(d.oppData || {});
          setMetricsData(d.metrics || null);
        }
      }).catch(e => console.error(e));
  }, [selectedService, selectedEmployee, periodPreset, periodBounds?.start, periodBounds?.end]);
  return (
    <div className="space-y-4 sm:space-y-6 page-shell min-w-0">
      
      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-center bg-white p-3 sm:px-5 rounded-2xl shadow-sm border border-rose-100">
        <div className="text-sm font-bold text-rose-700 whitespace-nowrap mr-2">Filters:</div>
        
        <select 
          className="w-full sm:w-auto bg-rose-50/50 border border-rose-200 text-gray-800 text-sm rounded-xl px-4 py-2 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400 transition"
          value={selectedService}
          onChange={e => setSelectedService(e.target.value)}
        >
          <option value="All Services">Select Service (All)</option>
          {servicesList.map(s => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
        </select>

        <select 
          className="w-full sm:w-auto bg-rose-50/50 border border-rose-200 text-gray-800 text-sm rounded-xl px-4 py-2 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400 transition"
          value={selectedEmployee}
          onChange={e => setSelectedEmployee(e.target.value)}
        >
          <option value="All Employees">Select Employee (All)</option>
          {employeesList.map(e => (
            <option key={e.id} value={e.name}>{e.name}</option>
          ))}
        </select>
      </div>

      {/* ── 1. KPI row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-2.5">
        {(kpiData.length ? kpiData : []).map((k, i) => <PremiumKPICard key={k.label} k={k} index={i} />)}
      </div>

      {/* ── 2. Revenue Opportunity + IMP Metrics (left) + AI Insights (right) ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 sm:gap-6 items-start min-w-0">
        <div className="xl:col-span-2 flex flex-col gap-3 sm:gap-6 min-w-0">
          <RevenueOpportunitySection
            oppData={oppData}
            selectedService={selectedService}
            selectedEmployee={selectedEmployee}
            periodPreset={periodPreset}
            periodBounds={periodBounds}
          />
          <IMMetrics metrics={metricsData} />
        </div>

        <SalesAIInsights showToast={showToast} employee={selectedEmployee} />
      </div>

      {/* ── 3. Sales Pipeline Status ── */}
      <SalesPipelineStatus
        service={selectedService}
        employee={selectedEmployee}
        periodPreset={periodPreset}
        periodBounds={periodBounds}
      />

      <AddLeadDrawer
        open={addOpen}
        onClose={handleAddClose}
        showToast={showToast}
      />

      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-6 right-6 z-[9999] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-medium"
          style={{
            background: toast.type === "success" ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${toast.type === "success" ? "#bbf7d0" : "#fecdd3"}`,
            color: toast.type === "success" ? "#15803d" : "#be123c",
          }}
        >
          {toast.type === "success" ? <CheckCircle2 size={16} /> : <X size={16} />}
          {toast.message}
        </motion.div>
      )}
    </div>
  );
}

/* ── Helper components ── */

function SalesLeadDetail({ lead, onDelete, onUpdate }) {
  const [activeTab, setActiveTab] = useState("details");
  const [isEditing, setIsEditing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [editData, setEditData] = useState({ ...lead });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [statusHistory, setStatusHistory] = useState([]);
  const [note, setNote] = useState("");
  const [tasks, setTasks] = useState([
    { id: 1, text: "Send proposal", done: false },
    { id: 2, text: "Book demo call", done: false },
    { id: 3, text: "Follow up tomorrow", done: false },
  ]);
  const [newTask, setNewTask] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleNote, setScheduleNote] = useState("");
  const [showScheduler, setShowScheduler] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  // Fetch status history when activity tab opens
  useEffect(() => {
    if (activeTab !== "activity") return;
    const fetchHistory = async () => {
      try {
        const data = await apiGet(`/api/sales/emp-leads/${lead.id}/status-history`);
        if (data.success) setStatusHistory(data.history);
      } catch (e) {
        console.error("Failed to fetch status history", e);
      }
    };
    fetchHistory();
  }, [activeTab, lead.id]);

  const rawName = (lead.lead_name || lead.business_name || "NA").trim();
  const cleanName = rawName.replace(/[^\x00-\x7F]/g, "").trim() || rawName.trim();
  const words = cleanName.split(" ").filter(Boolean);
  const initials =
    words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : cleanName.slice(0, 2).toUpperCase();

  // Status → color map
  const statusColor = (s = "") => {
    const v = s.toLowerCase();
    if (v.includes("convert") || v.includes("won"))    return { bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" };
    if (v.includes("hot"))                             return { bg: "#fff1f2", color: "#dc2626", border: "#fecdd3" };
    if (v.includes("meeting"))                         return { bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" };
    if (v.includes("qualified") || v.includes("warm")) return { bg: "#fff7ed", color: "#ea580c", border: "#fed7aa" };
    if (v.includes("not interested"))                  return { bg: "#f9fafb", color: "#6b7280", border: "#e5e7eb" };
    return { bg: "#fdf4ff", color: "#9333ea", border: "#e9d5ff" };
  };

  const statusIcon = (s = "") => {
    const v = s.toLowerCase();
    if (v.includes("convert") || v.includes("won"))    return CheckCircle2;
    if (v.includes("meeting"))                         return Calendar;
    if (v.includes("call") || v.includes("follow"))    return PhoneCall;
    if (v.includes("qualified"))                       return UserCheck;
    if (v.includes("not interested"))                  return X;
    return Activity;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await apiPut(`/api/sales/emp-leads/${lead.id}`, editData);
      if (data.success) { onUpdate(data.lead); setIsEditing(false); }
    } catch (err) { console.error("Update failed", err); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const data = await apiDelete(`/api/sales/emp-leads/${lead.id}`);
      if (data.success) onDelete(lead.id);
    } catch (err) { console.error("Delete failed", err); }
    finally { setDeleting(false); }
  };

  const setEdit = (key, val) => setEditData(prev => ({ ...prev, [key]: val }));
  const handleCall = () => {
    if (!lead?.phone) return;
    const url = formatTelUrl(lead.phone);
    if (url) window.location.href = url;
  };

  const handleScheduleSave = () => {
    if (!scheduleDate) return;
    setTasks(prev => [...prev, {
      id: Date.now(),
      text: scheduleNote || `Meeting scheduled on ${scheduleDate}`,
      done: false,
      date: scheduleDate,
    }]);
    setShowScheduler(false);
    setScheduleDate("");
    setScheduleNote("");
    setActiveTab("tasks");
  };

  const toggleTask = (id) => setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const addTask = () => {
    if (!newTask.trim()) return;
    setTasks(prev => [...prev, { id: Date.now(), text: newTask.trim(), done: false }]);
    setNewTask("");
  };
  const deleteTask = (id) => setTasks(prev => prev.filter(t => t.id !== id));

  return (
    <div className="px-1">

      {/* Edit / Delete bar */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b" style={{ borderColor: "#fce7f3" }}>
        {!isEditing ? (
          <>
            <button onClick={() => { setEditData({ ...lead }); setIsEditing(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: "#fff5f5", border: "1px solid #fecdd3", color: "#be123c" }}>
Edit
            </button>
            {!deleteConfirm ? (
              <button onClick={() => setDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: "#fff5f5", border: "1px solid #fecdd3", color: "#dc2626" }}>
Delete
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Are you sure?</span>
                <button onClick={handleDelete} disabled={deleting}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                  style={{ background: deleting ? "#fca5a5" : "#dc2626" }}>
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
                <button onClick={() => setDeleteConfirm(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: "#f3f4f6", color: "#6b7280" }}>
                  Cancel
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white"
              style={{ background: saving ? "#fda4af" : "#be123c" }}>
              {saving ? "Saving…" : "✓ Save Changes"}
            </button>
            <button onClick={() => { setIsEditing(false); setEditData({ ...lead }); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: "#f3f4f6", color: "#6b7280" }}>
              Cancel
            </button>
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex mb-5 border-b" style={{ borderColor: "#f3d5dd" }}>
        {["details", "activity", "tasks"].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className="flex-1 py-3 text-sm font-medium capitalize"
            style={{
              color: activeTab === tab ? "#be123c" : "#6b7280",
              borderBottom: activeTab === tab ? "2px solid #be123c" : "2px solid transparent",
            }}>
            {tab}
          </button>
        ))}
      </div>

      {/* ── DETAILS TAB ── */}
      {activeTab === "details" && !isEditing && (
        <div className="space-y-4">

          {/* Profile */}
          <div className="flex gap-3 items-start">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-lg shrink-0"
              style={{ background: "linear-gradient(135deg,#be123c,#e11d48)" }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg text-gray-900">{lead.lead_name}</h3>
              <p className="text-sm text-gray-500">{lead.business_name || lead.company_name || "—"}</p>

              {/* Employee badge */}
              {lead.employee_name && (
                <div className="inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                  style={{ background: "rgba(124,58,237,.1)", color: "rgb(109,40,217)", border: "1px solid rgba(124,58,237,.2)" }}>
                  <Users size={10} />
                  {lead.employee_name}
                  {lead.employee_id && <span className="opacity-60">· #{lead.employee_id}</span>}
                </div>
              )}

              <div className="flex gap-2 mt-2 flex-wrap">
                {/* Current status badge */}
                {lead.status && (() => {
                  const sc = statusColor(lead.status);
                  return (
                    <span className="px-2 py-1 rounded-full text-xs font-semibold"
                      style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                      {lead.status}
                    </span>
                  );
                })()}
                {lead.temperature && (
                  <span className="px-2 py-1 rounded-full text-xs"
                    style={{
                      background: lead.temperature?.toLowerCase().includes("hot") ? "#ffe4e6"
                        : lead.temperature?.toLowerCase().includes("warm") ? "#fff7ed" : "#eff6ff",
                      color: lead.temperature?.toLowerCase().includes("hot") ? "#e11d48"
                        : lead.temperature?.toLowerCase().includes("warm") ? "#ea580c" : "#2563eb",
                    }}>
                    {lead.temperature}
                  </span>
                )}
                {lead.source && (
                  <span className="px-2 py-1 rounded-full text-xs" style={{ background: "#f0fdf4", color: "#16a34a" }}>
                    {lead.source}
                  </span>
                )}
                {lead.platform && (
                  <span className="px-2 py-1 rounded-full text-xs" style={{ background: "#eff6ff", color: "#2563eb" }}>
                    {lead.platform}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Contact info */}
          <div className="space-y-2 pt-1">
            {lead.email && (
              <div className="flex items-center gap-3 text-gray-700">
                <Mail size={15} className="text-rose-500 shrink-0" />
                <span className="text-sm truncate">{lead.email}</span>
              </div>
            )}
            {lead.phone && (
              <div className="flex items-center gap-3 text-gray-700">
                <Phone size={15} className="text-rose-500 shrink-0" />
                <span className="text-sm">{lead.phone}</span>
              </div>
            )}
            {lead.city && (
              <div className="flex items-center gap-3 text-gray-700">
                <Target size={15} className="text-rose-500 shrink-0" />
                <span className="text-sm">{lead.city}</span>
              </div>
            )}
            {lead.form_name && (
              <div className="flex items-center gap-3 text-gray-700">
                <Sparkles size={15} className="text-rose-500 shrink-0" />
                <span className="text-sm text-gray-500">{lead.form_name}</span>
              </div>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Employee",    value: lead.employee_name || "—" },
              { label: "Source",      value: lead.source || lead.platform || "—" },
              { label: "Sheet",       value: lead.sheet_name || "—" },
              { label: "Form",        value: lead.form_name || "—" },
              { label: "Round Robin", value: lead.round_robin_code || "—" },
              { label: "Submitted",   value: lead.submitted_time ? new Date(lead.submitted_time).toLocaleDateString("en-IN") : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="p-3 rounded-xl" style={{ background: "#fff5f5", border: "1px solid #fecdd3" }}>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</div>
                <div className="text-sm font-semibold text-gray-800 mt-0.5 truncate">{value}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="grid grid-cols-3 gap-3">
            <button onClick={handleCall}
              className="p-4 rounded-xl text-center transition-all hover:scale-105"
              style={{ background: "#fff5f5", border: "1px solid #fecdd3" }}>
              <Phone size={18} className="mx-auto mb-2 text-rose-600" />
              <div className="text-xs text-gray-700">Call</div>
            </button>
            <button onClick={() => setShowEmailModal(true)}
              className="p-4 rounded-xl text-center transition-all hover:scale-105"
              style={{ background: "#fff5f5", border: "1px solid #fecdd3" }}>
              <Mail size={18} className="mx-auto mb-2 text-rose-600" />
              <div className="text-xs text-gray-700">Email</div>
            </button>
            <button onClick={() => setShowScheduler(true)}
              className="p-4 rounded-xl text-center transition-all hover:scale-105"
              style={{ background: "#fff5f5", border: "1px solid #fecdd3" }}>
              <Calendar size={18} className="mx-auto mb-2 text-rose-600" />
              <div className="text-xs text-gray-700">Schedule</div>
            </button>
          </div>

          {/* Schedule mini-form */}
          {showScheduler && (
            <div className="p-4 rounded-xl space-y-3" style={{ background: "#fff5f5", border: "1.5px solid #fecdd3" }}>
              <div className="text-xs font-bold text-rose-700 uppercase tracking-wider">Schedule Meeting</div>
              <input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}
                className="w-full p-2.5 rounded-lg text-sm"
                style={{ background: "#fff", border: "1px solid #fecdd3", color: "#111827" }} />
              <input placeholder="Meeting note (optional)" value={scheduleNote} onChange={e => setScheduleNote(e.target.value)}
                className="w-full p-2.5 rounded-lg text-sm"
                style={{ background: "#fff", border: "1px solid #fecdd3", color: "#111827" }} />
              <div className="flex gap-2">
                <button onClick={() => setShowScheduler(false)}
                  className="flex-1 py-2 rounded-lg text-sm border" style={{ borderColor: "#fecdd3", color: "#6b7280" }}>
                  Cancel
                </button>
                <button onClick={handleScheduleSave}
                  className="flex-1 py-2 rounded-lg text-sm text-white font-medium" style={{ background: "#be123c" }}>
                  Save to Tasks
                </button>
              </div>
            </div>
          )}

          {/* Email modal */}
          {showEmailModal && (
            <div className="p-4 rounded-xl space-y-3" style={{ background: "#fff5f5", border: "1.5px solid #fecdd3" }}>
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-rose-700 uppercase tracking-wider">Email Address</div>
                <button onClick={() => setShowEmailModal(false)} className="text-gray-400 hover:text-red-500">
                  <X size={14} />
                </button>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: "#fff", border: "1px solid #fecdd3" }}>
                <span className="text-sm text-gray-800 flex-1 truncate">{lead.email || "No email"}</span>
                {lead.email && (
                  <button onClick={() => navigator.clipboard.writeText(lead.email)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                    style={{ background: "#be123c", whiteSpace: "nowrap" }}>
                    Copy
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Notes from form_data if available */}
         
{lead.form_data && typeof lead.form_data === "object" && Object.keys(lead.form_data).length > 0 && (() => {
  const entries = Object.entries(lead.form_data).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return null;
  return (
    <div style={{ border: "1px solid #fecdd3", borderRadius: 12, overflow: "hidden" }}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2"
        style={{ background: "#fff1f2", borderBottom: "1px solid #fecdd3" }}>
        <div className="text-xs font-bold text-rose-700 uppercase tracking-wider">Form Data</div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: "#fecdd3", color: "#be123c" }}>
          {entries.length} fields
        </span>
      </div>

      {/* Horizontal scrollable table */}
      <style>{`
        .fd-scroll::-webkit-scrollbar { height: 3px; }
        .fd-scroll::-webkit-scrollbar-track { background: #fff1f2; }
        .fd-scroll::-webkit-scrollbar-thumb { background: #f43f5e; border-radius: 9999px; }
      `}</style>
      <div className="fd-scroll" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 11, width: "max-content", minWidth: "100%" }}>
          {/* Field names as header columns */}
          <thead>
            <tr style={{ background: "#fff5f5" }}>
              {entries.map(([k]) => (
                <th key={k} style={{
                  padding: "8px 14px",
                  textAlign: "left",
                  fontWeight: 700,
                  color: "#be123c",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  fontSize: 10,
                  whiteSpace: "nowrap",
                  borderBottom: "2px solid #fecdd3",
                  borderRight: "1px solid #fef2f2",
                }}>
                  {k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                </th>
              ))}
            </tr>
          </thead>
          {/* Values as a single row */}
          <tbody>
            <tr style={{ background: "#ffffff" }}>
              {entries.map(([k, v]) => (
                <td key={k} style={{
                  padding: "9px 14px",
                  color: "#111827",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  borderRight: "1px solid #fef2f2",
                  maxWidth: 200,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {String(v)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
})()}

          {/* Add Note */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Add Note</div>
            <div className="flex gap-2">
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Type a note..."
                className="flex-1 p-3 rounded-xl text-sm"
                style={{ background: "#fff5f5", border: "1px solid #fecdd3", color: "#111827" }} />
              <button onClick={() => setNote("")} className="px-5 rounded-xl text-white text-sm" style={{ background: "#be123c" }}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT FORM ── */}
      {activeTab === "details" && isEditing && (
        <div className="space-y-4">
          {[
            { label: "Lead Name",     key: "lead_name" },
            { label: "Phone",         key: "phone" },
            { label: "Email",         key: "email" },
            { label: "City",          key: "city" },
            { label: "Business Name", key: "business_name" },
          ].map(({ label, key }) => (
            <label key={key} className="block">
              <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "#be123c" }}>{label}</div>
              <input value={editData[key] || ""} onChange={e => setEdit(key, e.target.value)}
                className="w-full rounded-xl p-3 text-sm"
                style={{ background: "#fff5f5", border: "1px solid #fecdd3", color: "#111827" }} />
            </label>
          ))}

          {/* Status selector */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "#be123c" }}>Status</div>
            <div className="flex gap-2 flex-wrap">
              {["New Lead","Call Back Later","Qualified","Meeting Scheduled","Meeting Done","Hot Lead","Warm Lead","Cold Lead","Not Interested","Converted"].map(s => (
                <button key={s} onClick={() => setEdit("status", s)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border"
                  style={{
                    background: editData.status === s ? "#be123c" : "#fff5f5",
                    color: editData.status === s ? "#fff" : "#be123c",
                    borderColor: editData.status === s ? "#be123c" : "#fecdd3",
                  }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ACTIVITY TAB — status history timeline ── */}
      {activeTab === "activity" && (
        <div className="space-y-3">
          <div className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-3">Status History</div>

          {statusHistory.length === 0 ? (
            /* fallback: show current status as single entry */
            <div className="space-y-2">
              {[
                { status: lead.status || "New Lead", changed_at: lead.updated_at || lead.created_at || new Date().toISOString() },
              ].map((entry, i) => {
                const sc = statusColor(entry.status);
                const Icon = statusIcon(entry.status);
                return (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl"
                    style={{ background: sc.bg, border: `1px solid ${sc.border}` }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: sc.color + "18" }}>
                      <Icon size={14} style={{ color: sc.color }} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold" style={{ color: sc.color }}>{entry.status}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(entry.changed_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="text-center text-[11px] text-gray-300 pt-2">No history found — showing current status</div>
            </div>
          ) : (
            /* real history from DB */
            <div className="relative">
              {/* vertical line */}
              <div className="absolute left-[19px] top-0 bottom-0 w-0.5" style={{ background: "#fce7f3" }} />
              <div className="space-y-3">
                {statusHistory.map((entry, i) => {
                  const sc = statusColor(entry.status || entry.new_status);
                  const Icon = statusIcon(entry.status || entry.new_status);
                  const label = entry.status || entry.new_status || "—";
                  const ts = entry.changed_at || entry.created_at;
                  return (
                    <motion.div key={i}
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="flex items-start gap-3 relative">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 z-10"
                        style={{ background: sc.bg, border: `1.5px solid ${sc.border}` }}>
                        <Icon size={14} style={{ color: sc.color }} />
                      </div>
                      <div className="flex-1 p-3 rounded-xl"
                        style={{ background: sc.bg, border: `1px solid ${sc.border}` }}>
                        <div className="text-sm font-semibold" style={{ color: sc.color }}>{label}</div>
                        {entry.changed_by && (
                          <div className="text-[11px] text-gray-500 mt-0.5">by {entry.changed_by}</div>
                        )}
                        {entry.note && (
                          <div className="text-[11px] text-gray-600 mt-1 italic">"{entry.note}"</div>
                        )}
                        <div className="text-[10px] text-gray-400 mt-1">
                          {ts ? new Date(ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TASKS TAB ── */}
      {activeTab === "tasks" && (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center gap-3 p-3 rounded-xl"
              style={{ background: "#fff5f5", border: "1px solid #fecdd3" }}>
              <input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)}
                className="accent-rose-600 w-4 h-4 cursor-pointer" />
              <div className="flex-1">
                <div className={`text-sm ${task.done ? "line-through text-gray-400" : "text-gray-900"}`}>
                  {task.text}
                </div>
                {task.date && (
                  <div className="text-[10px] text-rose-500 mt-0.5">
 {new Date(task.date).toLocaleString()}
                  </div>
                )}
              </div>
              <button onClick={() => deleteTask(task.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <input value={newTask} onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addTask()} placeholder="Add a task..."
              className="flex-1 p-3 rounded-xl text-sm"
              style={{ background: "#fff5f5", border: "1px solid #fecdd3", color: "#111827" }} />
            <button onClick={addTask} className="px-4 rounded-xl text-white text-sm font-medium" style={{ background: "#be123c" }}>
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// function AddLead({ onClose, showToast }) {
//   const [activeTab, setActiveTab] = useState("basic");
//   const [warmth, setWarmth] = useState("Hot Lead");
//   const [stage, setStage] = useState("New Lead");
//   const [prob, setProb] = useState(50);
//   const [dealVal, setDealVal] = useState("");
//   const [countryCode, setCountryCode] = useState("+91");
//   const [errors, setErrors] = useState({});
//   const [loading, setLoading] = useState(false);

//   const [formData, setFormData] = useState({
//     lead_name: "", phone: "", email: "", city: "", company_name: "",
//     source: "", keyword: "", ad_content: "", campaign_notes: "",
//     win_probability: 50, purchased: "", expected_close_date: "",
//     interactions: 0, next_followup_date: "", mom: "", call_summary: "", notes: "",
//     expected_revenue: "",
//   });

//   const tabs = [
//     { id: "basic",     label: "Basic Info",  icon: Users },
//     { id: "marketing", label: "Marketing",   icon: Sparkles },
//     { id: "pipeline",  label: "Pipeline",    icon: BarChart2 },
//     { id: "followup",  label: "Follow Up",   icon: Calendar },
//   ];

//   const tabIds = tabs.map(t => t.id);
//   const currentIndex = tabIds.indexOf(activeTab);
//   const isLastTab = currentIndex === tabIds.length - 1;
//   const isFirstTab = currentIndex === 0;

//   const setField = (key, val) => {
//     setFormData(prev => ({ ...prev, [key]: val }));
//     setErrors(prev => ({ ...prev, [key]: "" }));
//   };

//   const countryCodes = [
//     { code: "+91", flag: "" },
//     { code: "+1",  flag: "" },
//     { code: "+44", flag: "" },
//     { code: "+61", flag: "" },
//     { code: "+971",flag: "" },
//     { code: "+65", flag: "" },
//   ];

//   const validateTab = (tabId) => {
//     const errs = {};
//     if (tabId === "basic") {
//       if (!formData.lead_name.trim()) errs.lead_name = "Full name is required";
//       if (!formData.phone.trim()) errs.phone = "Phone number is required";
//       else if (!/^\d{10}$/.test(formData.phone.trim())) errs.phone = "Phone must be exactly 10 digits";
//       if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.(com|in|org|net|co|io|edu|gov|uk|au|us)$/i.test(formData.email.trim()))
//         errs.email = "Enter a valid email (e.g. name@domain.com)";
//       if (!formData.city.trim()) errs.city = "City is required";
//       if (!formData.company_name.trim()) errs.company_name = "Business name is required";
//     }
//     if (tabId === "marketing") {
//       if (!formData.source) errs.source = "Lead source is required";
//     }
//     if (tabId === "pipeline") {
//       if (!dealVal.trim()) errs.expected_revenue = "Proposal value is required";
//     }
//     if (tabId === "followup") {
//       if (!formData.next_followup_date) errs.next_followup_date = "Next follow-up date is required";
//     }
//     return errs;
//   };

//   const handleNext = () => {
//     const errs = validateTab(activeTab);
//     if (Object.keys(errs).length > 0) { setErrors(errs); return; }
//     setErrors({});
//     setActiveTab(tabIds[currentIndex + 1]);
//   };

//   const handleBack = () => {
//     setErrors({});
//     if (!isFirstTab) setActiveTab(tabIds[currentIndex - 1]);
//   };

//   const handleCreate = async () => {
//     const errs = validateTab("followup");
//     if (Object.keys(errs).length > 0) { setErrors(errs); return; }
//     setLoading(true);
//     const payload = {
//       ...formData,
//       phone: `${countryCode}${formData.phone}`,
//       temperature: warmth,
//       pipeline_stage: stage,
//       status: stage,
//       win_probability: prob,
//       expected_revenue: formData.expected_revenue || 0,
//     };
//     try {
//       const response = await fetch("http://localhost:5000/api/sales/leads/create", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload),
//       });
//       const data = await response.json();
//       console.log("Create API response:", data);
//       if (data.success) {
//         showToast("Lead created successfully!");
//         onClose(data.lead);
//       } else {
//         showToast(data.message || "Failed to create lead", "error");
//       }
//     } catch (error) {
//       console.error("Create lead error:", error);
//       showToast("Network error, please try again", "error");
//     } finally {
//       setLoading(false);
//     }
//   };

//   const inputStyle = {
//     background: "#fff5f5", border: "1.5px solid #fecdd3", borderRadius: 10,
//     padding: "10px 13px", fontSize: 13, color: "#111827", outline: "none",
//     width: "100%", boxSizing: "border-box", fontFamily: "inherit",
//   };
//   const errorInputStyle = { ...inputStyle, borderColor: "#f43f5e" };
//   const iconFieldWrap = { position: "relative" };
//   const iconStyle = { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#f43f5e", pointerEvents: "none" };
//   const pipelineStagesList = ["New Lead","Contacted","Qualified","Proposal Sent","Negotiation","Converted"];
//   const warmthOptions = [
//     { label: "Hot",  value: "Hot Lead",  style: { background: warmth === "Hot Lead" ? "#be123c" : "#fff1f2", color: warmth === "Hot Lead" ? "#fff" : "#be123c", borderColor: warmth === "Hot Lead" ? "#be123c" : "#fda4af" } },
//     { label: "Warm", value: "Warm Lead", style: { background: warmth === "Warm Lead" ? "#ea580c" : "#fff7ed", color: warmth === "Warm Lead" ? "#fff" : "#c2410c", borderColor: warmth === "Warm Lead" ? "#ea580c" : "#fdba74" } },
//     { label: "Cold", value: "Cold Lead", style: { background: warmth === "Cold Lead" ? "#2563eb" : "#eff6ff", color: warmth === "Cold Lead" ? "#fff" : "#1d4ed8", borderColor: warmth === "Cold Lead" ? "#2563eb" : "#93c5fd" } },
//   ];

//   const ErrMsg = ({ field }) => errors[field] ? (
//     <div style={{ color: "#f43f5e", fontSize: 11, marginTop: 4 }}>{errors[field]}</div>
//   ) : null;

//   return (
//     <div style={{ fontFamily: "inherit" }}>

//       {/* Header */}
//       <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
//         <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,#be123c,#f43f5e)", display: "flex", alignItems: "center", justifyContent: "center" }}>
//           <Users size={18} color="#fff" />
//         </div>
//         <div>
//           <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>New Lead</div>
//           <div style={{ fontSize: 11, color: "#f43f5e", marginTop: 1 }}>Fill in the details below</div>
//         </div>
//       </div>

//       {/* Tab indicators */}
//       <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
//         {tabs.map((tab, i) => {
//           const Icon = tab.icon;
//           const active = activeTab === tab.id;
//           const done = i < currentIndex;
//           return (
//             <div key={tab.id} style={{
//               display: "inline-flex", alignItems: "center", gap: 6,
//               padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
//               fontFamily: "inherit",
//               background: active ? "#be123c" : done ? "#fef2f2" : "#fff5f5",
//               color: active ? "#fff" : done ? "#be123c" : "#9ca3af",
//               border: `1.5px solid ${active ? "#be123c" : done ? "#fda4af" : "#fecdd3"}`,
//             }}>
//               {done ? <CheckCircle2 size={13} /> : <Icon size={13} />}
//               {tab.label}
//             </div>
//           );
//         })}
//       </div>

//       {/* Tab content */}
//       <AnimatePresence mode="wait">

//         {activeTab === "basic" && (
//           <motion.div key="basic" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }}>
//             <SectionDivider label="Contact details" />
//             <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>

//               <FormField label="Full Name" required>
//                 <div style={iconFieldWrap}>
//                   <Users size={14} style={iconStyle} />
//                   <input style={{ ...(errors.lead_name ? errorInputStyle : inputStyle), paddingLeft: 36 }} placeholder="e.g. Ananya Sharma" value={formData.lead_name} onChange={e => setField("lead_name", e.target.value)} />
//                 </div>
//                 <ErrMsg field="lead_name" />
//               </FormField>

//               <FormField label="Phone Number" required>
//                 <div style={{ display: "flex", gap: 6 }}>
//                   <select value={countryCode} onChange={e => setCountryCode(e.target.value)} style={{ ...inputStyle, width: "auto", paddingRight: 8, flexShrink: 0 }}>
//                     {countryCodes.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
//                   </select>
//                   <input style={{ ...(errors.phone ? errorInputStyle : inputStyle), flex: 1 }} placeholder="98765 43210" value={formData.phone} maxLength={10} onChange={e => setField("phone", e.target.value.replace(/\D/g, ""))} />
//                 </div>
//                 <ErrMsg field="phone" />
//               </FormField>

//               <FormField label="Email Address">
//                 <div style={iconFieldWrap}>
//                   <Mail size={14} style={iconStyle} />
//                   <input style={{ ...(errors.email ? errorInputStyle : inputStyle), paddingLeft: 36 }} placeholder="name@company.com" value={formData.email} onChange={e => setField("email", e.target.value)} />
//                 </div>
//                 <ErrMsg field="email" />
//               </FormField>

//               <FormField label="City" required>
//                 <input style={errors.city ? errorInputStyle : inputStyle} placeholder="e.g. Mumbai" value={formData.city} onChange={e => setField("city", e.target.value)} />
//                 <ErrMsg field="city" />
//               </FormField>

//               <FormField label="Business Name" required fullWidth>
//                 <input style={errors.company_name ? errorInputStyle : inputStyle} placeholder="e.g. Penguin India Pvt. Ltd." value={formData.company_name} onChange={e => setField("company_name", e.target.value)} />
//                 <ErrMsg field="company_name" />
//               </FormField>

//             </div>
//           </motion.div>
//         )}

//         {activeTab === "marketing" && (
//           <motion.div key="marketing" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }}>
//             <SectionDivider label="Campaign attribution" />
//             <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>

//               <FormField label="Lead Source" required>
//                 <ALSelect options={["Website","Instagram","Facebook Ads","Google Ads","Referral","Cold Call","LinkedIn","WhatsApp","Walk-in"]} value={formData.source} onChange={val => setField("source", val)} error={!!errors.source} />
//                 <ErrMsg field="source" />
//               </FormField>

//               <FormField label="Keyword / Adset">
//                 <input style={inputStyle} placeholder="e.g. crm software india" value={formData.keyword} onChange={e => setField("keyword", e.target.value)} />
//               </FormField>

//               <FormField label="Ad / Content">
//                 <input style={inputStyle} placeholder="e.g. summer-campaign-v2" value={formData.ad_content} onChange={e => setField("ad_content", e.target.value)} />
//               </FormField>

//               <FormField label="Campaign Notes" fullWidth>
//                 <textarea rows={3} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} placeholder="Any additional campaign context..." value={formData.campaign_notes} onChange={e => setField("campaign_notes", e.target.value)} />
//               </FormField>

//             </div>
//           </motion.div>
//         )}

//         {activeTab === "pipeline" && (
//           <motion.div key="pipeline" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }}>
//             <SectionDivider label="Deal details" />
//             <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>

//               <FormField label="Pipeline Stage" fullWidth>
//                 <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
//                   {pipelineStagesList.map(s => (
//                     <button key={s} onClick={() => setStage(s)} style={{ padding: "7px 13px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all .15s", background: stage === s ? "#be123c" : "#fff5f5", color: stage === s ? "#fff" : "#be123c", border: `1.5px solid ${stage === s ? "#be123c" : "#fecdd3"}` }}>{s}</button>
//                   ))}
//                 </div>
//               </FormField>

//               <FormField label="Lead Warmth" fullWidth>
//                 <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
//                   {warmthOptions.map(w => (
//                     <button key={w.value} onClick={() => setWarmth(w.value)} style={{ padding: "8px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "1.5px solid", transition: "all .15s", ...w.style }}>{w.label}</button>
//                   ))}
//                 </div>
//               </FormField>

//               <FormField label="Proposal Value (₹)" required>
//                 <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
//                   <span style={{ fontSize: 16, fontWeight: 700, color: "#be123c" }}>₹</span>
//                   <input style={{ ...(errors.expected_revenue ? errorInputStyle : inputStyle), flex: 1 }} placeholder="2,50,000" value={dealVal} onChange={e => { setDealVal(e.target.value); setField("expected_revenue", e.target.value.replace(/\D/g, "")); }} />
//                 </div>
//                 <div style={{ background: "#fce7f3", borderRadius: 99, height: 5, marginTop: 8, overflow: "hidden" }}>
//                   <div style={{ height: "100%", borderRadius: 99, background: "linear-gradient(90deg,#be123c,#f43f5e)", width: `${Math.min((parseInt(dealVal.replace(/\D/g, "")) / 1000000) * 100 || 0, 100)}%`, transition: "width .3s ease" }} />
//                 </div>
//                 <ErrMsg field="expected_revenue" />
//               </FormField>

//               <FormField label={`Win Probability — ${prob}%`}>
//                 <input type="range" min={0} max={100} step={1} value={prob} onChange={e => { setProb(Number(e.target.value)); setField("win_probability", Number(e.target.value)); }} style={{ width: "100%", accentColor: "#be123c" }} />
//               </FormField>

//               <FormField label="Purchased">
//                 <input style={inputStyle} placeholder="Product / plan purchased" value={formData.purchased} onChange={e => setField("purchased", e.target.value)} />
//               </FormField>

//               <FormField label="Expected Close Date">
//                 <input type="date" style={inputStyle} value={formData.expected_close_date} onChange={e => setField("expected_close_date", e.target.value)} />
//               </FormField>

//             </div>
//           </motion.div>
//         )}

//         {activeTab === "followup" && (
//           <motion.div key="followup" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }}>
//             <SectionDivider label="Follow-up log" />
//             <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>

//               <FormField label="Interactions (count)">
//                 <input type="number" style={inputStyle} placeholder="e.g. 3" min={0} value={formData.interactions} onChange={e => setField("interactions", e.target.value)} />
//               </FormField>

//               <FormField label="Next Follow-up Date" required>
//                 <input type="date" style={errors.next_followup_date ? errorInputStyle : inputStyle} value={formData.next_followup_date} onChange={e => setField("next_followup_date", e.target.value)} />
//                 <ErrMsg field="next_followup_date" />
//               </FormField>

//               <FormField label="MOM (Minutes of Meeting)" fullWidth>
//                 <textarea rows={4} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} placeholder="Key points discussed..." value={formData.mom} onChange={e => setField("mom", e.target.value)} />
//               </FormField>

//               <FormField label="Call Summary" fullWidth>
//                 <textarea rows={4} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} placeholder="Summary of the last call..." value={formData.call_summary} onChange={e => setField("call_summary", e.target.value)} />
//               </FormField>

//               <FormField label="Meeting Notes" fullWidth>
//                 <textarea rows={4} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} placeholder="Observations, objections, next steps..." value={formData.notes} onChange={e => setField("notes", e.target.value)} />
//               </FormField>

//             </div>
//           </motion.div>
//         )}

//       </AnimatePresence>

//       {/* Footer */}
//       <div style={{ display: "flex", gap: 12, marginTop: 28, paddingTop: 20, borderTop: "1px solid #fce7f3", flexWrap: "wrap" }}>
//         {isFirstTab ? (
//           <button onClick={onClose} style={{ flex: 1, minWidth: 100, padding: 12, borderRadius: 12, border: "1.5px solid #fecdd3", background: "#fff", color: "#6b7280", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
//             Cancel
//           </button>
//         ) : (
//           <button onClick={handleBack} style={{ flex: 1, minWidth: 100, padding: 12, borderRadius: 12, border: "1.5px solid #fecdd3", background: "#fff", color: "#6b7280", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
//             ← Back
//           </button>
//         )}

//         {!isLastTab ? (
//           <button onClick={handleNext} style={{ flex: 1, minWidth: 100, padding: 12, borderRadius: 12, border: "none", background: "linear-gradient(135deg,#be123c,#f43f5e)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
//             Next →
//           </button>
//         ) : (
//           <button onClick={handleCreate} disabled={loading} style={{ flex: 1, minWidth: 100, padding: 12, borderRadius: 12, border: "none", background: loading ? "#fda4af" : "linear-gradient(135deg,#be123c,#f43f5e)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
//             {loading ? "Creating..." : "Create Lead"}
//           </button>
//         )}
//       </div>
//     </div>
//   );
// }

/* ── Helper sub-components ── */

// function SectionDivider({ label }) {
//   return (
//     <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
//       <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#f43f5e", whiteSpace: "nowrap" }}>{label}</span>
//       <div style={{ flex: 1, height: 1, background: "#fce7f3" }} />
//     </div>
//   );
// }

// function FormField({ label, children, fullWidth = false, required = false }) {
//   return (
//     <div style={{ display: "flex", flexDirection: "column", gap: 5, ...(fullWidth ? { gridColumn: "1 / -1" } : {}) }}>
//       <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "#be123c" }}>
//         {label}{required && <span style={{ color: "#f43f5e", marginLeft: 2 }}>*</span>}
//       </label>
//       {children}
//     </div>
//   );
// }

// function ALSelect({ options, value = "", onChange }) {
//   return (
//     <select
//       value={value}
//       onChange={e => onChange && onChange(e.target.value)}
//       style={{
//         background: "#fff5f5", border: "1.5px solid #fecdd3", borderRadius: 10,
//         padding: "10px 36px 10px 13px", fontSize: 13, color: "#111827",
//         outline: "none", width: "100%", fontFamily: "inherit", appearance: "none",
//         backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23f43f5e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
//         backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
//       }}
//     >
//       <option value="">Select</option>
//       {options.map((o) => <option key={o}>{o}</option>)}
//     </select>
//   );
// }
function Field({ label }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-rose-700 mb-1">
        {label}
      </div>

      <input
        className="w-full rounded-xl p-3 text-sm"
        style={{
          background: "#fff5f5",
          border: "1px solid #fecdd3",
          color: "#111827",
        }}
      />
    </label>
  );
}

function SelectField({ label, options }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-rose-700 mb-1">
        {label}
      </div>

      <select
        className="w-full rounded-xl p-3 text-sm"
        style={{
          background: "#fff5f5",
          border: "1px solid #fecdd3",
          color: "#111827",
        }}
      >
        <option>Select</option>

        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
function Info({ label, value }) {
  return (
    <div className="p-3 rounded-xl border" style={{ background: "#fff5f5", borderColor: "#fecdd3" }}>
      <div className="text-[10px] uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-sm font-medium mt-1 text-gray-800">{value}</div>
    </div>
  );
}