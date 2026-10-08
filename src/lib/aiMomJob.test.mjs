// Run: node src/lib/aiMomJob.test.mjs
// Generate AI MoM on a 47-minute call: background job + polling instead of one request that times out after 20 s.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAiMomJob } from "./aiMomJob.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const noSleep = () => Promise.resolve();
const seq = (...answers) => { let i = 0; return async () => { const a = answers[Math.min(i, answers.length - 1)]; i += 1; if (a instanceof Error) throw a; return a; }; };
const CALL = { id: 7, ai_summary: "[KEY HIGHLIGHTS] ..." };

// 1. processing ... processing ... done -> { success, call } (same shape as the old one-request answer)
{
  const ticks = [];
  const res = await runAiMomJob({
    start: async () => ({ success: true, status: "processing" }),
    poll: seq({ status: "processing" }, { status: "processing" }, { status: "done", call: CALL }),
    sleep: noSleep,
    onTick: (st, sec) => ticks.push(st.status),
  });
  assert.deepEqual(res, { success: true, call: CALL });
  assert.deepEqual(ticks, ["processing", "processing", "done"]);
}

// 2. an old backend answers in one request - returned untouched, nothing is polled
{
  let polled = 0;
  const old = { success: true, call: CALL };
  const res = await runAiMomJob({ start: async () => old, poll: async () => { polled += 1; return {}; }, sleep: noSleep });
  assert.equal(res, old);
  assert.equal(polled, 0);
}

// 3. skipped (call never connected) and failed jobs surface their message
await assert.rejects(
  runAiMomJob({ start: async () => ({ status: "processing" }), poll: seq({ status: "skipped", message: "No AI summary for this call." }), sleep: noSleep }),
  (e) => e.skipped === true && e.message === "No AI summary for this call.",
);
await assert.rejects(
  runAiMomJob({ start: async () => ({ status: "processing" }), poll: seq({ status: "failed", message: "Gemini 429: quota" }), sleep: noSleep }),
  /Gemini 429: quota/,
);

// 4. the server forgot the job (restart) -> a clear "try again", not an endless wait
await assert.rejects(
  runAiMomJob({ start: async () => ({ status: "processing" }), poll: seq({ status: "idle" }), sleep: noSleep }),
  (e) => e.code === "AI_MOM_LOST" && /click Generate AI MoM again/.test(e.message),
);

// 5. a few dropped polls are tolerated; a dead connection is not tolerated forever
{
  const net = new Error("Failed to fetch");
  const res = await runAiMomJob({ start: async () => ({ status: "processing" }), poll: seq(net, net, { status: "processing" }, net, { status: "done", call: CALL }), sleep: noSleep });
  assert.deepEqual(res, { success: true, call: CALL });
  await assert.rejects(
    runAiMomJob({ start: async () => ({ status: "processing" }), poll: seq(net), sleep: noSleep }),
    /Failed to fetch/,
  );
}

// 6. waiting is bounded; the job itself keeps running on the server
{
  let t = 0;
  await assert.rejects(
    runAiMomJob({
      start: async () => ({ status: "processing" }),
      poll: async () => ({ status: "processing" }),
      sleep: async (ms) => { t += ms; },
      now: () => t,
      pollMs: 3000,
      maxWaitMs: 60_000,
    }),
    (e) => e.code === "AI_MOM_STILL_RUNNING" && /saved automatically/.test(e.message),
  );
}

// 7. wiring: the shared helper starts the job and polls; the call sites all go through it (no bare 20 s POST left)
const api = fs.readFileSync(path.join(root, "src/lib/api.js"), "utf8");
assert.match(api, /import \{ runAiMomJob \} from "\.\/aiMomJob\.js"/);
assert.match(api, /\{ callId, async: true \}/);
assert.match(api, /\/api\/v1\/ai\/process-call\/\$\{callId\}\/status/);
const detail = fs.readFileSync(path.join(root, "src/employee/pages/EmployeeCallDetail.jsx"), "utf8");
assert.ok(!detail.includes("apiPost(`/api/v1/ai/process-call/"), "Call Detail no longer uses a bare 20 s POST");
assert.match(detail, /processCallWithAi\(call\.id/);
const panel = fs.readFileSync(path.join(root, "src/components/leads/LeadDetailPanel.jsx"), "utf8");
assert.match(panel, /long calls can take a few minutes/, "the user is told a long call takes a while");

console.log("aiMomJob: long-call AI MoM runs as a background job and is polled - OK");
