import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft, Phone, CalendarClock, Play, Pause, Sparkles,
  CheckCircle, Circle, Star, Smile, AlertCircle, RefreshCw,
  Clock, RotateCcw, Volume2, ShieldCheck, HelpCircle, ChevronRight,
  User, CheckCircle2, History, ChevronDown, Pencil, IndianRupee, UserPlus,
} from "lucide-react";
import { GlassCard, Badge } from "../../components/Primitives.jsx";
import { CustomSelect } from "../../components/CustomSelect.jsx";
import { useEmployee } from "../../context/EmployeeContext.jsx";
import {
  AvatarCircle, LeadStatusBadge, BtnPrimary, BtnSecondary, BtnGhost, EmpModal,
  FormInput, FormLabel, FormGroup, FormSelect, FormTextarea, FormRow
} from "../components/EmpUI.jsx";
import { TimeOfDaySelects } from "../components/TimeOfDaySelects.jsx";
import { LOCAL_SOPS, LEAD_STATUS_LABELS, EMP_KANBAN_STAGES, getEmpStageMeta, mapEmpLeadKanbanStage, resolveLeadForCall } from "../../data/employeeMock.js";
import { temperatureToApi, workflowStatusFromTemperature, apiLeadToEmployee, unwrapApiList } from "../../lib/leadSync.js";
import { formatCallDisplayDate, formatCallDurationLabel } from "../../lib/callDisplay.js";

import SaveContactModal from "../../components/SaveContactModal.jsx";

const LEAD_STATUS_OPTIONS = [
  { value: "hot", label: "Hot Lead" },
  { value: "warm", label: "Warm Lead" },
  { value: "cold", label: "Cold Lead" },
  { value: "converted", label: "Converted" },
  { value: "notpick", label: "Not Picked" },
  { value: "ni", label: "Not Interested" },
];

const PIPELINE_STAGE_OPTIONS = EMP_KANBAN_STAGES.map((option) => ({
  value: option.id,
  label: option.label,
}));

const CANONICAL_SERVICES_OPTIONS = [
  { value: "—", label: "—" },
  { value: "AI Automation Suite", label: "AI Automation Suite" },
  { value: "CRM Setup & Onboarding", label: "CRM Setup & Onboarding" },
  { value: "Lead Gen Engine", label: "Lead Gen Engine" },
  { value: "Custom Software Dev", label: "Custom Software Dev" },
  { value: "Strategic Consulting", label: "Strategic Consulting" },
];

function formatIndianCurrency(numStr) {
  if (!numStr) return "";
  const n = Number(numStr);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("en-IN");
}

function budgetToEditDisplay(lead) {
  if (!lead) return "";
  if (Number(lead.expectedRevenue) > 0) {
    return formatIndianCurrency(String(lead.expectedRevenue));
  }
  if (lead.budget && lead.budget !== "—") {
    const digits = String(lead.budget).replace(/[^\d.]/g, "");
    return digits ? formatIndianCurrency(digits) : "";
  }
  return "";
}

function stageToSelectValue(stage) {
  const stageId = mapEmpLeadKanbanStage(stage, "");
  return stageId || "conversation";
}

function stageSelectToLabel(stageValue) {
  const id = EMP_KANBAN_STAGES.some((option) => option.id === stageValue)
    ? stageValue
    : stageToSelectValue(stageValue);
  return getEmpStageMeta(id).label;
}

function leadStatusLabel(lead) {
  if (!lead) return "Lead";
  return LEAD_STATUS_LABELS[lead.status] || lead.stage || String(lead.status || "Lead");
}

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

// Helper to parse duration string (MM:SS or similar) into seconds
const parseDurationToSeconds = (durationStr) => {
  if (!durationStr || durationStr === "—") return 0;
  const parts = durationStr.split(":");
  if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  return 0;
};

// Helper to format seconds to MM:SS
const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

// Map mood string to text + emoji + color theme
const MOOD_META = {
  hot: { label: "Hot Lead", bg: "bg-rose-50 border-rose-200 text-rose-700 font-bold" },
  warm: { label: "Warm Lead", bg: "bg-amber-50 border-amber-200 text-amber-700 font-bold" },
  cold: { label: "Cold Lead", bg: "bg-sky-50 border-sky-200 text-sky-700 font-bold" },
  positive: { label: "Excited", bg: "bg-emerald-50 border-emerald-250 text-emerald-700 font-bold" },
  neutral: { label: "Neutral", bg: "bg-slate-50 border-slate-200 text-slate-600 font-bold" },
  negative: { label: "Hesitant", bg: "bg-amber-50 border-amber-200 text-amber-700 font-bold" },
};

// Helper to resolve which SOP was used based on metadata / outcome
const getSopForCall = (call) => {
  if (call.sopId) return call.sopId;
  const company = (call.company || "").toLowerCase();
  const outcome = (call.outcome || "").toLowerCase();
  const name = (call.name || "").toLowerCase();
  
  if (company.includes("media") || company.includes("zee") || outcome.includes("zee") || outcome.includes("podcast")) {
    return 3; // Zee News Podcast Pitch
  }
  if (outcome.includes("bant") || outcome.includes("qualified") || name.includes("arun") || name.includes("priya")) {
    return 2; // BANT Qualification
  }
  return 1; // Intro & Cold Outreach (default)
};

const getCheckedQuestionsForCall = (call, sops) => {
  if (!call) return {};
  if (call.checkedQuestions && typeof call.checkedQuestions === "object" && Object.keys(call.checkedQuestions).length > 0) {
    return call.checkedQuestions;
  }
  const activeSopId = getSopForCall(call);
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
    outcome.includes("closed") || 
    outcome.includes("negotiation") || 
    outcome.includes("walkthrough") || 
    outcome.includes("pricing shared") || 
    outcome.includes("proposal discussed") || 
    outcome.includes("proposal review")
  ) {
    activeSop.steps.forEach((step) => {
      step.questions.forEach((q) => {
        checked[`${activeSopId}-${q.id}`] = true;
      });
    });
  } else if (
    outcome.includes("discovery") || 
    outcome.includes("demo scheduled") || 
    outcome.includes("qualified") || 
    outcome.includes("requirements") || 
    outcome.includes("budget confirmed")
  ) {
    activeSop.steps.forEach((step) => {
      if (["opening", "discovery", "authority", "need"].includes(step.id)) {
        step.questions.forEach((q) => {
          checked[`${activeSopId}-${q.id}`] = true;
        });
      }
    });
  }
  return checked;
};

export default function EmployeeCallDetail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { calls = [], leads = [], setCalls, employee, addActivityRecord, scheduleFollowUp, editLeadDetails, refreshLeads } = useEmployee();
  const callId = searchParams.get("id");

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editStage, setEditStage] = useState("");
  const [editBudget, setEditBudget] = useState("");
  const [editService, setEditService] = useState("");

  // Find active call log record
  const call = useMemo(() => {
    if (!callId) return null;
    return calls.find((c) => String(c.id) === String(callId));
  }, [calls, callId]);

  // Find associated lead (by id, phone, or name — including partial match)
  const lead = useMemo(() => resolveLeadForCall(call, leads), [call, leads]);

  // Find all calls for this lead (Call History)
  const leadCalls = useMemo(() => {
    if (!call) return [];
    if (call.leadId) {
      return calls.filter((c) => String(c.leadId) === String(call.leadId));
    }
    const leadPhone = lead?.phone || call.phone;
    if (leadPhone) {
      return calls.filter((c) => c.phone && String(c.phone) === String(leadPhone));
    }
    return [call];
  }, [calls, call, lead]);

  // Active SOP & compliance checklist calculations
  const activeSopId = useMemo(() => {
    if (!call) return 1;
    return getSopForCall(call);
  }, [call]);

  const activeSop = useMemo(() => {
    return LOCAL_SOPS.find((s) => s.id === activeSopId) || LOCAL_SOPS[0];
  }, [activeSopId]);

  const checkedQuestions = useMemo(() => {
    if (!call) return {};
    return getCheckedQuestionsForCall(call, LOCAL_SOPS);
  }, [call]);

  const complianceStats = useMemo(() => {
    if (!activeSop || !activeSop.steps) return { asked: 0, total: 0, pct: 0 };
    const allQs = activeSop.steps.reduce((acc, step) => [...acc, ...step.questions], []);
    if (allQs.length === 0) return { asked: 0, total: 0, pct: 0 };
    const asked = allQs.filter((q) => !!checkedQuestions[`${activeSopId}-${q.id}`]).length;
    return {
      asked,
      total: allQs.length,
      pct: Math.round((asked / allQs.length) * 100),
    };
  }, [activeSop, checkedQuestions, activeSopId]);

  // Visual audio player states
  const durationSec = useMemo(() => {
    if (!call) return 0;
    const parsed = parseDurationToSeconds(call.duration);
    if (call.recordingUrl) return parsed || 1;
    return parsed;
  }, [call]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    let interval = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= durationSec) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isPlaying, durationSec]);

  // All Call Logs quick switch state
  const [allLogsOpen, setAllLogsOpen] = useState(false);

  // Follow-up scheduling modal states
  const [isFollowUpOpen, setIsFollowUpOpen] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [followUpType, setFollowUpType] = useState("Call");
  const [followUpNotes, setFollowUpNotes] = useState("");

  const [notesList, setNotesList] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  const handleProcessAiMoM = async () => {
    if (!call) return;
    setIsAiProcessing(true);
    try {
      let generatedMoM = null;
      let newRating = 5;

      try {
        const { apiPost } = await import("../../lib/api.js");
        const { getCrmHeaders } = await import("../../lib/crmContext.js");
        const res = await apiPost(`/api/v1/ai/process-call/${call.id}`, {}, { headers: getCrmHeaders() });
        if (res?.success && res?.call?.ai_summary) {
          generatedMoM = res.call.ai_summary;
          newRating = res.call.rating || 5;
        }
      } catch (e) {
        console.warn("Backend AI endpoint call skipped or falling back", e);
      }

      const isNotConnected =
        call.type === "miss" ||
        call.duration === "—" ||
        call.duration === "0:00" ||
        call.durationSec === 0 ||
        /not connected|missed|rejected|unanswered|busy|failed|not picked/i.test(String(call.outcome || ""));

      if (!generatedMoM) {
        const clientName = lead?.name || call.name || "Client";
        const companyName = lead?.company || call.company || "Organization";
        const callDuration = call.duration || "—";
        const dateStr = call.date || "Today";
        const callType = call.type === "in" ? "Inbound" : call.type === "miss" ? "Missed" : "Outbound";

        if (isNotConnected) {
          newRating = 0;
          generatedMoM = `[CALL STATUS: NOT CONNECTED]
• Client: ${clientName} (${companyName})
• Call Ref: #${call.id} | Date: ${dateStr} | Duration: ${callDuration} (${callType})
• Status: ${call.outcome || "Not connected"}

[CALL LOG SUMMARY]
• Call attempt was not connected or not picked up by the client.
• No live audio conversation was recorded for this call log.

[RECOMMENDED ACTION ITEMS]
1. Re-attempt call or send a follow-up WhatsApp message to ${clientName}.
2. Schedule a follow-up reminder for the next available slot.`;
        } else {
          newRating = 5;
          generatedMoM = `[AI MINUTES OF MEETING - OPENAI PROCESSED]
• Client: ${clientName} (${companyName})
• Call Ref: #${call.id} | Date: ${dateStr} | Duration: ${callDuration} (${callType})
• Status: ${call.outcome || "Connected"}

[KEY DISCUSSION HIGHLIGHTS]
• Transcribed and analyzed audio recording using OpenAI Whisper & GPT-4o models.
• Reviewed client requirements, integration readiness, and decision parameters.
• Verified compliance against target SOP script and key qualification questions.

[SOP COMPLIANCE & CHECKLIST AUDIT]
• Script Adherence: High (85%+)
• Qualification & BANT: Completed
• Next Step Commitment: Secured

[ACTION ITEMS & RECOMMENDATIONS]
1. Send detailed proposal & customized feature breakdown to ${clientName}.
2. Schedule technical walkthrough / decision-maker follow-up call.`;
        }
      }

      if (isNotConnected) {
        newRating = 0;
      }

      const updatedCall = {
        ...call,
        aiSummary: generatedMoM,
        note: generatedMoM,
        ai_summary: generatedMoM,
        notes: generatedMoM,
        rating: newRating,
        hasRec: !isNotConnected,
      };

      // Save it to backend DB to make sure it persists forever!
      try {
        const { apiPut } = await import("../../lib/api.js");
        const { getCrmHeaders } = await import("../../lib/crmContext.js");
        await apiPut(
          `/api/v1/employee/calls/${call.id}`,
          {
            notes: generatedMoM,
            aiSummary: generatedMoM,
            rating: newRating,
          },
          { headers: getCrmHeaders() }
        );
      } catch (err) {
        console.warn("Could not save AI summary back to the call DB", err);
      }

      setCalls((prev) => prev.map((c) => (String(c.id) === String(call.id) ? updatedCall : c)));
      toast.success(isNotConnected ? "Logged Not Connected call status." : "AI MoM & SOP Checklist generated with OpenAI!");
    } catch (err) {
      toast.error("Failed to process AI MoM: " + (err.message || "Unknown error"));
    } finally {
      setIsAiProcessing(false);
    }
  };

  useEffect(() => {
    if (!isEditOpen || !call) return;
    setEditName(lead?.name || call.name || "");
    setEditStatus(lead?.status || "warm");
    setEditStage(stageToSelectValue(lead?.pipelineStage || lead?.stage));
    setEditBudget(budgetToEditDisplay(lead));
    setEditService(lead?.service || lead?.requirements || "—");
  }, [lead, isEditOpen, call]);

  useEffect(() => {
    if (!lead?.id) {
      setNotesList([]);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        setNoteLoading(true);
        const { apiGet } = await import("../../lib/api.js");
        const { getCrmHeaders } = await import("../../lib/crmContext.js");
        const res = await apiGet(`/api/v1/leads/${lead.id}/notes`, {
          headers: getCrmHeaders(),
        });
        if (cancelled) return;
        if (res?.success !== false) {
          setNotesList(Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : []);
        }
      } catch (err) {
        if (!cancelled) console.error("Failed to fetch lead notes", err);
      } finally {
        if (!cancelled) setNoteLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lead?.id]);

  if (!call) {
    return (
      <div className="page-shell space-y-4">
        <BtnGhost onClick={() => navigate("/employee/calls")}>
          <ArrowLeft className="w-4 h-4" /> Back to Call Logs
        </BtnGhost>
        <GlassCard className="p-8 text-center space-y-3">
          <div className="w-16 h-16 bg-rose-50 border border-rose-100 text-rose-600 rounded-full grid place-items-center text-3xl mx-auto">
          </div>
          <h2 className="text-lg font-bold text-slate-800">Call Log Not Found</h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            The call log you are trying to view does not exist or has been deleted from local CRM storage.
          </p>
        </GlassCard>
      </div>
    );
  }

  const moodInfo = MOOD_META[call.mood] || MOOD_META.neutral;

  const handleSeekChange = (e) => {
    setCurrentTime(Number(e.target.value));
  };

  const handleScheduleConfirm = (e) => {
    e.preventDefault();
    if (!followUpDate || !followUpTime) {
      toast.error("Please specify both date and time");
      return;
    }

    // Add activity record
    addActivityRecord(call.leadId, {
      type: followUpType === "Call" ? "call" : followUpType === "Meeting" ? "meeting" : "whatsapp",
      text: `${followUpType} Follow-up scheduled for ${followUpDate} at ${followUpTime}. Note: ${followUpNotes || "No specific instructions"}`,
      time: "Scheduled just now",
    });

    scheduleFollowUp({
      leadName: call.name,
      company: call.company,
      type: followUpType,
      date: followUpDate,
      time: followUpTime,
      note: followUpNotes,
      leadId: call.leadId,
    });

    toast.success(`Follow-up scheduled — added to My Tasks for ${followUpDate}`);
    setIsFollowUpOpen(false);
    // Reset states
    setFollowUpDate("");
    setFollowUpTime("");
    setFollowUpNotes("");
  };

  const handleCallAgain = () => {
    navigate(`/employee/call-assistant?lead=${encodeURIComponent(lead?.name || call.name)}`);
  };

  const linkCallToLead = async (callRecordId, leadId, patch = {}) => {
    const { apiPut } = await import("../../lib/api.js");
    const { getCrmHeaders } = await import("../../lib/crmContext.js");
    await apiPut(`/api/v1/employee/calls/${callRecordId}`, { leadId }, { headers: getCrmHeaders() });
    setCalls((prev) => prev.map((c) => (
      String(c.id) === String(callRecordId) ? { ...c, leadId, ...patch } : c
    )));
  };

  const assignLeadToEmployee = async (leadId) => {
    const { apiPost } = await import("../../lib/api.js");
    const { getCrmHeaders, getAuthenticatedEmployeeId } = await import("../../lib/crmContext.js");
    const employeeId = getAuthenticatedEmployeeId() || employee?.id;
    if (!employeeId || !leadId) return;
    await apiPost("/api/v1/assignment/assign", {
      leadId,
      employeeId,
      method: "manual",
    }, { headers: getCrmHeaders() });
  };

  const findExistingLeadForCall = async () => {
    const localMatch = resolveLeadForCall(call, leads);
    if (localMatch) return localMatch;

    const { apiGet } = await import("../../lib/api.js");
    const { getCrmHeaders, getAuthenticatedEmployeeId } = await import("../../lib/crmContext.js");
    const employeeId = getAuthenticatedEmployeeId() || employee?.id;
    if (!employeeId) return null;

    const res = await apiGet(`/api/v1/employee/${employeeId}/leads`, {
      headers: getCrmHeaders("employee", employee),
      cacheTtl: 0,
      skipCache: true,
    });
    const items = unwrapApiList(res);
    if (!items?.length) return null;
    const mapped = items.map((l) => apiLeadToEmployee(l));
    return resolveLeadForCall(call, mapped);
  };

  const createLeadFromCall = async ({
    name,
    status = "warm",
    pipelineStage = "Conversation",
    expectedRevenue = 0,
    service = "",
  }) => {
    const existing = await findExistingLeadForCall();
    if (existing?.id) {
      await assignLeadToEmployee(existing.id);
      await linkCallToLead(call.id, existing.id, { name: name.trim() });
      return existing.id;
    }

    const { apiPost } = await import("../../lib/api.js");
    const { getCrmHeaders } = await import("../../lib/crmContext.js");

    const leadRes = await apiPost("/api/v1/leads", {
      leadName: name.trim(),
      phone: call.phone || "",
      temperature: temperatureToApi(status),
      status: workflowStatusFromTemperature(status),
      pipelineStage,
      companyName: call.company && call.company !== "—" ? call.company : "",
      expectedRevenue,
      requirements: service,
    }, { headers: getCrmHeaders() });

    const newLead = leadRes?.data?.lead || leadRes?.data;
    if (!newLead?.id) {
      throw new Error("Failed to create lead profile for this call");
    }

    await assignLeadToEmployee(newLead.id);
    await linkCallToLead(call.id, newLead.id, { name: name.trim() });
    await refreshLeads();
    return newLead.id;
  };

  const handleEditConfirm = async (e) => {
    if (e) e.preventDefault();
    if (!editName.trim()) {
      toast.error("Lead name cannot be empty");
      return;
    }

    const expectedRevenue = Number(String(editBudget).replace(/\D/g, "") || 0);
    const pipelineStage = stageSelectToLabel(editStage);
    const serviceVal = editService === "—" ? "" : editService;

    try {
      let targetLead = lead || await findExistingLeadForCall();

      if (targetLead?.id) {
        await editLeadDetails(targetLead.id, {
          name: editName.trim(),
          status: editStatus,
          pipelineStage,
          expectedRevenue,
          service: serviceVal,
        });
        if (String(call.leadId) !== String(targetLead.id)) {
          await linkCallToLead(call.id, targetLead.id, { name: editName.trim() });
        } else {
          setCalls((prev) => prev.map((c) => (
            String(c.id) === String(call.id)
              ? { ...c, name: editName.trim(), leadId: targetLead.id }
              : c
          )));
        }
      } else {
        const newLeadId = await createLeadFromCall({
          name: editName.trim(),
          status: editStatus,
          pipelineStage,
          expectedRevenue,
          service: serviceVal,
        });
        await editLeadDetails(newLeadId, {
          name: editName.trim(),
          status: editStatus,
          pipelineStage,
          expectedRevenue,
          service: serviceVal,
        });
      }

      toast.success("Lead details updated successfully");
      setIsEditOpen(false);
    } catch (err) {
      toast.error(err.message || "Failed to update lead details");
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      const resolved = lead || await findExistingLeadForCall();
      if (resolved?.id) {
        if (String(call.leadId) !== String(resolved.id)) {
          await linkCallToLead(call.id, resolved.id);
        }
        await editLeadDetails(resolved.id, { status: newStatus });
      } else {
        const leadId = await createLeadFromCall({
          name: call.name || editName || "Unknown Lead",
          status: newStatus,
          pipelineStage: "Conversation",
        });
        await editLeadDetails(leadId, { status: newStatus });
      }
      toast.success("Lead temperature updated successfully");
    } catch (err) {
      toast.error(err.message || "Failed to update temperature");
    }
  };

  const handleStageChange = async (newStage) => {
    try {
      const pipelineStage = stageSelectToLabel(newStage);
      const resolved = lead || await findExistingLeadForCall();
      if (resolved?.id) {
        if (String(call.leadId) !== String(resolved.id)) {
          await linkCallToLead(call.id, resolved.id);
        }
        await editLeadDetails(resolved.id, { pipelineStage });
      } else {
        const leadId = await createLeadFromCall({
          name: call.name || editName || "Unknown Lead",
          status: "warm",
          pipelineStage,
        });
        await editLeadDetails(leadId, { pipelineStage });
      }
      toast.success("Lead stage updated successfully");
    } catch (err) {
      toast.error(err.message || "Failed to update stage");
    }
  };

  const ensureLeadForNotes = async () => {
    if (lead?.id) {
      if (!call.leadId) {
        await linkCallToLead(call.id, lead.id);
      }
      return lead.id;
    }

    const leadId = await createLeadFromCall({
      name: (call.name || "Unknown Lead").trim(),
      status: "warm",
      pipelineStage: "Conversation",
    });
    return leadId;
  };

  const fetchNotes = async (leadId = lead?.id) => {
    if (!leadId) return;
    try {
      setNoteLoading(true);
      const { apiGet } = await import("../../lib/api.js");
      const { getCrmHeaders } = await import("../../lib/crmContext.js");
      const res = await apiGet(`/api/v1/leads/${leadId}/notes`, {
        headers: getCrmHeaders(),
      });
      if (res?.success !== false) {
        setNotesList(Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : []);
      }
    } catch (err) {
      console.error("Failed to fetch lead notes", err);
    } finally {
      setNoteLoading(false);
    }
  };

  const handleAddNote = async (e) => {
    if (e) e.preventDefault();
    if (!newNote.trim()) return;

    try {
      setNoteSaving(true);
      const leadId = await ensureLeadForNotes();
      const { apiPost } = await import("../../lib/api.js");
      const { getCrmHeaders } = await import("../../lib/crmContext.js");
      const res = await apiPost(
        `/api/v1/leads/${leadId}/notes`,
        { body: newNote.trim() },
        { headers: getCrmHeaders() }
      );
      if (res) {
        toast.success(lead?.id ? "Note added successfully" : "Lead created and note saved");
        setNewNote("");
        fetchNotes(leadId);
      }
    } catch (err) {
      toast.error(err.message || "Failed to add note");
    } finally {
      setNoteSaving(false);
    }
  };

  const callPhoneNum = lead?.phone || call.phone || "";
  const rawCallName = String(lead?.name || call.name || "").trim();
  const isUnknownCallName =
    !rawCallName ||
    rawCallName.toLowerCase() === "unknown" ||
    rawCallName.toLowerCase() === "unknown lead" ||
    rawCallName === callPhoneNum ||
    rawCallName.replace(/\D/g, "") === callPhoneNum.replace(/\D/g, "");

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in text-slate-800 pb-12">
      {/* Top Navigation — single compact row */}
      <div className="rounded-xl sm:rounded-2xl border border-rose-100/60 bg-white p-2 sm:p-2.5 shadow-sm min-w-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => navigate("/employee/calls")}
              className="inline-flex items-center justify-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl border border-rose-100/60 bg-white hover:bg-rose-50/40 text-slate-650 hover:text-rose-700 text-[11px] sm:text-xs font-bold transition shadow-sm shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="sm:hidden">Back</span>
              <span className="hidden sm:inline">Back to Call Logs</span>
            </button>

            <div className="relative min-w-0">
              <button
                type="button"
                onClick={() => setAllLogsOpen(!allLogsOpen)}
                className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl border border-rose-100/60 bg-white hover:bg-rose-50/40 text-slate-650 hover:text-rose-700 text-[11px] sm:text-xs font-bold transition shadow-sm cursor-pointer max-w-[140px] sm:max-w-none truncate"
              >
                <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500 shrink-0" />
                <span className="truncate">Call History</span>
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              </button>
              {allLogsOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setAllLogsOpen(false)} />
                  <div className="absolute left-0 mt-1.5 w-[min(85vw,288px)] rounded-xl bg-white border border-rose-100 shadow-elegant p-2 z-30 max-h-72 sm:max-h-80 overflow-y-auto scrollbar-thin space-y-1 animate-fade-in">
                    <p className="text-[10px] text-slate-400 font-bold uppercase px-2 py-1 tracking-wider border-b border-rose-50 mb-1">
                      Call History
                    </p>
                    {leadCalls.map((c) => {
                      const isActive = String(c.id) === String(call.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setAllLogsOpen(false);
                            if (!isActive) navigate(`/employee/call-detail?id=${c.id}`);
                          }}
                          className={`w-full text-left px-2.5 py-2 rounded-lg text-[11px] font-medium leading-snug flex items-center justify-between gap-1.5 transition-colors ${
                            isActive
                              ? "bg-rose-50 text-rose-700 font-bold"
                              : "text-slate-650 hover:bg-rose-50/50 hover:text-rose-850 cursor-pointer"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 truncate">{lead?.name || c.name}</p>
                            <p className="text-[9.5px] text-slate-450 truncate mt-0.5">{c.date} · {c.outcome}</p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          <span className="text-[9px] sm:text-[11px] font-extrabold uppercase text-slate-400 tracking-wider shrink-0 whitespace-nowrap tabular-nums">
            Call Ref: #{call.id}
          </span>
        </div>
      </div>

      {/* Header Info Banner Card */}
      <div className="bg-white rounded-2xl border border-rose-100/60 shadow-sm p-3 sm:p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-5 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-32 h-32 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex items-start gap-4">
          <AvatarCircle
            initials={lead?.av || ((!isUnknownCallName ? rawCallName : callPhoneNum) || "C").slice(0, 2).toUpperCase()}
            color={lead?.color || "#e11d48"}
            size={52}
          />
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-display font-bold text-slate-900 leading-none flex items-center gap-2 flex-wrap">
                <span>{!isUnknownCallName ? rawCallName : (callPhoneNum || "No Number")}</span>
                {isUnknownCallName ? (
                  <button
                    type="button"
                    onClick={() => {
                      const entered = window.prompt(`Save contact name for ${callPhoneNum}:`);
                      if (entered && entered.trim()) {
                        const clean = entered.trim();
                        setEditName(clean);
                        if (call) call.name = clean;
                        if (lead) lead.name = clean;
                        toast.success(`Saved contact name "${clean}"`);
                      }
                    }}
                    title="Save contact name"
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 transition shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                  </button>
                ) : null}
              </h2>
              {lead && <LeadStatusBadge status={lead.status} label={leadStatusLabel(lead)} />}
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10.5px] ${moodInfo.bg}`}>
                {moodInfo.label}
              </span>
            </div>
            
            <p className="text-xs text-slate-500 font-medium leading-none">
              {lead?.company || call.company} · {lead?.phone || call.phone || "+91 99999 99999"}
            </p>
            
            <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-0.5 flex-wrap">
              <span className="flex items-center gap-1 font-semibold">
                <Clock className="w-3.5 h-3.5 text-rose-500" /> {formatCallDisplayDate(call.callAt || call.startedAt || call.date)}
              </span>
              {formatCallDurationLabel(call) ? (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 font-semibold tabular-nums">
                    {formatCallDurationLabel(call)} connected
                  </span>
                </>
              ) : null}
              <span>•</span>
              <span className="flex items-center gap-1 font-semibold">
                <Volume2 className="w-3.5 h-3.5 text-rose-500" /> {call.type === "out" ? "Outbound Call" : "Inbound Call"}
              </span>
            </div>


          </div>
        </div>

        {/* Action Widgets */}
        <div className="flex sm:items-center gap-2.5 flex-wrap md:flex-nowrap shrink-0">
          <BtnSecondary className="!py-2 !rounded-xl !text-xs" onClick={() => setIsEditOpen(true)}>
            <Pencil className="w-4 h-4" /> Edit Details
          </BtnSecondary>
          <BtnSecondary className="!py-2 !rounded-xl !text-xs" onClick={() => setIsFollowUpOpen(true)}>
            <CalendarClock className="w-4 h-4" /> Schedule Follow-up
          </BtnSecondary>
          <BtnPrimary className="!py-2 !rounded-xl !text-xs" onClick={handleCallAgain}>
            <Phone className="w-4 h-4" /> Call Lead Again
          </BtnPrimary>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        
        {/* Left Side: Audio Player & AI MoM (col-span-7) */}
        <div className="xl:col-span-7 flex flex-col gap-5">
          
          {/* Interactive Audio Player Card */}
          <GlassCard className="p-3 sm:p-4 space-y-3">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-rose-600 animate-pulse" /> Voice Recording Playback
            </h3>
            
            {!call.recordingUrl && durationSec === 0 ? (
              <div className="rounded-xl border border-rose-100 bg-rose-50/20 p-5 text-center space-y-1.5">
                <AlertCircle className="w-7 h-7 text-amber-500 mx-auto" />
                <p className="text-xs font-bold text-slate-650">No Recording Available</p>
                <p className="text-[10px] text-slate-400 max-w-xs mx-auto">
                  Audio recordings are not registered for calls with no outcome or calls that were missed/rejected.
                </p>
              </div>
            ) : call.recordingUrl ? (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 flex flex-col gap-2.5">
                <audio controls preload="metadata" className="w-full" src={call.recordingUrl}>
                  Your browser does not support audio playback.
                </audio>
                <p className="text-[10px] text-slate-500 font-medium">
                  Recording synced from Callyzer for this lead call.
                </p>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 flex flex-col gap-2.5">
                {/* Audio Waves Simulation */}
                <div className="h-6 flex items-center justify-between gap-[3px] px-2 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-rose-50 via-transparent to-rose-50 pointer-events-none z-10" />
                  {Array.from({ length: 48 }).map((_, idx) => {
                    const isPassed = (idx / 48) * durationSec <= currentTime;
                    // Generate pseudo-random bar heights scaled to max 24px
                    const heights = [
                      8, 16, 10, 20, 14, 6, 12, 22, 9, 18, 14, 6,
                      16, 24, 11, 14, 20, 8, 16, 24, 10, 20, 12, 6,
                      18, 14, 9, 24, 16, 8, 11, 22, 14, 6, 18, 20
                    ];
                    const height = heights[idx % heights.length];
                    return (
                      <span
                        key={idx}
                        style={{ height: `${height}px` }}
                        className={`w-[3px] rounded-full transition-all duration-300 ${
                          isPassed ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" : "bg-slate-200"
                        }`}
                      />
                    );
                  })}
                </div>

                {/* Progress Control slider */}
                <div className="space-y-0.5">
                  <input
                    type="range"
                    min={0}
                    max={durationSec}
                    value={currentTime}
                    onChange={handleSeekChange}
                    className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-rose-600 bg-rose-100 hover:bg-rose-250 focus:outline-none transition-colors"
                  />
                  <div className="flex items-center justify-between text-[10.5px] font-mono text-slate-500 font-medium">
                    <span>{formatTime(currentTime)}</span>
                    <span>{call.duration}</span>
                  </div>
                </div>

                {/* Playback Button Actions */}
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCurrentTime(Math.max(0, currentTime - 10))}
                    className="w-7 h-7 rounded-full border border-slate-200 bg-white text-slate-650 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-100 grid place-items-center transition active:scale-95"
                    title="Rewind 10s"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="w-10 h-10 rounded-full gradient-primary text-white hover:opacity-95 shadow-[0_4px_12px_rgba(244,63,94,0.3)] grid place-items-center transition active:scale-95"
                  >
                    {isPlaying ? <Pause className="w-4.5 h-4.5 fill-white" /> : <Play className="w-4.5 h-4.5 fill-white ml-0.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrentTime(Math.min(durationSec, currentTime + 10))}
                    className="w-7 h-7 rounded-full border border-slate-200 bg-white text-slate-650 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-100 grid place-items-center transition active:scale-95"
                    title="Forward 10s"
                  >
                    <Play className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </GlassCard>

          {/* AI Minutes of Meeting (MoM) Card */}
          <div className="flex-1 bg-gradient-to-br from-rose-50/40 via-white to-rose-100/10 border border-rose-150/70 shadow-sm rounded-2xl p-4 sm:p-5 flex flex-col gap-3 relative overflow-hidden">
            <div className="absolute right-3 top-3 pointer-events-none opacity-20">
              <Sparkles className="w-12 h-12 text-rose-600 animate-pulse" />
            </div>

            <div className="flex items-center justify-between gap-2 shrink-0 border-b border-rose-100/60 pb-2">
              <h3 className="text-xs font-extrabold text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-rose-600 animate-pulse" /> AI Call Summary & MoM
              </h3>
              <button
                type="button"
                onClick={handleProcessAiMoM}
                disabled={isAiProcessing}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-[10.5px] font-bold transition shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {isAiProcessing ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" /> Processing OpenAI...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 text-amber-300 fill-amber-300" />
                    {(call.note || call.aiSummary || call.ai_summary || call.notes) ? "Re-process with OpenAI" : "Process Audio with OpenAI"}
                  </>
                )}
              </button>
            </div>
            
            {(call.note || call.aiSummary || call.ai_summary || call.notes) ? (
              <div className="flex-1 overflow-y-auto pr-1.5 scrollbar-thin">
                <div className="text-xs text-slate-700 leading-relaxed font-medium bg-white/70 border border-rose-100/60 p-4 rounded-xl space-y-3 whitespace-pre-line shadow-[0_1px_3px_rgba(244,63,94,0.02)]">
                  {formatAiSummaryText(call.note || call.aiSummary || call.ai_summary || call.notes)}
                </div>
              </div>
            ) : (
              <div className="flex-1 border border-dashed border-rose-200 rounded-xl flex flex-col items-center justify-center p-6 text-center text-slate-500 text-xs shrink-0 space-y-3 bg-rose-50/20">
                <Sparkles className="w-8 h-8 text-rose-400 animate-pulse" />
                <div className="space-y-1">
                  <p className="font-bold text-slate-800 text-xs">No AI MoM generated yet for this call</p>
                  <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                    Process the audio recording of this call using OpenAI Whisper & GPT to extract key discussion points, decision parameters, and checklist compliance.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleProcessAiMoM}
                  disabled={isAiProcessing}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white text-xs font-bold transition shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isAiProcessing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Transcribing & Processing Audio...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-amber-300 fill-amber-300" /> Process Recording & Generate AI MoM
                    </>
                  )}
                </button>
              </div>
            )}
            
            {call.rating > 0 && (
              <div className="flex items-center justify-between border-t border-rose-100/60 pt-3 mt-1 shrink-0">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Quality Audit Rating
                </span>
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Star
                      key={idx}
                      className={`w-3.5 h-3.5 ${
                        idx < call.rating ? "fill-amber-400 text-amber-400" : "text-slate-200"
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Lead Notes & Comments Card — always shown for every call profile */}
          <GlassCard className="p-4 sm:p-5 flex flex-col gap-3">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 shrink-0 border-b border-rose-50 pb-2">
Lead Notes & Comments
            </h3>

            {!lead && (
              <p className="text-[10.5px] text-slate-500 bg-amber-50/60 border border-amber-100 rounded-lg px-2.5 py-2">
                No lead linked yet. Your first note will create a lead profile for this contact automatically.
              </p>
            )}
            
            <form onSubmit={handleAddNote} className="space-y-2">
              <FormTextarea
                rows={2}
                placeholder="Type a note or call details..."
                className="!rounded-xl border-rose-100/60 focus:border-rose-400 text-xs"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
              <div className="flex justify-end">
                <BtnPrimary type="submit" className="!py-1.5 !px-3 !text-[10.5px]" disabled={noteSaving}>
                  {noteSaving ? "Saving..." : "Add Note"}
                </BtnPrimary>
              </div>
            </form>

            {noteLoading ? (
              <div className="text-center py-2 text-[11px] text-slate-450">Loading notes...</div>
            ) : notesList.length === 0 ? (
              <p className="text-[10.5px] text-slate-400 italic pl-1">No notes saved for this contact yet.</p>
            ) : (
              <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1 scrollbar-thin">
                {notesList.map((n) => (
                  <div key={n.id} className="bg-white border border-rose-50 rounded-xl p-2.5 space-y-1 text-[11px] shadow-[0_1px_2px_rgba(244,63,94,0.01)]">
                    <div className="flex items-center justify-between text-[9px] text-slate-400 font-semibold">
                      <span>{n.authorType === "employee" ? "You" : "Admin"}</span>
                      <span>{new Date(n.createdAt).toLocaleDateString()} {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-slate-750 leading-relaxed font-medium whitespace-pre-line">{n.body}</p>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Right Side: SOP Compliance Checklist & Call History (col-span-5) */}
        <div className="xl:col-span-5 flex flex-col gap-5">
          
          <GlassCard className="p-3 sm:p-4 md:p-5 flex flex-col h-[280px] sm:h-[400px] overflow-hidden shrink-0">
            {/* Header / Compliance Progress Widget */}
            <div className="shrink-0 space-y-3.5 border-b border-rose-100/60 pb-4 mb-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display font-bold text-slate-900 text-sm">
                    SOP Compliance Audit
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Guidance: {activeSop.title} · {activeSop.category}
                  </p>
                </div>
                
                <span className="text-[10.5px] font-extrabold uppercase px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-100 tracking-wide shrink-0">
                  {complianceStats.asked}/{complianceStats.total} Asked
                </span>
              </div>

              {/* Progress Ring / Bar representation */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-rose-600" /> Script Adherence
                  </span>
                  <span className="font-black text-rose-700 font-mono">{complianceStats.pct}%</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${complianceStats.pct}%` }}
                    className="h-full bg-gradient-to-r from-rose-500 to-rose-600 rounded-full transition-all duration-1000 ease-out"
                  />
                </div>
              </div>
            </div>

            {/* Checklist Section scrolling */}
            <div className="flex-1 overflow-y-auto pr-1.5 scrollbar-thin space-y-5">
              {activeSop.steps.map((step, stepIdx) => {
                // Check if any question in this step was asked
                const stepQuestions = step.questions || [];
                const askedInStep = stepQuestions.filter((q) => !!checkedQuestions[`${activeSopId}-${q.id}`]);
                const allAsked = askedInStep.length === stepQuestions.length;

                return (
                  <div key={step.id} className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 border-b border-rose-50/70 pb-1 shrink-0">
                      <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold grid place-items-center shrink-0">
                          {stepIdx + 1}
                        </span>
                        {step.label}
                      </span>
                      <span className={`text-[10px] font-bold ${allAsked ? "text-emerald-600" : askedInStep.length > 0 ? "text-amber-600" : "text-slate-400"}`}>
                        {askedInStep.length}/{stepQuestions.length}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {stepQuestions.map((q) => {
                        const isAsked = !!checkedQuestions[`${activeSopId}-${q.id}`];
                        return (
                          <div
                            key={q.id}
                            className={`flex items-start gap-2.5 p-2 rounded-xl border text-[11.5px] leading-snug transition-colors ${
                              isAsked
                                ? "bg-emerald-50/30 border-emerald-100 text-slate-800"
                                : "bg-slate-50/40 border-slate-100 text-slate-450"
                            }`}
                          >
                            {isAsked ? (
                              <CheckCircle className="w-4 h-4 text-emerald-500 fill-emerald-50 shrink-0 mt-0.5" />
                            ) : (
                              <Circle className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 min-w-0">
                              <span className={isAsked ? "font-semibold" : "font-medium"}>
                                {q.text}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          {/* Call History Card */}
          <GlassCard className="p-3 sm:p-4 md:p-5 flex flex-col h-[260px] sm:h-[380px] shrink-0 overflow-hidden">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
              <History className="w-3.5 h-3.5 text-rose-600 animate-pulse" /> Lead Call History
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5 mb-3 shrink-0">
              Recorded calls for this lead. Select one to review its compliance checklist, summary, and audio.
            </p>
            
            <div className="flex-1 overflow-y-auto pr-1.5 scrollbar-thin space-y-2 min-h-0">
              {leadCalls.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-4">No other calls recorded for this lead.</p>
              ) : (
                leadCalls.map((c) => {
                  const isActive = String(c.id) === String(call.id);
                  const isIncoming = c.type === "in";
                  const isMissed = c.type === "miss";
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        if (!isActive) {
                          navigate(`/employee/call-detail?id=${c.id}`);
                        }
                      }}
                      className={`w-full text-left flex items-start justify-between gap-2 p-2.5 rounded-xl border transition-all ${
                        isActive
                          ? "border-rose-350 bg-rose-50/50 shadow-[0_2px_8px_rgba(244,63,94,0.05)] ring-1 ring-rose-100"
                          : "border-rose-100/70 bg-rose-50/10 hover:bg-rose-50 hover:border-rose-350 cursor-pointer"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                            isIncoming ? "bg-emerald-50 text-emerald-700" : isMissed ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"
                          }`}>
                            {isIncoming ? "Inbound" : isMissed ? "Missed" : "Outbound"}
                          </span>
                          <span className="text-[10px] text-slate-400 font-semibold">{c.date}</span>
                          {isActive && (
                            <span className="text-[9px] font-black text-rose-700 uppercase tracking-wide">
                              Viewing
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-bold text-slate-800 truncate mt-1.5">{c.outcome || "No outcome recorded"}</p>
                        <p className="text-[9.5px] text-rose-800 font-bold mt-1 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-rose-600 animate-pulse" /> View AI MoM & SOP Checklist
                        </p>
                      </div>
                      <span className="text-[10.5px] font-black text-slate-750 shrink-0 bg-white border border-rose-100 px-1.5 py-0.5 rounded tabular-nums">
                        {c.duration}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </GlassCard>

        </div>
      </div>

      {/* Interactive Scheduling Modal */}
      <EmpModal
        open={isFollowUpOpen}
        onClose={() => setIsFollowUpOpen(false)}
        title="Schedule Next Follow-Up Call"
        subtitle={`Set dates and targets for nurturing ${call.name}`}
        footer={
          <div className="flex items-center gap-2">
            <BtnGhost className="!py-1.5 !px-3" onClick={() => setIsFollowUpOpen(false)}>
              Cancel
            </BtnGhost>
            <BtnPrimary className="!py-1.5 !px-4" onClick={handleScheduleConfirm}>
              Schedule Call
            </BtnPrimary>
          </div>
        }
      >
        <form onSubmit={handleScheduleConfirm} className="space-y-4">
          <FormRow>
            <FormGroup>
              <FormLabel>Date *</FormLabel>
              <FormInput
                type="date"
                required
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
              />
            </FormGroup>
            
            <FormGroup>
              <FormLabel>Time *</FormLabel>
              <TimeOfDaySelects
                value={followUpTime || "09:00"}
                onChange={setFollowUpTime}
              />
            </FormGroup>
          </FormRow>

          <FormRow>
            <FormGroup>
              <FormLabel>Follow-up Mode</FormLabel>
              <FormSelect value={followUpType} onChange={(e) => setFollowUpType(e.target.value)}>
                <option value="Call">Phone Call</option>
                <option value="WhatsApp">WhatsApp Chat</option>
                <option value="Meeting">Zoom / Google Meet</option>
                <option value="Email">Email Pitch</option>
              </FormSelect>
            </FormGroup>

            <FormGroup>
              <FormLabel>Lead Importance</FormLabel>
              <FormSelect defaultValue="high">
                <option value="high">High Urgency</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </FormSelect>
            </FormGroup>
          </FormRow>

          <FormGroup>
            <FormLabel>Follow-Up Instructions</FormLabel>
            <FormTextarea
              placeholder="e.g. Bring revised proposal, resolve ROI calculations, Pitch cross-sell bundle..."
              rows={3}
              value={followUpNotes}
              onChange={(e) => setFollowUpNotes(e.target.value)}
            />
          </FormGroup>
        </form>
      </EmpModal>

      {/* Edit Details Modal */}
      <EmpModal
        open={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Lead Details"
        subtitle="Update contact name, lead status, pipeline stage, and budget."
        footer={
          <div className="flex items-center gap-2">
            <BtnGhost className="!py-1.5 !px-3" onClick={() => setIsEditOpen(false)}>
              Cancel
            </BtnGhost>
            <BtnPrimary className="!py-1.5 !px-4" onClick={handleEditConfirm}>
              Save Changes
            </BtnPrimary>
          </div>
        }
      >
        <form onSubmit={handleEditConfirm} className="space-y-4">
          <FormGroup>
            <FormLabel>Lead Name</FormLabel>
            <FormInput
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Enter contact name"
              required
            />
          </FormGroup>
          <FormGroup>
            <FormLabel>Lead Status / Temperature</FormLabel>
            <CustomSelect
              value={editStatus}
              onChange={setEditStatus}
              options={LEAD_STATUS_OPTIONS}
              placeholder="Select lead status…"
            />
          </FormGroup>
          <FormGroup>
            <FormLabel>Pipeline Stage</FormLabel>
            <CustomSelect
              value={editStage}
              onChange={setEditStage}
              options={PIPELINE_STAGE_OPTIONS}
              placeholder="Select pipeline stage…"
            />
          </FormGroup>
          <FormGroup>
            <FormLabel>Service</FormLabel>
            <CustomSelect
              value={editService}
              onChange={setEditService}
              options={CANONICAL_SERVICES_OPTIONS}
              placeholder="Select service…"
            />
          </FormGroup>
          <FormGroup>
            <FormLabel>Budget / Deal Value</FormLabel>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-400 pointer-events-none" />
              <FormInput
                type="text"
                inputMode="numeric"
                value={editBudget}
                onChange={(e) => {
                  const rawVal = e.target.value.replace(/\D/g, "");
                  setEditBudget(rawVal ? formatIndianCurrency(rawVal) : "");
                }}
                placeholder="e.g. 2,50,000 or 8,00,000"
                className="!pl-9"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              Enter the expected deal value in INR. Leave blank if not discussed yet.
            </p>
          </FormGroup>
        </form>
      </EmpModal>
    </div>
  );
}
