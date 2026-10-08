// Run: node src/lib/mobileTimeRow.test.mjs
// Book Meeting: Date and Time stack on a phone and hour : minute AM/PM share the row width instead of overflowing it.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (rel) => fs.readFileSync(path.resolve(root, rel), "utf8");

// 1. the three selects are flexible on a phone and keep their fixed widths from sm up
const sel = read("src/employee/components/TimeOfDaySelects.jsx");
for (const name of ["HOUR_SELECT_CLASS", "MINUTE_SELECT_CLASS", "AMPM_SELECT_CLASS"]) {
  const m = sel.match(new RegExp(`const ${name} =\\s*"([^"]+)"`));
  assert.ok(m, `${name} exists`);
  assert.ok(/(^|\s)flex-1(\s|$)/.test(m[1]) && m[1].includes("min-w-0"), `${name} shrinks to fit on a phone`);
  assert.ok(!/(^|\s)shrink-0(\s|$)/.test(m[1]), `${name} is not pinned at a fixed width on a phone`);
  assert.ok(/sm:!w-1[46]/.test(m[1]) && m[1].includes("sm:flex-none"), `${name} keeps the fixed desktop width`);
}
assert.match(sel, /className="flex w-full gap-1\.5 items-center min-w-0"/, "the row fills its column");

// 2. Date | Time stack below sm in both booking forms
const modal = read("src/employee/components/LeadBookMeetingModal.jsx");
assert.match(modal, /grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 sm:mb-4/);
assert.ok(!/grid grid-cols-2 gap-3 mb-3 sm:mb-4/.test(modal));
const meetings = read("src/employee/pages/EmployeeMeetings.jsx");
assert.match(meetings, /grid grid-cols-1 sm:grid-cols-2 gap-3">\s*<Field label="Date">/);

console.log("mobileTimeRow: Date/Time stack on phones, hour:minute AM/PM fit the row - OK");
