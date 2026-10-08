// Run: node src/lib/boardHeaderClean.test.mjs
// Employee Pipeline board: no "N cards on board" note, no "N leads" line under each stage name, and no stage header BUTTON on mobile
// (the chip row at the top already shows every stage name + count).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(here, "../employee/pages/EmployeeLeads.jsx"), "utf8");
const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

// the note under the board
assert.ok(!/cards? on board|cardsOnBoard/.test(code), "the 'N cards on board' note is gone");
assert.ok(!/summary tiles, which count leads/.test(code));

// no "N leads" line under the stage names (hover hints that mention leads are kept)
assert.ok(!/\{columnLeads\.length\} leads\n/.test(code), "no visible 'N leads' line");
assert.ok(!/<p className="text-\[9px\] text-slate-400 tabular-nums mt-0\.5/.test(code));

// mobile: one plain stage-name label per row - no button, no count box
const mobileStart = code.indexOf("{/* Mobile");
const desktopStart = code.indexOf("{/* Desktop");
assert.ok(mobileStart > 0 && desktopStart > mobileStart);
const mobile = code.slice(mobileStart, desktopStart);
assert.ok(!/onClick=\{\(\) => scrollToStage\(stage\.id\)\}/.test(mobile), "no clickable stage header on mobile");
assert.ok(!/getColumnCount/.test(mobile), "no count box on mobile");
assert.match(mobile, /<div className="mb-2 px-0\.5">\s*<Badge tone=\{stage\.badgeTone\}>\{stage\.label\}<\/Badge>\s*<\/div>/);

// desktop keeps its stage header (name + count box); the top chip row (name + count, tap to jump) is unchanged
const desktop = code.slice(desktopStart);
assert.match(desktop, /getColumnCount\(stage\.id, columnLeads\)/);
assert.match(code, /onClick=\{\(\) => scrollToStage\(stage\.id\)\}\s+title=\{callHint \|\| undefined\}/, "the chip row still jumps to a stage");

console.log("boardHeaderClean: no cards-on-board note, no 'N leads' line, no mobile stage button - OK");
