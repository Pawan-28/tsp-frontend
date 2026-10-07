/**
 * Settings <-> Incentives shared config helpers: KPI metric set, slab validation,
 * pending-edit diffing and per-employee target resolution.
 */
import { formatIndianNumber } from "./indianFormat.js";

/**
 * One metric set for Settings "KPI Weightages" and the Incentives page.
 * `id` is the id stored in the saved Settings config, `key` is the Incentives metric key.
 */
export const KPI_METRIC_DEFS = [
  { id: "calls", key: "calls", label: "Call Conversations", defaultWeight: 20 },
  { id: "leads", key: "qualified", label: "Qualified Leads", defaultWeight: 20 },
  { id: "meetings", key: "meetings", label: "Meetings Scheduled", defaultWeight: 20 },
  { id: "revenue", key: "cash", label: "Cash Collection", defaultWeight: 25 },
  { id: "conversion", key: "conversion", label: "Call Conversion (%)", defaultWeight: 15 },
];

const DEF_BY_ID = Object.fromEntries(KPI_METRIC_DEFS.map((d) => [d.id, d]));

function num(value) {
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

export function defaultKpiWeights() {
  return KPI_METRIC_DEFS.map((d) => ({ id: d.id, label: d.label, weight: d.defaultWeight, enabled: true }));
}

/**
 * Settings-page KPI list: keeps whatever was saved (labels aligned to the shared metric names)
 * and appends any shared metric missing from an older saved config as a disabled 0% row.
 */
export function normalizeKpiWeights(saved) {
  if (!Array.isArray(saved) || !saved.length) return defaultKpiWeights();
  const rows = saved.map((item) => ({
    ...item,
    label: DEF_BY_ID[item.id]?.label || item.label || item.id,
    weight: num(item.weight),
    enabled: item.enabled !== false,
  }));
  KPI_METRIC_DEFS.forEach((d) => {
    if (!rows.some((r) => r.id === d.id)) {
      rows.push({ id: d.id, label: d.label, weight: 0, enabled: false });
    }
  });
  return rows;
}

/**
 * Incentives metric rows (key/label/weight) from the saved Settings KPI weights.
 * Falls back to the default set only when Settings has nothing saved.
 */
export function kpiWeightsToIncentiveRows(saved) {
  const hasSaved = Array.isArray(saved) && saved.length > 0;
  const source = hasSaved ? saved : defaultKpiWeights();
  const rows = source
    .filter((item) => DEF_BY_ID[item.id] && item.enabled !== false)
    .map((item) => ({
      key: DEF_BY_ID[item.id].key,
      label: DEF_BY_ID[item.id].label,
      weight: num(item.weight),
    }));
  if (!rows.length) {
    return {
      rows: defaultKpiWeights().map((d) => ({ key: DEF_BY_ID[d.id].key, label: d.label, weight: d.weight })),
      source: "default",
    };
  }
  return { rows, source: hasSaved ? "settings" : "default" };
}

/** Bronze slab = the one named Bronze, else the lowest-min slab. */
function findBronzeSlab(slabs) {
  if (!slabs.length) return null;
  return (
    slabs.find((s) => /bronze/i.test(String(s.tier || "")))
    || [...slabs].sort((a, b) => num(a.min) - num(b.min))[0]
  );
}

/**
 * Validate baseline rate + commission slabs.
 * Returns { valid, baseError, slabErrors: { [slabId]: string[] }, messages: string[] }.
 */
export function validateIncentiveConfig({ baseIncentiveRate, incentiveSlabs }) {
  const slabs = Array.isArray(incentiveSlabs) ? incentiveSlabs : [];
  const slabErrors = {};
  const messages = [];
  let baseError = null;

  const slabKey = (s, i) => s.id ?? s.tier ?? i;
  const addSlabError = (slab, i, text) => {
    const key = slabKey(slab, i);
    (slabErrors[key] ||= []).push(text);
    messages.push(`${slab.tier || `Slab ${i + 1}`}: ${text}`);
  };

  const base = Number(baseIncentiveRate);
  if (Number.isNaN(base) || base < 0) {
    baseError = "Baseline rate must be 0% or more";
  } else {
    const bronze = findBronzeSlab(slabs);
    if (bronze && base > num(bronze.rate)) {
      baseError = `Baseline rate (${base}%) cannot be higher than the ${bronze.tier || "Bronze"} rate (${num(bronze.rate)}%)`;
    }
  }
  if (baseError) messages.push(baseError);

  slabs.forEach((slab, i) => {
    const min = Number(slab.min);
    const max = Number(slab.max);
    const rate = Number(slab.rate);
    if (Number.isNaN(min) || min < 0) addSlabError(slab, i, "Min collection must be 0 or more");
    if (Number.isNaN(max) || max < 0) addSlabError(slab, i, "Max collection must be 0 or more");
    if (!Number.isNaN(min) && !Number.isNaN(max) && min > max) {
      addSlabError(slab, i, `Min (₹${formatIndianNumber(min)}) cannot be greater than max (₹${formatIndianNumber(max)})`);
    }
    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
      addSlabError(slab, i, "Commission rate must be between 0% and 100%");
    }

    const prev = slabs[i - 1];
    if (prev) {
      if (num(slab.min) < num(prev.max)) {
        addSlabError(
          slab,
          i,
          `Overlaps ${prev.tier || "the previous slab"}: min (₹${formatIndianNumber(num(slab.min))}) is below its max (₹${formatIndianNumber(num(prev.max))})`,
        );
      }
      if (num(slab.rate) < num(prev.rate)) {
        addSlabError(
          slab,
          i,
          `Rate (${num(slab.rate)}%) cannot be lower than ${prev.tier || "the previous slab"} (${num(prev.rate)}%)`,
        );
      }
    }
  });

  return { valid: messages.length === 0, baseError, slabErrors, messages };
}

/** Flatten a Settings config into comparable leaf values. */
function flattenConfig(cfg = {}) {
  const out = {};
  (cfg.employeeTargets || []).forEach((t) => {
    ["calls", "leads", "meetings", "revenue"].forEach((f) => {
      out[`target.${t.id}.${f}`] = num(t[f]);
    });
  });
  (cfg.kpiWeights || []).forEach((k) => {
    out[`kpi.${k.id}.weight`] = num(k.weight);
    out[`kpi.${k.id}.enabled`] = k.enabled !== false;
  });
  (cfg.incentiveSlabs || []).forEach((s, i) => {
    ["min", "max", "rate"].forEach((f) => {
      out[`slab.${s.id ?? s.tier ?? i}.${f}`] = num(s[f]);
    });
  });
  out.baseIncentiveRate = num(cfg.baseIncentiveRate);
  out.targetBonusAmount = num(cfg.targetBonusAmount);
  out.formulaType = cfg.formulaType ?? "";
  Object.entries(cfg.ratingThresholds || {}).forEach(([k, v]) => {
    out[`rating.${k}`] = num(v);
  });
  return out;
}

/** Number of real (leaf-level) differences between two Settings configs. */
export function countConfigChanges(saved, current) {
  const a = flattenConfig(saved);
  const b = flattenConfig(current);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let count = 0;
  keys.forEach((k) => {
    if (a[k] !== b[k]) count += 1;
  });
  return count;
}

/**
 * Per-employee target resolution used by both Settings and Incentives:
 * the employee record's own target (also edited from the Team page) wins when set,
 * then the saved Settings value, otherwise the fallback.
 */
export function resolveTarget(employeeValue, savedValue, fallback = 0) {
  const own = Number(employeeValue);
  if (own > 0) return own;
  const saved = Number(savedValue);
  if (saved > 0) return saved;
  return fallback;
}
