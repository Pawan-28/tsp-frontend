/** Shared incentive calculation — performance metrics + cash slabs + bonus. */

const DEFAULT_SLABS = [
  { tier: "Bronze", min: 0, max: 100000, rate: 3 },
  { tier: "Silver", min: 100000, max: 250000, rate: 4.5 },
  { tier: "Gold", min: 250000, max: 400000, rate: 6 },
  { tier: "Platinum", min: 400000, max: 1000000, rate: 8 },
];

function safeNum(val) {
  const num = Number(val);
  return Number.isNaN(num) ? 0 : num;
}

function pct(actual, target) {
  const t = safeNum(target) || 1;
  return Math.round((safeNum(actual) / t) * 1000) / 10;
}

export function resolveIncentiveSlabRate(cashCollected, slabs = DEFAULT_SLABS, fallbackRate = 2.5) {
  const cash = safeNum(cashCollected);
  const list = slabs.length ? slabs : DEFAULT_SLABS;
  const sorted = [...list].sort((a, b) => safeNum(b.min) - safeNum(a.min));
  for (const slab of sorted) {
    if (cash >= safeNum(slab.min)) return safeNum(slab.rate) || fallbackRate;
  }
  return safeNum(list[0]?.rate) || fallbackRate;
}

function insightValues(emp, key) {
  switch (key) {
    case "calls":
      return { actual: emp.callsCompleted, target: emp.callsTarget };
    case "qualified":
      return { actual: emp.qualifiedLeads, target: emp.qualifiedTarget };
    case "meetings":
      return { actual: emp.meetingsScheduled, target: emp.meetingsTarget };
    case "cash":
      return { actual: emp.cashCollected, target: emp.cashTarget };
    case "conversion":
      return {
        actual: safeNum(emp.conversionRate),
        target: safeNum(emp.conversionTarget) || 100,
      };
    default:
      return { actual: 0, target: 1 };
  }
}

function metricEarned(actual, target, weight) {
  const achievement = pct(actual, target);
  return Math.round((achievement / 100) * weight * 10) / 10;
}

/** Weighted performance score from calls, leads, meetings, cash, conversion. */
export function computeWeightedKraScore(emp, metricRows = []) {
  if (!emp || !metricRows.length) return 0;
  let earned = 0;
  metricRows.forEach((row) => {
    const { actual, target } = insightValues(emp, row.key);
    earned += metricEarned(actual, target, safeNum(row.weight));
  });
  return Math.round(earned * 10) / 10;
}

export const computeWeightedPerformanceScore = computeWeightedKraScore;

function hasManualIncentiveOverride(draft) {
  if (!draft || draft.manualIncentive == null || draft.manualIncentive === "") return false;
  return !Number.isNaN(Number(draft.manualIncentive));
}

/**
 * Incentive = performance share + cash commission (or manual override) + bonus − penalty.
 */
export function computeRemunerationBreakdown(draft, options = {}) {
  const {
    kraRows: metricRows = [],
    employee = null,
    weightedPerformance = null,
    baseIncentiveRate = 2.5,
    targetBonusAmount = 2500,
    incentiveSlabs = DEFAULT_SLABS,
    useManualCashRate = false,
  } = options;

  const merged = { ...(employee || {}), ...(draft || {}) };
  const baseSalary = safeNum(draft?.baseSalary ?? merged.baseSalary);
  const cashCollected = safeNum(draft?.cashCollected ?? merged.cashCollected);
  const manualBonus = safeNum(draft?.incBonus ?? merged.incBonus);
  const penalty = safeNum(draft?.penaltyDeduction ?? merged.penaltyDeduction);

  const performanceScore =
    weightedPerformance != null && weightedPerformance > 0
      ? safeNum(weightedPerformance)
      : computeWeightedKraScore(merged, metricRows);

  const baselineRate = safeNum(baseIncentiveRate) || 2.5;
  const slabRate = resolveIncentiveSlabRate(cashCollected, incentiveSlabs, baselineRate);
  const cashRate = useManualCashRate && draft?.incRate != null
    ? safeNum(draft.incRate)
    : slabRate;

  const performancePool = baseSalary * (baselineRate / 100);
  const performanceIncentive = Math.round(performancePool * Math.min(1.25, performanceScore / 100));
  const cashCommission = Math.round(cashCollected * (cashRate / 100));
  const calculatedIncentive = performanceIncentive + cashCommission;

  const manualOverride = hasManualIncentiveOverride(draft);
  const incentiveCore = manualOverride
    ? Math.round(safeNum(draft.manualIncentive))
    : calculatedIncentive;

  const autoTargetBonus = performanceScore >= 100 ? safeNum(targetBonusAmount) : 0;
  const bonus = Math.round(manualBonus + autoTargetBonus);

  const incentiveTotal = Math.round(incentiveCore + bonus - penalty);
  const totalMoney = Math.round(baseSalary + incentiveTotal);

  return {
    baseSalary,
    cashCollected,
    performanceScore,
    kraScore: performanceScore,
    performanceIncentive,
    cashCommission,
    calculatedIncentive,
    incentiveCore,
    manualIncentiveOverride: manualOverride,
    kraIncentive: 0,
    commission: incentiveCore,
    bonus,
    autoTargetBonus,
    manualBonus,
    penalty,
    incentiveTotal,
    totalMoney,
    slabRate: cashRate,
    baselineRate,
  };
}

export const DEFAULT_INCENTIVE_SETTINGS = {
  baseIncentiveRate: 2.5,
  targetBonusAmount: 2500,
  incentiveSlabs: DEFAULT_SLABS,
};
