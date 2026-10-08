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

// mobile: one stage-name label per row with its count chip - no button
const mobileStart = code.indexOf("{/* Mobile");
const desktopStart = code.indexOf("{/* Desktop");
assert.ok(mobileStart > 0 && desktopStart > mobileStart);
const mobile = code.slice(mobileStart, desktopStart);
assert.ok(!/onClick=\{\(\) => scrollToStage\(stage\.id\)\}/.test(mobile), "no clickable stage header on mobile");
// the stage row shows its lead COUNT again (user request) - still not a button and no "N leads" line
assert.match(mobile, /<Badge tone=\{stage\.badgeTone\}>\{stage\.label\}<\/Badge>\s*<span[^>]*data-testid="mobile-stage-count"[^>]*>\s*\{getColumnCount\(stage\.id, columnLeads\)\}/);
assert.ok(!/ leads`|\} leads</.test(mobile), "no 'N leads' text line");

// desktop keeps its stage header (name + count box); the top chip row (name + count, tap to jump) is unchanged
const desktop = code.slice(desktopStart);
assert.match(desktop, /getColumnCount\(stage\.id, columnLeads\)/);
assert.match(code, /onClick=\{\(\) => scrollToStage\(stage\.id\)\}\s+title=\{callHint \|\| undefined\}/, "the chip row still jumps to a stage");

// mobile: the in-page red "+ Add Lead" button is hidden (the floating + quick-add already creates leads); desktop keeps it
const addBtn = src.slice(src.lastIndexOf("<button", src.indexOf("Add Lead</button>") > 0 ? src.indexOf("Add Lead</button>") : src.indexOf("            Add Lead")), src.indexOf("Add Lead", src.indexOf("setModalOpen(true)")) + 8);
assert.match(addBtn, /className="hidden sm:inline-flex[^"]*bg-rose-700/, "Add Lead button is hidden below the sm breakpoint");
assert.ok(!/className="inline-flex[^"]*bg-rose-700[^"]*"\s*>\s*<Plus className="w-3\.5 h-3\.5" \/>\s*Add Lead/.test(src), "no always-visible Add Lead button");
const layout = fs.readFileSync(path.resolve(here, "../employee/layouts/EmployeeLayout.jsx"), "utf8");
assert.match(layout, /label: "Add Lead", to: "\/employee\/leads\?action=add"/, "the floating quick-add still offers Add Lead");
assert.match(src, /searchParams\.get\("action"\) === "add"/, "...and it opens this page's Add Lead form");

console.log("boardHeaderClean: no cards-on-board note, no 'N leads' line, no mobile stage button - OK");
