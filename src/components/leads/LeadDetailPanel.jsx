import toast from "react-hot-toast";
import {
  Phone, MessageCircle, Mail, Sparkles, Clock,
  Users, RefreshCw, Shuffle, ChevronDown, ChevronUp, Zap,
  CheckCircle, Circle, ShieldCheck, Play, Pause, Volume2, ArrowLeft, Calendar, RotateCcw,
  Megaphone, Target, Video, CalendarClock, Eye, EyeOff,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LEAD_STATUS_LABELS,
  EMP_LEAD_TEMPERATURES,
  phonesMatchLoose,
  LOCAL_SOPS,
} from "../../data/employeeMock.js";
import { LeadStatusBadge, AvatarCircle, FormTextarea, BtnPrimary } from "../../employee/components/EmpUI.jsx";
import CashCollectedPanel, { paymentTypeForStage } from "../CashCollectedPanel.jsx";
import { CANONICAL_STAGE_LABELS, buildDetailDraft, realLeadName, unwrapApiList, filterAssignableEmployees, isDummyEmployee } from "../../lib/leadSync.js";
import { useLeadSources } from "../../lib/useLeadSources.js";
import { normalizeSource } from "../../lib/leadAssignment.js";
import { formatLeadCreated } from "../../lib/leadCreated.js";
import { callFromApiLite } from "../../lib/callFromApiLite.js";
import { formatCallDisplayDate, formatCallDuration, isCallConnected } from "../../lib/callDisplay.js";
import { formatTelUrl, formatWhatsAppPhone } from "../../lib/phoneUtils.js";
import { apiGet, apiPost, processCallWithAi } from "../../lib/api.js";
import { getCrmHeaders, getAdminCrmHeaders } from "../../lib/crmContext.js";
import { getMomSections, getMomPlainText, stripGeminiCharges, isWasteMomText } from "../../lib/momFormat.js";
import ExtraInfoCard from "./ExtraInfoCard.jsx";
import MomText from "./MomText.jsx";
import CallHistoryList from "./CallHistoryList.jsx";
import { buildCallHistoryItems } from "../../lib/callHistoryList.js";
import { buildExtraInfoRows } from "../../lib/extraInfo.js";
import { useEmployee } from "../../context/EmployeeContext.jsx";
import MomSections, { GeminiChargesBar } from "./MomSections.jsx";
import { isOutboundCall, isMissedCall, callStatusMeta } from "../../lib/callMetrics.js";
import { sourceLabel } from "../../lib/sourceLabels.js";
import LeadBookMeetingModal from "../../employee/components/LeadBookMeetingModal.jsx";
import LeadFollowUpModal from "../../employee/components/LeadFollowUpModal.jsx";
import WhatsAppScriptPicker from "../../employee/components/WhatsAppScriptPicker.jsx";
import { cleanServiceName, matchCatalogService } from "../../lib/meetingTitle.js";
import AutoAssignChip from "../AutoAssignChip.jsx";
import { useAutoAssignClocks } from "../../lib/useAutoAssignClocks.js";

const TEMPERATURE_BTN_ACTIVE = {
  hot: "bg-rose-100 border-rose-200 text-rose-800 shadow-sm",
  warm: "bg-amber-100 border-amber-200 text-amber-800 shadow-sm",
  cold: "bg-sky-100 border-sky-200 text-sky-800 shadow-sm",
  ni: "bg-violet-100 border-violet-200 text-violet-800 shadow-sm",
};

// Real options come from /api/services; until they load, only the empty choice is offered.
const DEFAULT_SERVICE_OPTIONS = ["—"];

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

/** A call that never connected (Not pick / Rejected / Missed incoming / 0:00): no AI summary exists for it. */
function isCallNotConnected(call) {
  return !isCallConnected(call) || isMissedCall(call);
}

const CUSTOM_FIELD_OPTION = "__custom__";

function DetailField({ label, value, onChange, readOnly = false, type = "text", options, allowCustom = false, getOptionLabel, wide = false, footer = null, placeholder, highlight = false, onCustomCommit }) {
  // Only the user's "+ Add new…" opens free-text mode. A stored value that isn't in `options`
  // is appended to them so the select shows it instead of silently falling back to "—".
  const [customMode, setCustomMode] = useState(false);
  const [committing, setCommitting] = useState(false);
  // onCustomCommit(text) -> final value: used by Source so a typed new source is SAVED (and shows on the admin Sources page).
  const commitCustom = async () => {
    const text = String(value || "").trim();
    if (!onCustomCommit || !text || committing) return;
    setCommitting(true);
    try {
      const finalValue = await onCustomCommit(text);
      onChange(finalValue);
      setCustomMode(false);
    } catch (err) {
      toast.error(err?.message || "Could not save this option");
    } finally {
      setCommitting(false);
    }
  };
  const selectOptions = options && value && value !== "—" && !options.includes(value)
    ? [...options, value]
    : options;

  const optionText = (opt) => (getOptionLabel ? getOptionLabel(opt) : opt);
  const shownValue = value ? optionText(value) : "";

  return (
    <div className={`${fieldCardClass}${wide ? " col-span-2" : ""}${highlight ? " !border-rose-400 !bg-rose-50/60 ring-1 ring-rose-200" : ""}`}>
      <p className={labelClass}>{label}</p>
      {readOnly ? (
        <p className="text-xs font-black text-slate-800 mt-1.5 truncate" title={shownValue || undefined}>{shownValue || "—"}</p>
      ) : options && customMode ? (
        <div className="relative">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCustomCommit ? commitCustom : undefined}
            onKeyDown={onCustomCommit ? ((e) => { if (e.key === "Enter") { e.preventDefault(); commitCustom(); } }) : undefined}
            disabled={committing}
            placeholder={onCustomCommit ? "Type the new source name, press Enter…" : "Type to add new…"}
            className={inputClass}
            style={{ paddingRight: 28 }}
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
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
          title={shownValue || undefined}
        >
          {selectOptions.map((opt) => (
            <option key={opt} value={opt}>{optionText(opt)}</option>
          ))}
          {allowCustom && <option value={CUSTOM_FIELD_OPTION}>+ Add new…</option>}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
      {footer}
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
  // Shared call definition: only answered calls can have a checklist (no outcome-text guessing).
  const isMissed = !callStatusMeta(call).connected;
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
  createMeeting,
  onMeetingBooked,
  scheduleFollowUp,
  onTemperatureChange,
  onStageChange,
  pipelineView = false,
  editLeadsHref = null,
}) {
  const navigate = useNavigate();
  const readOnly = readOnlyProp ?? variant === "admin";
  const viewOnlyPipeline = pipelineView && readOnly;
  const [draft, setDraft] = useState(() => buildDetailDraft(liveLead));
  const [waPickerOpen, setWaPickerOpen] = useState(false);
  // Optimistic Hot/Warm/Cold selection so the toggle responds instantly and never sticks on the old value.
  const [tempOverride, setTempOverride] = useState(null);
  useEffect(() => { setTempOverride(null); }, [liveLead?.id]);
  const [saving, setSaving] = useState(false);
  // Hide / See: Source, SOP and the UTM fields can be folded away (the choice is remembered on this device).
  const [showMoreFields, setShowMoreFields] = useState(() => {
    try { return window.localStorage.getItem("leadPanel.showMoreFields") !== "0"; } catch { return true; }
  });
  const toggleMoreFields = () => {
    setShowMoreFields((v) => {
      try { window.localStorage.setItem("leadPanel.showMoreFields", v ? "0" : "1"); } catch { /* private window / blocked storage: just not remembered */ }
      return !v;
    });
  };
  const [notesList, setNotesList] = useState([]);
  const [noteLoading, setNoteLoading] = useState(false);
  const [activeViewCallMom, setActiveViewCallMom] = useState(null);
  const [isProcessingAi, setIsProcessingAi] = useState(false);
  const [fetchedCalls, setFetchedCalls] = useState([]);
  const [callsLoading, setCallsLoading] = useState(false);
  const [serviceOptions, setServiceOptions] = useState(DEFAULT_SERVICE_OPTIONS);
  // Extra Info: customer-level profile (leads.source_meta.extraInfo) + the CRM data that owns meeting / follow-up.
  const { meetingsUpcoming, meetingsHistory, followUps } = useEmployee();
  const [fetchedExtraInfo, setFetchedExtraInfo] = useState(null);
  // The lead's created time from the backend (the lead object on a board / call card can lack it).
  const [fetchedCreatedAt, setFetchedCreatedAt] = useState(null);
  // Source dropdown = ONLY the sources on the admin Sources page; "+ Add new…" creates one there too.
  const { sources: leadSources, addSource } = useLeadSources(() => (variant === "admin" ? getAdminCrmHeaders() : getCrmHeaders()));
  // Catalog entries ({ name, serviceId, priceNum }) — used to resolve the lead's stored service.
  const [serviceCatalog, setServiceCatalog] = useState([]);
  // Once the user picks a service themselves, never overwrite it with the lead's stored value.
  const serviceTouchedRef = useRef(false);
  useEffect(() => { serviceTouchedRef.current = false; }, [liveLead?.id]);
  const [bookMeetingOpen, setBookMeetingOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  // Stage → Advance Paid / Payment Complete opens "Cash Collected" with the matching payment type.
  const [cashPrompt, setCashPrompt] = useState({ type: "", signal: 0 });

  // Latest stored Extra Info for this customer (the lead in memory can be older than the last processed call).
  const refreshExtraInfo = async () => {
    const id = liveLead?._dbId || liveLead?.id;
    if (!id || !/^\d+$/.test(String(id))) return;
    try {
      const res = await apiGet(`/api/v1/leads/${id}`, { headers: crmHeaders, cacheTtl: 0 });
      const data = res?.data && typeof res.data === "object" ? res.data : res;
      setFetchedCreatedAt(data?.createdAt ?? data?.created_at ?? null);
      let meta = data?.sourceMeta ?? data?.source_meta;
      if (typeof meta === "string") { try { meta = JSON.parse(meta); } catch { meta = null; } }
      setFetchedExtraInfo(meta && typeof meta === "object" && meta.extraInfo ? meta.extraInfo : null);
    } catch {
      /* keep what we have - Extra Info is informational */
    }
  };

  useEffect(() => {
    setFetchedExtraInfo(null);
    setFetchedCreatedAt(null);
    refreshExtraInfo();
  }, [liveLead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerateAiMom = async (callToProcess) => {
    if (!callToProcess || isProcessingAi) return;
    if (isCallNotConnected(callToProcess)) {
      toast("No AI summary for calls that did not connect.");
      return;
    }
    try {
      setIsProcessingAi(true);
      const toastId = toast.loading("Generating AI MoM… long calls can take a few minutes");
      const res = await processCallWithAi(callToProcess.id, { headers: crmHeaders });
      const updatedCallData = res?.call || res?.data || res;
      if (!updatedCallData || typeof updatedCallData !== "object") {
        throw new Error("AI processing returned no data");
      }
      setActiveViewCallMom((prev) => ({
        ...prev,
        ...updatedCallData,
        checklistProgress: updatedCallData.checklist_progress || updatedCallData.checklistProgress || prev?.checklistProgress,
      }));
      // keep the call list in step, so the new MoM also shows in the MoM card / call history after going back
      setFetchedCalls((prev) => (Array.isArray(prev) ? prev.map((x) => (String(x.id) === String(callToProcess.id)
        ? {
            ...x,
            ai_summary: updatedCallData.ai_summary ?? x.ai_summary,
            aiSummary: updatedCallData.aiSummary ?? updatedCallData.ai_summary ?? x.aiSummary,
            checklistProgress: updatedCallData.checklist_progress || updatedCallData.checklistProgress || x.checklistProgress,
          }
        : x)) : prev));
      toast.success("AI MoM generated successfully!", { id: toastId });
      refreshExtraInfo(); // the AI just folded this call into the customer's Extra Info
    } catch (err) {
      toast.error(err.message || "Failed to generate AI MoM.");
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
  // 3-day stuck-lead timer of THIS lead ("2 days to auto-assign") - nothing while auto-assign is off.
  const { clockFor: autoAssignClockFor } = useAutoAssignClocks(variant === "admin" ? "admin" : "employee", () => crmHeaders);
  const autoAssignClock = autoAssignClockFor(liveLead);

  // Use the real service catalog (same source as the New Lead form) instead of
  // the small hardcoded placeholder list, so this reflects what the business
  // actually offers.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet("/api/services", { headers: crmHeaders, cacheTtl: 30_000 });
        const catalog = (data?.services || data?.data || [])
          .map((s) => ({
            name: s.name || s.title,
            serviceId: s.serviceId || s.serviceCode || s.service_code || "",
            priceNum: Number(s.priceNum ?? s.price_num) || 0,
          }))
          .filter((s) => s.name);
        if (!cancelled && catalog.length) {
          setServiceCatalog(catalog);
          setServiceOptions(["—", ...catalog.map((s) => s.name)]);
        }
      } catch {
        // keep defaults
      }
    })();
    return () => { cancelled = true; };
  }, [crmHeaders]);

  // The webhook stores the service inside `requirements` ("[Service: X] SOP: …") or only as a service
  // code (SRV-010), and the draft is built once per lead — so resolve it against the catalog here.
  // This is what makes the Service dropdown show the lead's real service instead of "—".
  useEffect(() => {
    if (serviceTouchedRef.current || !liveLead) return;
    const meta = liveLead.sourceMeta && typeof liveLead.sourceMeta === "object" ? liveLead.sourceMeta : {};
    const named = [liveLead.service, meta.service, meta.services]
      .map((v) => (Array.isArray(v) ? v.join(", ") : v));
    const hit = matchCatalogService(
      [liveLead.serviceId, meta.serviceId, ...named, liveLead.requirements],
      serviceCatalog,
    );
    const resolved = hit?.name
      || named.map(cleanServiceName).find((s) => s && !/^SRV-/i.test(s) && s.length <= 60)
      || "";
    if (!resolved) return;
    setDraft((prev) => (prev.service === resolved ? prev : { ...prev, service: resolved }));
  }, [liveLead?.id, liveLead?.service, liveLead?.requirements, liveLead?.serviceId, serviceCatalog]);

  const handleServiceChange = (val) => {
    serviceTouchedRef.current = true;
    // Budget is only what the rep/sender entered — never defaulted from the catalog price.
    setDraft((prev) => ({ ...prev, service: val }));
  };

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

  // Total dial attempts to this lead (outbound calls incl. not-picked) — "Dialed N×".
  const dialCount = useMemo(() => {
    const seen = new Set();
    let n = 0;
    for (const c of resolvedCalls) {
      const mine = String(c.leadId) === String(liveLead.id) || String(c.leadId) === String(liveLead._dbId)
        || (liveLead.phone && (phonesMatchLoose(c.phone, liveLead.phone) || phonesMatchLoose(c.clientPhone, liveLead.phone)));
      if (!mine || !isOutboundCall(c)) continue;
      const key = String(c.callyzerCallId || c.callyzer_call_id || c.id || "");
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      n += 1;
    }
    return n;
  }, [resolvedCalls, liveLead]);

  // SOP shown in Lead Details: the lead's own SOP, else the SOP the CRM applies to the
  // lead's service (same matching as the AI MoM / n8n webhook), else "All Services" SOP.
  const [sopCatalog, setSopCatalog] = useState([]);
  useEffect(() => {
    let cancelled = false;
    apiGet("/api/v1/sops", { headers: crmHeaders, cacheTtl: 5 * 60_000 })
      .then((res) => {
        const list = Array.isArray(res) ? res : (res?.data || res?.sops || []);
        if (!cancelled && Array.isArray(list)) setSopCatalog(list);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [crmHeaders]);

  // The SOP record behind this lead: by explicit id/code, then by name, then by the lead's service.
  const resolvedSopRecord = useMemo(() => {
    const active = sopCatalog.filter((sp) => String(sp.status || "").toLowerCase() !== "archived");
    const norm = (v) => String(v ?? "").trim().toLowerCase();
    const idNeedle = norm(draft.sopId || liveLead?.sopId);
    const nameNeedle = norm(draft.sop || liveLead?.sop);
    if (idNeedle) {
      const hit = sopCatalog.find((sp) => norm(sp.sop_code) === idNeedle || norm(sp.id) === idNeedle || norm(sp.title) === idNeedle);
      if (hit) return { sop: hit, byService: false };
    }
    if (nameNeedle) {
      const hit = sopCatalog.find((sp) => norm(sp.title) === nameNeedle || norm(sp.sop_code) === nameNeedle)
        || sopCatalog.find((sp) => norm(sp.title).includes(nameNeedle) || nameNeedle.includes(norm(sp.title)));
      if (hit) return { sop: hit, byService: false };
    }
    const service = cleanServiceName(draft.service) || cleanServiceName(liveLead?.service);
    const servicesOf = (sp) => (Array.isArray(sp.services) && sp.services.length ? sp.services : [sp.service || "All Services"]);
    const hit = (service && active.find((sp) => servicesOf(sp).includes(service)))
      || active.find((sp) => servicesOf(sp).includes("All Services"));
    return hit ? { sop: hit, byService: true } : null;
  }, [draft.sop, draft.sopId, draft.service, liveLead?.sop, liveLead?.sopId, liveLead?.service, sopCatalog]);

  // ONE human SOP identifier (SOP-007). The numeric DB id stays internal and is never shown.
  const resolvedSopLabel = useMemo(() => {
    const own = String(draft.sop || "").trim();
    const rec = resolvedSopRecord?.sop;
    if (own && own !== "—" && !/^\d+$/.test(own)) return own;
    if (rec) return rec.sop_code || rec.title || "";
    const sopIdText = String(draft.sopId || "").trim();
    return /^\d+$/.test(sopIdText) ? "" : sopIdText;
  }, [draft.sop, draft.sopId, resolvedSopRecord]);

  // Source: the stored key is the option value; the current stored value is always selectable.
  const sourceOptions = useMemo(() => {
    const current = String(draft.source || "").trim();
    const currentKey = current ? normalizeSource(current) : "";
    const keys = leadSources.map((s) => s.key).filter((k) => k !== currentKey && k !== current);
    return current ? [current, ...keys] : ["", ...keys];
  }, [draft.source, leadSources]);
  const sourceOptionLabel = (opt) => {
    if (!opt) return "\u2014";
    const hit = leadSources.find((s) => s.key === opt || s.key === normalizeSource(opt));
    return hit ? hit.label : sourceLabel(opt);
  };

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
      const createdAt = c.callAt ? new Date(c.callAt).getTime() : Date.now() - idx * 1000;
      // Calls that never connected add nothing here - no call-log lines and no AI summary.
      if (isCallNotConnected(c)) return null;
      const summaryText = c.aiSummary || c.ai_summary || c.notes || c.note;
      if (!summaryText) return null;
      // A MoM exists only for a call that really connected and was analysed: filler text stored on a call with no
      // conversation (the "not connected" template, a silent recording, ...) is hidden - the stored text is not deleted.
      if (isWasteMomText(summaryText)) return null;

      const callNum = leadCalls.length - idx;
      return {
        id: `call-summary-${c.id}`,
        authorType: "ai",
        authorName: `Call #${callNum} AI Summary (${c.outcome})`,
        callDate: c.date,
        duration: c.duration,
        recordingUrl: c.recordingUrl || c.recording_url || c.audioUrl,
        body: summaryText,
        call: c,
        createdAt,
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
    const previous = tempOverride;
    setTempOverride(newTemp);
    try {
      if (updateLeadTemperature) {
        await updateLeadTemperature(liveLead.id, newTemp);
      }
      if (onTemperatureChange) {
        onTemperatureChange(newTemp);
      }
      toast.success(`Temperature updated to ${LEAD_STATUS_LABELS[newTemp] || newTemp}`);
    } catch (err) {
      setTempOverride(previous);
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
  // The lead's Hot / Warm / Cold / Not Interested - read from its TEMPERATURE (Gemini sets it after a connected call, or the rep picks
  // one). Blank = nothing selected. A stale "warm" in `status` is never read as a temperature.
  const storedTemperature = (() => {
    const t = String(liveLead.temperature || "").toLowerCase();
    if (t.includes("not interested") || t === "ni") return "ni";
    if (t.includes("hot")) return "hot";
    if (t.includes("cold")) return "cold";
    if (t.includes("warm")) return "warm";
    return !t.trim() && ["hot", "warm", "cold"].includes(liveLead.status) ? liveLead.status : "";
  })();
  const currentTemperature = tempOverride ?? storedTemperature;
  const isTemperatureStatus = Boolean(currentTemperature);

  // ACTIVITY HISTORY: every call of this lead - direction, status (Connected / Missed / Not pick / Rejected), time, duration, recording.
  const callHistoryItems = useMemo(() => buildCallHistoryItems(leadCalls), [leadCalls]);

  // EXTRA INFO rows: stored AI profile -> older MOMs -> live CRM data. Calls are newest first; only calls that really connected
  // and carry a real MoM can contribute (not-connected filler never does).
  const extraInfo = useMemo(() => {
    const analysed = leadCalls.filter((c) => !isCallNotConnected(c) && !isWasteMomText(c.aiSummary || c.ai_summary || c.notes || c.note));
    const stored = fetchedExtraInfo || (liveLead.sourceMeta && typeof liveLead.sourceMeta === "object" ? liveLead.sourceMeta.extraInfo : null);
    const built = buildExtraInfoRows({
      stored,
      calls: analysed,
      lead: liveLead,
      temperatureId: currentTemperature || liveLead.temperature || "",
      meetings: [...(meetingsUpcoming || []), ...(meetingsHistory || [])],
      followUps: followUps || [],
    });
    return { ...built, hasAnalysedCall: analysed.some((c) => getMomSections(c)) || Boolean(stored) };
  }, [leadCalls, fetchedExtraInfo, liveLead, tempOverride, isTemperatureStatus, meetingsUpcoming, meetingsHistory, followUps]);

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
      const baseName = buildDetailDraft(liveLead).name || "";
      await onSave({
        ...(String(draft.name || "").trim() !== baseName ? { name: String(draft.name || "").trim() } : {}),
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
              {(Number(c.durationSec ?? c.duration_sec ?? 0) > 0 || (c.duration && !/^0*:?0*:?0*$/.test(String(c.duration))))
                ? "Recording not available yet — it syncs from Callyzer shortly after the call"
                : "No call recording"}
            </div>
          )}
        </div>

        {/* AI Call Summary & MoM Card (Gemini — backend /api/v1/ai/process-call) */}
        <div className="bg-gradient-to-br from-rose-50/60 via-white to-rose-100/20 border border-rose-200/80 shadow-2xs rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between border-b border-rose-100 pb-2 flex-wrap gap-2">
            <h4 className="text-xs font-extrabold text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-rose-600 animate-pulse" /> AI Call Summary & MoM
            </h4>
            {!isCallNotConnected(c) && (
            <button
              type="button"
              disabled={isProcessingAi}
              onClick={() => handleGenerateAiMom(c)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10.5px] transition shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              {isProcessingAi ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-rose-200" />
                  {(getMomSections(c) || getMomPlainText(c)) ? "Re-process AI MoM" : "Generate AI MoM"}
                </>
              )}
            </button>
            )}
          </div>
          <div className="bg-white/90 border border-rose-100 p-3.5 rounded-xl shadow-2xs">
            <MomSections call={c} emptyText="No AI MoM generated yet for this call." />
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
              if (!formatWhatsAppPhone(liveLead.phone)) {
                toast.error("Phone number not found for this lead");
                return;
              }
              setWaPickerOpen(true);
            }}
            className="flex-1 h-10 rounded-xl border border-emerald-250 bg-emerald-50/10 text-emerald-800 hover:bg-emerald-50/30 text-xs font-bold transition flex items-center justify-center gap-1.5"
          >
            <MessageCircle className="w-4 h-4 text-emerald-600" /> WhatsApp
          </button>

          <button
            type="button"
            onClick={async () => {
              const session = await startCallyzerCall?.(liveLead);
              if (!session) return; // reason already shown by startCallyzerCall — stay here instead of opening a dead call screen
              onClose?.();
              navigate(`/employee/call-assistant?leadId=${liveLead.id}&lead=${encodeURIComponent(liveLead.name)}&live=1`);
              if (session.message) toast.success(session.message);
            }}
            className="flex-1 h-10 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold transition shadow-[0_4px_12px_rgba(220,38,38,0.2)] flex items-center justify-center gap-1.5"
          >
            <Zap className="w-4 h-4 fill-white" /> Live Call
          </button>

          <button
            type="button"
            onClick={() => {
              // Date + time only — lead/customer/phone/service/employee come from this lead.
              if (typeof createMeeting === "function") setBookMeetingOpen(true);
              else navigate(`/employee/meetings?action=add&leadId=${liveLead.id}`);
            }}
            className="flex-1 h-10 rounded-xl border border-sky-200 bg-sky-50/60 text-sky-800 hover:bg-sky-100/60 text-xs font-bold transition flex items-center justify-center gap-1.5"
          >
            <Video className="w-4 h-4 text-sky-600" /> Book Meeting
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
                  title="Blank until Gemini sets it after a connected call: Hot = pays within 7 days, Warm = 30 days, Cold = might pay within 90 days, Not Interested = the customer said no. You can also pick one."
                >
                  {EMP_LEAD_TEMPERATURES.map(({ id, label }) => {
                    const active = currentTemperature === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          if (updateLeadTemperature) {
                            handleTemperatureChange(id);
                          } else if (onTemperatureChange) {
                            setTempOverride(id);
                            onTemperatureChange(id);
                          }
                          // Not Interested is also a pipeline stage: the lead moves there (same as picking it in the Stage dropdown).
                          if (id === "ni" && draft.stage !== "Not Interested") {
                            patchDraft("stage")("Not Interested");
                            onStageChange?.("Not Interested");
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
                <LeadStatusBadge status={currentTemperature} label={LEAD_STATUS_LABELS[currentTemperature]} />
              )}
              {variant === "employee" && !readOnly && (
                <button
                  type="button"
                  onClick={() => setFollowUpOpen(true)}
                  disabled={typeof scheduleFollowUp !== "function"}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition disabled:opacity-40"
                >
                  <CalendarClock className="w-3 h-3" /> Follow-up
                </button>
              )}
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-50 border border-rose-100 text-[10px] font-bold text-rose-800">
 {currentAssignee}
              </span>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-700 tabular-nums"
                title="Total dial attempts to this lead"
              >
                <Phone className="w-3 h-3" /> Dialed {dialCount}×
              </span>
              {/* next to the Dialed counter: the exact time left (days, hours, minutes, seconds) before this lead goes to another employee */}
              {autoAssignClock && <AutoAssignChip live clock={autoAssignClock} className="!rounded-full !px-2 !py-1 !text-[10px]" />}
            </div>
          </div>
        </div>
      </div>

      {/* EXTRA INFO - customer-level sales profile, directly below the header card and above the notes / call history. */}
      <ExtraInfoCard rows={extraInfo.rows} hasAnalysedCall={extraInfo.hasAnalysedCall} />

      {/* MoM of connected calls - directly under Extra Info. Only real MoMs (AI summaries of calls that connected) are listed:
          no note input, no call-log lines, no made-up "call completed" text. Hidden while there is nothing to show. */}
      {allNotesAndSummaries.length > 0 && (
        <div className="rounded-2xl border border-rose-100 bg-[#fffbfb] p-4 space-y-3 shadow-sm" data-testid="call-mom-card">
          <div className="flex items-center border-b border-rose-50 pb-2">
            <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-rose-500" /> MoM
            </h4>
          </div>
          <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1 scrollbar-thin">
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
                {item.isAiCallSummary && typeof item.body === "string" && (
                  <GeminiChargesBar call={{ ai_summary: item.body }} />
                )}
                {item.isAiCallSummary && typeof item.body === "string" ? (
                  <MomText text={stripGeminiCharges(item.body)} className="text-slate-800 leading-relaxed font-medium text-[11px]" />
                ) : (
                  <p className="text-slate-800 leading-relaxed font-medium whitespace-pre-line text-[11px]">
                    {formatAiSummaryText(item.body)}
                  </p>
                )}
                {item.isAiCallSummary && item.call && (
                  <button
                    type="button"
                    onClick={() => setActiveViewCallMom(item.call)}
                    className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 hover:text-rose-900"
                  >
                    <ChevronDown className="w-3 h-3" /> View MoM &amp; SOP checklist
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <DetailField
          label="Name"
          value={draft.name || ""}
          onChange={patchDraft("name")}
          readOnly={readOnly}
          placeholder="Add customer name"
          highlight={!readOnly && !realLeadName({ name: draft.name })}
          wide
          footer={!readOnly && !realLeadName({ name: draft.name }) ? (
            <p className="mt-1 text-[10px] font-semibold text-rose-600">This lead has no name - add the name, then Save.</p>
          ) : null}
        />
        <DetailField label="Phone" value={draft.phone} onChange={patchDraft("phone")} readOnly={readOnly} placeholder="Add phone number" highlight={!readOnly && !String(draft.phone || "").trim()} />
        <DetailField label="Email" value={draft.email} onChange={patchDraft("email")} readOnly={readOnly} placeholder="Add email" highlight={!readOnly && !String(draft.email || "").trim()} />
        <DetailField
          label="Stage"
          value={draft.stage}
          onChange={(val) => {
            patchDraft("stage")(val);
            if (onStageChange) {
              onStageChange(val);
            }
            const payType = paymentTypeForStage(val);
            if (payType) setCashPrompt((p) => ({ type: payType, signal: p.signal + 1 }));
          }}
          options={CANONICAL_STAGE_LABELS}
          readOnly={readOnly}
        />
        {showMoreFields && (
          <DetailField
            label="Source"
            value={draft.source}
            onChange={patchDraft("source")}
            options={sourceOptions}
            getOptionLabel={sourceOptionLabel}
            allowCustom
            onCustomCommit={async (text) => (await addSource(text)).key}
            readOnly={readOnly}
          />
        )}
        <DetailField
          label="Budget (₹)"
          value={draft.expectedRevenue}
          onChange={patchDraft("expectedRevenue")}
          type="number"
          readOnly={readOnly}
        />
        <DetailField label="Last Contact" value={liveLead.last} readOnly />
        <DetailField label="Owner/Assignee" value={currentAssignee} readOnly />
        <DetailField label="Lead Created" value={formatLeadCreated(fetchedCreatedAt || liveLead.createdAt || liveLead.created_at)} readOnly />
        <DetailField
          label="Service"
          value={draft.service || "—"}
          onChange={handleServiceChange}
          options={serviceOptions}
          allowCustom
          wide
          readOnly={readOnly}
        />
        {showMoreFields && (
          <DetailField
            label="SOP"
            value={resolvedSopLabel || "—"}
            onChange={patchDraft("sop")}
            readOnly={readOnly}
          />
        )}
        <DetailField label="City" value={draft.city} onChange={patchDraft("city")} readOnly={readOnly} />
        <DetailField label="Company" value={draft.company} onChange={patchDraft("company")} readOnly={readOnly} />
        {/* UTM fields shown right here in the details grid (folded away by Hide) */}
        {showMoreFields && (
          <>
            <DetailField label="UTM Source" value={draft.utm_source} onChange={patchDraft("utm_source")} readOnly={readOnly} />
            <DetailField label="UTM Medium" value={draft.utm_medium} onChange={patchDraft("utm_medium")} readOnly={readOnly} />
            <DetailField label="UTM Campaign" value={draft.utm_campaign} onChange={patchDraft("utm_campaign")} readOnly={readOnly} />
            {/* <DetailField label="UTM Term" value={draft.utm_term} onChange={patchDraft("utm_term")} readOnly={readOnly} /> */}
            <DetailField label="UTM Content" value={draft.utm_content} onChange={patchDraft("utm_content")} readOnly={readOnly} />
          </>
        )}
        <button
          type="button"
          onClick={toggleMoreFields}
          aria-expanded={showMoreFields}
          data-testid="toggle-more-fields"
          className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-rose-200 bg-white/70 px-3 py-2 text-[11px] font-bold text-rose-700 transition hover:bg-rose-50"
        >
          {showMoreFields ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showMoreFields ? "Hide Source, SOP & UTM" : "See Source, SOP & UTM"}
        </button>
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
        defaultPaymentType={cashPrompt.type || paymentTypeForStage(draft.stage)}
        openSignal={cashPrompt.signal}
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





      {/* ACTIVITY HISTORY - every call of this lead (which call, when, how long; Missed / Not pick / Rejected; the recording of a
          connected call), then any other logged activity. */}
      <div className="rounded-2xl border border-rose-100 bg-[#fffbfb] p-4.5 space-y-3 shadow-sm" data-testid="activity-history-card">
        <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-rose-50 pb-2">
          <Clock className="w-3.5 h-3.5 text-rose-505" /> Activity History
        </h4>
        <CallHistoryList items={callHistoryItems} loading={callsLoading} onOpenCall={(call) => setActiveViewCallMom(call)} />
        {variant === "employee" && leadActivities.length > 0 && (
          <div>
            <p className="mb-1.5 text-[9.5px] font-extrabold uppercase tracking-wider text-slate-400">Other activity</p>
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
          </div>
        )}
        {!callsLoading && callHistoryItems.length === 0 && (variant !== "employee" || leadActivities.length === 0) && (
          <p className="text-[11px] text-slate-450 italic pl-1 py-1">No calls or activity yet.</p>
        )}
      </div>

      {variant === "employee" && followUpOpen && (
        <LeadFollowUpModal
          open={followUpOpen}
          lead={liveLead}
          scheduleFollowUp={scheduleFollowUp}
          onClose={() => setFollowUpOpen(false)}
        />
      )}

      {variant === "employee" && waPickerOpen && (
        <WhatsAppScriptPicker
          open={waPickerOpen}
          onClose={() => setWaPickerOpen(false)}
          lead={liveLead}
          phone={formatWhatsAppPhone(liveLead?.phone) || liveLead?.phone || ""}
        />
      )}

      {variant === "employee" && bookMeetingOpen && (
        <LeadBookMeetingModal
          open={bookMeetingOpen}
          lead={liveLead}
          serviceName={cleanServiceName(draft.service) || cleanServiceName(liveLead?.service)}
          employee={employee}
          createMeeting={createMeeting}
          onBooked={onMeetingBooked}
          onClose={() => setBookMeetingOpen(false)}
        />
      )}
    </div>
  );
}
