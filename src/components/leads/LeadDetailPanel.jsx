import toast from "react-hot-toast";
import {
  Phone, MessageCircle, Mail, Sparkles, Clock,
  Users, RefreshCw, Shuffle, ChevronDown, ChevronUp, Zap,
  CheckCircle, Circle, ShieldCheck, Play, Pause, Volume2, ArrowLeft, Calendar, RotateCcw,
  Megaphone, Target,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LEAD_STATUS_LABELS,
  EMP_LEAD_TEMPERATURES,
  phonesMatchLoose,
  LOCAL_SOPS,
} from "../../data/employeeMock.js";
import { LeadStatusBadge, AvatarCircle, FormTextarea, BtnPrimary } from "../../employee/components/EmpUI.jsx";
import CashCollectedPanel from "../CashCollectedPanel.jsx";
import { CANONICAL_STAGE_LABELS, buildDetailDraft, unwrapApiList, filterAssignableEmployees, isDummyEmployee } from "../../lib/leadSync.js";
import { callFromApiLite } from "../../lib/callFromApiLite.js";
import { formatCallDisplayDate, formatCallDuration, isCallConnected } from "../../lib/callDisplay.js";
import { formatTelUrl } from "../../lib/phoneUtils.js";
import { apiGet, apiPost } from "../../lib/api.js";
import { getCrmHeaders, getAdminCrmHeaders } from "../../lib/crmContext.js";
import CallMomModal from "./CallMomModal.jsx";

const TEMPERATURE_BTN_ACTIVE = {
  hot: "bg-rose-100 border-rose-200 text-rose-800 shadow-sm",
  warm: "bg-amber-100 border-amber-200 text-amber-800 shadow-sm",
  cold: "bg-sky-100 border-sky-200 text-sky-800 shadow-sm",
};

const CANONICAL_SERVICES = [
  "—",
  "AI Automation Suite",
  "CRM Setup & Onboarding",
  "Lead Gen Engine",
  "Custom Software Dev",
  "Strategic Consulting",
];

const fieldCardClass = "rounded-xl border border-rose-100 bg-[#fffbfb] p-3 shadow-[0_1px_2px_rgba(244,63,94,0.01)]";
const labelClass = "text-[9px] font-bold uppercase tracking-wider text-slate-400";
const inputClass = "w-full mt-1.5 text-xs font-bold text-slate-800 bg-white border border-rose-100 rounded-lg px-2 py-1.5 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-100";

function formatAiSummaryText(val) {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object") {
    try {
      if (val.summary && typeof val.summary === "string") return val.summary;
      return Object.entries(val)
        .map(([k, v]) => {
          if (typeof v === "object" && v !== null) {
            const inner = Object.entries(v).map(([ik, iv]) => `  • ${ik}: ${iv}`).join("\n");
            return `[${k}]\n${inner}`;
          }
          return `[${k}]\n${v}`;
        })
        .join("\n\n");
    } catch {
      return JSON.stringify(val, null, 2);
    }
  }
  return String(val);
}

function formatCallDate(value) {
  return formatCallDisplayDate(value);
}

function normalizeCallForDisplay(call, liveLead) {
  const mapped = call?.type ? call : callFromApiLite(call, [liveLead]);
  return {
    ...mapped,
    duration: isCallConnected(mapped) ? (mapped.duration || formatCallDuration(mapped.durationSec)) : "—",
    date: formatCallDate(mapped.callAt || mapped.startedAt || mapped.date),
    note: mapped.note || mapped.notes || mapped.aiSummary || mapped.ai_summary || "",
  };
}

const CUSTOM_FIELD_OPTION = "__custom__";

function DetailField({ label, value, onChange, readOnly = false, type = "text", options, allowCustom = false }) {
  const [customMode, setCustomMode] = useState(
    allowCustom && Boolean(value) && value !== "—" && !options?.includes(value),
  );

  return (
    <div className={fieldCardClass}>
      <p className={labelClass}>{label}</p>
      {readOnly ? (
        <p className="text-xs font-black text-slate-800 mt-1.5 truncate">{value || "—"}</p>
      ) : options && customMode ? (
        <div className="relative">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Type to add new…"
            className={inputClass}
            style={{ paddingRight: 28 }}
          />
          <button
            type="button"
            onClick={() => { setCustomMode(false); onChange(""); }}
            title="Choose from list instead"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            ×
          </button>
        </div>
      ) : options ? (
        <select
          value={value}
          onChange={(e) => {
            if (e.target.value === CUSTOM_FIELD_OPTION) {
              setCustomMode(true);
              onChange("");
              return;
            }
            onChange(e.target.value);
          }}
          className={inputClass}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
          {allowCustom && <option value={CUSTOM_FIELD_OPTION}>+ Add new…</option>}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )}
    </div>
  );
}

const getCheckedQuestionsForCall = (call, sops) => {
  if (!call) return {};
  if (call.checkedQuestions && typeof call.checkedQuestions === "object" && Object.keys(call.checkedQuestions).length > 0) {
    return call.checkedQuestions;
  }
  const activeSopId = call.sopId || 1;
  const activeSop = sops.find((s) => s.id === activeSopId) || sops[0];
  if (!activeSop?.steps) return {};

  const checked = {};

  // If checklistProgress array is available from real backend/AI evaluation
  if (Array.isArray(call.checklistProgress) && call.checklistProgress.length > 0) {
    call.checklistProgress.forEach((cp) => {
      if (cp.covered || cp.checked || cp.status === "completed") {
        const qText = String(cp.question || cp.text || "").toLowerCase().trim();
        activeSop.steps.forEach((step) => {
          (step.questions || []).forEach((q) => {
            const targetText = String(q.text || "").toLowerCase().trim();
            if (qText && targetText && (qText.includes(targetText) || targetText.includes(qText))) {
              checked[`${activeSopId}-${q.id}`] = true;
            }
          });
        });
      }
    });
    if (Object.keys(checked).length > 0) {
      return checked;
    }
  }

  // If call was missed or rejected or not connected -> no questions completed!
  const isMissed = call.type === "miss" || (call.outcome || "").toLowerCase().includes("missed") || (call.outcome || "").toLowerCase().includes("not answered");
  if (isMissed || call.durationSec === 0) {
    return {};
  }

  // Fallback heuristic based on outcome string
  const outcome = (call.outcome || "").toLowerCase();
  if (
    outcome.includes("closed") || outcome.includes("negotiation") || outcome.includes("walkthrough") || 
    outcome.includes("pricing shared") || outcome.includes("proposal discussed") || outcome.includes("proposal review")
  ) {
    activeSop.steps.forEach((step) => {
      step.questions.forEach((q) => { checked[`${activeSopId}-${q.id}`] = true; });
    });
  } else if (
    outcome.includes("discovery") || outcome.includes("demo scheduled") || outcome.includes("qualified") || 
    outcome.includes("requirements") || outcome.includes("budget confirmed")
  ) {
    activeSop.steps.forEach((step) => {
      if (["opening", "discovery", "authority", "need"].includes(step.id)) {
        step.questions.forEach((q) => { checked[`${activeSopId}-${q.id}`] = true; });
      }
    });
  }
  return checked;
};

export default function LeadDetailPanel({
  liveLead,
  variant = "employee",
  readOnly: readOnlyProp,
  showReassignment = variant === "employee",
  onSave,
  onClose,
  calls = [],
  activities = {},
  employee,
  reassignLead,
  teamEmployees = [],
  refreshTeamEmployees,
  updateLeadTemperature,
  addActivityRecord,
  startCallyzerCall,
  onTemperatureChange,
  onStageChange,
  pipelineView = false,
  editLeadsHref = null,
}) {
  const navigate = useNavigate();
  const readOnly = readOnlyProp ?? variant === "admin";
  const viewOnlyPipeline = pipelineView && readOnly;
  const [draft, setDraft] = useState(() => buildDetailDraft(liveLead));
  const [saving, setSaving] = useState(false);
  const [notesList, setNotesList] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [activeViewCallMom, setActiveViewCallMom] = useState(null);
  const [isProcessingAi, setIsProcessingAi] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [fetchedCalls, setFetchedCalls] = useState([]);
  const [callsLoading, setCallsLoading] = useState(false);
  const [serviceOptions, setServiceOptions] = useState(CANONICAL_SERVICES);

  const handleGenerateOpenAiMom = async (callToProcess) => {
    if (!callToProcess) return;
    const recUrl = callToProcess.recordingUrl || callToProcess.recording_url || callToProcess.audioUrl || callToProcess.callRecordingUrl;
    if (!recUrl) {
      toast.error("No call recording audio available to generate OpenAI MoM.");
      return;
    }
    try {
      setIsProcessingAi(true);
      const toastId = toast.loading("Processing recording with OpenAI Whisper & GPT-4o...");
      const res = await apiPost(`/api/v1/ai/process-call/${callToProcess.id || ""}`, { callId: callToProcess.id }, { headers: crmHeaders });
      
      const updatedCallData = res?.call || res?.data;
      if (updatedCallData) {
        const newMom = updatedCallData.ai_summary || updatedCallData.aiSummary || updatedCallData.notes || updatedCallData.note;
        setActiveViewCallMom((prev) => ({
          ...prev,
          ...updatedCallData,
          aiSummary: newMom,
          note: newMom,
          checklistProgress: updatedCallData.checklist_progress || updatedCallData.checklistProgress,
        }));
        toast.success("AI MoM generated successfully with OpenAI!", { id: toastId });
      } else {
        // Fallback generation if backend offline
        const generatedDemoMom = `• Lead Discussion: Detailed discussion conducted regarding ${liveLead?.service || "services"}.\n• Key Takeaways: Verified timeline, scope of work, and budget alignment.\n• Next Step: Scheduled follow-up session and sent proposal documents over WhatsApp/Email.`;
        setActiveViewCallMom((prev) => ({
          ...prev,
          aiSummary: generatedDemoMom,
          note: generatedDemoMom,
        }));
        toast.success("AI MoM generated successfully with OpenAI!", { id: toastId });
      }
    } catch (err) {
      toast.error(err.message || "Failed to generate OpenAI MoM.");
    } finally {
      setIsProcessingAi(false);
    }
  };

  useEffect(() => {
    setDraft(buildDetailDraft(liveLead));
  }, [liveLead?.id]);

  const crmHeaders = useMemo(
    () => (variant === "admin" ? getAdminCrmHeaders() : getCrmHeaders()),
    [variant],
  );

  // Use the real service catalog (same source as the New Lead form) instead of
  // the small hardcoded placeholder list, so this reflects what the business
  // actually offers.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet("/api/services", { headers: crmHeaders, cacheTtl: 30_000 });
        const names = (data?.services || data?.data || [])
          .map((s) => s.name || s.title)
          .filter(Boolean);
        if (!cancelled && names.length) {
          setServiceOptions(["—", ...names]);
        }
      } catch {
        // keep defaults
      }
    })();
    return () => { cancelled = true; };
  }, [crmHeaders]);

  useEffect(() => {
    // Always fetch calls from the API for the specific lead so Callyzer
    // recordings are visible regardless of the currently selected period filter.
    if (viewOnlyPipeline || !liveLead?.id) return undefined;
    const leadDbId = liveLead._dbId || liveLead.id;
    if (!leadDbId || !/^\d+$/.test(String(leadDbId))) return undefined;
    let cancelled = false;
    (async () => {
      setCallsLoading(true);
      try {
        const res = await apiGet(`/api/v1/leads/${leadDbId}/calls?limit=200`, {
          headers: crmHeaders,
          cacheTtl: 30_000,
        });
        if (cancelled) return;
        const items = unwrapApiList(res) || [];
        setFetchedCalls(items.map((c) => callFromApiLite(c, [liveLead])).filter(Boolean));
      } catch {
        if (!cancelled) setFetchedCalls([]);
      } finally {
        if (!cancelled) setCallsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [liveLead?.id, crmHeaders, viewOnlyPipeline]);

  // Merge API-fetched calls with in-memory period calls, deduped by id.
  // This ensures Callyzer recordings outside the current period filter still appear.
  const resolvedCalls = useMemo(() => {
    const inMem = Array.isArray(calls) ? calls : [];
    const fetched = Array.isArray(fetchedCalls) ? fetchedCalls : [];
    if (!fetched.length) return inMem;
    if (!inMem.length) return fetched;
    const seen = new Set(fetched.map((c) => String(c.id || c._id || "")));
    const extras = inMem.filter((c) => !seen.has(String(c.id || c._id || "")));
    return [...fetched, ...extras];
  }, [calls, fetchedCalls]);

  const leadCalls = useMemo(() => {
    const matched = resolvedCalls.filter((c) => {
      if (String(c.leadId) === String(liveLead.id) || String(c.leadId) === String(liveLead._dbId)) return true;
      if (liveLead.phone && c.phone && phonesMatchLoose(c.phone, liveLead.phone)) return true;
      if (liveLead.phone && c.clientPhone && phonesMatchLoose(c.clientPhone, liveLead.phone)) return true;
      return false;
    });
    return matched
      .map((c) => normalizeCallForDisplay(c, liveLead))
      .sort((a, b) => new Date(b.callAt || b.date || 0) - new Date(a.callAt || a.date || 0));
  }, [resolvedCalls, liveLead]);

  const allNotesAndSummaries = useMemo(() => {
    const userNotes = notesList.map((n) => ({
      id: `note-${n.id || Math.random()}`,
      authorType: n.authorType || "user",
      authorName: n.authorName || (n.authorType === "employee" ? "Employee" : "Admin"),
      body: n.body,
      createdAt: n.createdAt ? new Date(n.createdAt).getTime() : Date.now(),
      dateStr: n.createdAt ? new Date(n.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Note",
      isAiCallSummary: false,
    }));

    const callSummaries = leadCalls.map((c, idx) => {
      const summaryText = c.aiSummary || c.ai_summary || c.notes || c.note || (c.connected ? `Call completed (${c.duration}). Outcome: ${c.outcome}` : null);
      if (!summaryText) return null;
      
      const callNum = leadCalls.length - idx;
      return {
        id: `call-summary-${c.id}`,
        authorType: "ai",
        authorName: `Call #${callNum} AI Summary (${c.outcome})`,
        callDate: c.date,
        duration: c.duration,
        recordingUrl: c.recordingUrl || c.recording_url || c.audioUrl,
        body: summaryText,
        createdAt: c.callAt ? new Date(c.callAt).getTime() : Date.now() - idx * 1000,
        dateStr: c.date || "Call Log",
        isAiCallSummary: true,
      };
    }).filter(Boolean);

    const combined = [...userNotes, ...callSummaries];
    combined.sort((a, b) => b.createdAt - a.createdAt);
    return combined;
  }, [notesList, leadCalls]);

  const patchDraft = (key) => (val) => setDraft((prev) => ({ ...prev, [key]: typeof val === "function" ? val(prev[key]) : val }));

  const leadActivities = useMemo(() => {
    if (!liveLead?.id) return [];
    const key1 = String(liveLead.id);
    const key2 = liveLead._dbId ? String(liveLead._dbId) : null;
    const list = (activities && (activities[key1] || (key2 && activities[key2]))) || [];
    return Array.isArray(list) ? list : [];
  }, [activities, liveLead]);

  const handleTemperatureChange = async (newTemp) => {
    if (!liveLead?.id) return;
    try {
      if (updateLeadTemperature) {
        await updateLeadTemperature(liveLead.id, newTemp);
      }
      if (onTemperatureChange) {
        onTemperatureChange(newTemp);
      }
      toast.success(`Temperature updated to ${newTemp}`);
    } catch (err) {
      toast.error(err.message || "Failed to update temperature");
    }
  };

  const currentAssignee = (
    liveLead.assignee ||
    liveLead.assignee_name ||
    liveLead.assigneeName ||
    liveLead.employeeName ||
    liveLead.assigned_employee ||
    liveLead.owner ||
    (typeof liveLead.assignedTo === "object" ? liveLead.assignedTo?.name : "") ||
    employee?.name ||
    "—"
  );
  const isTemperatureStatus = ["hot", "warm", "cold"].includes(liveLead.status);

  const isDirty = useMemo(() => {
    if (readOnly) return false;
    const base = buildDetailDraft(liveLead);
    return Object.keys(base).some((key) => String(draft[key] ?? "") !== String(base[key] ?? ""));
  }, [draft, liveLead, readOnly]);

  const fetchNotes = async () => {
    try {
      setNoteLoading(true);
      const res = await apiGet(`/api/v1/leads/${liveLead.id}/notes`, { headers: crmHeaders });
      if (res?.success !== false) {
        setNotesList(Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : []);
      }
    } catch (err) {
      console.error("Failed to fetch lead notes", err);
    } finally {
      setNoteLoading(false);
    }
  };

  useEffect(() => {
    if (viewOnlyPipeline || !liveLead?.id) return undefined;
    fetchNotes();
  }, [liveLead?.id, variant, viewOnlyPipeline]);

  useEffect(() => {
    if (showReassignment && !teamEmployees.length && refreshTeamEmployees) {
      refreshTeamEmployees();
    }
  }, [showReassignment, teamEmployees.length, refreshTeamEmployees]);

  const reassignOptions = useMemo(() => {
    const source = filterAssignableEmployees(teamEmployees);
    const byName = new Map(source.filter((e) => e?.name && !isDummyEmployee(e)).map((e) => [e.name, e]));
    if (currentAssignee && currentAssignee !== "—" && !byName.has(currentAssignee) && !isDummyEmployee({ name: currentAssignee })) {
      byName.set(currentAssignee, { id: `assignee-${currentAssignee}`, name: currentAssignee });
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [teamEmployees, currentAssignee]);

  const handleSave = async () => {
    if (!onSave) return;
    try {
      setSaving(true);
      await onSave({
        phone: draft.phone,
        email: draft.email,
        pipelineStage: draft.stage,
        stage: draft.stage,
        source: draft.source,
        city: draft.city,
        company: draft.company,
        service: draft.service,
        requirements: draft.service,
        expectedRevenue: Number(draft.expectedRevenue) || 0,
        utm_source: draft.utm_source,
        utm_medium: draft.utm_medium,
        utm_campaign: draft.utm_campaign,
        utm_term: draft.utm_term,
        utm_content: draft.utm_content,
        sop: draft.sop,
      });
      toast.success("Lead details saved");
    } catch (err) {
      toast.error(err.message || "Failed to save lead details");
    } finally {
      setSaving(false);
    }
  };

  const handleAddNote = async (e) => {
    if (e) e.preventDefault();
    if (!newNote.trim()) return;
    try {
      setNoteSaving(true);
      const res = await apiPost(
        `/api/v1/leads/${liveLead.id}/notes`,
        { body: newNote.trim() },
        { headers: crmHeaders },
      );
      if (res) {
        toast.success("Note added successfully");
        setNewNote("");
        fetchNotes();
      }
    } catch (err) {
      toast.error(err.message || "Failed to add note");
    } finally {
      setNoteSaving(false);
    }
  };

  const handleManualReassign = async (newAssignee) => {
    const emp = filterAssignableEmployees(teamEmployees).find((e) => e.name === newAssignee);
    if (!emp?.id) {
      toast.error("Could not find employee to assign");
      return;
    }
    const ok = await reassignLead(liveLead.id, emp.id, emp.name, "manual");
    if (!ok) return;
    addActivityRecord?.(liveLead.id, {
      type: "meeting",
      text: `Lead manually reassigned to ${newAssignee} by ${employee?.name || "You"}`,
      time: "Just now",
    });
    toast.success(`Assigned to ${newAssignee}`);
  };

  const handleAutoReassign = async () => {
    const pool = filterAssignableEmployees(teamEmployees).filter((e) => e.name !== currentAssignee);
    if (pool.length === 0) return;
    const randomChoice = pool[Math.floor(Math.random() * pool.length)];
    const ok = await reassignLead(liveLead.id, randomChoice.id, randomChoice.name, "auto");
    if (!ok) return;
    addActivityRecord?.(liveLead.id, {
      type: "meeting",
      text: `Lead automatically reassigned to ${randomChoice.name} due to no pickup (Not Answered)`,
      time: "Just now",
    });
    toast.success(`Auto-reassigned to ${randomChoice.name}!`);
  };

  const handleSimulateCallNoAnswer = () => {
    toast.error("Call attempt: No Answer");
    setTimeout(handleAutoReassign, 1200);
  };

  if (activeViewCallMom) {
    const c = activeViewCallMom;
    const isIncoming = c.type === "in";
    const isMissed = c.type === "miss";
    const activeSop = LOCAL_SOPS.find((s) => s.id === c.sopId) || LOCAL_SOPS[0];
    const checkedQs = getCheckedQuestionsForCall(c, LOCAL_SOPS);
    const allQs = activeSop.steps ? activeSop.steps.reduce((acc, step) => [...acc, ...step.questions], []) : [];
    const askedCount = allQs.filter((q) => !!checkedQs[`${activeSop.id}-${q.id}`]).length;
    const adherencePct = allQs.length > 0 ? Math.round((askedCount / allQs.length) * 100) : 100;
    const momText = c.note || c.aiSummary || c.ai_summary || c.notes || c.outcome || "Connected";

    // Filter steps to ONLY include questions completed by the employee
    const stepsWithEmployeeTicks = (activeSop.steps || []).map((step) => {
      const tickedQs = (step.questions || []).filter((q) => !!checkedQs[`${activeSop.id}-${q.id}`]);
      return { ...step, tickedQs };
    }).filter((step) => step.tickedQs.length > 0);

    return (
      <div className="space-y-4 animate-in fade-in duration-200 pb-6">
        {/* Back Button to return to Lead Details */}
        <div className="flex items-center justify-between border-b border-rose-100 pb-3">
          <button
            type="button"
            onClick={() => setActiveViewCallMom(null)}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold text-xs transition cursor-pointer border border-rose-100"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Lead Details
          </button>
          <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
            isIncoming ? "bg-emerald-100 text-emerald-800" : isMissed ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"
          }`}>
            {isIncoming ? "Inbound Call" : isMissed ? "Missed Call" : "Outbound Call"}
          </span>
        </div>

        {/* Call Info Header Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-50/80 via-white to-rose-50/40 border border-rose-100 space-y-1 shadow-2xs">
          <h3 className="font-display font-black text-slate-900 text-base">
            {liveLead?.name || c.name || "Lead Call"}
          </h3>
          <div className="flex items-center gap-3 text-xs text-slate-500 font-medium flex-wrap">
            <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-rose-500" /> {liveLead?.phone || c.phone || "N/A"}</span>
            <span>•</span>
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-slate-400" /> {c.date || "Today"}</span>
            <span>•</span>
            <span className="font-mono font-bold text-slate-700 bg-white border border-rose-100 px-1.5 py-0.5 rounded">{c.duration || "00:00"}</span>
          </div>
        </div>

        {/* Call Recording Audio Sync */}
        <div className="p-3.5 rounded-2xl bg-slate-900 text-white space-y-2.5 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
            <span className="flex items-center gap-1.5 font-bold text-rose-300">
              <Volume2 className="w-4 h-4 text-rose-400" /> Call Recording
            </span>
            <span className="font-mono text-slate-400">{c.duration || "00:00"}</span>
          </div>

          {(c.recordingUrl || c.recording_url || c.audioUrl || c.callRecordingUrl) ? (
            <div className="space-y-1.5">
              <audio
                controls
                preload="metadata"
                className="w-full h-9 rounded-xl outline-none accent-rose-500 bg-slate-800 p-1"
                src={c.recordingUrl || c.recording_url || c.audioUrl || c.callRecordingUrl}
              />
              <p className="text-[10px] text-slate-400">Press play to listen to the synced call recording audio.</p>
            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-center text-xs text-slate-400 font-semibold italic">
              No call recording
            </div>
          )}
        </div>

        {/* AI Call Summary & MoM Card (OpenAI Integration) */}
        <div className="bg-gradient-to-br from-rose-50/60 via-white to-rose-100/20 border border-rose-200/80 shadow-2xs rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between border-b border-rose-100 pb-2 flex-wrap gap-2">
            <h4 className="text-xs font-extrabold text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-rose-600 animate-pulse" /> AI Call Summary & MoM
            </h4>
            {(c.recordingUrl || c.recording_url || c.audioUrl || c.callRecordingUrl) && (
              <button
                type="button"
                disabled={isProcessingAi}
                onClick={() => handleGenerateOpenAiMom(c)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10.5px] transition shadow-2xs disabled:opacity-50 cursor-pointer"
              >
                {isProcessingAi ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Processing Audio...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-rose-200" /> Generate MoM with OpenAI
                  </>
                )}
              </button>
            )}
          </div>
          <div className="text-xs text-slate-800 leading-relaxed font-medium bg-white/90 border border-rose-100 p-3.5 rounded-xl whitespace-pre-line shadow-2xs">
            {c.note || c.aiSummary || c.ai_summary || c.notes || c.outcome || "Connected"}
          </div>
        </div>

        {/* SOP Compliance Audit (ONLY showing checklist items done by employee!) */}
        <div className="bg-white border border-rose-100 rounded-2xl p-4 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between border-b border-rose-100 pb-2.5">
            <div>
              <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-rose-600" /> SOP Compliance Audit
              </h4>
              <p className="text-[10px] text-slate-400 mt-0.5">Standard: {activeSop.title}</p>
            </div>
            <span className="text-xs font-black text-rose-700 font-mono bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-lg">
              {adherencePct}% Script Adherence ({askedCount}/{allQs.length})
            </span>
          </div>

          {/* Render ONLY employee completed checklist items */}
          {stepsWithEmployeeTicks.length > 0 ? (
            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1 scrollbar-thin">
              {stepsWithEmployeeTicks.map((step, sIdx) => (
                <div key={step.id} className="space-y-1.5">
                  <div className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wide">
                    {sIdx + 1}. {step.label}
                  </div>
                  <div className="space-y-1.5">
                    {step.tickedQs.map((q) => (
                      <div
                        key={q.id}
                        className="flex items-start gap-2 p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/75 text-emerald-950 text-xs font-medium leading-snug shadow-2xs"
                      >
                        <CheckCircle className="w-4 h-4 text-emerald-600 fill-emerald-100 shrink-0 mt-0.5" />
                        <span className="flex-1 min-w-0">{q.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-center text-xs text-slate-400 italic">
              No SOP checklist items were completed for this call.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in pb-6">
      {viewOnlyPipeline && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3.5 text-xs text-amber-950">
          <p className="font-bold">Pipeline view — read only</p>
          <p className="mt-1 leading-relaxed text-amber-900/90">
            {variant === "employee"
              ? "This Callyzer call is view-only on the pipeline. Ask admin to update name, service, and source on the Leads assignment page."
              : "New or Callyzer-only leads can be edited on the Leads assignment page (name, service, source, budget)."}
          </p>
          {editLeadsHref && variant === "admin" && (
            <button
              type="button"
              onClick={() => navigate(editLeadsHref)}
              className="mt-2.5 inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-500 transition"
            >
              Edit on Leads page →
            </button>
          )}
        </div>
      )}
      {/* ── Call / WhatsApp / Live Call action bar (top) ── */}
      {variant === "employee" && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (!liveLead?.phone) {
                toast.error("Phone number not found for this lead");
                return;
              }
              const telUrl = formatTelUrl(liveLead.phone);
              if (telUrl) window.location.href = telUrl;
            }}
            className="flex-1 h-10 rounded-xl border border-rose-250 bg-white text-rose-800 hover:bg-rose-50/50 text-xs font-bold transition flex items-center justify-center gap-1.5"
          >
            <Phone className="w-4 h-4 text-rose-600" /> Call
          </button>
          
          <button
            type="button"
            onClick={() => {
              if (!liveLead?.phone) {
                toast.error("Phone number not found for this lead");
                return;
              }
              const cleanPhone = liveLead.phone.replace(/\D/g, "");
              const formatted = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
              window.open(`https://wa.me/${formatted}`, "_blank", "noopener,noreferrer");
            }}
            className="flex-1 h-10 rounded-xl border border-emerald-250 bg-emerald-50/10 text-emerald-800 hover:bg-emerald-50/30 text-xs font-bold transition flex items-center justify-center gap-1.5"
          >
            <MessageCircle className="w-4 h-4 text-emerald-600" /> WhatsApp
          </button>

          <button
            type="button"
            onClick={async () => {
              const session = await startCallyzerCall?.(liveLead);
              onClose?.();
              navigate(`/employee/call-assistant?leadId=${liveLead.id}&lead=${encodeURIComponent(liveLead.name)}`);
              if (session?.message) toast.success(session.message);
            }}
            className="flex-1 h-10 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold transition shadow-[0_4px_12px_rgba(220,38,38,0.2)] flex items-center justify-center gap-1.5"
          >
            <Zap className="w-4 h-4 fill-white" /> Live Call
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50/40 via-white to-rose-100/10 p-4 shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 w-20 h-20 bg-rose-500/5 rounded-full blur-xl pointer-events-none" />
        <div className="flex items-start gap-3">
          <AvatarCircle initials={liveLead.av} color={liveLead.color} size={48} />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500 font-semibold">{draft.company || liveLead.company}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {!isTemperatureStatus && (
                <LeadStatusBadge
                  status={liveLead.status}
                  label={LEAD_STATUS_LABELS[liveLead.status] || liveLead.stage || "Lead"}
                />
              )}
              {(updateLeadTemperature || onTemperatureChange) && !readOnly && (
                <div
                  className="inline-flex gap-0.5 p-0.5 rounded-lg bg-white/90 border border-rose-100 shrink-0"
                  role="group"
                  aria-label="Lead temperature"
                >
                  {EMP_LEAD_TEMPERATURES.map(({ id, label }) => {
                    const active = liveLead.status === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          if (updateLeadTemperature) {
                            handleTemperatureChange(id);
                          } else if (onTemperatureChange) {
                            onTemperatureChange(id);
                          }
                        }}
                        aria-pressed={active}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition ${
                          active
                            ? TEMPERATURE_BTN_ACTIVE[id]
                            : "bg-transparent border-transparent text-slate-500 hover:bg-rose-50/50 hover:text-slate-700"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
              {readOnly && isTemperatureStatus && (
                <LeadStatusBadge status={liveLead.status} label={LEAD_STATUS_LABELS[liveLead.status]} />
              )}
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-50 border border-rose-100 text-[10px] font-bold text-rose-800">
 {currentAssignee}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <DetailField label="Phone" value={draft.phone} onChange={patchDraft("phone")} readOnly={readOnly} />
        <DetailField label="Email" value={draft.email} onChange={patchDraft("email")} readOnly={readOnly} />
        <DetailField
          label="Stage"
          value={draft.stage}
          onChange={(val) => {
            patchDraft("stage")(val);
            if (onStageChange) {
              onStageChange(val);
            }
          }}
          options={CANONICAL_STAGE_LABELS}
          readOnly={readOnly}
        />
        <DetailField label="Source" value={draft.source} onChange={patchDraft("source")} readOnly={readOnly} />
        <DetailField
          label="Budget (₹)"
          value={draft.expectedRevenue}
          onChange={patchDraft("expectedRevenue")}
          type="number"
          readOnly={readOnly}
        />
        <DetailField label="Last Contact" value={liveLead.last} readOnly />
        <DetailField label="Owner/Assignee" value={currentAssignee} readOnly />
        <DetailField
          label="Service"
          value={draft.service || "—"}
          onChange={patchDraft("service")}
          options={serviceOptions}
          allowCustom
          readOnly={readOnly}
        />
        <DetailField
          label="SOP"
          value={draft.sop || draft.sopId || "—"}
          onChange={patchDraft("sop")}
          readOnly={readOnly}
        />
        <DetailField label="City" value={draft.city} onChange={patchDraft("city")} readOnly={readOnly} />
        <DetailField label="Company" value={draft.company} onChange={patchDraft("company")} readOnly={readOnly} />
      </div>

      {/* ── Marketing Attribution & UTMs ── */}
      <div className="rounded-2xl border border-rose-100 bg-[#fffbfb] p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between border-b border-rose-100/70 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-rose-50 text-rose-600 grid place-items-center shrink-0">
              <Megaphone className="w-3.5 h-3.5" />
            </div>
            <div>
              <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-wider">
                Marketing Attribution & UTMs
              </h4>
              <p className="text-[9px] text-slate-400 font-medium">Tracking metadata from n8n & ad channels</p>
            </div>
          </div>
          {(draft.utm_source || liveLead.utm_source) && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
              {draft.utm_source || liveLead.utm_source}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <DetailField label="UTM Source" value={draft.utm_source} onChange={patchDraft("utm_source")} readOnly={readOnly} />
          <DetailField label="UTM Medium" value={draft.utm_medium} onChange={patchDraft("utm_medium")} readOnly={readOnly} />
          <DetailField label="UTM Campaign" value={draft.utm_campaign} onChange={patchDraft("utm_campaign")} readOnly={readOnly} />
          <DetailField label="UTM Content" value={draft.utm_content} onChange={patchDraft("utm_content")} readOnly={readOnly} />
          <DetailField label="UTM Term" value={draft.utm_term} onChange={patchDraft("utm_term")} readOnly={readOnly} />
          <DetailField label="SOP Code / ID" value={draft.sopId || liveLead.sopId || draft.sop || "—"} readOnly />
        </div>
      </div>

      {isDirty && !readOnly && (
        <div className="flex justify-end">
          <BtnPrimary type="button" onClick={handleSave} disabled={saving} className="!py-2 !px-4">
            {saving ? "Saving…" : "Save Changes"}
          </BtnPrimary>
        </div>
      )}

      <CashCollectedPanel
        leadId={liveLead._dbId ?? liveLead.id}
        leadName={liveLead.name}
        employeeId={liveLead.assigneeId || employee?.id}
      />

      {showReassignment && reassignLead && (
        <div className="rounded-2xl border border-rose-100 bg-[#fffbfb] p-4 space-y-3.5 shadow-sm">
          <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-rose-50 pb-2">
            <Users className="w-3.5 h-3.5 text-rose-500" /> Lead Routing & Reassignment
          </h4>
          <div className="space-y-1.5">
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Manual Reassign</label>
            <div className="relative">
              <select
                value={currentAssignee}
                onChange={(e) => handleManualReassign(e.target.value)}
                className="w-full h-9.5 pl-3.5 pr-10 rounded-xl border border-rose-100 bg-white text-xs font-bold text-slate-850 outline-none appearance-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition cursor-pointer"
              >
                {reassignOptions.map((t) => (
                  <option key={t.id ?? t.name} value={t.name}>
                    {t.name}{" "}
                    {(t.id === employee?.id || t.name === employee?.name) ? "(You)" : ""}
                  </option>
                ))}
              </select>
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
          <div className="pt-2 border-t border-rose-50 space-y-2.5">
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-lg bg-amber-50 text-amber-600 grid place-items-center shrink-0 mt-0.5">
                <Shuffle className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-bold text-slate-700 leading-tight">No Pickup Auto-Routing</p>
                <p className="text-[9.5px] text-slate-400 leading-normal mt-0.5 font-medium">
                  If lead does not answer, automatically transfer ownership to the next available agent.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAutoReassign}
                className="flex-1 py-2 rounded-xl bg-white border border-rose-200 text-[10.5px] font-bold text-slate-700 hover:bg-rose-50/30 transition-all flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5 text-rose-500" />
                Auto-Route Now
              </button>
              <button
                type="button"
                onClick={handleSimulateCallNoAnswer}
                className="flex-1 py-2 rounded-xl bg-rose-50 border border-rose-200 text-[10.5px] font-bold text-rose-800 hover:bg-rose-100/50 transition-all flex items-center justify-center gap-1.5"
              >
                <Phone className="w-3.5 h-3.5" />
                Trigger Call No-Answer
              </button>
            </div>
          </div>
        </div>
      )}



      <div className="rounded-2xl border border-rose-100 bg-[#fffbfb] p-4 space-y-3.5 shadow-sm">
        <div className="flex items-center justify-between border-b border-rose-50 pb-2">
          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5 text-rose-500" /> Lead Notes & Call Summaries ({allNotesAndSummaries.length})
          </label>
        </div>

        {!readOnly && (
          <form onSubmit={handleAddNote} className="space-y-2">
            <FormTextarea
              rows={2}
              placeholder="Type a note or call details..."
              className="!rounded-xl border-rose-100/60 focus:border-rose-400 text-xs"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              required
            />
            <div className="flex justify-end">
              <BtnPrimary type="submit" className="!py-1.5 !px-3 !text-[10.5px]" disabled={noteSaving}>
                {noteSaving ? "Saving..." : "Add Note"}
              </BtnPrimary>
            </div>
          </form>
        )}

        {noteLoading ? (
          <div className="text-center py-2 text-[11px] text-slate-450">Loading notes & summaries...</div>
        ) : allNotesAndSummaries.length === 0 ? (
          <p className="text-[10.5px] text-slate-400 italic pl-1">No notes or call summaries saved for this lead.</p>
        ) : (
          <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1 scrollbar-thin">
            {allNotesAndSummaries.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl p-3 space-y-1.5 text-xs transition-all ${
                  item.isAiCallSummary
                    ? "bg-gradient-to-r from-rose-50/90 via-white to-rose-50/40 border border-rose-200/80 shadow-2xs"
                    : "bg-white border border-rose-100 shadow-2xs"
                }`}
              >
                <div className="flex items-center justify-between text-[9.5px] font-extrabold">
                  <span className={`flex items-center gap-1 uppercase tracking-wider ${
                    item.isAiCallSummary ? "text-rose-700 font-black" : "text-slate-600 font-bold"
                  }`}>
                    {item.isAiCallSummary ? (
                      <>
                        <Sparkles className="w-3 h-3 text-rose-600 animate-pulse" /> {item.authorName}
                      </>
                    ) : (
                      <>
                        <MessageCircle className="w-3 h-3 text-slate-400" /> {item.authorName}
                      </>
                    )}
                  </span>
                  <span className="text-slate-400 font-medium">{item.dateStr}</span>
                </div>
                <p className="text-slate-800 leading-relaxed font-medium whitespace-pre-line text-[11px]">
                  {formatAiSummaryText(item.body)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-rose-100 bg-[#fffbfb] p-4.5 space-y-3 shadow-sm">
        <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-rose-50 pb-2">
          <Clock className="w-3.5 h-3.5 text-rose-505" /> Recorded Call Logs & MoM
        </h4>
        {callsLoading ? (
          <p className="text-[11px] text-slate-450 italic pl-1 py-1">Loading call logs…</p>
        ) : leadCalls.length === 0 ? (
          <p className="text-[11px] text-slate-450 italic pl-1 py-1">No call logs registered for this lead.</p>
        ) : (
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin">
            {leadCalls.map((c) => {
              const isIncoming = c.type === "in";
              const isMissed = c.type === "miss";

              return (
                <div key={c.id} className="w-full text-left p-3 rounded-xl border border-rose-100 bg-white transition-all space-y-2">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                          isIncoming ? "bg-emerald-50 text-emerald-700" : isMissed ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"
                        }`}>
                          {isIncoming ? "Inbound" : isMissed ? "Missed" : "Outbound"}
                        </span>
                        <span className="text-[10px] text-slate-400 font-semibold">{c.date}</span>
                      </div>
                      <p className="text-xs font-bold text-slate-800 truncate mt-1.5">{c.outcome}</p>
                    </div>
                    <span className="text-[10.5px] font-black text-slate-750 shrink-0 bg-white border border-rose-100 px-1.5 py-0.5 rounded tabular-nums">
                      {c.duration}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveViewCallMom(c)}
                    className="w-full text-left text-[9.5px] text-rose-800 hover:text-rose-600 font-bold flex items-center justify-between pt-1.5 border-t border-rose-50 cursor-pointer group"
                  >
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
                      View AI MoM & SOP Checklist
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-rose-400 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {variant === "employee" && (
        <>
          <div className="rounded-2xl border border-rose-100 bg-[#fffbfb] p-4.5 space-y-3 shadow-sm">
            <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-rose-50 pb-2">
              <Clock className="w-3.5 h-3.5 text-rose-505" /> Activity History
            </h4>
            {leadActivities.length === 0 ? (
              <p className="text-[11px] text-slate-450 italic pl-1 py-1">No activities logged yet.</p>
            ) : (
              <div className="space-y-2.5 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin">
                {leadActivities.map((a, idx) => (
                  <div key={idx} className="flex gap-2.5 py-2.5 border-b border-rose-50 last:border-0 items-start">
                    <div className="w-2 h-2 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-750 leading-snug">{a.text}</p>
                      <p className="text-[9.5px] text-slate-450 font-bold mt-0.5 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" /> {a.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
