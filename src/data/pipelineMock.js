import { PIPELINE_STAGE_DEFINITIONS, mapStageToId } from "../lib/pipelineStages.js";
import {
  groupEmpLeadsKanban,
} from "../lib/leadKanban.js";
import { normalizeLeadForDetailPanel } from "../lib/leadSync.js";

export const PIPELINE_STAGES = PIPELINE_STAGE_DEFINITIONS;

export const PRIORITY_BADGE = {
  HOT: "danger",
  WARM: "warning",
  COLD: "info",
};

export const PRIORITY_OPTIONS = ["HOT", "WARM", "COLD"];

export function formatPipelineValue(amount) {
  const n = Number(amount) || 0;
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(0)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function timeAgoShort(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

export function getStageMeta(stageIdOrLabel) {
  if (!stageIdOrLabel) return PIPELINE_STAGES[0];
  const q = String(stageIdOrLabel).toLowerCase().trim();
  const normalized = q.replace(/_/g, " ");
  return (
    PIPELINE_STAGES.find(
      (s) => s.id === stageIdOrLabel
        || s.id.toLowerCase() === q
        || s.label.toLowerCase() === q
        || s.label.toLowerCase() === normalized,
    ) || PIPELINE_STAGES[0]
  );
}

export function getStageIndex(stageId) {
  return PIPELINE_STAGES.findIndex((s) => s.id === stageId);
}

export function patchLead(lead, patch, activityText, activityType = "note") {
  const next = { ...lead, ...patch, updatedAt: new Date().toISOString() };
  if (patch.stage === "payment_complete") next.winProbability = 100;
  if (activityText) {
    next.activities = [
      { id: Date.now(), type: activityType, text: activityText, at: new Date().toISOString() },
      ...lead.activities,
    ];
  }
  return next;
}

export function groupLeadsByStage(leads, calls = [], options = {}) {
  const period = String(options.period || "month").toLowerCase();
  const meetings = options.meetings || [];
  return groupEmpLeadsKanban(leads, calls, {
    period,
    meetings,
    visibleLeads: options.visibleLeads,
  });
}

const FORM_STAGE_TO_PIPELINE = {
  Lead: "lead",
  "New Lead": "lead",
  "Not Pick": "not_pick",
  "Short Call": "short_call",
  "Conversation 2 min+": "conversation_2min",
  Conversation: "conversation_2min",
  "Conversation - 5 (Inko follow Up)": "conversation_2min",
  Contacted: "lead",
  Qualified: "meeting_booked",
  Attempted: "not_pick",
  "Meeting Booked": "meeting_booked",
  Booked: "meeting_booked",
  "Call Booked": "meeting_booked",
  "Meeting Done": "meeting_done",
  "Showed up": "meeting_done",
  "Proposal Sent": "proposal_sent",
  Proposal: "proposal_sent",
  Objection: "objection",
  Negotiation: "objection",
  "Advance Paid": "advance_paid",
  "Payment Complete": "payment_complete",
  Converted: "payment_complete",
  "Closed Won": "payment_complete",
  "Not Interested": "not_interested",
};

const FORM_TEMP_TO_PRIORITY = {
  "Hot Lead": "HOT",
  "Warm Lead": "WARM",
  "Cold Lead": "COLD",
};

export function leadFromForm(raw) {
  const stage = FORM_STAGE_TO_PIPELINE[raw.pipeline_stage] || "lead";
  const priority = FORM_TEMP_TO_PRIORITY[raw.temperature] || "COLD";
  const assigneeName =
    raw.assignee_name ||
    raw.assigneeName ||
    raw.assignee ||
    (typeof raw.assignedTo === "object" ? raw.assignedTo?.name : "") ||
    raw.owner ||
    "";
  return {
    id: String(raw.id ?? raw._id ?? `p-${Date.now()}`),
    stage,
    name: raw.lead_name || raw.name || "New Lead",
    company: raw.company_name || raw.company || "",
    value: Number(raw.expected_revenue ?? raw.value ?? 0),
    priority,
    updatedAt: new Date().toISOString(),
    phone: raw.phone || "",
    email: raw.email || "",
    city: raw.city || "",
    state: raw.state || "",
    source: raw.source || "Manual",
    owner: assigneeName,
    assignee: assigneeName,
    assignee_name: assigneeName,
    employeeName: assigneeName,
    assigneeId: raw.assigneeId || raw.assigned_to || raw.assignedTo?.id || null,
    assignedTo: raw.assignedTo || (assigneeName ? { id: raw.assigneeId, name: assigneeName } : null),
    winProbability: raw.win_probability ?? 50,
    nextFollowUp: raw.next_followup_date || raw.nextFollowUp || "",
    notes: raw.notes || "",
    activities: [
      { id: Date.now(), type: "created", text: "Lead added manually", at: new Date().toISOString() },
    ],
    tasks: [],
  };
}

export function getPipelineSummary(leads) {
  const list = Array.isArray(leads) ? leads.filter(Boolean) : [];
  const total = list.length;
  let hot = 0;
  let warm = 0;
  let cold = 0;
  for (const l of list) {
    const temp = String(l.temperature || l.status || "").toLowerCase();
    if (l.priority === "HOT" || temp.includes("hot")) hot += 1;
    else if (l.priority === "COLD" || temp.includes("cold")) cold += 1;
    else warm += 1;
  }
  const value = list.reduce((s, l) => s + (Number(l.value || l.expectedRevenue || l.expected_revenue) || 0), 0);
  
  const notInterested = list.filter((l) => {
    const status = String(l.status || "").toLowerCase().trim();
    const stage = String(l.stage || l.pipelineStage || l.pipeline_stage || "").toLowerCase().trim();
    return (
      status === "not interested" ||
      status === "not_interested" ||
      status === "ni" ||
      stage === "not interested" ||
      stage === "not_interested" ||
      stage === "ni"
    );
  }).length;

  return { total, hot, warm, cold, value, notInterested };
}
