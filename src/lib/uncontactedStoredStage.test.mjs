// Run: node src/lib/uncontactedStoredStage.test.mjs
// E-09: a lead whose STORED stage is already Not Pick / Short Call / Conversation was still counted as "waiting for a first call"
// when the call itself was not in the loaded period.
import assert from "node:assert/strict";
import { isUncontactedNewLead } from "./leadKanban.js";

const lead = (stage) => ({ id: 1, phone: "9876543210", pipelineStage: stage, assignmentStatus: "assigned", assignedAt: "2026-10-01T10:00:00Z", assignedTo: { id: 7 } });

assert.equal(isUncontactedNewLead(lead("Lead"), []), true, "a real new lead with no call is still uncontacted");
for (const stage of ["Not Pick", "Short Call", "Conversation 2 min+"]) {
  assert.equal(isUncontactedNewLead(lead(stage), []), false, `${stage}: already called`);
}
assert.equal(isUncontactedNewLead(lead("Lead"), [{ leadId: 1, direction: "outgoing", outcome: "connected", durationSec: 30 }]), false, "an outbound call still wins");

console.log("uncontactedStoredStage: a lead stored as Not Pick / Short Call / Conversation is not a new uncontacted lead - OK");
