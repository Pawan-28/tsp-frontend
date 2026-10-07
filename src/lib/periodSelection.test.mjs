// Run: node src/lib/periodSelection.test.mjs
// Date filter shared by the employee Dashboard, Call Reporting and Pipeline:
// URL params -> period key + range, working days in a range, labels, API query string.
import assert from "node:assert/strict";
import {
  addDaysToDateKey, calendarMonthRange, calendarWeekRange, countWorkingDaysInRange, formatDateRangeLabel,
  isValidCustomRange, isValidDateKey, otherPresetPeriods, periodQueryString, periodWords,
  resolvePeriodSelection, workingDaysForSelection, yesterdayDateKey,
} from "./periodSelection.js";
import { periodLabel } from "./periodQuery.js";
import { isDateKeyInPeriod } from "./periodFilter.js";

const WED = new Date("2026-10-07T10:00:00+05:30"); // Wednesday 7 Oct 2026 (IST)
const sel = (obj, opts = {}) => resolvePeriodSelection(obj, { now: WED, ...opts });
const E = "–";

// ---- date key helpers ------------------------------------------------------------------------------
assert.equal(isValidDateKey("2026-10-06"), true);
assert.equal(isValidDateKey("2026-02-31"), false);
assert.equal(isValidDateKey("2026-2-1"), false);
assert.equal(isValidDateKey(""), false);
assert.equal(addDaysToDateKey("2026-10-01", -1), "2026-09-30");
assert.equal(addDaysToDateKey("2026-12-31", 1), "2027-01-01");
assert.equal(isValidCustomRange("2026-10-01", "2026-10-06"), true);
assert.equal(isValidCustomRange("2026-10-06", "2026-10-06"), true); // one day is fine
assert.equal(isValidCustomRange("2026-10-06", "2026-10-01"), false); // From > To
assert.equal(isValidCustomRange("2026-10-01", ""), false);

// ---- yesterday, including month / year / leap-year boundaries and the IST day -----------------------
assert.equal(yesterdayDateKey(WED), "2026-10-06");
assert.equal(yesterdayDateKey(new Date("2026-10-01T10:00:00+05:30")), "2026-09-30"); // 1st of a month
assert.equal(yesterdayDateKey(new Date("2026-03-01T10:00:00+05:30")), "2026-02-28");
assert.equal(yesterdayDateKey(new Date("2028-03-01T10:00:00+05:30")), "2028-02-29"); // leap year
assert.equal(yesterdayDateKey(new Date("2026-01-01T09:00:00+05:30")), "2025-12-31"); // 1 Jan
// 20:00 UTC on 6 Oct is already 7 Oct 01:30 in IST -> yesterday is 6 Oct, not 5 Oct
assert.equal(yesterdayDateKey(new Date("2026-10-06T20:00:00Z")), "2026-10-06");

const y = sel({ period: "yesterday" });
assert.equal(y.key, "yesterday");
assert.equal(y.period, "custom:2026-10-06:2026-10-06");
assert.deepEqual(y.range, { startDate: "2026-10-06", endDate: "2026-10-06" });
assert.equal(y.needsExactFetch, true);
assert.equal(y.label, "Yesterday");
assert.equal(y.customFrom, ""); // yesterday never leaks into the Custom pill
const y1 = sel({ period: "yesterday" }, { now: new Date("2026-10-01T10:00:00+05:30") });
assert.equal(y1.period, "custom:2026-09-30:2026-09-30"); // 1st of a month: range is in the PREVIOUS month
assert.equal(y1.needsExactFetch, true);

// ---- presets ---------------------------------------------------------------------------------------
for (const k of ["today", "week", "month"]) {
  const s = sel({ period: k });
  assert.equal(s.key, k);
  assert.equal(s.period, k);
  assert.equal(s.range, null);
  assert.equal(s.needsExactFetch, false);
}
assert.equal(sel({ period: "TODAY" }).key, "today"); // case-insensitive
assert.equal(sel({ period: " week " }).key, "week");

// ---- custom: both dates, real dates, From <= To ------------------------------------------------------
const c = sel({ period: "custom", from: "2026-10-01", to: "2026-10-06" });
assert.equal(c.key, "custom");
assert.equal(c.period, "custom:2026-10-01:2026-10-06");
assert.equal(c.customFrom, "2026-10-01");
assert.equal(c.customTo, "2026-10-06");
assert.equal(c.needsExactFetch, true);
assert.equal(c.label, `1 Oct ${E} 6 Oct 2026`);
// crossing months
const cm = sel({ period: "custom", from: "2026-09-28", to: "2026-10-03" });
assert.equal(cm.period, "custom:2026-09-28:2026-10-03");
assert.equal(cm.label, `28 Sep ${E} 3 Oct 2026`);
// one-day custom range
assert.equal(sel({ period: "custom", from: "2026-10-06", to: "2026-10-06" }).label, "6 Oct 2026");

// From > To is rejected -> page default
assert.equal(sel({ period: "custom", from: "2026-10-06", to: "2026-10-01" }).key, "today");
assert.equal(sel({ period: "custom", from: "2026-10-06", to: "2026-10-01" }, { defaultPeriod: "month" }).key, "month");
// empty / partial / invalid custom falls back to the default (never an empty Custom pill)
assert.equal(sel({ period: "custom" }).key, "today");
assert.equal(sel({ period: "custom", from: "2026-10-01" }).key, "today");
assert.equal(sel({ period: "custom", to: "2026-10-01" }, { defaultPeriod: "month" }).key, "month");
assert.equal(sel({ period: "custom", from: "2026-02-31", to: "2026-03-05" }).key, "today");
assert.equal(sel({ period: "custom", from: "abc", to: "def" }).key, "today");
assert.equal(sel({ period: "custom" }, { defaultPeriod: "month" }).customFrom, "");
// missing / unknown period -> default (Dashboard + Call Reporting "today", Pipeline "month")
assert.equal(sel({}).key, "today");
assert.equal(sel({}, { defaultPeriod: "month" }).key, "month");
assert.equal(sel({ period: "last_year" }).key, "today");
assert.equal(sel(null).key, "today");
// a stray from/to with a preset period is ignored
const stray = sel({ period: "week", from: "2026-10-01", to: "2026-10-06" });
assert.equal(stray.period, "week");
assert.equal(stray.customFrom, "");
// URLSearchParams input works too
assert.equal(sel(new URLSearchParams("period=custom&from=2026-09-01&to=2026-09-23")).period, "custom:2026-09-01:2026-09-23");
assert.equal(sel(new URLSearchParams("")).key, "today");

// ---- working days (Mon-Fri) ------------------------------------------------------------------------
assert.equal(countWorkingDaysInRange("2026-10-05", "2026-10-09"), 5); // Mon-Fri
assert.equal(countWorkingDaysInRange("2026-10-05", "2026-10-11"), 5); // Mon-Sun
assert.equal(countWorkingDaysInRange("2026-09-28", "2026-10-03"), 5); // across months, ends Saturday
assert.equal(countWorkingDaysInRange("2026-10-06", "2026-10-06"), 1); // a Tuesday
assert.equal(countWorkingDaysInRange("2026-10-03", "2026-10-03"), 0); // Saturday only
assert.equal(countWorkingDaysInRange("2026-10-04", "2026-10-04"), 0); // Sunday only
assert.equal(countWorkingDaysInRange("2026-10-03", "2026-10-04"), 0); // Saturday + Sunday
assert.equal(countWorkingDaysInRange("2026-10-04", "2026-10-05"), 1); // Sun + Mon
assert.equal(countWorkingDaysInRange("2026-10-06", "2026-10-01"), 0); // reversed -> 0, never negative
assert.equal(countWorkingDaysInRange("", ""), 0);
assert.equal(countWorkingDaysInRange("2026-09-01", "2026-09-30"), 22); // all of September 2026

assert.equal(workingDaysForSelection(sel({ period: "today" }), WED), 1);
assert.equal(workingDaysForSelection(sel({ period: "week" }), WED), 5);
assert.equal(workingDaysForSelection(sel({ period: "month" }), WED), 22); // October 2026: Thu 1st .. Sat 31st
assert.equal(workingDaysForSelection(sel({ period: "yesterday" }), WED), 1); // Tuesday
const SUN = new Date("2026-10-04T12:00:00+05:30");
const MON = new Date("2026-10-05T12:00:00+05:30");
assert.equal(workingDaysForSelection(sel({ period: "yesterday" }, { now: MON }), MON), 0); // yesterday = Sunday
assert.equal(workingDaysForSelection(sel({ period: "yesterday" }, { now: SUN }), SUN), 0); // yesterday = Saturday
assert.equal(workingDaysForSelection(sel({ period: "custom", from: "2026-10-03", to: "2026-10-04" }), WED), 0);
assert.equal(workingDaysForSelection(sel({ period: "custom", from: "2026-09-28", to: "2026-10-03" }), WED), 5);
assert.deepEqual(calendarWeekRange("2026-10-07"), { startDate: "2026-10-05", endDate: "2026-10-11" });
assert.deepEqual(calendarWeekRange("2026-10-04"), { startDate: "2026-09-28", endDate: "2026-10-04" }); // Sunday belongs to the week before
assert.deepEqual(calendarMonthRange("2028-02-10"), { startDate: "2028-02-01", endDate: "2028-02-29" });
assert.deepEqual(calendarMonthRange("2026-12-31"), { startDate: "2026-12-01", endDate: "2026-12-31" });

// ---- labels ----------------------------------------------------------------------------------------
assert.equal(formatDateRangeLabel("2026-10-01", "2026-10-06"), `1 Oct ${E} 6 Oct 2026`);
assert.equal(formatDateRangeLabel("2026-10-01", "2026-10-06", { withYear: false }), `1 Oct ${E} 6 Oct`);
assert.equal(formatDateRangeLabel("2026-10-06", "2026-10-06"), "6 Oct 2026");
assert.equal(formatDateRangeLabel("2025-12-28", "2026-01-03"), `28 Dec 2025 ${E} 3 Jan 2026`);
assert.equal(formatDateRangeLabel("2026-10-06", "2026-10-01"), `6 Oct ${E} 1 Oct 2026`); // formatting only; validity is checked elsewhere
assert.equal(formatDateRangeLabel("bad", "2026-10-01"), "");

assert.equal(periodLabel("today"), "Today");
assert.equal(periodLabel("yesterday"), "Yesterday");
assert.equal(periodLabel("week"), "This Week");
assert.equal(periodLabel("month"), "This Month");
assert.equal(periodLabel("custom"), "Custom");
assert.equal(periodLabel("custom", { start: "2026-10-01", end: "2026-10-06" }), `1 Oct ${E} 6 Oct 2026`);
assert.equal(periodLabel("custom:2026-10-01:2026-10-06"), `1 Oct ${E} 6 Oct 2026`);
assert.equal(periodLabel(undefined), "This Month");
// every page shows the SAME wording for the same selection
for (const p of [{ period: "yesterday" }, { period: "week" }, { period: "custom", from: "2026-10-01", to: "2026-10-06" }]) {
  const s = sel(p);
  assert.equal(periodWords(s, WED).label, s.label);
}

// sentences
assert.deepEqual(periodWords(sel({ period: "today" }), WED), { when: "today", calls: "Calls today", created: "created today", label: "Today" });
assert.equal(periodWords(sel({ period: "yesterday" }), WED).created, "created yesterday");
assert.equal(periodWords(sel({ period: "yesterday" }), WED).calls, "Calls yesterday");
assert.equal(periodWords(sel({ period: "week" }), WED).when, "this week");
assert.equal(periodWords(sel({ period: "month" }), WED).created, "created this month");
const w = periodWords(c, WED);
assert.equal(w.created, `created 1 Oct ${E} 6 Oct`); // current year: no year in the short form
assert.equal(w.calls, `Calls 1 Oct ${E} 6 Oct`);
assert.equal(w.when, "from 1 Oct to 6 Oct");
assert.equal(periodWords(sel({ period: "custom", from: "2026-10-06", to: "2026-10-06" }), WED).when, "on 6 Oct");
const past = periodWords(sel({ period: "custom", from: "2025-12-28", to: "2026-01-03" }), WED);
assert.equal(past.when, "from 28 Dec 2025 to 3 Jan 2026");
assert.equal(periodWords(sel({ period: "custom", from: "2025-03-01", to: "2025-03-09" }), WED).created, `created 1 Mar ${E} 9 Mar 2025`); // other year keeps the year

// ---- API query string ------------------------------------------------------------------------------
assert.equal(periodQueryString("today"), "period=today");
assert.equal(periodQueryString("week"), "period=week");
assert.equal(periodQueryString("month"), "period=month");
assert.equal(periodQueryString("custom:2026-09-01:2026-09-23"), "period=custom&startDate=2026-09-01&endDate=2026-09-23");
assert.equal(periodQueryString(y.period), "period=custom&startDate=2026-10-06&endDate=2026-10-06");
assert.equal(periodQueryString("garbage"), "period=month");

// ---- selection feeds the existing date-key helpers --------------------------------------------------
assert.equal(isDateKeyInPeriod("2026-10-06", y.period, WED), true);
assert.equal(isDateKeyInPeriod("2026-10-07", y.period, WED), false); // today is not yesterday
assert.equal(isDateKeyInPeriod("2026-10-05", y.period, WED), false);
assert.equal(isDateKeyInPeriod("2026-09-30", cm.period, WED), true); // crossing months, inclusive
assert.equal(isDateKeyInPeriod("2026-09-27", cm.period, WED), false);
assert.equal(isDateKeyInPeriod("2026-10-04", cm.period, WED), false);

// ---- empty-state hint presets ----------------------------------------------------------------------
assert.deepEqual(otherPresetPeriods(sel({ period: "today" })), ["week", "month"]);
assert.deepEqual(otherPresetPeriods(sel({ period: "yesterday" })), ["today", "week", "month"]);
assert.deepEqual(otherPresetPeriods(c), ["today", "week", "month"]);

console.log("periodSelection tests passed");
