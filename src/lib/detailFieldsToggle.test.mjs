// Run: node src/lib/detailFieldsToggle.test.mjs
// Lead panel: a Hide / See button folds Source, SOP and the UTM fields; the "Mark as Not Interested" button under Stage is gone.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const code = fs.readFileSync(path.resolve(root, "src/components/leads/LeadDetailPanel.jsx"), "utf8");

// 1. no "Mark as Not Interested" button any more (the Stage dropdown already offers Not Interested)
assert.ok(!code.includes("Mark as Not Interested"), "the button is gone");
assert.ok(!code.includes("Marked Not Interested"));
assert.match(code, /options=\{CANONICAL_STAGE_LABELS\}/, "the Stage dropdown is still there");
assert.ok(!/label="Stage"[\s\S]{0,700}footer=/.test(code), "no footer under Stage");
assert.match(code, /Set the Stage to Not Interested to move the lead/, "the AI chip points at the dropdown");

// 2. the grid: exactly these six fields fold away, everything else always shows
const gridStart = code.indexOf('<div className="grid grid-cols-2 gap-3">\n        <DetailField\n          label="Name"');
const gridEnd = code.indexOf('data-testid="toggle-more-fields"', gridStart);
assert.ok(gridStart > 0 && gridEnd > gridStart);
const grid = code.slice(gridStart, gridEnd).replace(/\{\/\*[\s\S]*?\*\/\}/g, ""); // JSX comments are not fields
const labelsIn = (text) => [...text.matchAll(/label="([^"]+)"/g)].map((m) => m[1]);
const folded = [];
let outside = grid;
for (const m of grid.matchAll(/\{showMoreFields && \(([\s\S]*?)\n        \)\}/g)) {
  folded.push(...labelsIn(m[1]));
  outside = outside.replace(m[0], "");
}
assert.deepEqual(folded.sort(), ["SOP", "Source", "UTM Campaign", "UTM Content", "UTM Medium", "UTM Source"].sort());
for (const keep of ["Name", "Phone", "Email", "Stage", "Budget (₹)", "Last Contact", "Owner/Assignee", "Lead Created", "Service", "City", "Company"]) {
  assert.ok(labelsIn(outside).includes(keep), `${keep} is always shown`);
}

// 3. the button: full width, Hide <-> See, remembered on the device, safe when storage is blocked
assert.match(code, /data-testid="toggle-more-fields"/);
assert.match(code, /showMoreFields \? "Hide Source, SOP & UTM" : "See Source, SOP & UTM"/);
assert.match(code, /aria-expanded=\{showMoreFields\}/);
assert.match(code, /col-span-2 inline-flex/);
assert.match(code, /try \{ return window\.localStorage\.getItem\("leadPanel\.showMoreFields"\) !== "0"; \} catch \{ return true; \}/, "shown by default, never breaks without storage");
assert.match(code, /try \{ window\.localStorage\.setItem\("leadPanel\.showMoreFields", v \? "0" : "1"\); \} catch/);
// hiding only hides: the values stay in the draft and are still saved
assert.ok(!/showMoreFields[\s\S]{0,80}setDraft/.test(code), "folding never touches the draft");

console.log("detailFieldsToggle: Hide/See folds Source, SOP and UTM fields; no Mark-as-Not-Interested button - OK");
