/**
 * EXTRA INFO - frontend side (backend/src/utils/extraInfo.js builds + merges the customer-level profile).
 *
 * Shown on the lead card BELOW the header and ABOVE the notes / call history. It is a short, customer-level profile - NOT the MOM.
 * Where every value comes from, in this order (never invented; missing -> "Not discussed" / "Unknown"):
 *   1. the customer's STORED profile (leads.source_meta.extraInfo): the AI's values from call recordings, merged over time
 *      (a later "Not discussed" never erases a known value, a newer explicit statement replaces the old one);
 *   2. for customers whose calls were analysed BEFORE Extra Info existed: the labelled lines of their existing MOMs
 *      (Budget / Offer / Purchase Timeline / Next Step ... in KEY HIGHLIGHTS, Customer Requirements / Objections in the discussion)
 *      - read-only, nothing is written back;
 *   3. verified CRM data wins for the fields CRM owns: Lead Temperature (the header toggle), Meeting (an active meeting),
 *      Follow-up (an open follow-up), Conversion (pipeline stage).
 */
import { getMomSections } from "./momFormat.js";
import { mapStageToId } from "./pipelineStages.js";

export const NOT_DISCUSSED = "Not discussed";
export const UNKNOWN = "Unknown";

export const EXTRA_INFO_ROWS = [
  { key: "requirement", label: "Requirement" },
  { key: "intent", label: "Intent" },
  { key: "budget", label: "Budget" },
  { key: "offerQuoted", label: "Offer / Price Quoted" },
  { key: "mainConcern", label: "Main Concern" },
  { key: "purchaseTimeline", label: "Purchase Timeline" },
  { key: "decisionMaker", label: "Decision Maker" },
  { key: "objection", label: "Objection" },
  { key: "nextAction", label: "Next Action" },
  { key: "followUp", label: "Follow-up" },
  { key: "meeting", label: "Meeting" },
  { key: "conversion", label: "Conversion" },
  { key: "temperature", label: "Lead Temperature" },
];

// MIRROR of backend/src/utils/extraInfo.js isEmptyValue (extraInfo.parity.test.mjs proves they agree).
const EMPTY_PATTERNS = [
  /^$/, /^-+$/, /^n\/?a$/i, /^none$/i, /^null$/i, /^unknown$/i, /^not (discussed|mentioned|specified|stated|provided|available|applicable)\b/i,
  /^no (information|info|mention|details?)\b/i, /^nothing\b/i, /^not discussed on the call/i, /^no objections? (raised)?$/i,
];
export function isEmptyValue(v) {
  if (v == null) return true;
  const s = String(v).replace(/\s+/g, " ").trim();
  return EMPTY_PATTERNS.some((re) => re.test(s));
}

const MAX_LEN = 160;
const clean = (v) => String(v).replace(/\s+/g, " ").replace(/^[\s•\-*]+/, "").replace(/[\s.;,]+$/, "").trim().slice(0, MAX_LEN);
const usable = (v) => {
  if (v == null || typeof v === "object") return null;
  const s = clean(v);
  return s && !isEmptyValue(s) ? s : null;
};

/* ───────────── legacy: read the labelled lines of an existing MOM (no AI, no writes) ───────────── */

const KEY_HIGHLIGHT_LABELS = {
  "budget": "budget",
  "offer / price quoted": "offerQuoted",
  "offer/price quoted": "offerQuoted",
  "offer": "offerQuoted",
  "price quoted": "offerQuoted",
  "purchase timeline": "purchaseTimeline",
  "next step": "nextAction",
  "next steps": "nextAction",
  "payment / conversion": "conversion",
  "conversion": "conversion",
};

function bulletLines(text) {
  return String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
}

/** First bullet under a "<Heading>:" line of a MOM section (stops at the next "Something:" heading). */
function firstUnderHeading(text, headingRe) {
  const lines = bulletLines(text);
  const at = lines.findIndex((l) => headingRe.test(l.replace(/^[•\-*\s]+/, "")));
  if (at < 0) return null;
  for (let i = at + 1; i < lines.length; i += 1) {
    const l = lines[i].replace(/^[•\-*\s]+/, "");
    if (/^[A-Za-z][A-Za-z /&-]{2,40}:\s*$/.test(l)) break; // next heading
    const v = usable(l);
    if (v) return v;
  }
  return null;
}

function conversionFromText(text) {
  const s = String(text || "").toLowerCase();
  if (/\bnot (yet )?(paid|converted)\b|\bunpaid\b/.test(s)) return "Not converted";
  if (/\bconverted\b|\bpaid\b|\badvance (paid|received)\b|\bpayment (done|received|complete)/.test(s)) return "Converted";
  return null;
}

/** Partial Extra Info read from ONE existing MOM (only values that are explicitly there). */
export function deriveFromMom(call) {
  const sections = getMomSections(call);
  if (!sections) return {};
  const out = {};
  for (const line of bulletLines(sections.keyHighlights)) {
    const m = line.replace(/^[•\-*\s]+/, "").match(/^([A-Za-z /&]+?):\s*(.+)$/);
    if (!m) continue;
    const key = KEY_HIGHLIGHT_LABELS[m[1].trim().toLowerCase()];
    if (!key) continue;
    if (key === "conversion") {
      const c = conversionFromText(m[2]);
      if (c) out.conversion = c;
      continue;
    }
    const v = usable(m[2]);
    if (v) out[key] = v;
  }
  const req = firstUnderHeading(sections.discussionHighlights, /^customer requirements:?$/i);
  if (req && !out.requirement) out.requirement = req;
  const obj = firstUnderHeading(sections.discussionHighlights, /^customer concerns? ?\/? ?objections?:?$/i);
  if (obj) { out.objection = obj; out.mainConcern = obj; }
  if (!out.nextAction) {
    const next = firstUnderHeading(sections.actionItems, /^next steps?:?$/i);
    if (next) out.nextAction = next;
  }
  return out;
}

/** Newest explicit value per field across the lead's connected calls (calls newest first). */
export function deriveFromCalls(calls = []) {
  const merged = {};
  for (const call of calls) {
    const part = deriveFromMom(call);
    for (const [k, v] of Object.entries(part)) if (merged[k] == null) merged[k] = v;
  }
  return merged;
}

/* ───────────── building the rows ───────────── */

const TEMPERATURE_LABELS = { hot: "Hot", warm: "Warm", cold: "Cold" };

/** Hot / Warm / Cold from the id the header toggle uses (or the AI's "Warm Lead" style string); anything else is Unknown. */
export function temperatureLabel(temperatureId) {
  const t = String(temperatureId || "").toLowerCase();
  const id = t.includes("hot") ? "hot" : t.includes("warm") ? "warm" : t.includes("cold") ? "cold" : "";
  return TEMPERATURE_LABELS[id] || UNKNOWN;
}

const formatFollowUpValue = (fu) => {
  if (!fu || typeof fu !== "object") return null;
  if (fu.needed === "No") return "No";
  if (fu.needed === "Yes") return fu.when ? `Yes — ${fu.when}` : "Yes";
  return null;
};

/**
 * @param {object} p
 * @param {object|null} p.stored          lead.sourceMeta.extraInfo ({ fields: { key: { value } } })
 * @param {object[]} p.calls              the lead's calls, NEWEST FIRST (connected ones carry the MOM)
 * @param {object} p.lead                 the lead (stage / status / sourceMeta)
 * @param {string} p.temperatureId        the same value the header Hot/Warm/Cold toggle shows
 * @param {object[]} p.meetings           this employee's meetings (frontend shape, with isActive)
 * @param {object[]} p.followUps          this employee's follow-ups (frontend shape)
 * @returns {{ rows: {key,label,value,known,source}[], knownCount: number }}
 */
export function buildExtraInfoRows({ stored = null, calls = [], lead = null, temperatureId = "", meetings = [], followUps = [] } = {}) {
  const fields = (stored && stored.fields) || {};
  const derived = deriveFromCalls(calls);
  const leadId = lead?.id != null ? String(lead.id) : null;
  const stageId = lead ? mapStageToId(lead.pipelineStage || lead.stage || "", lead.status || "") : "";

  const pick = (key) => {
    const s = fields[key] && fields[key].value;
    if (s != null) {
      const v = typeof s === "object" ? s : usable(s); // "Not discussed"-like text in a stored value is not a known fact
      if (v != null) return { value: v, source: "ai" };
    }
    if (derived[key] != null && key !== "followUp") return { value: derived[key], source: "mom" };
    return null;
  };

  const rows = EXTRA_INFO_ROWS.map(({ key, label }) => {
    let value = null;
    let source = null;

    if (key === "temperature") {
      const v = temperatureLabel(temperatureId || lead?.temperature);
      return { key, label, value: v, known: v !== UNKNOWN, source: "crm" };
    }

    if (key === "meeting") {
      const active = leadId && meetings.find((m) => String(m.leadId) === leadId && m.status === "scheduled" && m.isActive !== false);
      if (active) { value = active.time ? `Booked — ${active.time}` : "Booked"; source = "crm"; }
    } else if (key === "followUp") {
      const open = leadId && followUps.filter((f) => String(f.leadId) === leadId && !f.done).sort((a, b) => String(a.scheduledDate || "").localeCompare(String(b.scheduledDate || "")))[0];
      if (open) { value = open.time ? `Yes — ${open.time}` : "Yes"; source = "crm"; }
    } else if (key === "conversion") {
      if (stageId === "payment_complete") { value = "Converted"; source = "crm"; }
      else if (stageId === "advance_paid") { value = "Pending — advance paid"; source = "crm"; }
    }

    if (value == null) {
      const p = pick(key);
      if (p) { value = key === "followUp" ? formatFollowUpValue(p.value) : p.value; source = p.source; }
    }

    if (value == null) {
      // nothing reliable: show the honest default, never a guess ("Not converted" = CRM shows no payment)
      const dflt = key === "intent" ? UNKNOWN : key === "conversion" ? "Not converted" : NOT_DISCUSSED;
      return { key, label, value: dflt, known: false, source: null };
    }
    return { key, label, value, known: true, source };
  });

  return { rows, knownCount: rows.filter((r) => r.known && r.key !== "temperature").length };
}
