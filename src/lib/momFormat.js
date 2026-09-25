// Shared MoM (Minutes of Meeting) / AI call-summary formatting helpers.
//
// Backend (aiService.js) can return a structured summary object with these keys, or
// (for older rows) a single text blob with bracket-tagged sections, e.g.:
//   [CALL HEADER]
//   ...
//   [DISCUSSION HIGHLIGHTS & KEY REQUIREMENTS]
//   ...
// These helpers normalize either shape into the same 4-section structure so the UI
// never has to special-case old vs. new data, and never dumps raw JSON.

export const SECTION_LABELS = {
  callHeader: "CALL HEADER",
  discussionHighlights: "DISCUSSION HIGHLIGHTS & KEY REQUIREMENTS",
  qualificationsMet: "QUALIFICATIONS MET",
  actionItems: "ACTION ITEMS & NEXT STEPS",
};

export const LABEL_TO_KEY = Object.fromEntries(
  Object.entries(SECTION_LABELS).map(([key, label]) => [label, key]),
);

export const MOM_SECTION_ORDER = [
  "callHeader",
  "discussionHighlights",
  "qualificationsMet",
  "actionItems",
];

export const MOM_SECTION_TITLES = {
  callHeader: "Call Header",
  discussionHighlights: "Discussion Highlights & Key Requirements",
  qualificationsMet: "Qualifications Met",
  actionItems: "Action Items & Next Steps",
};

/** Parse a legacy bracket-tagged summary string into { callHeader, discussionHighlights, ... }. */
export function parseBracketTaggedMom(text) {
  if (!text || typeof text !== "string") return null;
  const regex = /\[([A-Z0-9 &]+)\]\n([\s\S]*?)(?=\n\[[A-Z0-9 &]+\]\n|$)/g;
  const sections = {};
  let matched = false;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const label = match[1].trim();
    const key = LABEL_TO_KEY[label];
    if (!key) continue;
    sections[key] = match[2].trim();
    matched = true;
  }
  return matched ? sections : null;
}

function hasRealContent(sections) {
  if (!sections || typeof sections !== "object") return false;
  return MOM_SECTION_ORDER.some((key) => String(sections[key] || "").trim().length > 0);
}

/** Resolve the 4-section structure for a call, preferring backend structuredSummary. */
export function getMomSections(call) {
  if (!call) return null;
  if (call.structuredSummary && hasRealContent(call.structuredSummary)) {
    return call.structuredSummary;
  }
  const raw = call.ai_summary || call.aiSummary || call.note || call.notes;
  const parsed = parseBracketTaggedMom(raw);
  return hasRealContent(parsed) ? parsed : null;
}

/** Raw fallback text when no structured/bracket-tagged sections are recognizable. */
export function getMomPlainText(call) {
  if (!call) return "";
  const raw = call.ai_summary || call.aiSummary || call.note || call.notes || "";
  return typeof raw === "string" ? raw : "";
}
