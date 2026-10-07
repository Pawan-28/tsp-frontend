// Run: node src/lib/leadSourcesUi.test.mjs
// (1) the Source dropdowns offer ONLY the admin's sources and "+ Add new..." saves a source that the admin Sources page shows,
// (2) a lead with no name gets a Name field (and phone / email placeholders) in the lead panel.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  aggregateLeadsBySource, filterLeadsForSourceDashboard, getSourceLabel, customSourceKeys, isSourceDashboardLead, resolveLeadSourceKey,
} from "./leadSource.js";
import { realLeadName, buildDetailDraft } from "./leadSync.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.resolve(here, rel), "utf8");

// ───────── 1. admin Sources page: custom sources are real sources ─────────
let n = 0;
const lead = (o = {}) => { n += 1; return { id: 100 + n, name: `Person ${n}`, email: `p${n}@acme.in`, phone: `98${String(10000000 + n)}`, createdAt: "2026-09-01T10:00:00Z", sourceMeta: {}, ...o }; };
const podcastLead = lead({ source: "Podcast Ads", sourceMeta: { integration: "admin", channel: "Podcast Ads" } });
const leads = [lead({ source: "meta_ads" }), lead({ source: "website" }), podcastLead];
const custom = [{ key: "podcast_ads", label: "Podcast Ads" }];

assert.equal(isSourceDashboardLead(podcastLead), false, "an unknown source nobody created is not on the page");
assert.equal(isSourceDashboardLead(podcastLead, customSourceKeys(custom)), true, "once created it is");
assert.equal(resolveLeadSourceKey(podcastLead), "podcast_ads");
assert.deepEqual(filterLeadsForSourceDashboard(leads).map((l) => l.id), [leads[0].id, leads[1].id]);
assert.deepEqual(filterLeadsForSourceDashboard(leads, custom).map((l) => l.id), leads.map((l) => l.id));
const page = aggregateLeadsBySource(filterLeadsForSourceDashboard(leads, custom), custom);
assert.deepEqual(page.map((g) => [g.key, g.leadCount, g.label]).sort(), [["meta_ads", 1, "Meta"], ["podcast_ads", 1, "Podcast Ads"], ["website", 1, "Website"]]);
// a source created from a dropdown is on the page BEFORE it has a lead
const fresh = aggregateLeadsBySource([], [{ key: "radio", label: "Radio" }]);
assert.deepEqual(fresh.map((g) => [g.key, g.label, g.leadCount]), [["radio", "Radio", 0]]);
assert.equal(getSourceLabel("podcast_ads", custom), "Podcast Ads");
assert.equal(getSourceLabel("podcast_ads"), "Podcast Ads", "title-case fallback matches");
assert.equal(getSourceLabel("meta_ads", custom), "Meta");
// both admin pages read the saved custom sources
const dash = read("../pages/sources/SourcesDashboard.jsx");
assert.match(dash, /setCustomSources\(Array\.isArray\(res\?\.customSources\)/);
assert.match(dash, /filterLeadsForSourceDashboard\(leads, customSources\)/);
assert.match(dash, /aggregateLeadsBySource\(marketingLeads, customSources\)/);
const srcLeads = read("../pages/sources/SourceLeads.jsx");
assert.match(srcLeads, /filterLeadsForSourceDashboard\(items, custom\)/);
assert.match(srcLeads, /getSourceLabel\(decodedKey, customSources\)/);

// ───────── 2. dropdowns: the admin's sources only, no hard-coded list ─────────
const drawer = read("../components/AddLeadDrawer.jsx");
assert.ok(!/LEAD_SOURCE_OPTIONS|SOURCE_CATALOG/.test(drawer), "no static source list in the Add Lead form");
assert.equal((drawer.match(/<SourceSelect[\s>]/g) || []).length, 2, "both Source fields use the shared list");
assert.match(drawer, /useLeadSources\(getAdminCrmHeaders\)/);
assert.match(drawer, /onCustomCommit=\{async \(text\) => \(await addSource\(text\)\)\.label\}/);
assert.match(drawer, /Press Enter to add it - it also appears on your Sources page/);
const panel = read("../components/leads/LeadDetailPanel.jsx");
assert.ok(!/SELECTABLE_SOURCE_KEYS/.test(panel), "no static source list in the lead panel");
assert.match(panel, /leadSources\.map\(\(s\) => s\.key\)/);
assert.match(panel, /allowCustom\s+onCustomCommit=\{async \(text\) => \(await addSource\(text\)\)\.key\}/);
const hook = read("./useLeadSources.js");
assert.match(hook, /\/api\/v1\/lead-sources/);
assert.match(hook, /apiPost\("\/api\/v1\/lead-sources", \{ label \}/);
assert.match(hook, /FALLBACK/, "an unreachable list never leaves an empty dropdown");

// ───────── 3. a lead with no name ─────────
for (const nameless of [{}, { name: "" }, { name: "—" }, { name: "-" }, { name: "Unknown" }, { name: "unknown lead" }, { name: "   " },
  { name: "919718491201", phone: "+91 97184 91201" }, { name: "9718491201", phone: "919718491201" }]) {
  assert.equal(realLeadName(nameless), "", `nameless: ${JSON.stringify(nameless)}`);
  assert.equal(buildDetailDraft({ ...nameless, phone: nameless.phone || "9000000001" }).name, "");
}
assert.equal(realLeadName({ name: "Anita Rao", phone: "9718491201" }), "Anita Rao");
assert.equal(realLeadName({ leadName: "Dr. Mehta" }), "Dr. Mehta");
assert.equal(realLeadName({ lead_name: "Ravi", phone: "123" }), "Ravi");
assert.equal(buildDetailDraft({ name: "Anita Rao", phone: "9718491201", email: "a@b.in" }).name, "Anita Rao");
// the panel: Name field first, highlighted + helper text when missing, phone / email placeholders, name saved only when changed
const nameIdx = panel.indexOf('label="Name"');
const phoneIdx = panel.indexOf('label="Phone"');
const emailIdx = panel.indexOf('label="Email"');
assert.ok(nameIdx > 0 && nameIdx < phoneIdx && phoneIdx < emailIdx, "Name, then Phone, then Email");
assert.match(panel, /placeholder="Add customer name"/);
assert.match(panel, /This lead has no name - add the name, then Save\./);
assert.match(panel, /placeholder="Add phone number"/);
assert.match(panel, /placeholder="Add email"/);
assert.match(panel, /highlight=\{!readOnly && !realLeadName\(\{ name: draft\.name \}\)\}/);
assert.match(panel, /String\(draft\.name \|\| ""\)\.trim\(\) !== baseName \? \{ name: String\(draft\.name \|\| ""\)\.trim\(\) \} : \{\}/);
// the existing save path already writes a new name (leadName) to the CRM
const ctx = read("../context/EmployeeContext.jsx");
assert.match(ctx, /if \(updates\.name !== undefined\) payload\.leadName = updates\.name;/);

console.log("leadSourcesUi: admin-only sources in dropdowns, + Add new saves to the Sources page, nameless leads get a Name field - OK");
