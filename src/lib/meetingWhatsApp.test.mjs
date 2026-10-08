// Run: node src/lib/meetingWhatsApp.test.mjs
// The WhatsApp confirmation sent after a meeting is booked uses ONE fixed template:
//   Hello <name> JI / This is to confirm our Clarity Call scheduled for <service> / Date : Today - <date> / Time / Meeting Link / Confirmed
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMeetingConfirmationMessage, formatMeetingWhen, serviceForMeetingMessage } from "./whatsappScripts.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// "now" = Thu 8 Oct 2026, 10:00 IST (04:30 UTC)
const NOW = new Date("2026-10-08T04:30:00Z");
const LINK = "https://meet.google.com/gxt-zsba-xqw";
const msg = (over = {}, name = "New1", service = "Podcast Interview On News Channel") => buildMeetingConfirmationMessage({
  leadName: name, serviceName: service, now: NOW, meeting: { scheduledAt: "2026-10-08T14:00:00", meetLink: LINK, ...over },
});

// 1. the exact template from the screenshot
assert.equal(msg(), [
  "Hello New1 JI",
  "",
  "This is to confirm our Clarity Call scheduled for Podcast Interview On News Channel",
  "",
  "Date : Today - Thu, 8 Oct 2026",
  "Time : 2:00 PM",
  `Meeting Link : ${LINK}`,
  "",
  "Kindly acknowledge by replying “Confirmed”",
].join("\n"));

// 2. the earlier templates are gone
for (const gone of ["Hi ", "Your meeting is confirmed", "Looking forward", "Discovery Call", "📅", "⏰", "📌", "Join Google Meet"]) {
  assert.ok(!msg().includes(gone), `old text removed: ${JSON.stringify(gone)}`);
}

// 3. Date: "Today - <date>", "Tomorrow - <date>", otherwise just the date (all in IST)
assert.deepEqual(formatMeetingWhen("2026-10-08T14:00:00", NOW), { date: "Thu, 8 Oct 2026", relative: "Today", time: "2:00 PM" });
assert.deepEqual(formatMeetingWhen("2026-10-09T09:00:00", NOW), { date: "Fri, 9 Oct 2026", relative: "Tomorrow", time: "9:00 AM" });
assert.deepEqual(formatMeetingWhen("2026-10-12T09:00:00", NOW), { date: "Mon, 12 Oct 2026", relative: "", time: "9:00 AM" });
assert.deepEqual(formatMeetingWhen("2026-10-06T09:00:00", NOW), { date: "Tue, 6 Oct 2026", relative: "", time: "9:00 AM" }, "a past date is just a date");
assert.ok(msg({ scheduledAt: "2026-10-09T09:00:00" }).includes("Date : Tomorrow - Fri, 9 Oct 2026\nTime : 9:00 AM"));
assert.ok(msg({ scheduledAt: "2026-10-12T09:00:00" }).includes("Date : Mon, 12 Oct 2026\nTime : 9:00 AM"), "no 'Today -' for another day");
assert.equal(formatMeetingWhen("2027-01-01T10:00:00", new Date("2026-12-31T10:00:00Z")).relative, "Tomorrow", "month / year rollover");
assert.equal(formatMeetingWhen("2026-12-31T10:00:00", new Date("2026-12-29T10:00:00Z")).date, "Thu, 31 Dec 2026");
// "Today" follows the IST calendar, not UTC / the browser: 01:30 IST on the 9th is still the 8th in UTC
assert.equal(formatMeetingWhen("2026-10-09T09:00:00", new Date("2026-10-08T20:00:00Z")).relative, "Today");
assert.equal(formatMeetingWhen("2026-10-08T23:30:00", new Date("2026-10-08T17:45:00Z")).relative, "Today", "23:15 IST on the 8th");
assert.equal(formatMeetingWhen("2026-10-08T23:30:00", new Date("2026-10-08T20:00:00Z")).relative, "", "already the 9th in IST");

// 4. Time: 12-hour, no leading zero, upper-case AM / PM
for (const [at, time] of [["2026-10-08T17:30:00", "5:30 PM"], ["2026-10-08T09:05:00", "9:05 AM"], ["2026-10-08T00:00:00", "12:00 AM"],
  ["2026-10-08T12:00:00", "12:00 PM"], ["2026-10-08T12:45:00", "12:45 PM"], ["2026-10-08T23:59:00", "11:59 PM"], ["2026-10-08 14:00:00", "2:00 PM"]]) {
  assert.equal(formatMeetingWhen(at, NOW).time, time, at);
}
// an instant with a zone is shown in IST, not in the browser's time zone
assert.deepEqual(formatMeetingWhen("2026-10-08T08:30:00Z", NOW), { date: "Thu, 8 Oct 2026", relative: "Today", time: "2:00 PM" });
assert.deepEqual(formatMeetingWhen("2026-10-08T08:30:00+00:00", NOW), { date: "Thu, 8 Oct 2026", relative: "Today", time: "2:00 PM" });
assert.deepEqual(formatMeetingWhen("", NOW), { date: "", relative: "", time: "" });
assert.deepEqual(formatMeetingWhen("not a date", NOW), { date: "", relative: "", time: "" });

// 5. customer name -> "<name> JI"
assert.ok(msg({}, "Anita Rao").startsWith("Hello Anita Rao JI\n"));
assert.ok(msg({}, "  Anita  ").startsWith("Hello Anita JI\n"));
assert.ok(msg({}, "Rajesh Ji").startsWith("Hello Rajesh Ji\n"), "no double JI");
assert.ok(msg({}, "Rajesh ji").startsWith("Hello Rajesh ji\n"));
assert.ok(msg({}, "Jiya").startsWith("Hello Jiya JI\n"), "a name that merely ends in letters 'ji' inside a word is still a name");
assert.ok(msg({}, "").startsWith("Hello\n\nThis is to confirm"), "no name -> plain Hello");
assert.ok(buildMeetingConfirmationMessage({ now: NOW, meeting: { scheduledAt: "2026-10-08T14:00:00" } }).startsWith("Hello\n\n"), "no lead name at all");

// 6. {SERVICES}: the lead's service, else the meeting's, else read back from the meeting title
assert.ok(msg({}, "New1", "Book Publishing").includes("scheduled for Book Publishing\n"));
assert.ok(msg({}, "New1", "[Service: Podcast Interview] extra").includes("scheduled for Podcast Interview\n"), "the webhook's [Service: X] wrapper is removed");
assert.equal(serviceForMeetingMessage({ meeting: { leadService: "PR Package" }, leadName: "A" }), "PR Package");
assert.equal(serviceForMeetingMessage({ meeting: { title: "New1 Podcast Interview On News Channel - Clarity Call" }, leadName: "New1" }), "Podcast Interview On News Channel");
assert.equal(serviceForMeetingMessage({ meeting: { title: "testing Book Publishing – Clarity Call" }, leadName: "testing" }), "Book Publishing");
assert.equal(serviceForMeetingMessage({ meeting: { title: "New1 - Clarity Call" }, leadName: "New1" }), "", "a title with no service gives none");
assert.equal(serviceForMeetingMessage({ serviceName: "SRV-010", meeting: { title: "A Book Publishing - Clarity Call" }, leadName: "A" }), "Book Publishing", "a service code is never shown");
const noService = msg({ title: "New1 - Clarity Call" }, "New1", "");
assert.ok(noService.includes("This is to confirm our Clarity Call scheduled for\n\nDate :"), "no service -> the line simply ends at 'scheduled for'");

// 7. meeting link
assert.ok(msg({ meetLink: "" }).includes("\nMeeting Link : \n"), "Meeting Link line stays (empty) when there is no link yet");
assert.ok(msg({ meetLink: undefined, meet_link: "https://meet.google.com/zzz" }).includes("Meeting Link : https://meet.google.com/zzz"));
assert.equal(msg().split("\n").length, 9, "exactly the template's lines");

// 8. the booking modal passes the lead's service into the template
const modal = fs.readFileSync(path.resolve(here, "../employee/components/MeetingBookedWhatsAppModal.jsx"), "utf8");
assert.match(modal, /buildMeetingConfirmationMessage\(\{/);
assert.match(modal, /serviceName: resolveLeadServiceName\(lead\) \|\| meeting\?\.leadService/);

console.log("meetingWhatsApp: Hello <name> JI / Clarity Call for <service> / Today - <date> / Time / Link / Confirmed - OK");
