const STORAGE_KEY = "emp_followup_outcomes";

export function readFollowUpOutcomes() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function persistFollowUpOutcome(followUpId, outcome) {
  if (typeof window === "undefined" || followUpId == null) return;
  const map = readFollowUpOutcomes();
  map[String(followUpId)] = { outcome, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function clearFollowUpOutcome(followUpId) {
  if (typeof window === "undefined" || followUpId == null) return;
  const map = readFollowUpOutcomes();
  delete map[String(followUpId)];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function applyFollowUpOutcomes(followUps = [], { isCompleted } = {}) {
  const outcomes = readFollowUpOutcomes();
  return followUps.map((f) => {
    if (typeof isCompleted === "function" && isCompleted(f)) {
      return f;
    }
    const stored = outcomes[String(f.id)];
    if (!stored?.outcome) return f;
    if (stored.outcome === "not_picked") {
      return {
        ...f,
        notPicked: true,
        lastCallOutcome: "not_picked",
        note: f.note?.includes("Not picked") ? f.note : `${f.note || "Call follow-up scheduled"} · Not picked`,
      };
    }
    if (stored.outcome === "call_again") {
      return {
        ...f,
        notPicked: false,
        lastCallOutcome: "call_again",
        note: f.note?.includes("Call again") ? f.note : `${f.note || "Call follow-up scheduled"} · Call again`,
      };
    }
    return f;
  });
}
