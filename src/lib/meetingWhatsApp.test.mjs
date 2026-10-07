// Run: node src/lib/meetingWhatsApp.test.mjs
// The WhatsApp confirmation sent after a meeting is booked uses ONE fixed template (Hello <name> / Discovery Call / Date / Time / Link / Confirmed).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMeetingConfirmationMessage, formatMeetingWhen } from "./whatsappScripts.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// "now" = Wed 7 Oct 2026, 10:00 IST (04:30 UTC)
const NOW = new Date("2026-10-07T04:30:00Z");
const msg = (over = {}, name = "Ravi Kumar") => buildMeetingConfirmationMessage({
  leadName: name, now: NOW, meeting: { scheduledAt: "2026-10-07T17:30:00", meetLink: "https://meet.google.com/abc-defg-hij", ...over },
});

// 1. the exact template
assert.equal(msg(), [
  "Hello Ravi Kumar",
  "",
  "This is to confirm our Discovery Call scheduled for",
  "",
  "Date : Today",
  "Time : 5:30 PM",
  "Meeting Link : https://meet.google.com/abc-defg-hij",
  "",
  "Kindly acknowledge by replying “Confirmed”",
].join("\n"));

// 2. the old text is gone
for (const gone of ["Hi ", "Your meeting is confirmed", "Looking forward", "📅", "⏰", "📌", "Join Google Meet", "Clarity Call", "— "]) {
  assert.ok(!msg().includes(gone), `old text removed: ${JSON.stringify(gone)}`);
}

// 3. Date: Today / Tomorrow / a calendar date (all in IST)
assert.equal(formatMeetingWhen("2026-10-07T14:00:00", NOW).date, "Today");
assert.equal(formatMeetingWhen("2026-10-08T09:00:00", NOW).date, "Tomorrow");
assert.equal(formatMeetingWhen("2026-10-09T09:00:00", NOW).date, "Fri, 9 Oct, 2026");
assert.equal(formatMeetingWhen("2026-10-06T09:00:00", NOW).date, "Tue, 6 Oct, 2026", "a past date is shown as a date");
assert.equal(formatMeetingWhen("2026-12-31T23:59:00", new Date("2026-12-29T10:00:00Z")).date, "Thu, 31 Dec, 2026");
assert.equal(formatMeetingWhen("2027-01-01T10:00:00", new Date("2026-12-31T10:00:00Z")).date, "Tomorrow", "month / year rollover");
// "Today" follows the IST calendar, not UTC / the browser: 01:30 IST on the 8th is still the 7th in UTC
assert.equal(formatMeetingWhen("2026-10-08T09:00:00", new Date("2026-10-07T20:00:00Z")).date, "Today");
assert.equal(formatMeetingWhen("2026-10-07T23:30:00", new Date("2026-10-07T17:45:00Z")).date, "Today", "23:15 IST on the 7th");
assert.equal(formatMeetingWhen("2026-10-07T23:30:00", new Date("2026-10-07T20:00:00Z")).date, "Wed, 7 Oct, 2026", "already the 8th in IST");

// 4. Time: 12-hour, no leading zero, upper-case AM / PM
for (const [at, time] of [["2026-10-07T17:30:00", "5:30 PM"], ["2026-10-07T09:05:00", "9:05 AM"], ["2026-10-07T00:00:00", "12:00 AM"],
  ["2026-10-07T12:00:00", "12:00 PM"], ["2026-10-07T12:45:00", "12:45 PM"], ["2026-10-07T23:59:00", "11:59 PM"], ["2026-10-07 14:00:00", "2:00 PM"]]) {
  assert.equal(formatMeetingWhen(at, NOW).time, time, at);
}
// an instant with a zone is shown in IST, not in the browser's time zone
assert.deepEqual(formatMeetingWhen("2026-10-07T12:00:00Z", NOW), { date: "Today", time: "5:30 PM" });
assert.deepEqual(formatMeetingWhen("2026-10-07T12:00:00+00:00", NOW), { date: "Today", time: "5:30 PM" });
assert.deepEqual(formatMeetingWhen("", NOW), { date: "", time: "" });
assert.deepEqual(formatMeetingWhen("not a date", NOW), { date: "", time: "" });

// 5. customer name and meeting link
assert.ok(msg({}, "").startsWith("Hello\n\nThis is to confirm"), "no name -> plain Hello");
assert.ok(buildMeetingConfirmationMessage({ now: NOW, meeting: { scheduledAt: "2026-10-07T17:30:00" } }).startsWith("Hello\n\nThis is to confirm"), "no lead name at all");
assert.ok(msg({}, "  Anita  ").startsWith("Hello Anita\n"));
const noLink = msg({ meetLink: "" });
assert.ok(noLink.includes("\nMeeting Link : \n"), "Meeting Link line stays (empty) when there is no link yet");
assert.ok(msg({ meetLink: undefined, meet_link: "https://meet.google.com/zzz" }).includes("Meeting Link : https://meet.google.com/zzz"));
assert.equal(msg().split("\n").length, 9, "exactly the template's lines");

// 6. the booking modal still builds its text with this function
const modal = fs.readFileSync(path.resolve(here, "../employee/components/MeetingBookedWhatsAppModal.jsx"), "utf8");
assert.match(modal, /buildMeetingConfirmationMessage\(\{/);

console.log("meetingWhatsApp: confirmation template (Hello / Discovery Call / Date / Time / Meeting Link / Confirmed) - OK");
