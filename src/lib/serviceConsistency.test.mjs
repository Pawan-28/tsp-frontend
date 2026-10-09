// Run: node src/lib/serviceConsistency.test.mjs
// The service in the WhatsApp confirmation, the meeting title and the lead's Service field must agree
// (Garad Gunwant: title said "Book Launch With Chetan Bhagat", the message said "Podcast Interview On News Channel").
import assert from "node:assert/strict";
import { matchCatalogService, buildClarityCallTitle } from "./meetingTitle.js";
import { buildMeetingConfirmationMessage, serviceForMeetingMessage } from "./whatsappScripts.js";

// The real catalog has duplicate codes (auto-created services reuse SRV-009 / SRV-010)
const CATALOG = [
  { name: "Podcast Interview On News Channel", serviceId: "SRV-001" },
  { name: "Book Launch With Chetan Bhagat", serviceId: "SRV-010" },
  { name: "Book Launch With Celebrities", serviceId: "SRV-009" },
  { name: "SRV-001", serviceId: "SRV-010" },
  { name: "PVA & Lead Gen", serviceId: "SRV-009" },
];

// 1. a NAME in the catalog beats a service CODE sent next to it
assert.equal(
  matchCatalogService(["SRV-010", "SRV-010", "Podcast Interview On News Channel", "[Service: Podcast Interview On News Channel] SOP: SOP-010"], CATALOG).name,
  "Podcast Interview On News Channel",
  "Garad: serviceId SRV-010 + name Podcast -> Podcast (the form the customer filled)",
);
assert.equal(matchCatalogService(["SRV-001", "Book Launch With Chetan Bhagat"], CATALOG).name, "Book Launch With Chetan Bhagat", "the name wins in the other direction too");
// ... and the code still works when there is no usable name
assert.equal(matchCatalogService(["SRV-001"], CATALOG).name, "Podcast Interview On News Channel");
assert.equal(matchCatalogService(["SRV-010", ""], CATALOG).name, "Book Launch With Chetan Bhagat");
assert.equal(matchCatalogService(["SRV-001", "some unknown text"], CATALOG).name, "Podcast Interview On News Channel", "an unknown name falls back to the code");
// ... a name and a code that agree: same answer as before
assert.equal(matchCatalogService(["SRV-001", "Podcast Interview On News Channel"], CATALOG).name, "Podcast Interview On News Channel");
assert.equal(matchCatalogService(["", null], CATALOG), null);
assert.equal(matchCatalogService(["x"], []), null);

// 2. the WhatsApp message says the service the MEETING was booked for (its title), not the lead's stored one
const meeting = {
  title: "Garad Gunwant Book Launch With Chetan Bhagat - Clarity Call",
  scheduledAt: "2026-10-09T05:30:00.000Z",
  meetLink: "https://meet.google.com/gvq-viun-ybt",
  time: "Today, 11:00 am",
};
const now = new Date("2026-10-09T03:00:00.000Z");
assert.equal(
  serviceForMeetingMessage({ serviceName: "Podcast Interview On News Channel", meeting, leadName: "Garad Gunwant" }),
  "Book Launch With Chetan Bhagat",
  "the stale lead service does not override the meeting's own service",
);
const msg = buildMeetingConfirmationMessage({ leadName: "Garad Gunwant", serviceName: "Podcast Interview On News Channel", meeting, now });
assert.match(msg, /^Hello Garad Gunwant JI\n\nThis is to confirm our Clarity Call scheduled for Book Launch With Chetan Bhagat\n\nDate : Today - Fri, 9 Oct 2026\nTime : 11:00 AM\nMeeting Link : https:\/\/meet\.google\.com\/gvq-viun-ybt/);
assert.ok(!msg.includes("Podcast"), "the message no longer contradicts the meeting title");

// 3. when everything agrees, nothing changes
const podcast = { ...meeting, title: "Garad Gunwant Podcast Interview On News Channel - Clarity Call" };
assert.equal(serviceForMeetingMessage({ serviceName: "Podcast Interview On News Channel", meeting: podcast, leadName: "Garad Gunwant" }), "Podcast Interview On News Channel");
assert.equal(buildMeetingConfirmationMessage({ leadName: "Garad Gunwant", meeting: podcast, now }).includes("scheduled for Podcast Interview On News Channel"), true);

// 4. a title with no service uses the service passed in; nothing known = no service text
const noService = { ...meeting, title: "Garad Gunwant - Clarity Call" };
assert.equal(serviceForMeetingMessage({ serviceName: "TedX", meeting: noService, leadName: "Garad Gunwant" }), "TedX");
assert.equal(serviceForMeetingMessage({ meeting: noService, leadName: "Garad Gunwant" }), "");
assert.equal(serviceForMeetingMessage({ serviceName: "SRV-010", meeting: noService, leadName: "Garad Gunwant" }), "", "a bare code is never shown as a service");
// the title was built from the service the employee saw in Book Meeting
assert.equal(buildClarityCallTitle("Garad Gunwant", "Book Launch With Chetan Bhagat"), meeting.title);
// the customer's name in the title is not a service
assert.equal(serviceForMeetingMessage({ meeting: { title: "Ravi Kumar Podcast - Clarity Call" }, leadName: "Ravi Kumar" }), "Podcast");

console.log("serviceConsistency: Garad Gunwant case - message, title and Service field agree; a name beats a wrong service code - OK");
