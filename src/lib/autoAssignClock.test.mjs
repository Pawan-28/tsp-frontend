// Run: node src/lib/autoAssignClock.test.mjs
// 3-working-day stuck-lead timer on the page: the same live d/h/m/s countdown on the cards and in the lead header,
// green / yellow / red by the time left, Sunday pause, and the exact same numbers as the server.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { DAY_MS, clockState, formatCountdown, formatHoursMinutes, autoAssignLabel, autoAssignCountdownLabel, autoAssignTone, autoAssignTitle } from "./autoAssignClock.js";
import { addWorkingMs, isSunday } from "./workingTime.js";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (rel) => fs.readFileSync(path.resolve(root, rel), "utf8");

const ist = (iso) => Date.parse(`${iso}+05:30`);
const H = 3600 * 1000;
// Monday 2026-10-05 12:00 IST: the next 3 days (Tue, Wed, Thu) contain no Sunday
const NOW = ist("2026-10-05T12:00:00");
const at = (days, hours = 0) => ({ deadlineAt: new Date(NOW + days * DAY_MS + hours * H).toISOString() });

// 1. the short words: 3 -> 2 -> 1 -> due
assert.equal(autoAssignLabel(at(3), NOW), "3 days to auto-assign");
assert.equal(autoAssignLabel(at(2, 5), NOW), "3 days to auto-assign", "2d 5h left still rounds up to 3");
assert.equal(autoAssignLabel(at(2), NOW), "2 days to auto-assign");
assert.equal(autoAssignLabel(at(1), NOW), "1 day to auto-assign");
assert.equal(autoAssignLabel(at(0, 5), NOW), "1 day to auto-assign", "the last 24 hours read as 1 day");
assert.equal(autoAssignLabel(at(0), NOW), "Auto-assigning soon");
assert.equal(autoAssignLabel(at(-2), NOW), "Auto-assigning soon");
for (const bad of [null, {}, { deadlineAt: "garbage" }]) assert.equal(autoAssignLabel(bad, NOW), null);

// 2. the countdown: HOURS and MINUTES (no days, no seconds), counting down from 72 hours
assert.equal(formatHoursMinutes(3 * DAY_MS), "72h 00m", "a fresh lead starts at 72 hours");
assert.equal(formatHoursMinutes(2 * DAY_MS + 15 * H + 20 * 60000 + 19000), "63h 20m", "seconds are dropped, days become hours");
assert.equal(formatHoursMinutes(24 * H), "24h 00m");
assert.equal(formatHoursMinutes(23 * H + 59 * 60000), "23h 59m");
assert.equal(formatHoursMinutes(5 * H + 2 * 60000 + 3000), "5h 02m");
assert.equal(formatHoursMinutes(3 * H), "3h 00m");
assert.equal(formatHoursMinutes(59 * 60000 + 30000), "59m", "under an hour: minutes only");
assert.equal(formatHoursMinutes(7000), "0m");
assert.equal(formatHoursMinutes(-5000), "0m", "never negative");
assert.ok(!/\dd |\ds\b/.test(autoAssignCountdownLabel(at(2, 15.34), NOW)), "no days / seconds anywhere");
assert.equal(autoAssignCountdownLabel(at(3), NOW), "72h 00m to auto-assign");
assert.equal(autoAssignCountdownLabel(at(2, 15 + 20 / 60), NOW), "63h 20m to auto-assign");
assert.equal(autoAssignCountdownLabel(at(1), NOW), "24h 00m to auto-assign");
assert.equal(autoAssignCountdownLabel(at(0, 2.75), NOW), "2h 45m to auto-assign");
assert.equal(autoAssignCountdownLabel(at(0, 0.5), NOW), "30m to auto-assign");
assert.equal(autoAssignCountdownLabel(at(3), NOW + 60000), "71h 59m to auto-assign", "ticks down by the minute");
assert.equal(autoAssignCountdownLabel(at(3), NOW + 3 * H), "69h 00m to auto-assign");
assert.equal(autoAssignCountdownLabel(at(-1), NOW), "Auto-assigning soon");
// the old second-by-second text is still available as a helper, but is no longer shown
assert.equal(formatCountdown(2 * DAY_MS + 5 * H + 12 * 60000 + 33000), "2d 05h 12m 33s");

// 3. the colour follows the time left: GREEN above 24 h, YELLOW 24 h or less, RED 3 h or less
assert.equal(autoAssignTone(at(3), NOW), "normal", "3 days: green");
assert.equal(autoAssignTone(at(2), NOW), "normal", "2 days: green");
assert.equal(autoAssignTone(at(1, 1), NOW), "normal", "25 hours: still green");
assert.equal(autoAssignTone(at(1), NOW), "urgent", "exactly 24 hours: yellow");
assert.equal(autoAssignTone(at(0, 23), NOW), "urgent", "23 hours: yellow");
assert.equal(autoAssignTone(at(0, 3.5), NOW), "urgent", "3.5 hours: yellow");
assert.equal(autoAssignTone(at(0, 3), NOW), "critical", "exactly 3 hours: red");
assert.equal(autoAssignTone(at(0, 2), NOW), "critical", "2 hours: red");
assert.equal(autoAssignTone(at(0, 0.01), NOW), "critical");
assert.equal(autoAssignTone(at(-1), NOW), "due", "over: red");
assert.equal(autoAssignTone(null, NOW), null);
assert.deepEqual(Object.keys(clockState(at(2), NOW)).sort(), ["daysLeft", "due", "msLeft", "paused"]);
assert.match(autoAssignTitle(at(2), NOW), /auto-assigned to another employee on .*Sundays do not count/);
assert.match(autoAssignTitle(at(-1), NOW), /about to be auto-assigned/);

// 4. SUNDAY: the countdown stops
// lead entered Saturday 12:00 IST -> due Wednesday 12:00 IST (Sunday adds a day)
const sat = ist("2026-10-03T12:00:00");
const deadline = { deadlineAt: new Date(addWorkingMs(sat, 72 * H)).toISOString() };
assert.equal(deadline.deadlineAt, new Date(ist("2026-10-07T12:00:00")).toISOString());
const sunMorning = ist("2026-10-04T00:30:00");
const sunNight = ist("2026-10-04T23:30:00");
assert.equal(clockState(deadline, sunMorning).paused, true);
assert.equal(clockState(deadline, sunMorning).msLeft, clockState(deadline, sunNight).msLeft, "frozen all Sunday");
assert.equal(clockState(deadline, sunMorning).msLeft, 60 * H);
assert.equal(autoAssignLabel(deadline, sunMorning), "Paused on Sunday · 3 days left");
assert.equal(autoAssignCountdownLabel(deadline, sunNight), "Paused on Sunday · 60h 00m left");
assert.equal(autoAssignTone(deadline, sunMorning), "paused");
const monMorning = ist("2026-10-05T00:30:00");
assert.equal(clockState(deadline, monMorning).paused, false);
assert.equal(clockState(deadline, monMorning).msLeft, 60 * H - 30 * 60000, "runs again on Monday");
assert.equal(clockState(deadline, ist("2026-10-07T12:00:00")).due, true);

// 5. same numbers as the server, at every kind of moment (before / on / after a Sunday)
const backend = require(path.resolve(root, "../backend/src/utils/stageClock.js"));
let compared = 0;
for (let assigned = ist("2026-09-28T03:00:00"); assigned < ist("2026-10-12T00:00:00"); assigned += 11 * H + 7 * 60000) {
  const serverClock = backend.computeStageClock({ stage: "Lead", assignedAt: new Date(assigned), now: assigned, days: 3 });
  const clock = { deadlineAt: serverClock.deadlineAt.toISOString() };
  for (let now = assigned; now < assigned + 6 * DAY_MS; now += 9 * H + 11 * 60000) {
    const srv = backend.computeStageClock({ stage: "Lead", assignedAt: new Date(assigned), now, days: 3 });
    const fe = clockState(clock, now);
    assert.equal(fe.due, srv.due, `due @${new Date(now).toISOString()}`);
    assert.equal(fe.paused, srv.paused, `paused @${new Date(now).toISOString()}`);
    assert.equal(fe.msLeft, srv.msLeft, `msLeft @${new Date(now).toISOString()}`);
    assert.equal(fe.daysLeft, srv.daysLeft);
    assert.equal(autoAssignLabel(clock, now), backend.autoAssignLabel(srv), "same words as the server");
    compared += 1;
  }
}
assert.ok(compared > 300, `compared ${compared} moments`);

// 6. the chip, rendered
// React stays external and the bundle sits inside the project, so the component and this test share ONE copy of React (hooks need that)
const tmpDir = path.join(root, `.tmp-test-${process.pid}`);
fs.mkdirSync(tmpDir, { recursive: true });
const out = path.join(tmpDir, "autochip.cjs");
await build({ entryPoints: [path.resolve(root, "src/components/AutoAssignChip.jsx")], bundle: true, platform: "node", format: "cjs", outfile: out, jsx: "automatic", logLevel: "silent", external: ["react", "react/jsx-runtime", "react-dom"] });
const Chip = require(out).default;
fs.rmSync(tmpDir, { recursive: true, force: true });
const { renderToStaticMarkup } = require(path.resolve(root, "node_modules/react-dom/server.js"));
const React = require(path.resolve(root, "node_modules/react/index.js"));
const nowMs = Date.now();
const future = (ms) => ({ deadlineAt: new Date(addWorkingMs(nowMs, ms)).toISOString() });
const render = (props) => renderToStaticMarkup(React.createElement(Chip, props));

// the card chip and the header chip are the same live countdown (days, hours, minutes, seconds)
const html = render({ clock: future(2 * DAY_MS + 3600e3) });
assert.ok(html.includes('data-testid="auto-assign-chip"'));
assert.match(html, /\d+h \d\dm to auto-assign|\d+m to auto-assign|Paused on Sunday/, "a card shows hours and minutes");
assert.ok(!/\d+d \d|\d+s to/.test(html), "no days or seconds");
assert.ok(html.includes("tabular-nums"));
assert.match(render({ clock: future(2 * DAY_MS + 3600e3), live: false }), /\d+ days? to auto-assign|Paused on Sunday/, "live={false} keeps the short words");
if (!isSunday(nowMs)) {
  const tone = (ms) => render({ clock: future(ms) }).match(/data-tone="(\w+)"/)?.[1];
  assert.equal(tone(2 * DAY_MS), "normal");
  assert.equal(tone(20 * H), "urgent");
  assert.equal(tone(2 * H), "critical");
  assert.match(render({ clock: future(2 * DAY_MS) }), /emerald/, "green");
  assert.match(render({ clock: future(20 * H) }), /amber/, "yellow");
  assert.match(render({ clock: future(2 * H) }), /rose/, "red");
}
assert.match(render({ clock: { deadlineAt: new Date(nowMs - 3600e3).toISOString() } }), /rose/, "over = red");
assert.equal(render({ clock: null }), "", "no clock = nothing drawn");

// 7. wiring
const emp = read("src/employee/pages/EmployeeLeads.jsx");
assert.match(emp, /useAutoAssignClocks\("employee", getCrmHeaders\)/);
assert.equal((emp.match(/autoAssign=\{autoAssignClockFor\(lead\)\}/g) || []).length, 2, "mobile + desktop cards");
assert.match(emp, /<AutoAssignChip clock=\{autoAssign\} \/>/, "the card chip is the live one (live is the default)");
const adm = read("src/pages/Pipeline.jsx");
assert.match(adm, /useAutoAssignClocks\("admin", getAdminCrmHeaders\)/);
assert.equal((adm.match(/autoAssign=\{autoAssignClockFor\(lead\)\}/g) || []).length, 2);
assert.match(adm, /<AutoAssignChip clock=\{autoAssign\} \/>/);
const panel = read("src/components/leads/LeadDetailPanel.jsx");
assert.match(panel, /autoAssignClock && <AutoAssignChip live clock=\{autoAssignClock\}/, "live countdown in the lead header, next to Dialed");
assert.ok(panel.indexOf("Dialed {dialCount}") < panel.indexOf("<AutoAssignChip live"), "right after the Dialed counter");
assert.match(panel, /const active = currentTemperature === id;/);
const settings = read("src/pages/Settings.jsx");
assert.match(settings, /activeTab === "autoassign" && <AutoReassignPanel \/>/);
const ap = read("src/components/AutoReassignPanel.jsx");
assert.match(ap, /\{ autoReassign: \{ enabled \} \}/, "the client sends only on/off - the server stamps the start moment");
assert.match(ap, /Lead, Not Pick and Short Call/);
assert.match(ap, /working days/);
assert.match(ap, /Sunday/);
assert.match(ap, /same service group/);
assert.ok(!/Lead, Not Pick, Short Call, Conversation/.test(ap), "Conversation is no longer timed");
assert.match(read("src/lib/useNowTick.js"), /ONE interval per period is shared/);

console.log("autoAssignClock: 72h -> hours+minutes countdown on cards and header, green/yellow/red, Sunday pause, parity with the server - OK");
