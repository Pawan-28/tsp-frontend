/** Shared pipeline stages — admin kanban, employee kanban, and DB labels. */
export const PIPELINE_STAGE_DEFINITIONS = [
  { id: "lead", label: "Lead", shortLabel: "Lead", color: "#64748b", badgeTone: "muted" },
  { id: "not_pick", label: "Not Pick", shortLabel: "Not Pick", color: "#94a3b8", badgeTone: "danger" },
  { id: "short_call", label: "Short Call", shortLabel: "< 2 min", color: "#6366f1", badgeTone: "primary" },
  { id: "conversation_2min", label: "Conversation", shortLabel: "Conversation", color: "#3b82f6", badgeTone: "info" },
  { id: "meeting_booked", label: "Meeting Booked", shortLabel: "M. Booked", color: "#0ea5e9", badgeTone: "primary" },
  { id: "meeting_done", label: "Meeting Done", shortLabel: "M. Done", color: "#7c3aed", badgeTone: "primary" },
  { id: "proposal_sent", label: "Proposal Sent", shortLabel: "Proposal", color: "#f59e0b", badgeTone: "warning" },
  { id: "objection", label: "Objection", shortLabel: "Objection", color: "#f97316", badgeTone: "warning" },
  { id: "advance_paid", label: "Advance Paid", shortLabel: "Advance", color: "#06b6d4", badgeTone: "success" },
  { id: "payment_complete", label: "Payment Complete", shortLabel: "Paid", color: "#10b981", badgeTone: "success" },
  { id: "not_interested", label: "Not Interested", shortLabel: "Not Int.", color: "#dc2626", badgeTone: "danger" },
];

export const DEFAULT_PIPELINE_STAGE_ID = "lead";
export const DEFAULT_PIPELINE_STAGE_LABEL = "Lead";

export function getStageMetaById(stageId) {
  return PIPELINE_STAGE_DEFINITIONS.find((s) => s.id === stageId) || PIPELINE_STAGE_DEFINITIONS[0];
}

export function getStageLabelById(stageId) {
  return getStageMetaById(stageId).label;
}

/** Map any legacy or canonical stage string to a pipeline stage id. */
export function mapStageToId(stage, status = "") {
  const raw = String(stage || "").trim();
  const s = raw.toLowerCase();
  const normalized = s.replace(/_/g, " ");
  const st = String(status || "").toLowerCase();

  if (s === "conversation_5") return "conversation_2min";

  const direct = PIPELINE_STAGE_DEFINITIONS.find(
    (item) => item.id === s
      || item.id === raw
      || item.label.toLowerCase() === s
      || item.label.toLowerCase() === normalized,
  );
  if (direct) return direct.id;

  if (normalized.includes("not interested") || st === "ni" || st.includes("not interested")) {
    return "not_interested";
  }
  if (
    normalized.includes("payment complete")
    || normalized.includes("converted")
    || normalized === "won"
    || normalized.includes("closed won")
  ) {
    return "payment_complete";
  }
  if (normalized.includes("advance paid")) return "advance_paid";
  if (normalized.includes("objection") || normalized.includes("negotiation")) return "objection";
  if (normalized.includes("proposal sent") || normalized.includes("proposal")) return "proposal_sent";
  if (
    normalized.includes("meeting done")
    || normalized.includes("showed up")
    || normalized.includes("show up")
  ) {
    return "meeting_done";
  }
  if (
    normalized.includes("meeting booked")
    || normalized.includes("booked")
    || normalized.includes("call booked")
  ) {
    return "meeting_booked";
  }
  if (st === "booked" || st.includes("booked")) return "meeting_booked";
  if (
    s === "conversation_2min"
    || s === "conversation_5"
    || normalized.includes("conversation 2 min")
    || normalized.includes("conversation - 5")
    || normalized.includes("conversation 5")
    || (normalized.includes("conversation") && normalized.includes("2 min"))
  ) {
    return "conversation_2min";
  }
  if (
    s === "short_call"
    || normalized.includes("short call")
    || (normalized.includes("connected") && normalized.includes("2 min"))
  ) {
    return "short_call";
  }
  if (normalized.includes("not pick") || st === "notpick" || st.includes("not pick")) {
    return "not_pick";
  }
  if (s.includes("attempted") || st.includes("attempted")) return "not_pick";
  if (s === "new" || s.includes("new lead") || st === "new" || st.includes("new lead")) {
    return "lead";
  }
  if (s === "lead") return "lead";
  if (s.includes("not contacted")) return "lead";
  if (s.includes("stuck in pipeline")) {
    if (s.includes("booked")) return "meeting_booked";
    if (s.includes("done")) return "meeting_done";
    if (s.includes("proposal")) return "proposal_sent";
    if (s.includes("objection")) return "objection";
  }

  // Legacy admin pipeline column ids
  if (s === "closed_won") return "payment_complete";
  if (s === "negotiation") return "objection";
  if (s === "proposal") return "proposal_sent";
  if (s === "qualified") return "meeting_booked";
  if (s === "contacted" || st === "contacted" || st.includes("contacted")) return "lead";

  return DEFAULT_PIPELINE_STAGE_ID;
}

export function normalizeStageLabel(stage, status = "") {
  const raw = String(stage || "").trim();
  if (!raw) return DEFAULT_PIPELINE_STAGE_LABEL;
  const byId = PIPELINE_STAGE_DEFINITIONS.find((item) => item.id === raw);
  if (byId) return byId.label;
  const byLabel = PIPELINE_STAGE_DEFINITIONS.find(
    (item) => item.label.toLowerCase() === raw.toLowerCase(),
  );
  if (byLabel) return byLabel.label;
  return getStageLabelById(mapStageToId(raw, status));
}

export function isPaymentCompleteStageId(id) {
  return id === "payment_complete";
}

export function isPipelineQualifiedStageId(id) {
  return id === "meeting_booked" || id === "meeting_done";
}

export const ADMIN_PIPELINE_TO_DB_STAGE = Object.fromEntries(
  PIPELINE_STAGE_DEFINITIONS.map((s) => [s.id, s.label]),
);
ADMIN_PIPELINE_TO_DB_STAGE.conversation_5 = "Conversation 2 min+";
