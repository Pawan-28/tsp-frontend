// Run: node src/lib/momDisplay.test.mjs
// MoM display: section headings are BOLD and WITHOUT square brackets; Gemini charges are a small compact box; stored text is untouched.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { getGeminiCharges, stripGeminiCharges, getMomSections } from "./momFormat.js";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../.."); // frontend/
const bundle = async (entry, name) => {
  const out = path.join(os.tmpdir(), `${name}-${process.pid}.cjs`);
  await build({ entryPoints: [path.resolve(root, entry)], bundle: true, platform: "node", format: "cjs", outfile: out, jsx: "automatic", logLevel: "silent" });
  const mod = require(out);
  fs.rmSync(out, { force: true });
  return mod;
};
const { renderToStaticMarkup } = require(path.resolve(root, "node_modules/react-dom/server.js"));
const React = require(path.resolve(root, "node_modules/react/index.js"));

const MOM = `[KEY HIGHLIGHTS]
• Customer: Anita Rao
• Budget: Not discussed

[CALL HEADER]
Date: 1 Oct 2026 | Client: Anita Rao
Call Summary:
Discussed a podcast.

[DISCUSSION HIGHLIGHTS & KEY REQUIREMENTS]
Customer Requirements:
• Podcast

[QUALIFICATIONS MET]
SOP Evaluation:
• Covered

[ACTION ITEMS & NEXT STEPS]
Next Steps:
• Follow up`;
const CHARGES = `[GEMINI CHARGES]
Total: ₹1.34 ($0.0160) (est.)
Transcript: ₹0.90 — 4,200 audio + 120 text tokens in, 800 out
MoM: ₹0.44 — 2,100 tokens in, 700 out
Model: gemini-2.5-flash

`;

const { default: MomText, parseMomLines } = await bundle("src/components/leads/MomText.jsx", "momtext");
const { GeminiChargesBar, parseChargeLine } = await bundle("src/components/leads/MomSections.jsx", "momsections");

// 1. headings: bold, bracket-free
assert.deepEqual(parseMomLines(MOM).filter((l) => l.heading).map((l) => l.heading), [
  "KEY HIGHLIGHTS", "CALL HEADER", "DISCUSSION HIGHLIGHTS & KEY REQUIREMENTS", "QUALIFICATIONS MET", "ACTION ITEMS & NEXT STEPS",
]);
const html = renderToStaticMarkup(React.createElement(MomText, { text: MOM }));
for (const h of ["KEY HIGHLIGHTS", "CALL HEADER", "DISCUSSION HIGHLIGHTS &amp; KEY REQUIREMENTS", "QUALIFICATIONS MET", "ACTION ITEMS &amp; NEXT STEPS"]) {
  assert.ok(html.includes(`>${h}</strong>`), `${h} is a bold heading`);
}
assert.ok(!/\[(KEY HIGHLIGHTS|CALL HEADER|DISCUSSION HIGHLIGHTS|QUALIFICATIONS MET|ACTION ITEMS)/.test(html), "no square brackets around the headings");
assert.equal((html.match(/<strong/g) || []).length, 5);
assert.ok(html.includes("Call Summary:") && html.includes("Discussed a podcast.") && html.includes("Customer: Anita Rao"), "body text is shown as stored");
// order is preserved
const order = ["KEY HIGHLIGHTS", "CALL HEADER", "DISCUSSION HIGHLIGHTS", "QUALIFICATIONS MET", "ACTION ITEMS"].map((h) => html.indexOf(h));
assert.deepEqual(order, [...order].sort((a, b) => a - b));
// only real bracket headings are touched: a bracketed phrase inside a sentence stays as written
const inline = renderToStaticMarkup(React.createElement(MomText, { text: "Client said [call me later] twice\n[ACTION ITEMS]\n1. Call" }));
assert.ok(inline.includes("[call me later]") && inline.includes(">ACTION ITEMS</strong>"));
assert.equal(renderToStaticMarkup(React.createElement(MomText, { text: "" })).includes("<strong"), false);
// the stored MoM text and its structured sections are exactly what they were
assert.equal(getMomSections({ ai_summary: MOM }).keyHighlights.startsWith("• Customer: Anita Rao"), true);
assert.equal(stripGeminiCharges(CHARGES + MOM), MOM);

// 2. charges: parsed + shown as a small compact box (total, per-part chips, model), not as raw lines
assert.deepEqual(parseChargeLine("Transcript: ₹0.90 — 4,200 audio + 120 text tokens in, 800 out"), { label: "Transcript", value: "₹0.90", detail: "4,200 audio + 120 text tokens in, 800 out" });
assert.deepEqual(parseChargeLine("Model: gemini-2.5-flash"), { label: "Model", value: "gemini-2.5-flash", detail: "" });
assert.equal(getGeminiCharges({ ai_summary: CHARGES + MOM }).total, "₹1.34 ($0.0160) (est.)");
const bar = renderToStaticMarkup(React.createElement(GeminiChargesBar, { call: { ai_summary: CHARGES + MOM } }));
assert.ok(bar.includes('data-testid="gemini-charges"') && bar.includes("Gemini charges") && bar.includes("₹1.34"));
for (const chip of [">Transcript<", ">MoM<", ">Model<", "₹0.90", "₹0.44", "gemini-2.5-flash"]) assert.ok(bar.includes(chip), `chip ${chip}`);
assert.ok(bar.includes("rounded-xl") && bar.includes("bg-gradient-to-r") && bar.includes("rounded-full"), "same compact, rounded look as Extra Info");
assert.ok(bar.includes('title="4,200 audio + 120 text tokens in, 800 out"'), "token detail stays available on hover");
assert.ok(!bar.includes("[GEMINI CHARGES]"));
assert.equal(renderToStaticMarkup(React.createElement(GeminiChargesBar, { call: { ai_summary: MOM } })), "", "no box when there are no charges");
// charges are NOT part of Extra Info
const card = fs.readFileSync(path.resolve(root, "src/components/leads/ExtraInfoCard.jsx"), "utf8");
assert.ok(!/charge|gemini|token/i.test(card), "AI cost never appears in Extra Info");

// 3. wiring: every place that prints an AI MoM uses the bold-heading view and the compact charges box
const panel = fs.readFileSync(path.resolve(root, "src/components/leads/LeadDetailPanel.jsx"), "utf8");
assert.match(panel, /<MomText text=\{stripGeminiCharges\(item\.body\)\}/);
assert.match(panel, /<GeminiChargesBar call=\{\{ ai_summary: item\.body \}\} \/>/);
const detail = fs.readFileSync(path.resolve(root, "src/employee/pages/EmployeeCallDetail.jsx"), "utf8");
assert.match(detail, /<GeminiChargesBar call=/);
assert.match(detail, /<MomText text=\{stripGeminiCharges\(/);
const sections = fs.readFileSync(path.resolve(root, "src/components/leads/MomSections.jsx"), "utf8");
assert.match(sections, /<MomText text=\{plainText\}/);

console.log("momDisplay: bold bracket-free headings + compact charges box - OK");
