// Run: node src/lib/stageMapping.parity.test.mjs
// The frontend and backend stage mappers must give the SAME answer, and the decided legacy mappings must hold:
//   Contacted -> Conversation · Qualified -> Conversation · Attempted -> Not Pick
//   Not Contacted -> Lead · Un-Qualified -> Lead
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mapStageToId as fe } from "./pipelineStages.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { mapStageToId: be } = require(path.resolve(here, "../../../backend/src/utils/pipelineStages.js"));

// [stage, status, expected column]
const DECIDED = [
  ["Contacted", "Contacted", "conversation_2min"],
  ["contacted", "", "conversation_2min"],
  ["CONTACTED", "", "conversation_2min"],
  ["Qualified", "Qualified", "conversation_2min"],
  ["qualified", "", "conversation_2min"],
  ["Attempted", "Attempted", "not_pick"],
  ["attempted", "", "not_pick"],
  ["Not Contacted", "", "lead"],
  ["not_contacted", "", "lead"],
  ["Not Contacted", "Not Contacted", "lead"],
  ["Un-Qualified", "", "lead"],
  ["Unqualified", "", "lead"],
  ["Not Qualified", "", "lead"],
  // a workflow STATUS of "attempted" on a lead with no real stage
  ["", "attempted", "not_pick"],
];

// canonical + other real-world values stored in the CRM: both sides must agree and stay unchanged
const PARITY = [
  ["new", "New Lead", "lead"], ["New Lead", "New Lead", "lead"], ["Lead", "Lead", "lead"], ["", "", "lead"],
  ["Conversation", "Conversation", "conversation_2min"], ["Conversation 2 min+", "", "conversation_2min"],
  ["conversation_2min", "", "conversation_2min"], ["conversation_5", "", "conversation_2min"],
  ["booked", "New Lead", "meeting_booked"], ["Booked", "Booked", "meeting_booked"], ["Meeting Booked", "", "meeting_booked"],
  ["Meeting Done", "", "meeting_done"], ["Proposal Sent", "Proposal Sent", "proposal_sent"],
  ["Objection", "", "objection"], ["negotiation", "", "objection"],
  ["Advance Paid", "", "advance_paid"], ["Payment Complete", "", "payment_complete"], ["closed_won", "", "payment_complete"],
  ["Not Interested", "", "not_interested"], ["Not Pick", "", "not_pick"], ["Short Call", "", "short_call"],
  ["Conversation", "attempted", "conversation_2min"], // a real stage wins over a stale workflow status
];

let checked = 0;
for (const [stage, status, expected] of [...DECIDED, ...PARITY]) {
  const f = fe(stage, status);
  const b = be(stage, status);
  assert.equal(f, expected, `frontend ${JSON.stringify([stage, status])}: got ${f}, want ${expected}`);
  assert.equal(b, expected, `backend  ${JSON.stringify([stage, status])}: got ${b}, want ${expected}`);
  checked += 1;
}
console.log(`stageMapping parity: ${checked} cases OK (frontend == backend == decided mapping)`);
