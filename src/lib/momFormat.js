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
  keyHighlights: "KEY HIGHLIGHTS",
  callHeader: "CALL HEADER",
  discussionHighlights: "DISCUSSION HIGHLIGHTS & KEY REQUIREMENTS",
  qualificationsMet: "QUALIFICATIONS MET",
  actionItems: "ACTION ITEMS & NEXT STEPS",
};

export const LABEL_TO_KEY = Object.fromEntries(
  Object.entries(SECTION_LABELS).map(([key, label]) => [label, key]),
);

export const MOM_SECTION_ORDER = [
  "keyHighlights",
  "callHeader",
  "discussionHighlights",
  "qualificationsMet",
  "actionItems",
];

export const MOM_SECTION_TITLES = {
  keyHighlights: "Key Highlights",
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

/**
 * "[GEMINI CHARGES]" block that aiService.js prepends to ai_summary.
 * @returns {{ total: string, lines: string[] } | null}
 */
export function getGeminiCharges(call) {
  const raw = String(call?.ai_summary || call?.aiSummary || call?.notes || call?.note || "");
  const m = raw.match(/\[GEMINI CHARGES\]\n([\s\S]*?)(?:\n\n|$)/);
  if (!m) return null;
  const lines = m[1].split("\n").map((l) => l.trim()).filter(Boolean);
  const totalLine = lines.find((l) => /^Total:/i.test(l)) || "";
  return { total: totalLine.replace(/^Total:\s*/i, ""), lines: lines.filter((l) => l !== totalLine) };
}

/** ai_summary without the "[GEMINI CHARGES]" block (for plain-text rendering). */
export function stripGeminiCharges(text) {
  return String(text || "").replace(/^\[GEMINI CHARGES\]\n[\s\S]*?(?:\n\n|$)/, "");
}

/** Raw fallback text when no structured/bracket-tagged sections are recognizable. */
export function getMomPlainText(call) {
  if (!call) return "";
  const raw = call.ai_summary || call.aiSummary || call.note || call.notes || "";
  if (typeof raw !== "string" || isWasteMomText(raw)) return ""; // filler / not-connected text is never shown as a MoM
  return stripGeminiCharges(raw);
}

/**
 * Text stored on a call that is NOT a real MoM: the "not connected" filler, a silent-recording marker, a "transcript unavailable"
 * marker, or the made-up "Gemini processed" template an older Call Detail page used to save. A MoM exists only for a call that
 * really connected and was analysed - these are never shown as a MoM (the stored text is left alone, only hidden).
 */
export function isWasteMomText(text) {
  const body = stripGeminiCharges(text).trimStart();
  if (!body) return false;
  return /^\[CALL STATUS: NOT CONNECTED\]/i.test(body)
    || /^\[NO SPEECH DETECTED\]/i.test(body)
    || /^\[TRANSCRIPT UNAVAILABLE\]/i.test(body)
    || (/^\[AI MINUTES OF MEETING - GEMINI PROCESSED\]/i.test(body) && /Transcribed and analyzed audio recording using Google Gemini/i.test(body));
}
