import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { apiGet, apiPost, apiPut, apiDelete, invalidateCache, apiUrl, getApiBase } from "../lib/api.js";
import { getCrmHeaders, getAuthHeaders } from "../lib/crmContext.js";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import {
  LayoutGrid, List, Search, Plus, FileText, Tag, Clock, CheckCircle2, X,
  TrendingUp, TrendingDown, Zap, Users, Palette, Code, Megaphone, Lightbulb,
  Edit2, Trash2, Copy, Archive, Download, MoreVertical, GripVertical,
  Paperclip, MessageSquare, Activity, Eye, UserCheck, GitBranch, AlertTriangle,
  ChevronDown, ChevronUp, ChevronRight, Star, BookOpen, Send, Filter, SortAsc, Check,
  RotateCcw, Save, RefreshCw, Phone, PhoneCall, Sparkles, Pencil, ExternalLink,
} from "lucide-react";


/* ─── Utility: merge class names ─── */
const cn = (...classes) => classes.filter(Boolean).join(" ");

import { StatCard } from "../components/Primitives.jsx";
import { useAdmin } from "../context/AdminContext.jsx";

/* ─── Tone helpers (kept from original) ─── */
const priorityTone = (p) =>
  ({ Critical: "destructive", High: "warning", Medium: "primary", Low: "muted" }[p] ?? "muted");
const statusTone = (s) =>
  ({ Active: "success", Review: "warning", Draft: "muted", Archived: "secondary" }[s] ?? "muted");

/* ─── Badge (kept from original) ─── */
function Badge({ tone = "muted", className = "", children }) {
  const styles = {
    primary:     "bg-rose-100 text-rose-700 border-rose-300",
    success:     "bg-green-100 text-green-700 border-green-300",
    warning:     "bg-amber-100 text-amber-700 border-amber-300",
    destructive: "bg-red-100 text-red-700 border-red-300",
    info:        "bg-sky-100 text-sky-700 border-sky-300",
    muted:       "bg-rose-50 text-rose-400 border-rose-200",
    secondary:   "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border",
      styles[tone] ?? styles.muted, className
    )}>
      {children}
    </span>
  );
}

/* ─── GlassCard (kept from original) ─── */
function GlassCard({ className = "", children, ...props }) {
  return (
    <div
      className={cn("rounded-[24px] border border-rose-100 bg-gradient-to-br from-white via-[#fff9fa] to-[#fff3f4] shadow-sm", className)}
      {...props}
    >
      {children}
    </div>
  );
}

/* ─── Field wrapper ─── */
function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-rose-700 mb-1">{label}</div>
      {children}
    </label>
  );
}

/* ─── Toast notification ─── */
function Toast({ toasts, removeToast }) {
  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className={cn(
              "pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium shadow-lg",
              t.type === "success" && "bg-green-50 border-green-200 text-green-700",
              t.type === "error"   && "bg-red-50 border-red-200 text-red-700",
              t.type === "info"    && "bg-rose-50 border-rose-200 text-rose-700",
            )}
          >
            {t.type === "success" && <Check className="w-4 h-4 shrink-0" />}
            {t.type === "error"   && <X className="w-4 h-4 shrink-0" />}
            {t.type === "info"    && <Zap className="w-4 h-4 shrink-0" />}
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ─── Confirmation modal ─── */
function ConfirmModal({ open, onConfirm, onCancel, title, message, confirmLabel = "Delete", danger = true }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            className="relative z-10 w-full max-w-sm rounded-2xl border border-rose-100 bg-white shadow-2xl p-6"
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className={cn(
                "w-10 h-10 rounded-xl grid place-items-center shrink-0",
                danger ? "bg-red-500/15 border border-red-500/30" : "bg-amber-500/15 border border-amber-500/30"
              )}>
                <AlertTriangle className={cn("w-5 h-5", danger ? "text-red-400" : "text-amber-400")} />
              </div>
              <div>
                <div className="font-semibold text-sm text-gray-800">{title}</div>
                <div className="text-xs text-gray-500 mt-1">{message}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={onCancel} className="flex-1 py-2 rounded-xl border border-border text-sm hover:bg-secondary/40 transition-colors text-muted-foreground">
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className={cn(
                  "flex-1 py-2 rounded-xl text-sm font-medium transition-all",
                  danger
                    ? "bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30"
                    : "bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30"
                )}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Drawer ─── */
function Drawer({ open, onClose, title, children, width = "max-w-2xl", zIndex = 60, headerRight }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 flex" style={{ zIndex }}>
          <motion.div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className={cn("relative ml-auto h-full w-full flex flex-col bg-white border-l border-rose-100 shadow-2xl overflow-hidden", width)}
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-rose-100 shrink-0 bg-rose-50/50">
              <div className="font-semibold text-sm text-gray-800 truncate pr-2">{title}</div>
              <div className="flex items-center gap-2 shrink-0">
                {headerRight}
                <button

onClick={onClose}

className="w-10 h-10 rounded-lg text-[#be123c]  bg-rose-50/60 hover:bg-rose-100 transition"

style={{ fontWeight: 700 }}

>

✕

</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 bg-white">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ─── Initial mock data (same as original) ─── */
const INITIAL_SOPS = [
  {
    id: 1,
    title: "Enterprise Lead Qualification",
    description: "Complete playbook for qualifying enterprise inbound leads.",
    category: "Sales Call",
    status: "Active",
    priority: "High",
    version: "v2.1",
    creator: "Alex Morgan",
    created: "2024-01-15",
    updated: "2024-03-10",
    tags: ["leads", "CRM", "BANT"],
    department: "Revenue",
    estimatedTime: "45 min",
    readCount: 124,
    acknowledgedCount: 89,
    comments: [],
    attachments: [],
    revisions: [{ version: "v2.1", date: "2024-03-10", author: "Alex Morgan", note: "Updated CRM steps" }],
    // New fields
    script: "Hi [Name], this is [Your Name] from [Company].\nI wanted to connect regarding [specific reason].\nDo you have 2 minutes to talk?",
    questions: ["What is your current process for X?", "What challenges are you facing?", "What does success look like for you?", "Who else is involved in this decision?"],
    frameworks: ["BANT Framework", "SPIN Selling", "Challenger Sale"],
    steps: ["Review lead source and initial data", "Score lead using BANT criteria", "Enter qualified lead into CRM", "Assign to sales rep within 24h", "Send automated welcome sequence"],
  },
  {
    id: 2,
    title: "Post-Call Follow Up Process",
    description: "Standardized follow-up workflow after every sales call.",
    category: "After Call",
    status: "Active",
    priority: "Critical",
    version: "v3.0",
    creator: "Sam Rivera",
    created: "2024-02-01",
    updated: "2024-03-15",
    tags: ["follow-up", "CRM", "email"],
    department: "Sales",
    estimatedTime: "30 min",
    readCount: 98,
    acknowledgedCount: 75,
    comments: [],
    attachments: [],
    revisions: [{ version: "v3.0", date: "2024-03-15", author: "Sam Rivera", note: "Added CRM steps" }],
    script: null,
    questions: null,
    frameworks: ["MEDDIC", "Follow-up cadence model"],
    steps: ["Update CRM with call notes", "Send follow-up email within 2 hours", "Schedule next touchpoint", "Share relevant resources", "Log next action in pipeline"],
  },
  {
    id: 3,
    title: "Client Meeting Agenda",
    description: "Structured agenda for running productive client meetings.",
    category: "During Meeting",
    status: "Active",
    priority: "High",
    version: "v1.2",
    creator: "Jordan Kim",
    created: "2024-02-10",
    updated: "2024-03-01",
    tags: ["meeting", "agenda", "client"],
    department: "Sales",
    estimatedTime: "60 min",
    readCount: 45,
    acknowledgedCount: 30,
    comments: [],
    attachments: [],
    revisions: [{ version: "v1.2", date: "2024-03-01", author: "Jordan Kim", note: "Added discovery section" }],
    script: "Welcome [Client], thank you for joining.\nToday we'll cover [agenda items].\nLet's start with a quick recap of where we left off.",
    questions: ["What has changed since our last conversation?", "Are there any new stakeholders involved?", "What are your top priorities this quarter?"],
    frameworks: ["MEDDPICC", "Solution Selling"],
    steps: ["Send agenda 24h before", "Open with rapport building", "Review previous action items", "Present solution/demo", "Handle objections", "Agree on next steps"],
  },
  {
    id: 4,
    title: "Post-Meeting Action Plan",
    description: "Process for capturing and executing action items after client meetings.",
    category: "After Meeting",
    status: "Active",
    priority: "Critical",
    version: "v4.1",
    creator: "Casey Chen",
    created: "2024-01-20",
    updated: "2024-03-20",
    tags: ["action-items", "MOM", "follow-up"],
    department: "Sales",
    estimatedTime: "45 min",
    readCount: 210,
    acknowledgedCount: 195,
    comments: [],
    attachments: [],
    revisions: [{ version: "v4.1", date: "2024-03-20", author: "Casey Chen", note: "Added MOM template" }],
    script: null,
    questions: null,
    frameworks: ["MOM Framework", "Action Item Tracking"],
    steps: ["Write meeting summary within 1 hour", "List all action items with owners", "Send MOM to all attendees", "Update CRM opportunity stage", "Schedule follow-up if needed"],
  },
  {
    id: 5,
    title: "Deal Closing Checklist",
    description: "Step-by-step process for closing deals and onboarding new clients.",
    category: "After Closing",
    status: "Active",
    priority: "Critical",
    version: "v1.0",
    creator: "Riley Johnson",
    created: "2024-03-01",
    updated: "2024-03-05",
    tags: ["closing", "onboarding", "contract"],
    department: "Sales",
    estimatedTime: "2 hrs",
    readCount: 12,
    acknowledgedCount: 5,
    comments: [],
    attachments: [],
    revisions: [{ version: "v1.0", date: "2024-03-01", author: "Riley Johnson", note: "Initial draft" }],
    script: null,
    questions: null,
    frameworks: ["Closing Framework", "Handoff Protocol"],
    steps: ["Get signed contract", "Collect payment/PO", "Introduce to CS team", "Send welcome kit", "Schedule kickoff call", "Update CRM to Closed Won"],
  },
];

/* ─── KPI config ─── */
const categoryConfig = {
  "All SOPs":       { icon: LayoutGrid,  glowColor: "225, 29, 72", trend: "+12%", trendUp: true  },
  "Sales Call":     { icon: PhoneCall,   glowColor: "225, 29, 72", trend: "+3%",  trendUp: true  },
  "After Call":     { icon: Phone,       glowColor: "225, 29, 72", trend: "+2%",  trendUp: true  },
  "During Meeting": { icon: Users,       glowColor: "225, 29, 72", trend: "+4%",  trendUp: true  },
  "After Meeting":  { icon: CheckCircle2, glowColor: "225, 29, 72", trend: "+1%", trendUp: true  },
  "After Closing":  { icon: Star,        glowColor: "225, 29, 72", trend: "+5%",  trendUp: true  },
};

/* ─── KPI Card ─── */
function KPICard({ c }) {
  const cfg = categoryConfig[c.name] || { icon: FileText, glowColor: "225, 29, 72", trend: "+0%", trendUp: true };
  const Icon = cfg.icon;

  const toneMap = {
    "All SOPs":       "purple",
    "Sales Call":     "success",
    "After Call":     "warning",
    "During Meeting": "info",
    "After Meeting":  "primary",
    "After Closing":  "indigo",
  };

  const tone = toneMap[c.name] || "primary";

  return (
    <StatCard
      label={c.name}
      value={c.count}
      change={cfg.trend}
      sub="vs last period"
      icon={Icon}
      tone={tone}
      hover
    />
  );
}

/* ─── Activity Timeline ─── */
function ActivityTimeline({ sop }) {
  const events = [
    { icon: GitBranch, color: "text-sky-800", bg: "bg-sky-500/15", label: `Version ${sop.version} published`, time: sop.updated },
    { icon: UserCheck, color: "text-green-800", bg: "bg-green-500/15", label: `${sop.acknowledgedCount} employees acknowledged`, time: "Last week" },
    { icon: Eye, color: "text-purple-800", bg: "bg-purple-500/15", label: `${sop.readCount} total reads`, time: "This month" },
    { icon: Edit2, color: "text-amber-800", bg: "bg-amber-500/15", label: "SOP reviewed and updated", time: sop.updated },
    { icon: CheckCircle2, color: "text-green-800", bg: "bg-green-500/15", label: "Manager approval received", time: sop.created },
  ];
  return (
    <div className="space-y-2">
      {events.map((e, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className={cn("w-9 h-9 rounded-lg grid place-items-center shrink-0 border border-primary/80", e.bg)}>
            <e.icon className={cn("w-3.5 h-3.5", e.color)} />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="text-xs text-gray-700">{e.label}</div>
            <div className="text-[10px] text-gray-700 mt-0.5">{e.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Comments Section ─── */
function CommentsSection({ sop, onAddComment, onUpdateComment, onDeleteComment }) {
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  const startEdit = (c) => {
    setEditingId(c.id);
    setEditText(c.text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const submitEdit = (c) => {
    if (editText.trim()) {
      onUpdateComment(sop.id, c.id, editText.trim());
      setEditingId(null);
      setEditText("");
    }
  };

  return (
    <div className="space-y-3">
      {sop.comments.length === 0 && (
        <div className="text-xs text-rose-700 text-center py-4 border border-dashed border-rose-700 rounded-xl">
          No comments yet. Be the first to comment.
        </div>
      )}
      {sop.comments.map((c) => (
        <div key={c.id} className="flex gap-2.5 group">
          <div className="w-7 h-7 rounded-full bg-rose-100 border border-rose-200 grid place-items-center shrink-0 text-[10px] font-semibold text-rose-700">
            {(c.author || "?").split(" ").map(n => n[0]).join("").slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium text-rose-800">{c.author}</span>
                <span className="text-[10px] text-gray-400">{c.time}</span>
              </div>
              {/* Edit / Delete buttons */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={() => startEdit(c)}
                  className="p-1 rounded hover:bg-rose-50 text-gray-400 hover:text-rose-600 transition-colors"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onDeleteComment(sop.id, c.id)}
                  className="p-1 rounded hover:bg-rose-50 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {editingId === c.id ? (
              <div className="mt-1 space-y-1">
                <textarea
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  rows={2}
                  className="w-full text-xs p-2 border border-rose-300 rounded-lg bg-white text-rose-800 resize-none focus:outline-none focus:ring-2 focus:ring-rose-300/40"
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={() => submitEdit(c)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-rose-600 text-white hover:bg-rose-700 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-medium border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-rose-800 mt-0.5 p-2.5 rounded-lg bg-rose-50/60 border border-rose-100">
                {c.text}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Add comment input */}
      <div className="flex gap-2 items-start pt-1">
        <div className="w-7 h-7 rounded-full bg-rose-100 border border-rose-200 grid place-items-center shrink-0 text-[10px] font-semibold text-rose-700">
          ME
        </div>
        <div className="flex-1 relative">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Add a comment…"
            rows={2}
            className="w-full resize-none text-xs p-2.5 pr-8 border border-rose-200 rounded-lg bg-white text-rose-800 placeholder:text-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-300/40"
          />
          <button
            onClick={() => { if (text.trim()) { onAddComment(sop.id, text); setText(""); } }}
            className="absolute right-2 bottom-2 p-1.5 rounded-lg text-rose-400 hover:bg-rose-100 transition-colors"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Analytics Strip ─── */
function AnalyticsStrip({ sop }) {
  const pct = sop.readCount > 0 ? Math.round((sop.acknowledgedCount / sop.readCount) * 100) : 0;
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: "Total Reads", value: sop.readCount, icon: Eye, color: "text-sky-400" },
        { label: "Acknowledged", value: sop.acknowledgedCount, icon: UserCheck, color: "text-green-400" },
        { label: "Ack. Rate", value: `${pct}%`, icon: Star, color: "text-amber-400" },
      ].map((s) => (
        <div key={s.label} className="p-3 rounded-xl bg-rose-50/60 border border-rose-700 text-center">
          <s.icon className={cn("w-4 h-4 mx-auto mb-1.5", s.color)} />
          <div className="text-base font-bold tabular-nums text-rose-800">{s.value}</div>
          <div className="text-[10px] text-gray-700 mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ─── SOP Detail Drawer (enhanced) ─── */
function SOPDetailDrawer({ sop, onClose, onEdit, onDelete, onDuplicate, onArchive, onAddComment, onUpdateComment, onDeleteComment }) {
  const [copiedScriptIdx, setCopiedScriptIdx] = useState(null);

  const copyScript = (text, idx) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopiedScriptIdx(idx);
    setTimeout(() => setCopiedScriptIdx(null), 2000);
  };

  return (
    <Drawer
      open={!!sop}
      onClose={onClose}
      title={sop?.title || ""}
      width="max-w-2xl"
      zIndex={60}
      headerRight={
        sop && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onEdit(sop)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-rose-700 text-rose-700 hover:text-rose-700 hover:bg-rose-700 hover:text-white transition-all"
            >
              <Edit2 className="w-3 h-3" />
              <span className="hidden sm:inline">Edit</span>
            </button>
            <button
              onClick={() => onDuplicate(sop)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-rose-700 text-rose-700 hover:text-rose-700 hover:bg-rose-700 hover:text-white transition-all"
            >
              <Copy className="w-3 h-3" />
              <span className="hidden sm:inline">Duplicate</span>
            </button>
            <button
              onClick={() => onDelete(sop)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-rose-700 text-rose-700 hover:text-rose-700 hover:bg-rose-700 hover:text-white transition-all"
            >
              <Trash2 className="w-3 h-3" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          </div>
        )
      }
    >
      {sop && (
        <div className="space-y-5">
          {/* Status badges */}
          <div className="flex flex-wrap items-center gap-2">
            {(sop.sop_code || sop.sopCode || sop.id) && (
              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-200">
                {sop.sop_code || sop.sopCode || (typeof sop.id === "number" ? `SOP-${String(sop.id).padStart(3, "0")}` : sop.id)}
              </span>
            )}
            <Badge tone={statusTone(sop.status)}>{sop.status}</Badge>
            <Badge tone={priorityTone(sop.priority)}>{sop.priority}</Badge>
            <Badge tone="muted">{sop.category}</Badge>
            <Badge tone="info">{sop.version}</Badge>
            {(sop.services || [sop.service]).filter(Boolean).map(s => (
              <span key={s} className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                {s}
              </span>
            ))}
            {sop.status !== "Archived" && (
              <button
                onClick={() => onArchive(sop)}
                className="inline-flex items-center gap-1 text-[10px] text-rose-500 hover:text-amber-400 border border-rose-600 hover:border-amber-500/30 px-2 py-0.5 rounded-md transition-all ml-auto"
              >
                <Archive className="w-3 h-3" /> Archive
              </button>
            )}
          </div>

          {/* Attached Document Banner */}
          {(sop.attachment_url || sop.attachment_name || (Array.isArray(sop.attachments) && sop.attachments.length > 0)) && (
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-rose-50 via-pink-50 to-amber-50 border border-rose-200 shadow-sm">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white border border-rose-200 grid place-items-center shrink-0 shadow-sm">
                  <FileText className="w-4 h-4 text-rose-600" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">
                    {sop.attachment_name || (Array.isArray(sop.attachments) && sop.attachments[0]) || "Uploaded SOP Document"}
                  </div>
                  <div className="text-[10px] text-rose-700 font-medium flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Original Source Document
                  </div>
                </div>
              </div>
              {(sop.attachment_url || (Array.isArray(sop.attachments) && sop.attachments[0])) && (
                <a
                  href={(() => {
                    const raw = sop.attachment_url || sop.attachments[0];
                    if (raw.startsWith("http")) return raw;
                    const base = getApiBase();
                    return `${base}${raw.startsWith("/") ? "" : "/"}${raw}`;
                  })()}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 flex items-center gap-1.5 transition shadow-sm shrink-0"
                >
                  <Download className="w-3.5 h-3.5" /> View / Download
                </a>
              )}
            </div>
          )}

          {/* Creator + meta */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-rose-50/60 border border-rose-200">
            <div className="w-10 h-10 rounded-full gradient-primary grid place-items-center shrink-0 text-sm font-bold text-primary-foreground shadow-sm">
              {(sop.creator || "Admin").split(" ").map(n => n[0]).join("").slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-rose-900">{sop.creator || "Admin"}</div>
              <div className="text-[11px] text-slate-600 font-medium">{sop.department || "Operations"} · Created {sop.created || "Recently"}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] text-slate-500 font-medium">Estimated Time</div>
              <div className="text-xs font-bold mt-0.5 flex items-center gap-1 justify-end text-rose-700">
                <Clock className="w-3 h-3 text-rose-600" />
                {sop.estimatedTime || "15 min"}
              </div>
            </div>
          </div>

          {/* Analytics strip */}
          <AnalyticsStrip sop={sop} />

          {/* Overview content */}
          <div className="space-y-4 pt-1">
            {/* Description */}
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider text-rose-800 mb-1.5 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-rose-600" /> Scope & Description
              </div>
              <p className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded-xl border border-rose-100 shadow-sm whitespace-pre-wrap">
                {sop.description}
              </p>
            </div>

            {/* Frameworks */}
            {sop.frameworks?.length > 0 && (
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-rose-800 mb-1.5 flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5 text-rose-600" /> Frameworks & Methodologies
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sop.frameworks.map(f => <Badge key={f} tone="info">{f}</Badge>)}
                </div>
              </div>
            )}

            {/* Scripts */}
            {sop.scripts?.length > 0 ? (
              <div className="space-y-3">
                <div className="text-xs font-extrabold uppercase tracking-wider text-rose-800 flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5 text-rose-600" /> Spoken Dialogue Scripts ({sop.scripts.length})
                </div>
                {sop.scripts.map((scr, idx) => (
                  <div key={idx} className="space-y-1.5 bg-white p-3.5 rounded-xl border border-rose-100 shadow-sm relative group">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-rose-900 uppercase tracking-wide flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-600" />
                        {scr.heading || `Script Stage ${idx + 1}`}
                      </div>
                      <button
                        type="button"
                        onClick={() => copyScript(scr.content, idx)}
                        className="text-[10px] font-bold text-slate-500 hover:text-rose-700 bg-rose-50/70 hover:bg-rose-100 px-2 py-1 rounded-md transition flex items-center gap-1"
                      >
                        {copiedScriptIdx === idx ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                        {copiedScriptIdx === idx ? "Copied" : "Copy Script"}
                      </button>
                    </div>
                    <pre className="text-xs text-slate-800 bg-rose-50/40 border border-rose-100/80 rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed">
                      {scr.content}
                    </pre>
                  </div>
                ))}
              </div>
            ) : (
              sop.script && (
                <div>
                  <div className="text-xs font-extrabold uppercase tracking-wider text-rose-800 mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5 text-rose-600" /> Spoken Dialogue Script</span>
                    <button
                      type="button"
                      onClick={() => copyScript(sop.script, 999)}
                      className="text-[10px] font-bold text-slate-500 hover:text-rose-700 bg-rose-50/70 hover:bg-rose-100 px-2 py-1 rounded-md transition flex items-center gap-1"
                    >
                      {copiedScriptIdx === 999 ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                      {copiedScriptIdx === 999 ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="text-xs text-slate-800 bg-rose-50/40 border border-rose-100 rounded-xl p-3 whitespace-pre-wrap font-mono leading-relaxed">
                    {sop.script}
                  </pre>
                </div>
              )
            )}

            {/* Questions & Answers / Objections */}
            {sop.questions_answers?.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-extrabold uppercase tracking-wider text-rose-800 flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5 text-rose-600" /> Question & Answer Guidelines / Objections ({sop.questions_answers.length})
                </div>
                <div className="space-y-2">
                  {sop.questions_answers.map((qa, i) => (
                    <div key={i} className="p-3 rounded-xl bg-white border border-rose-100 shadow-sm space-y-1.5">
                      <div className="text-xs font-bold text-slate-900 flex items-start gap-1.5">
                        <span className="text-rose-700 font-extrabold shrink-0">Q{i + 1}:</span>
                        <span>{qa.question}</span>
                      </div>
                      {qa.answer && (
                        <div className="text-xs text-slate-700 pl-4 border-l-2 border-rose-400 ml-1 py-1 mt-1 leading-relaxed bg-rose-50/40 rounded p-2">
                          <span className="font-bold text-rose-900 mr-1">Guideline / Response:</span>
                          {qa.answer}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Questions list */}
            {sop.questions?.length > 0 && (!sop.questions_answers || sop.questions_answers.length === 0) && (
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-rose-800 mb-2 flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5 text-rose-600" /> Discovery & Qualification Questions ({sop.questions.length})
                </div>
                <ol className="space-y-1.5">
                  {sop.questions.map((q, i) => (
                    <li key={i} className="flex gap-2 text-xs text-slate-800 bg-white p-2.5 rounded-lg border border-rose-100 shadow-sm">
                      <span className="text-rose-700 font-bold shrink-0">{i + 1}.</span>
                      <span className="font-medium">{q}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Instruction Steps */}
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider text-rose-800 mb-2 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-rose-600" /> Actionable Execution Steps ({sop.steps?.length || 0})
              </div>
              <ol className="space-y-2">
                {(sop.steps || []).map((st, i) => (
                  <li key={i} className="flex gap-3 p-3 rounded-xl bg-white border border-rose-100 shadow-sm items-start">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-rose-600 to-rose-800 grid place-items-center text-[11px] font-bold shrink-0 text-white shadow-sm mt-0.5">
                      {i + 1}
                    </div>
                    <div className="text-xs text-slate-800 leading-relaxed font-medium">{st}</div>
                  </li>
                ))}
              </ol>
            </div>

            {/* Full Extracted PDF Content */}
            {sop.full_content && (
              <div className="space-y-2">
                <div className="text-xs font-extrabold uppercase tracking-wider text-rose-800 flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5 text-rose-600" /> Full Extracted Source Document
                </div>
                <div className="p-4 rounded-xl bg-slate-900 text-slate-100 text-xs whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-y-auto border border-slate-800 shadow-inner">
                  {sop.full_content}
                </div>
              </div>
            )}

            {/* Tags */}
            {sop.tags?.length > 0 && (
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-rose-800 mb-2 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-rose-600" /> Keywords & Tags
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sop.tags.map(t => <Badge key={t} tone="primary">{t}</Badge>)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

/* ─── Draggable Step Item ─── */
function StepItem({ step, index, onChange, onRemove }) {
  return (
    <Reorder.Item value={step} id={step.id} className="flex gap-2 items-center group">
      <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 shrink-0">
        <GripVertical className="w-3.5 h-3.5" />
      </div>
      <span className="text-xs text-muted-foreground w-5 shrink-0">{index + 1}.</span>
      <input
        value={step.text}
        onChange={(e) => onChange(step.id, e.target.value)}
        className="sop-input flex-1 text-sm"
        placeholder={`Step ${index + 1}`}
      />
      <button onClick={() => onRemove(step.id)} className="text-muted-foreground hover:text-red-400 p-1 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </Reorder.Item>
  );
}

/* ─── Form helpers ─── */
const CATS = ["Sales Call", "After Call", "During Meeting", "After Meeting", "After Closing"];
const STATS = ["Draft", "Review", "Active"];
const PRIS  = ["Low", "Medium", "High", "Critical"];
const TAG_SUGGESTIONS = ["CRM", "leads", "onboarding", "deployment", "review", "tracking", "enterprise", "automation", "analytics", "compliance"];

const CANONICAL_SERVICES = [
  "All Services",
  "Web Development",
  "App Development",
  "SEO & Performance Marketing",
  "Custom Software",
  "UI/UX Design"
];

function makeStep(text = "") { return { id: crypto.randomUUID?.() || Math.random().toString(36), text }; }
function makeBlankForm() {
  return {
    title: "", description: "", category: "Sales Call", status: "Draft",
    priority: "Medium", tags: [], steps: Array.from({ length: 3 }, () => makeStep()),
    department: "", estimatedTime: "", attachments: [],
    script: "", scripts: [{ heading: "Standard Call Script", content: "" }],
    questions: [""], questions_answers: [], frameworks: [""],
    services: ["All Services"],
    full_content: "", attachment_url: null, attachment_name: null,
  };
}
function sopToForm(s) {
  return {
    title: s.title || "",
    description: s.description || "",
    category: s.category || "Sales Call",
    status: s.status || "Draft",
    priority: s.priority || "Medium",
    tags: [...(s.tags || [])],
    steps: (s.steps || []).map(t => makeStep(t)),
    department: s.department || "",
    estimatedTime: s.estimatedTime || "",
    attachments: [...(s.attachments || [])],
    script: s.script || "",
    scripts: s.scripts?.length ? s.scripts : [{ heading: "Standard Call Script", content: s.script || "" }],
    questions: s.questions?.length ? s.questions : [""],
    questions_answers: Array.isArray(s.questions_answers) ? s.questions_answers : [],
    frameworks: s.frameworks?.length ? s.frameworks : [""],
    services: s.services?.length ? s.services : [s.service || "All Services"],
    full_content: s.full_content || "",
    attachment_url: s.attachment_url || null,
    attachment_name: s.attachment_name || null,
  };
}
function formToSop(base, form, isEdit) {
  const services = form.services?.length ? form.services : ["All Services"];
  return {
    ...base,
    title: form.title.trim(),
    description: form.description.trim(),
    category: form.category,
    status: form.status,
    priority: form.priority,
    tags: form.tags,
    steps: form.steps.map(s => s.text).filter(Boolean),
    department: form.department,
    estimatedTime: form.estimatedTime,
    attachments: form.attachments,
    attachment_url: form.attachment_url || null,
    attachment_name: form.attachment_name || null,
    full_content: form.full_content || "",
    script: form.script || null,
    scripts: form.scripts ? form.scripts.filter(scr => scr.heading?.trim() || scr.content?.trim()) : [],
    questions: form.questions?.filter(Boolean) || [],
    questions_answers: form.questions_answers || [],
    frameworks: form.frameworks?.filter(Boolean) || [],
    service: services[0],
    services,
    updated: new Date().toISOString().split("T")[0],
    ...(isEdit ? {} :  {
      id: Date.now(),
      created: new Date().toISOString().split("T")[0],
      version: "v1.0",
      creator: "Current User",
      readCount: 0,
      acknowledgedCount: 0,
      comments: [],
      revisions: [{ version: "v1.0", date: new Date().toISOString().split("T")[0], author: "Current User", note: "Initial publish" }],
    }),
  };
}

const SOP_STORAGE_KEY = "admin_dashboard_sops";

function normalizeApiSop(sop) {
  if (!sop) return null;
  return {
    ...sop,
    id:                sop.id,
    sop_code:          sop.sop_code || sop.sopCode || (typeof sop.id === "number" ? `SOP-${String(sop.id).padStart(3, "0")}` : sop.id),
    title:             sop.title || "Untitled SOP",
    description:       sop.description || "",
    category:          sop.category || "Sales Call",
    status:            sop.status || "Active",
    priority:          sop.priority || "Medium",
    creator:           sop.creator || "Admin",
    created:           sop.created_at?.split("T")[0] || sop.created || "",
    updated:           sop.updated_at?.split("T")[0] || sop.updated || "",
    service:           sop.service || "All Services",
    services:          sop.services?.length ? sop.services : [sop.service || "All Services"],
    estimatedTime:     sop.estimated_time || sop.estimatedTime || "",
    steps:             (sop.instruction_steps || sop.steps || []).map(s => (typeof s === "string" ? s : s?.title || s?.text || "")),
    questions:         sop.questions || [],
    questions_answers: Array.isArray(sop.questions_answers) ? sop.questions_answers : [],
    frameworks:        sop.frameworks || [],
    tags:              Array.isArray(sop.tags) ? sop.tags : [],
    script:            sop.script || "",
    scripts:           sop.scripts || [],
    full_content:      sop.full_content || "",
    attachment_url:    sop.attachment_url || (sop.attachments?.[0] || null),
    attachment_name:   sop.attachment_name || null,
    comments:          Array.isArray(sop.comments) ? sop.comments.map(c => ({
      id:     c.id,
      author: c.author || "Unknown",
      text:   c.text || "",
      time:   c.time || (c.created_at ? new Date(c.created_at).toLocaleString() : "Just now"),
    })) : [],
    attachments:       sop.attachments || (sop.attachment_url ? [sop.attachment_url] : []),
    revisions:         sop.revisions || [],
    version:           sop.version || "v1.0",
    readCount:         sop.readCount || 0,
    acknowledgedCount: sop.acknowledgedCount || 0,
  };
}

const DELETED_SOPS_KEY = "crm_deleted_sops_v1";

function getDeletedSopIds() {
  try {
    const raw = localStorage.getItem(DELETED_SOPS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addDeletedSopId(sop) {
  if (!sop) return;
  const ids = getDeletedSopIds();
  const newIds = new Set(ids.map((s) => String(s).toLowerCase()));
  if (sop.id != null) newIds.add(String(sop.id).toLowerCase());
  if (sop.sop_code) newIds.add(String(sop.sop_code).toLowerCase());
  if (sop.title) newIds.add(String(sop.title).toLowerCase());
  try {
    localStorage.setItem(DELETED_SOPS_KEY, JSON.stringify([...newIds]));
  } catch {}
}

function isSopDeleted(sop) {
  if (!sop) return false;
  const deleted = new Set(getDeletedSopIds().map((s) => String(s).toLowerCase()));
  if (sop.id != null && deleted.has(String(sop.id).toLowerCase())) return true;
  if (sop.sop_code && deleted.has(String(sop.sop_code).toLowerCase())) return true;
  if (sop.title && deleted.has(String(sop.title).toLowerCase())) return true;
  return false;
}

function loadLocalSops() {
  try {
    const raw = localStorage.getItem(SOP_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s) => !isSopDeleted(s)) : [];
  } catch {
    return [];
  }
}

function persistLocalSops(list) {
  try {
    const filtered = (list || []).filter((s) => !isSopDeleted(s));
    localStorage.setItem(SOP_STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error("Failed to persist SOPs locally:", error);
  }
}

function buildLocalSop(formData, asDraft, existing = null) {
  const form = asDraft ? { ...formData, status: "Draft" } : formData;
  return formToSop(existing || {}, form, !!existing);
}

/* ─── Validation ─── */
function validate(form) {
  const errs = {};
  if (!form.title.trim()) errs.title = "Title is required";
  if (!form.description.trim()) errs.description = "Description is required";
  if (form.steps.filter(s => s.text.trim()).length === 0) errs.steps = "At least one step is required";
  return errs;
}

/* ─── Add/Edit SOP Form ─── */
function SOPForm({ initialData, onSave, onClose, isEdit = false }) {
  const { servicesList } = useAdmin();
  const serviceOptions = servicesList?.length ? servicesList : CANONICAL_SERVICES;
  const [form, setForm] = useState(() => initialData ? sopToForm(initialData) : makeBlankForm());
  const [errors, setErrors] = useState({});
  const [tagInput, setTagInput] = useState("");
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [isDraft, setIsDraft] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatusText, setAiStatusText] = useState("");
  const [aiRecommending, setAiRecommending] = useState(false);
  const lastAutofilledTitle = useRef("");

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  useEffect(() => {
    const titleClean = (form.title || "").trim();
    if (titleClean.length < 5 || titleClean === lastAutofilledTitle.current) {
      return;
    }

    setAiRecommending(true);

    const timer = setTimeout(() => {
      lastAutofilledTitle.current = titleClean;

      // Simulate AI analysis delay
      setTimeout(() => {
        const generated = generateSOPData(titleClean);
        setForm(f => ({
          ...f,
          description: f.description.trim() ? f.description : generated.description,
          category: f.category === "Sales Call" && generated.category !== "Sales Call" ? generated.category : f.category,
          priority: f.priority === "Medium" && generated.priority !== "Medium" ? generated.priority : f.priority,
          department: f.department.trim() ? f.department : generated.department,
          estimatedTime: f.estimatedTime.trim() ? f.estimatedTime : generated.estimatedTime,
          script: f.script.trim() ? f.script : generated.script,
          scripts: f.scripts.length <= 1 && (!f.scripts[0] || (!f.scripts[0].heading && !f.scripts[0].content)) ? [{ heading: "Standard Call Script", content: generated.script }] : f.scripts,
          questions: f.questions.length <= 1 && !f.questions[0] ? generated.questions : f.questions,
          frameworks: f.frameworks.length <= 1 && !f.frameworks[0] ? generated.frameworks : f.frameworks,
          tags: f.tags.length === 0 ? generated.tags : f.tags,
          steps: f.steps.length <= 3 && f.steps.every(s => !s.text.trim()) ? generated.steps.map(text => makeStep(text)) : f.steps,
        }));
        setAiRecommending(false);
      }, 500);
    }, 800);

    return () => clearTimeout(timer);
  }, [form.title]);

  const addTag = (tag) => {
    const t = tag.trim().toLowerCase();
    if (t && !form.tags.includes(t)) set("tags", [...form.tags, t]);
    setTagInput("");
    setShowTagSuggestions(false);
  };
  const removeTag = (tag) => set("tags", form.tags.filter(t => t !== tag));

  const filteredSuggestions = tagInput
    ? TAG_SUGGESTIONS.filter(s => s.includes(tagInput.toLowerCase()) && !form.tags.includes(s))
    : [];

  const handleSubmit = (asDraft = false) => {
    const f = asDraft ? { ...form, status: "Draft" } : form;
    const errs = validate(f);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave(f, asDraft);
  };

  const stepChange  = (id, text) => set("steps", form.steps.map(s => s.id === id ? { ...s, text } : s));
  const stepRemove  = (id) => set("steps", form.steps.filter(s => s.id !== id));
  const stepsReorder = (newSteps) => set("steps", newSteps);

  const generateSOPData = (inputText) => {
    const query = (inputText || "").toLowerCase();
    let title = inputText || "Standard Sales Interaction Protocol";
    let description = "Standard operating procedure detailing key interaction protocols, execution steps, and compliance requirements.";
    let category = "Sales Call";
    let priority = "Medium";
    let department = "Sales Operations";
    let estimatedTime = "15 min";
    let script = "Agent: Hello [Lead Name], thank you for showing interest in our solutions. I'm calling to understand your current requirements...\nClient: Yes, we are currently evaluating CRM tools.";
    let questions = [
      "What is your current system for managing customer pipelines?",
      "What are the biggest pain points with your current solution?",
      "Who are the key decision-makers involved in this evaluation?"
    ];
    let frameworks = ["BANT (Budget, Authority, Need, Timeline)", "MEDDIC"];
    let tags = ["sales", "leads", "compliance"];
    let steps = [
      "Greet the client and establish a positive tone.",
      "Perform initial discovery by asking about pain points.",
      "Log interaction outcomes and next follow-up date in the CRM."
    ];

    if (query.includes("handoff") || query.includes("onboard") || query.includes("client")) {
      title = inputText.includes(".") ? "Lead Handoff to Customer Onboarding" : inputText;
      description = "SOP outlining the exact workflow, documentation exchange, and communications required when transitioning a closed-won deal from Sales to Customer Success.";
      category = "After Closing";
      priority = "High";
      department = "Customer Success";
      estimatedTime = "25 min";
      script = "Hi Onboarding Team, we have successfully closed [Client Name] and need to transition their account details. They are ready for implementation next Monday.";
      questions = [
        "Has the contract been signed and uploaded to the client folder?",
        "What are the primary goals/expectations the client has for their first 30 days?",
        "Who will be the primary point of contact for onboarding?"
      ];
      frameworks = ["MEDDPICC", "CS Handover Checklist"];
      tags = ["onboarding", "handoff", "success", "client"];
      steps = [
        "Mark lead as Closed Won and update contract details.",
        "Schedule internal handoff meeting between Account Executive and Customer Success Manager.",
        "Send introductory email to client introducing their CS lead.",
        "Set up kickoff calendar invite and share initial onboarding questionnaire."
      ];
    } else if (query.includes("objection") || query.includes("price") || query.includes("negotiat")) {
      title = inputText.includes(".") ? "Handling Pricing & Budget Objections" : inputText;
      description = "Best practices and scripts for overcoming budget resistance, explaining product value proposition, and navigating pricing discussions.";
      category = "Sales Call";
      priority = "Critical";
      department = "Sales Enablement";
      estimatedTime = "20 min";
      script = "Client: Your pricing is too high, we don't have the budget.\nAgent: I completely understand, [Client Name]. Budget is always a key constraint. Can I ask, outside of price, does our solution address all your key requirements?\nClient: Yes, it does, but we still can't afford it.";
      questions = [
        "Is the objection related to budget constraints or perceived value?",
        "Can we offer flexible monthly/annual payment options?",
        "Are they willing to start with a smaller pilot program?"
      ];
      frameworks = ["LAER (Listen, Acknowledge, Explore, Respond)", "Value Selling Framework"];
      tags = ["sales", "negotiation", "objections", "pricing"];
      steps = [
        "Acknowledge the objection without immediately offering a discount.",
        "Explore the root cause of the budget concern.",
        "Quantify the ROI and value of our solution compared to doing nothing.",
        "Propose flexible payment structures or tier options if necessary."
      ];
    } else if (query.includes("discovery") || query.includes("qualif") || query.includes("call")) {
      title = inputText.includes(".") ? "Sales Discovery and Lead Qualification Protocol" : inputText;
      description = "SOP detailing the key discovery questions and framework required to qualify standard inbound and outbound sales leads.";
      category = "Sales Call";
      priority = "High";
      department = "Business Development";
      estimatedTime = "30 min";
      script = "Agent: Thanks for joining the call today! The goal is to learn a bit about your current operations and see if we might be a good fit to help you scale. To start, could you tell me about...";
      questions = [
        "What does your current technology stack look like?",
        "What is the timeline you are looking to implement a new solution?",
        "What budget has been allocated for this initiative?"
      ];
      frameworks = ["BANT", "MEDDPICC"];
      tags = ["discovery", "qualification", "sales", "bant"];
      steps = [
        "Establish rapport and outline the agenda for the call.",
        "Ask open-ended discovery questions focusing on active problems.",
        "Introduce our high-level value proposition matching their concerns.",
        "Confirm qualification criteria and schedule the product demo."
      ];
    } else if (query.includes("demo") || query.includes("meeting") || query.includes("present")) {
      title = inputText.includes(".") ? "Standard Product Demo and Presentation Flow" : inputText;
      description = "SOP for running structured, value-focused product demonstrations that align directly with pain points identified during discovery.";
      category = "During Meeting";
      priority = "High";
      department = "Solutions Engineering";
      estimatedTime = "40 min";
      script = "Agent: Today, I'm going to walk you through three specific features of our dashboard that directly address the reporting delays you mentioned in our last call. Let's start with...";
      questions = [
        "Does this workflow align with how your team operates daily?",
        "How would this impact your current reporting speed?",
        "Who else on your team needs to review this demo?"
      ];
      frameworks = ["Feature-Benefit Mapping", "Demo-to-Win Framework"];
      tags = ["demo", "meeting", "presentation", "product"];
      steps = [
        "Recap the discovery findings and align on demo goals.",
        "Showcase targeted solution features (not a generic walk-through).",
        "Confirm value and alignment after showing each feature.",
        "Outline post-demo action items and next steps."
      ];
    }

    return {
      title,
      description,
      category,
      priority,
      department,
      estimatedTime,
      script,
      questions,
      frameworks,
      tags,
      steps,
    };
  };

  const handleAiAutofill = async () => {
    if (!form.title.trim()) {
      alert("Please enter an SOP Title first!");
      return;
    }
    
    setAiLoading(true);
    setAiStatusText("AI Smart Architect analyzing title...");

    try {
      const res = await fetch(apiUrl("/api/sop/generate-ai"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getCrmHeaders(),
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          title: form.title.trim(),
          category: form.category || "Sales Call",
          service: form.services?.[0] || "All Services",
        }),
      });

      const data = await res.json();
      if (data.success && data.sop) {
        const generated = data.sop;
        setForm(f => ({
          ...f,
          title: generated.title || f.title,
          description: generated.description || f.description,
          category: generated.category || f.category,
          priority: generated.priority || f.priority,
          department: generated.department || f.department,
          estimatedTime: generated.estimated_time || generated.estimatedTime || f.estimatedTime,
          script: generated.script || f.script,
          scripts: Array.isArray(generated.scripts) && generated.scripts.length > 0 ? generated.scripts : f.scripts,
          questions: Array.isArray(generated.questions) && generated.questions.length > 0 ? generated.questions : f.questions,
          questions_answers: Array.isArray(generated.questions_answers) ? generated.questions_answers : f.questions_answers,
          frameworks: Array.isArray(generated.frameworks) && generated.frameworks.length > 0 ? generated.frameworks : f.frameworks,
          tags: Array.isArray(generated.tags) && generated.tags.length > 0 ? generated.tags : f.tags,
          steps: Array.isArray(generated.instruction_steps) && generated.instruction_steps.length > 0
            ? generated.instruction_steps.map(st => makeStep(typeof st === "string" ? st : st.title || st.text))
            : f.steps,
          services: Array.isArray(generated.services) && generated.services.length > 0 ? generated.services : f.services,
        }));
        setAiLoading(false);
        setErrors({});
      } else {
        throw new Error(data.message || "Failed to generate SOP from title");
      }
    } catch (err) {
      console.warn("AI generation endpoint failed, using local generator:", err);
      const generated = generateSOPData(form.title);
      setForm(f => ({
        ...f,
        description: generated.description,
        category: generated.category,
        priority: generated.priority,
        department: generated.department,
        estimatedTime: generated.estimatedTime,
        script: generated.script,
        scripts: [{ heading: "Standard Call Script", content: generated.script }],
        questions: generated.questions,
        frameworks: generated.frameworks,
        tags: generated.tags,
        steps: generated.steps.map(text => makeStep(text)),
      }));
      setAiLoading(false);
      setErrors({});
    }
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // reset input so selecting the same file triggers again
    e.target.value = "";

    setAiLoading(true);
    setAiStatusText("Uploading PDF document to server...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      setAiStatusText("Extracting PDF text & analyzing with AI...");

      const res = await fetch(apiUrl("/api/sop/parse-document"), {
        method: "POST",
        headers: {
          ...getCrmHeaders(),
          ...getAuthHeaders(),
        },
        body: formData,
      });

      const data = await res.json();
      if (data.success && data.sop) {
        const parsed = data.sop;
        setForm(f => ({
          ...f,
          title: parsed.title || f.title,
          description: parsed.description || f.description,
          category: parsed.category || f.category,
          priority: parsed.priority || f.priority,
          department: parsed.department || f.department,
          estimatedTime: parsed.estimated_time || parsed.estimatedTime || f.estimatedTime,
          script: parsed.script || f.script,
          scripts: Array.isArray(parsed.scripts) && parsed.scripts.length > 0 ? parsed.scripts : [{ heading: "Standard Call Script", content: parsed.script || "" }],
          questions: Array.isArray(parsed.questions) && parsed.questions.length > 0 ? parsed.questions : f.questions,
          questions_answers: Array.isArray(parsed.questions_answers) ? parsed.questions_answers : [],
          frameworks: Array.isArray(parsed.frameworks) && parsed.frameworks.length > 0 ? parsed.frameworks : f.frameworks,
          tags: Array.isArray(parsed.tags) && parsed.tags.length > 0 ? parsed.tags : f.tags,
          steps: Array.isArray(parsed.instruction_steps) && parsed.instruction_steps.length > 0
            ? parsed.instruction_steps.map(st => makeStep(typeof st === "string" ? st : st.title || st.text))
            : f.steps,
          services: Array.isArray(parsed.services) && parsed.services.length > 0 ? parsed.services : f.services,
          full_content: parsed.full_content || "",
          attachment_url: parsed.attachment_url || null,
          attachment_name: parsed.attachment_name || file.name,
          attachments: [parsed.attachment_name || file.name],
        }));
        setAiLoading(false);
        setErrors({});
      } else {
        throw new Error(data.message || "Failed to extract SOP from PDF");
      }
    } catch (err) {
      console.error("PDF upload error:", err);
      // Fallback
      let fileName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim();
      let extractedTitle = fileName.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      const generated = generateSOPData(extractedTitle);
      setForm(f => ({
        ...f,
        title: generated.title || extractedTitle,
        description: generated.description,
        category: generated.category,
        priority: generated.priority,
        department: generated.department,
        estimatedTime: generated.estimatedTime,
        script: generated.script,
        scripts: [{ heading: "Standard Call Script", content: generated.script }],
        questions: generated.questions,
        frameworks: generated.frameworks,
        tags: generated.tags,
        steps: generated.steps.map(text => makeStep(text)),
        attachment_name: file.name,
        attachments: [file.name],
      }));
      setAiLoading(false);
      setErrors({});
    }
  };

  return (
    <div className="space-y-4">
      {/* AI Auto-Fill Panel */}
      <div className="relative p-4 rounded-xl border border-dashed border-rose-300 bg-rose-50/40 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-rose-700 animate-pulse" />
            <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">AI SOP Auto-Fill</span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-rose-700 text-white shadow-sm">AI POWERED</span>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {/* PDF Upload */}
          <label className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-rose-200 text-rose-800 text-xs font-bold hover:bg-rose-50/60 hover:border-rose-300 transition-all cursor-pointer shadow-sm">
            <FileText className="w-3.5 h-3.5" />
            Upload PDF SOP
            <input type="file" accept=".pdf,image/*,.docx,.txt" className="hidden" onChange={handlePdfUpload} />
          </label>

          {/* Autofill from Title */}
          <button
            type="button"
            onClick={handleAiAutofill}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-br from-rose-600 to-rose-800 text-white text-xs font-bold hover:shadow-md transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Generate from Title
          </button>
        </div>
        
        <p className="text-[10px] text-rose-950/80 leading-relaxed font-medium">
 Enter an SOP **Title** below and click "Generate from Title", or upload a **PDF procedure document** to automatically structure and fill the description, scripts, questions, steps, and frameworks.
        </p>

        {/* Loading overlay inside card */}
        {aiLoading && (
          <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-50 rounded-xl flex flex-col items-center justify-center p-3 text-center transition-all">
            <div className="w-8 h-8 rounded-full border-2 border-rose-200 border-t-rose-700 animate-spin mb-2" />
            <div className="text-xs font-bold text-rose-800 mb-0.5">AI Smart Architect</div>
            <div className="text-[10px] text-rose-600 font-semibold tracking-wide h-4 animate-pulse">{aiStatusText}</div>
          </div>
        )}
      </div>
      {/* Title */}
      <Field label={
        <div className="flex items-center justify-between w-full">
          <span>Title *</span>
          {aiRecommending && (
            <span className="text-[10px] text-rose-600 font-bold animate-pulse flex items-center gap-1 normal-case tracking-normal">
              <Sparkles className="w-3 h-3 animate-spin shrink-0" /> AI recommending details...
            </span>
          )}
        </div>
      }>
        <input
          value={form.title}
          onChange={e => { set("title", e.target.value); setErrors(er => ({ ...er, title: "" })); }}
          className={cn("sop-input", errors.title && "border-red-500/60")}
          placeholder="e.g. Lead handoff to onboarding"
        />
        {errors.title && <div className="text-[10px] text-red-400 mt-1">{errors.title}</div>}
      </Field>

      {/* Description */}
      <Field label="Description *">
        <textarea
          value={form.description}
          onChange={e => { set("description", e.target.value); setErrors(er => ({ ...er, description: "" })); }}
          rows={3}
          className={cn("sop-input resize-none", errors.description && "border-red-500/60")}
          placeholder="Describe the purpose and scope of this SOP…"
        />
        {errors.description && <div className="text-[10px] text-red-400 mt-1">{errors.description}</div>}
      </Field>
      {/* Spoken Dialogue Scripts */}
      <Field label="Spoken Dialogue Scripts">
        <div className="space-y-3">
          {(form.scripts || []).map((scr, i) => (
            <div key={i} className="p-3 border border-rose-100 rounded-xl bg-white space-y-2 relative shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <input
                  value={scr.heading}
                  onChange={e => {
                    const updated = [...form.scripts];
                    updated[i] = { ...updated[i], heading: e.target.value };
                    set("scripts", updated);
                  }}
                  className="sop-input flex-1 font-bold text-xs bg-transparent border-none px-0 py-0 focus:ring-0 focus:outline-none placeholder:text-slate-400"
                  placeholder={`Script Heading ${i + 1} (e.g. Opening Hook / Pitch)`}
                />
                <button
                  type="button"
                  onClick={() => set("scripts", form.scripts.filter((_, x) => x !== i))}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <textarea
                value={scr.content}
                onChange={e => {
                  const updated = [...form.scripts];
                  updated[i] = { ...updated[i], content: e.target.value };
                  set("scripts", updated);
                }}
                rows={3}
                className="sop-input w-full resize-none font-mono text-xs"
                placeholder="Write the dialogue script here…"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => set("scripts", [...(form.scripts || []), { heading: "", content: "" }])}
            className="text-xs text-rose-600 inline-flex items-center gap-1 hover:underline font-semibold"
          >
            <Plus className="w-3 h-3" /> Add script stage
          </button>
        </div>
      </Field>

      {/* Questions & Answers / Objections */}
      <Field label="Question & Answer Guidelines / Objections">
        <div className="space-y-3">
          {(form.questions_answers || []).map((qa, i) => (
            <div key={i} className="p-3 border border-rose-100 rounded-xl bg-white space-y-2 relative shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <input
                  value={qa.question || ""}
                  onChange={e => {
                    const updated = [...form.questions_answers];
                    updated[i] = { ...updated[i], question: e.target.value };
                    set("questions_answers", updated);
                  }}
                  className="sop-input flex-1 font-bold text-xs"
                  placeholder={`Question ${i + 1} (e.g. What is the pricing?)`}
                />
                <button
                  type="button"
                  onClick={() => set("questions_answers", form.questions_answers.filter((_, x) => x !== i))}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <textarea
                value={qa.answer || ""}
                onChange={e => {
                  const updated = [...form.questions_answers];
                  updated[i] = { ...updated[i], answer: e.target.value };
                  set("questions_answers", updated);
                }}
                rows={2}
                className="sop-input w-full resize-none text-xs"
                placeholder="Guideline response / objection handling answer…"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => set("questions_answers", [...(form.questions_answers || []), { question: "", answer: "" }])}
            className="text-xs text-rose-600 inline-flex items-center gap-1 hover:underline font-semibold"
          >
            <Plus className="w-3 h-3" /> Add Q&A guideline
          </button>
        </div>
      </Field>

      {/* Discovery Questions */}
      <Field label="Discovery / Qualification Questions">
        <div className="space-y-2">
          {form.questions.map((q, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={q}
                onChange={e => {
                  const updated = [...form.questions];
                  updated[i] = e.target.value;
                  set("questions", updated);
                }}
                className="sop-input flex-1"
                placeholder={`Discovery Question ${i + 1}`}
              />
              <button
                type="button"
                onClick={() => set("questions", form.questions.filter((_, x) => x !== i))}
                className="text-gray-400 hover:text-red-500 transition-colors p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => set("questions", [...form.questions, ""])}
            className="text-xs text-rose-600 inline-flex items-center gap-1 hover:underline font-semibold"
          >
            <Plus className="w-3 h-3" /> Add question
          </button>
        </div>
      </Field>

      <Field label="Frameworks (Knowledge)">
        <div className="space-y-2">
          {form.frameworks.map((f, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={f}
                onChange={e => {
                  const updated = [...form.frameworks];
                  updated[i] = e.target.value;
                  set("frameworks", updated);
                }}
                className="sop-input flex-1"
                placeholder={`Framework ${i + 1} e.g. BANT, MEDDIC`}
              />
              <button
                type="button"
                onClick={() => set("frameworks", form.frameworks.filter((_, x) => x !== i))}
                className="text-gray-400 hover:text-red-500 transition-colors p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => set("frameworks", [...form.frameworks, ""])}
            className="text-xs text-rose-600 inline-flex items-center gap-1 hover:underline font-semibold"
          >
            <Plus className="w-3 h-3" /> Add framework
          </button>
        </div>
      </Field>

      {/* Attached Source Document Banner if present */}
      {(form.attachment_name || form.attachment_url) && (
        <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-rose-600 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-800 truncate">{form.attachment_name || "Attached PDF"}</div>
              <div className="text-[10px] text-rose-600">Attached source file</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, attachment_name: null, attachment_url: null, attachments: [] }))}
            className="text-xs text-slate-400 hover:text-red-500 p-1"
            title="Remove attachment"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Full Extracted Markdown Text (Optional) */}
      {form.full_content && (
        <Field label="Full Extracted Document Content">
          <textarea
            value={form.full_content}
            onChange={e => set("full_content", e.target.value)}
            rows={4}
            className="sop-input w-full resize-none font-mono text-xs"
            placeholder="Full procedure and script text extracted from document…"
          />
        </Field>
      )}
      {/* Grid fields */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select value={form.category} onChange={e => set("category", e.target.value)} className="sop-input">
            {CATS.map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={e => set("status", e.target.value)} className="sop-input">
            {STATS.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select value={form.priority} onChange={e => set("priority", e.target.value)} className="sop-input">
            {PRIS.map(p => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Department">
          <input value={form.department} onChange={e => set("department", e.target.value)} className="sop-input" placeholder="e.g. Revenue Ops" />
        </Field>
        <Field label="Estimated Time">
          <input value={form.estimatedTime} onChange={e => set("estimatedTime", e.target.value)} className="sop-input" placeholder="e.g. 45 min" />
        </Field>
      </div>

      {/* Services — a SOP can apply to more than one */}
      <Field label="Services">
        <div className="flex flex-wrap gap-1.5">
          {serviceOptions.map(s => {
            const active = form.services?.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  if (s === "All Services") {
                    set("services", ["All Services"]);
                    return;
                  }
                  const current = (form.services || []).filter(x => x !== "All Services");
                  const next = active ? current.filter(x => x !== s) : [...current, s];
                  set("services", next.length ? next : ["All Services"]);
                }}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                  active
                    ? "bg-rose-600 text-white border-rose-600"
                    : "bg-white text-muted-foreground border-rose-200 hover:border-rose-400"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Only reps handling one of these services will be guided by this SOP during AI call analysis.
          Pick specific services, or leave "All Services" selected to apply everywhere.
        </p>
      </Field>

      {/* Tags */}
      <Field label="Tags">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {form.tags.map(t => (
              <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15 border border-primary/30 text-[11px] font-medium text-primary">
                {t}
                <button onClick={() => removeTag(t)} className="hover:text-red-400 transition-colors"><X className="w-2.5 h-2.5" /></button>
              </span>
            ))}
          </div>
          <div className="relative">
            <input
              value={tagInput}
              onChange={e => { setTagInput(e.target.value); setShowTagSuggestions(true); }}
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag(tagInput))}
              onBlur={() => setTimeout(() => setShowTagSuggestions(false), 150)}
              className="sop-input"
              placeholder="Type and press Enter…"
            />
            {showTagSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-xl border border-border bg-card/95 backdrop-blur shadow-xl z-10 overflow-hidden">
                {filteredSuggestions.map(s => (
                  <button key={s} onMouseDown={() => addTag(s)} className="w-full text-left px-3 py-2 text-xs hover:bg-secondary/60 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </Field>

      {/* Steps — drag-and-drop */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-rose-700 mb-2 flex items-center justify-between">
          <span>Instruction Steps *</span>
          {errors.steps && <span className="text-red-400 normal-case">{errors.steps}</span>}
        </div>
        <Reorder.Group
          axis="y"
          values={form.steps}
          onReorder={stepsReorder}
          className="space-y-2 max-h-64 overflow-y-auto pr-1 text-rose-700"
        >
          {form.steps.map((s, i) => (
            <StepItem key={s.id} step={s} index={i} onChange={stepChange} onRemove={stepRemove} />
          ))}
        </Reorder.Group>
        <button
          onClick={() => set("steps", [...form.steps, makeStep()])}
          className="mt-2 text-xs text-rose-700 inline-flex items-center gap-1 hover:underline"
        >
          <Plus className="w-3 h-3" /> Add step
        </button>
      </div>

      {/* Attachments */}
      <Field label="Attachments">
        <div className="space-y-1.5">
          {form.attachments.map((a, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-rose-50/60 border border-rose-700">
              <Paperclip className="w-3 h-3 text-rose-700 shrink-0" />
              <span className="text-xs flex-1">{a}</span>
              <button onClick={() => set("attachments", form.attachments.filter((_, x) => x !== i))} className="hover:text-red-400 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              const name = prompt("Enter attachment name:");
              if (name?.trim()) set("attachments", [...form.attachments, name.trim()]);
            }}
            className="w-full py-2 rounded-lg border border-dashed border-rose-700 text-xs text-rose-700 hover:rose-500 hover:border-primary/40 transition-all flex items-center justify-center gap-1.5"
          >
            <Paperclip className="w-3 h-3" /> Add attachment
          </button>
        </div>
      </Field>

      {/* Footer buttons */}
      <div className="flex gap-2 pt-3 border-t border-border">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl  text-rose-700 border border-rose-700 text-sm hover:bg-rose-700 hover:text-white transition-colors">
          Cancel
        </button>
        <button
          onClick={() => handleSubmit(true)}
          className="px-4 py-2.5 rounded-xl border border-rose-700 text-xs text-rose-700 hover:bg-rose-700 hover:text-white transition-colors inline-flex items-center gap-1.5"
        >
          <Save className="w-3.5 h-3.5" /> Draft
        </button>
        <button
          onClick={() => handleSubmit(false)}
          className="flex-1 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-medium hover-lift inline-flex items-center justify-center gap-1.5"
        >
          {isEdit ? <><RefreshCw className="w-3.5 h-3.5" /> Update</> : <><CheckCircle2 className="w-3.5 h-3.5" /> Publish</>}
        </button>
      </div>

      <style>{`
        .sop-input{width:100%;padding:.55rem .75rem;border-radius:.6rem;background:#ffffff;border:1px solid #fecdd3;font-size:.875rem;color:#1f2937}
        .sop-input:focus{outline:none;box-shadow:0 0 0 2px rgba(225,29,72,0.2);border-color:#f43f5e}
        .sop-input::placeholder{color:#9ca3af}
        .sop-input option{background:#ffffff;color:#1f2937}
      `}</style>
    </div>
  );
}

/* ─── Quick Action Dropdown ─── */
function QuickActions() {
  return null;
}

/* ─── SOP card (matches employee Sales Process layout) ─── */
function AdminSopCard({
  sop,
  onOpen,
  onEdit,
  onDuplicate,
  onArchive,
  onDelete,
  onExport,
}) {
  const stepCount = sop.steps?.length || 0;

  return (
    <article
      onClick={() => onOpen(sop)}
      className="h-[156px] sm:h-[162px] flex flex-col justify-between rounded-xl sm:rounded-2xl border border-slate-200/80 bg-white overflow-hidden hover:border-rose-300 hover:shadow-[0_8px_24px_rgba(225,29,72,0.08)] transition-all group min-w-0 cursor-pointer relative"
    >
      <div className="flex items-start gap-2.5 sm:gap-3 p-3 sm:p-3.5 pb-1 min-w-0 flex-1">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-50 border border-slate-200/90 group-hover:bg-rose-50 group-hover:border-rose-200 group-hover:text-rose-600 grid place-items-center shrink-0 text-slate-600 transition-colors mt-0.5 shadow-sm">
          <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <p className="text-xs sm:text-sm font-bold text-slate-900 truncate group-hover:text-rose-700 transition-colors">
              {sop.title}
            </p>
            {(sop.sop_code || sop.sopCode || sop.id) && (
              <span className="shrink-0 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-rose-100/90 text-rose-800 border border-rose-200" title="Unique SOP ID">
                {sop.sop_code || sop.sopCode || (typeof sop.id === "number" ? `SOP-${String(sop.id).padStart(3, "0")}` : sop.id)}
              </span>
            )}
            <span className="shrink-0 sm:hidden text-[7px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-sky-50 text-sky-700 border-sky-100">
              {sop.category}
            </span>
          </div>

          <p
            className="text-[11px] text-slate-500 mt-1 leading-snug h-[30px] sm:h-[32px] overflow-hidden"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {sop.description || "Standard operating procedure detailing key interaction protocols, execution steps, and compliance requirements."}
          </p>

          <p className="text-[9px] sm:text-[10px] text-slate-400 font-medium mt-1">
            {stepCount} steps · {sop.estimatedTime || "15 min"}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0 pt-0.5">
          <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 group-hover:text-rose-600 group-hover:translate-x-0.5 transition shrink-0" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(sop);
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition shrink-0"
            aria-label="Quick edit"
            title="Edit SOP"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex px-3 sm:px-4 py-2 justify-between items-center border-t border-slate-100 bg-slate-50/50 shrink-0 gap-2">
        <div className="flex flex-wrap items-center gap-1 min-w-0">
          <Badge tone={statusTone(sop.status)}>{sop.status}</Badge>
          <Badge tone="muted" className="hidden sm:inline-flex">{sop.category}</Badge>
          <Badge tone={priorityTone(sop.priority)} className="hidden md:inline-flex">{sop.priority}</Badge>
          <Badge tone="info" className="hidden lg:inline-flex">{sop.version}</Badge>
        </div>
        <span className="text-[9px] sm:text-[10px] font-semibold text-slate-500 shrink-0 tabular-nums">
          {sop.updated || sop.created}
        </span>
      </div>
    </article>
  );
}

/* ─── Empty state ─── */
function EmptyState({ query }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="col-span-full xl:col-span-2 flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-rose-100 border border-rose-300 grid place-items-center mb-4">
        <BookOpen className="w-7 h-7 text-rose-600" />
      </div>
      <div className="text-sm font-semibold text-gray-900 mb-1">
        {query ? "No SOPs match your search" : "No SOPs yet"}
      </div>
      <div className="text-xs text-gray-700">
        {query ? "Try different keywords or filters" : "Create your first SOP to get started"}
      </div>
    </motion.div>
  );
}

/* ─── Sort options ─── */
const SORT_OPTIONS = [
  { label: "Newest", value: "newest" },
  { label: "Priority", value: "priority" },
  { label: "Category", value: "category" },
  { label: "Title A–Z", value: "title" },
];
const PRIORITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };

/* ════════════════════════════════════════════
   MAIN SOP PAGE
   ════════════════════════════════════════════ */
export default function SOP() {
  const { selectedService } = useAdmin();
  const [sops, setSops] = useState([]);
  const [view, setView]   = useState("grid");
  const [q, setQ]         = useState("");
  const [filter, setFilter] = useState("All");
  const [sortBy, setSortBy] = useState("newest");
  const [statusFilter, setStatusFilter] = useState("All");

  // Drawer states
  const [detailSop, setDetailSop] = useState(null);
  const [editSop, setEditSop]     = useState(null);  // null = closed, or the SOP being edited
  const [addOpen, setAddOpen]     = useState(false);

  // Confirm modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);

  // Toasts
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }, []);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (new URLSearchParams(location.search).get("action") === "addSOP") setAddOpen(true);
  }, [location.search]);

  useEffect(() => {
    const openId = new URLSearchParams(location.search).get("openSop");
    if (openId && sops.length) {
      const found = sops.find((s) => String(s.id) === String(openId));
      if (found) {
        setDetailSop(found);
      }
    }
  }, [location.search, sops]);

  useEffect(() => {
    const fetchSops = async () => {
      try {
        const data = await apiGet("/api/sop/all", { skipCache: true, cacheTtl: 0 });

        if (data.success) {
          const normalized = (data.sops || []).map(normalizeApiSop).filter((s) => !isSopDeleted(s));
          setSops(normalized);
          persistLocalSops(normalized);
          try { localStorage.setItem("crm_employee_sops_v1", JSON.stringify(normalized)); } catch {}
          return;
        }
      } catch (error) {
        console.error("Failed to fetch SOPs:", error);
      }

      const local = loadLocalSops();
      setSops(local);
    };

    fetchSops();
  }, []);

  const handleUpdateComment = async (sopId, commentId, newText) => {
    try {
      const data = await apiPut(`/api/sop/${sopId}/comment/${commentId}`, { text: newText });
  
      if (data.success && data.comment) {
        setSops(prev => prev.map(s =>
          s.id === sopId
            ? { ...s, comments: s.comments.map(c => c.id === commentId ? data.comment : c) }
            : s
        ));
        setDetailSop(d =>
          d?.id === sopId
            ? { ...d, comments: d.comments.map(c => c.id === commentId ? data.comment : c) }
            : d
        );
        addToast("Comment updated");
      } else {
        addToast(data.message || "Failed to update comment", "error");
      }
    } catch (error) {
      console.error("Update comment error:", error);
      addToast("Network error, please try again", "error");
    }
  };
  
  const handleDeleteComment = async (sopId, commentId) => {
    try {
      const data = await apiDelete(`/api/sop/${sopId}/comment/${commentId}`);
  
      if (data.success) {
        setSops(prev => prev.map(s =>
          s.id === sopId
            ? { ...s, comments: s.comments.filter(c => c.id !== commentId) }
            : s
        ));
        setDetailSop(d =>
          d?.id === sopId
            ? { ...d, comments: d.comments.filter(c => c.id !== commentId) }
            : d
        );
        addToast("Comment deleted", "error");
      } else {
        addToast(data.message || "Failed to delete comment", "error");
      }
    } catch (error) {
      console.error("Delete comment error:", error);
      addToast("Network error, please try again", "error");
    }
  };

  /* ── KPI data (dynamic) ── */
  const sopCategories = useMemo(() => {
    const active = (sops || []).filter(s => s && s.status !== "Archived");
    return [
      { name: "All SOPs",       count: active.length },
      { name: "Sales Call",     count: active.filter(s => s.category === "Sales Call").length },
      { name: "After Call",     count: active.filter(s => s.category === "After Call").length },
      { name: "During Meeting", count: active.filter(s => s.category === "During Meeting").length },
      { name: "After Meeting",  count: active.filter(s => s.category === "After Meeting").length },
      { name: "After Closing",  count: active.filter(s => s.category === "After Closing").length },
    ];
  }, [sops]);

  /* ── Filtered + sorted list ── */
  const filtered = useMemo(() => {
    let list = (sops || []).filter(s => {
      if (!s) return false;
      if (filter !== "All" && s.category !== filter) return false;
      if (statusFilter !== "All" && s.status !== statusFilter) return false;
      const sopServices = s.services?.length ? s.services : [s.service || "All Services"];
      if (selectedService && selectedService !== "All Services" && !sopServices.includes("All Services") && !sopServices.includes(selectedService)) return false;
      const qLow = (q || "").toLowerCase();
      const titleMatch = (s.title || "").toLowerCase().includes(qLow);
      const tagMatch = Array.isArray(s.tags) && s.tags.join(" ").toLowerCase().includes(qLow);
      const descMatch = (s.description || "").toLowerCase().includes(qLow);
      return !qLow || titleMatch || tagMatch || descMatch;
    });
    if (sortBy === "newest")   list = [...list].sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
    if (sortBy === "priority") list = [...list].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
    if (sortBy === "category") list = [...list].sort((a, b) => (a.category || "").localeCompare(b.category || ""));
    if (sortBy === "title")    list = [...list].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    return list;
  }, [sops, q, filter, statusFilter, sortBy, selectedService]);

  /* ── Handlers ── */
  const saveSopLocally = (formData, asDraft, existing = null) => {
    const saved = buildLocalSop(formData, asDraft, existing);
    if (existing) {
      setSops(prev => {
        const next = prev.map(s => s.id === existing.id ? saved : s);
        persistLocalSops(next);
        return next;
      });
      setDetailSop(d => d?.id === existing.id ? saved : d);
      setEditSop(null);
      addToast("SOP saved locally (database unavailable)", "info");
    } else {
      setSops(prev => {
        const next = [saved, ...prev];
        persistLocalSops(next);
        return next;
      });
      setAddOpen(false);
      addToast(asDraft ? "Draft saved locally" : "SOP published locally (database unavailable)", "info");
    }
    navigate(location.pathname, { replace: true });
  };

  const handleSave = async (formData, asDraft) => {
    const finalStatus = asDraft ? "Draft" : formData.status;
  
    const payload = {
      title:             formData.title.trim(),
      description:       formData.description.trim(),
      category:          formData.category,
      status:            finalStatus,
      priority:          formData.priority,
      department:        formData.department,
      estimated_time:    formData.estimatedTime,
      script:            formData.script || (formData.scripts?.[0]?.content) || null,
      scripts:           formData.scripts ? formData.scripts.filter(s => s.heading?.trim() || s.content?.trim()) : [],
      questions:         formData.questions?.filter(Boolean) || [],
      questions_answers: formData.questions_answers || [],
      frameworks:        formData.frameworks?.filter(Boolean) || [],
      tags:              formData.tags || [],
      instruction_steps: formData.steps
                           .map((s, i) => ({ step: i + 1, title: s.text }))
                           .filter(s => s.title),
      attachment_url:    formData.attachment_url || null,
      attachment_name:   formData.attachment_name || null,
      full_content:      formData.full_content || "",
      services:          formData.services?.length ? formData.services : ["All Services"],
      service:           (formData.services?.length ? formData.services[0] : formData.service) || "All Services",
    };
  
    if (editSop) {
      try {
        const data = await apiPut(`/api/sop/update/${editSop.id}`, payload);
        console.log("Update SOP response:", data);

        if (data.success && data.sop?.id) {
          const normalized = normalizeApiSop({ ...data.sop, comments: editSop.comments || [], revisions: editSop.revisions || [], readCount: editSop.readCount || 0, acknowledgedCount: editSop.acknowledgedCount || 0 });
          setSops(prev => {
            const next = prev.map(s => s.id === editSop.id ? normalized : s);
            persistLocalSops(next);
            return next;
          });
          setDetailSop(d => d?.id === editSop.id ? normalized : d);
          setEditSop(null);
          invalidateCache("/api/sop");
          addToast("SOP updated successfully");
        } else {
          console.error("Backend error:", data);
          addToast(data.message || "Failed to save SOP to database", "error");
          saveSopLocally({ ...formData, status: finalStatus }, asDraft, editSop);
        }
      } catch (error) {
        console.error("Update SOP error:", error);
        saveSopLocally({ ...formData, status: finalStatus }, asDraft, editSop);
      }
    } else {
      // CREATE new SOP
      try {
        const data = await apiPost("/api/sop/create", payload);
        console.log("Create SOP response:", data);

        if (data.success && data.sop?.id) {
          const normalized = normalizeApiSop(data.sop);
          setSops(prev => {
            const next = [normalized, ...prev];
            persistLocalSops(next);
            return next;
          });
          setAddOpen(false);
          invalidateCache("/api/sop");
          addToast("SOP published successfully");
        } else {
          console.error("Backend error:", data);
          addToast(data.message || "Failed to save SOP to database", "error");
          saveSopLocally({ ...formData, status: finalStatus }, asDraft);
        }
      } catch (error) {
        console.error("Create SOP error:", error);
        saveSopLocally({ ...formData, status: finalStatus }, asDraft);
      }
    }

    navigate(location.pathname, { replace: true });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id;
    const targetTitle = deleteTarget.title || "SOP";

    // 1. Blacklist in localStorage & unconditionally remove from React state & local storage
    addDeletedSopId(deleteTarget);

    setSops((prev) => {
      const next = prev.filter((s) => !isSopDeleted(s));
      persistLocalSops(next);
      try { localStorage.setItem("crm_employee_sops_v1", JSON.stringify(next)); } catch {}
      return next;
    });

    if (detailSop && isSopDeleted(detailSop)) {
      setDetailSop(null);
    }

    // 2. Best-effort API request to delete from backend DB
    try {
      await apiDelete(`/api/sop/delete/${targetId}`).catch(() => apiDelete(`/api/sop/${targetId}`));
      invalidateCache("/api/sop");
      invalidateCache("/api/v1/sops");
    } catch (err) {
      console.warn("[SOP Delete] Server sync notice:", err);
    } finally {
      addToast(`"${targetTitle}" deleted permanently`, "success");
      setDeleteTarget(null);
    }
  };

  const handleArchive = () => {
    if (!archiveTarget) return;
    setSops(prev => {
      const next = prev.map(s => s.id === archiveTarget.id ? { ...s, status: "Archived" } : s);
      persistLocalSops(next);
      return next;
    });
    setDetailSop(d => d?.id === archiveTarget.id ? { ...d, status: "Archived" } : d);
    setArchiveTarget(null);
    addToast(`"${archiveTarget.title}" archived`, "info");
  };

  const handleDuplicate = async (sop) => {
    try {
      const data = await apiPost(`/api/sop/duplicate/${sop.id}`);
      console.log("Duplicate SOP response:", data);
  
      if (data.success && data.sop) {
        const s = data.sop;
        const normalized = {
          ...s,
          creator:           s.creator || "Unknown",
          created:           s.created_at?.split("T")[0] || "",
          updated:           s.updated_at?.split("T")[0] || "",
          estimatedTime:     s.estimated_time || "",
          steps:             (s.instruction_steps || []).map(st => st.title || ""),
          questions:         s.questions || [],
          frameworks:        s.frameworks || [],
          tags:              s.tags || [],
          comments:          [],
          attachments:       s.attachment_url ? [s.attachment_url] : [],
          revisions:         [],
          version:           s.version || "v1.0",
          readCount:         0,
          acknowledgedCount: 0,
        };
        setSops(prev => [normalized, ...prev]);
        addToast(`"${sop.title}" duplicated`);
      } else {
        addToast(data.message || "Failed to duplicate SOP", "error");
      }
    } catch (error) {
      console.error("Duplicate SOP error:", error);
      addToast("Network error, please try again", "error");
    }
  };

  const handleExport = (sop) => {
    const data = JSON.stringify(sop, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${sop.title.replace(/\s+/g, "_")}.json`; a.click();
    URL.revokeObjectURL(url);
    addToast("SOP exported");
  };

  const handleAddComment = async (sopId, text) => {
    try {
      const data = await apiPost(`/api/sop/${sopId}/comment`, { text, author: "Current User" });
  
      if (data.success && data.comment) {
        setSops(prev => prev.map(s =>
          s.id === sopId ? { ...s, comments: [...(s.comments || []), data.comment] } : s
        ));
        setDetailSop(d =>
          d?.id === sopId ? { ...d, comments: [...(d.comments || []), data.comment] } : d
        );
        addToast("Comment added");
      } else {
        addToast(data.message || "Failed to add comment", "error");
      }
    } catch (error) {
      console.error("Add comment error:", error);
      addToast("Network error, please try again", "error");
    }
  };

  const handleOpenDetail = (sop) => {
    const updated = { ...sop, readCount: (sop.readCount || 0) + 1 };
    setSops(prev => prev.map(s => s.id === sop.id ? updated : s));
    setDetailSop(updated);
  };

  return (
    <div className="space-y-6 page-shell min-w-0">




     {/* ── Content ── */}
{view === "grid" ? (
  <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-1 xl:grid-cols-2 sm:gap-3">
    <AnimatePresence mode="popLayout">
      {filtered.length === 0 ? (
        <EmptyState query={q} />
      ) : filtered.map((s) => (
        <motion.div
          layout
          key={s.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          <AdminSopCard
            sop={s}
            onOpen={handleOpenDetail}
            onEdit={setEditSop}
            onDuplicate={handleDuplicate}
            onArchive={setArchiveTarget}
            onDelete={setDeleteTarget}
            onExport={handleExport}
          />
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
) : (
  <GlassCard className="p-2 divide-y divide-rose-100">
    {filtered.length === 0 && <EmptyState query={q} />}
    <AnimatePresence>
      {filtered.map((s) => (
        <motion.div
          key={s.id}
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => handleOpenDetail(s)}
          className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-rose-50 cursor-pointer transition-colors group"
        >
          <div className="w-8 h-8 rounded-lg gradient-primary grid place-items-center shrink-0">
            <FileText className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-800 truncate">{s.title}</div>
            <div className="text-[10px] text-gray-500 mt-0.5 truncate">{s.category} · {s.creator} · {s.updated || s.created}</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge tone={statusTone(s.status)}>{s.status}</Badge>
            <Badge tone={priorityTone(s.priority)} className="hidden sm:inline-flex">{s.priority}</Badge>
            <Badge tone="info" className="hidden md:inline-flex">{s.version}</Badge>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
              <QuickActions sop={s} onEdit={setEditSop} onDuplicate={handleDuplicate} onArchive={setArchiveTarget} onDelete={setDeleteTarget} onExport={handleExport} />
            </div>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  </GlassCard>
)}

      {/* ── Detail Drawer (z-60) ── */}
      <SOPDetailDrawer
        sop={detailSop}
        onClose={() => { setDetailSop(null); navigate(location.pathname, { replace: true }); }}
        onEdit={(sop) => setEditSop(sop)}
        onDelete={setDeleteTarget}
        onDuplicate={handleDuplicate}
        onArchive={setArchiveTarget}
         onAddComment={handleAddComment} 
         onUpdateComment={handleUpdateComment}
         onDeleteComment={handleDeleteComment}
      />

      {/* ── Edit Drawer (z-80, above detail) ── */}
      <Drawer
        open={!!editSop}
        onClose={() => setEditSop(null)}
        title={`Edit: ${editSop?.title || ""}`}
        width="max-w-2xl"
        zIndex={80}
      >
        {editSop && (
          <SOPForm
            key={editSop.id}
            initialData={editSop}
            onSave={handleSave}
            onClose={() => setEditSop(null)}
            isEdit
          />
        )}
      </Drawer>

      {/* ── Add Drawer (z-80) ── */}
      <Drawer
        open={addOpen}
        onClose={() => { setAddOpen(false); navigate(location.pathname, { replace: true }); }}
        title="New SOP"
        width="max-w-2xl"
        zIndex={80}
      >
        <SOPForm
          key="add"
          onSave={handleSave}
          onClose={() => { setAddOpen(false); navigate(location.pathname, { replace: true }); }}
        />
      </Drawer>

      {/* ── Confirm Delete ── */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete SOP"
        message={`Are you sure you want to permanently delete "${deleteTarget?.title}"? This action cannot be undone.`}
        confirmLabel="Delete permanently"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        danger
      />

      {/* ── Confirm Archive ── */}
      <ConfirmModal
        open={!!archiveTarget}
        title="Archive SOP"
        message={`Archive "${archiveTarget?.title}"? It will be hidden from active lists but can be restored.`}
        confirmLabel="Archive"
        onConfirm={handleArchive}
        onCancel={() => setArchiveTarget(null)}
        danger={false}
      />

      {/* ── Toasts ── */}
      <Toast toasts={toasts} removeToast={(id) => setToasts(t => t.filter(x => x.id !== id))} />
    </div>
  );
}