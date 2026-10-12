// Run: node src/lib/incentiveHold.test.mjs
// F-53: an INVALID incentive configuration (baseline 5% above the Bronze 3% slab) used to be only a warning - Rs 133 was still
// calculated for a rep. Now the payout is ON HOLD until the settings are fixed.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeRemunerationBreakdown } from "./incentiveCalculator.js";
import { validateIncentiveConfig } from "./incentiveSettings.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.resolve(root, rel), "utf8");

const slabs = [
  { id: "b", tier: "Bronze", min: 0, max: 100000, rate: 3 },
  { id: "s", tier: "Silver", min: 100000, max: 250000, rate: 8 },
];
const draft = { baseSalary: 30000, cashCollected: 150000 };
const base = { weightedPerformance: 80, incentiveSlabs: slabs, targetBonusAmount: 2500 };

// the exact situation of the audit
const bad = { baseIncentiveRate: 5, incentiveSlabs: slabs };
const good = { baseIncentiveRate: 2.5, incentiveSlabs: slabs };
const check = validateIncentiveConfig(bad);
assert.equal(check.valid, false);
assert.match(check.messages[0], /Baseline rate \(5%\) cannot be higher than the Bronze rate \(3%\)/);
assert.equal(validateIncentiveConfig(good).valid, true);

// 1. valid settings: the money is calculated exactly as before
const paid = computeRemunerationBreakdown(draft, { ...base, baseIncentiveRate: 2.5, configInvalid: !validateIncentiveConfig(good).valid });
assert.equal(paid.held, undefined);
assert.equal(paid.cashCommission, 12000, "8% of 1,50,000");
assert.equal(paid.incentiveTotal, paid.performanceIncentive + paid.cashCommission);
assert.ok(paid.incentiveTotal > 0);
// ... and when the option is not given nothing changes (default = valid)
assert.deepEqual(computeRemunerationBreakdown(draft, { ...base, baseIncentiveRate: 2.5 }), paid);

// 2. invalid settings: nothing is paid
const held = computeRemunerationBreakdown(draft, { ...base, baseIncentiveRate: 5, configInvalid: !check.valid });
assert.equal(held.held, true);
for (const k of ["performanceIncentive", "cashCommission", "calculatedIncentive", "incentiveCore", "commission", "bonus", "autoTargetBonus", "incentiveTotal"]) assert.equal(held[k], 0, k);
assert.equal(held.totalMoney, 30000, "only the base salary");
// not even a manual override or a bonus can pay while the config is invalid
const heldManual = computeRemunerationBreakdown({ ...draft, manualIncentive: 50000, incBonus: 5000 }, { ...base, baseIncentiveRate: 5, configInvalid: true });
assert.equal(heldManual.incentiveTotal, 0);
assert.equal(heldManual.held, true);

// 3. wiring: the Incentives page and the report export hold too
const page = read("src/pages/Incentives.jsx");
assert.match(page, /configInvalid: !validateIncentiveConfig\(incentiveSettings\)\.valid,/);
assert.match(page, /const payoutHeld = !configCheck\.valid;/);
assert.match(page, /const handleRunCalculation = \(\) => \{\s*if \(!calcDraft\) return;\s*if \(payoutHeld\) \{\s*toast\.error/, "Calculate refuses while on hold");
assert.match(page, /const handleDownloadReport = \(format = "csv"\) => \{\s*if \(!selected\) return;\s*if \(payoutHeld\) \{\s*toast\.error/, "no report while on hold");
assert.match(page, /data-testid="payout-hold-banner"[\s\S]{0,200}Payouts are ON HOLD/, "a red banner, not an amber hint");
assert.match(page, /\{payoutHeld \? "On hold" : formatCash\(/, "the amount shows On hold");
assert.match(read("src/lib/incentiveReportExport.js"), /configInvalid: !validateIncentiveConfig\(incentiveSettings\)\.valid,/);

console.log("incentiveHold: an invalid baseline / slab setup pays nothing (on hold) until it is fixed - OK");
