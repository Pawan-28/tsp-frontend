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
/**
 * When the AI could not make a MoM, the server stores a marker + the real reason on the call ("[TRANSCRIPT UNAVAILABLE] ...
 * Reason: recording download failed (HTTP 403)"). That text is hidden from the MoM view, so the user only saw "not generated" and
 * a success toast. This turns it into a plain message to show instead. Returns null when the text is a real MoM (or empty).
 */
export function momFailure(text) {
  const body = stripGeminiCharges(text).trimStart();
  if (!body) return null;
  if (/^\[NO SPEECH DETECTED\]/i.test(body)) {
    return "The recording has no intelligible speech, so there is nothing to summarise.";
  }
  if (/^\[AI UNAVAILABLE\]/i.test(body)) {
    return body.replace(/^\[AI UNAVAILABLE\]\s*/i, "").split("\n")[0].trim() || "The AI service is not available on the server.";
  }
  if (/^\[AI SUMMARY PENDING\]/i.test(body)) {
    const why = (/Reason:\s*([^\n]+)/i.exec(body) || [])[1]?.trim();
    return why
      ? `The call was transcribed but the AI summary step failed (${why}). Try again in a moment.`
      : "The call was transcribed but the AI summary step failed. Try again in a moment.";
  }
  if (/^\[TRANSCRIPT UNAVAILABLE\]/i.test(body)) {
    const reason = (/Reason:\s*([^\n]+)/i.exec(body) || [])[1]?.trim() || "";
    if (/download failed \(HTTP (401|403|404|410)\)/i.test(reason)) {
      return `The recording link no longer works (${reason.replace(/^recording download failed /i, "")}). Callyzer may have expired or removed it, so the AI cannot hear the call.`;
    }
    if (/download failed/i.test(reason)) return `The recording could not be downloaded (${reason}). Try again later.`;
    if (/empty/i.test(reason)) return "The recording file is empty, so the AI cannot hear the call.";
    if (/quota|429|rate/i.test(reason)) return "The AI is over its usage limit right now. Try again later.";
    return reason ? `The AI could not transcribe the recording: ${reason}` : "The AI could not transcribe the recording.";
  }
  return null;
}

export function isWasteMomText(text) {
  const body = stripGeminiCharges(text).trimStart();
  if (!body) return false;
  return /^\[CALL STATUS: NOT CONNECTED\]/i.test(body)
    || /^\[NO SPEECH DETECTED\]/i.test(body)
    || /^\[TRANSCRIPT UNAVAILABLE\]/i.test(body)
    || (/^\[AI MINUTES OF MEETING - GEMINI PROCESSED\]/i.test(body) && /Transcribed and analyzed audio recording using Google Gemini/i.test(body));
}
