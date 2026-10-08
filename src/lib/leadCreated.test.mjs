// Run: node src/lib/leadCreated.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatLeadCreated } from "./leadCreated.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// naive stored time = IST wall clock -> shown as is
assert.equal(formatLeadCreated("2026-10-08T12:20:00"), "8 Oct 2026, 12:20 PM");
assert.equal(formatLeadCreated("2026-10-08 12:20:00"), "8 Oct 2026, 12:20 PM");
assert.equal(formatLeadCreated("2026-07-15T09:05:00"), "15 Jul 2026, 9:05 AM");
assert.equal(formatLeadCreated("2026-10-08T00:10:00"), "8 Oct 2026, 12:10 AM");
assert.equal(formatLeadCreated("2026-10-08T23:59:00"), "8 Oct 2026, 11:59 PM");
// an instant with a zone is converted to Indian time, whatever the browser's time zone is
assert.equal(formatLeadCreated("2026-10-08T06:50:00Z"), "8 Oct 2026, 12:20 PM");
assert.equal(formatLeadCreated("2026-10-07T20:00:00Z"), "8 Oct 2026, 1:30 AM", "next day in IST");
assert.equal(formatLeadCreated("2026-10-08T06:50:00+00:00"), "8 Oct 2026, 12:20 PM");
assert.equal(formatLeadCreated(new Date("2026-10-08T06:50:00Z")), "8 Oct 2026, 12:20 PM");
// missing / invalid -> "" (the card shows "—", never "Invalid Date")
for (const bad of [undefined, null, "", "   ", "not a date"]) assert.equal(formatLeadCreated(bad), "", String(bad));

// the lead card: a read-only "Lead Created" field right after Owner/Assignee, fed by the lead's created time
const panel = fs.readFileSync(path.resolve(here, "../components/leads/LeadDetailPanel.jsx"), "utf8");
const owner = panel.indexOf('label="Owner/Assignee"');
const created = panel.indexOf('label="Lead Created"');
const service = panel.indexOf('label="Service"');
assert.ok(owner > 0 && created > owner && created < service, "Owner/Assignee, then Lead Created, then Service");
assert.match(panel, /<DetailField label="Lead Created" value=\{formatLeadCreated\(fetchedCreatedAt \|\| liveLead\.createdAt \|\| liveLead\.created_at\)\} readOnly \/>/);
// the created time is read from the backend (GET /api/v1/leads/:id), not only from the lead already in memory
assert.match(panel, /setFetchedCreatedAt\(data\?\.createdAt \?\? data\?\.created_at \?\? null\)/);
assert.match(panel, /setFetchedCreatedAt\(null\);\s+refreshExtraInfo\(\);/);
assert.equal((panel.match(/label="Lead Created"/g) || []).length, 1);

console.log("leadCreated: Lead Created date + time (IST) on the lead card - OK");
