/**
 * "Generate AI MoM" for a long call (47 min = download + transcription + MoM = minutes): the server starts a background job and answers
 * at once ({ status: "processing" }); we poll its status until it is done. One request never has to stay open for minutes.
 *
 *   start()  -> the POST answer. Anything other than { status: "processing" } is an old-style one-request answer and is returned as is.
 *   poll()   -> { status: "processing" | "done" | "skipped" | "failed" | "idle", call?, message? }
 *
 * Resolves with { success: true, call } - the same shape the one-request answer always had, so every caller works unchanged.
 */
export const AI_MOM_POLL_MS = 3000;
export const AI_MOM_MAX_WAIT_MS = 15 * 60 * 1000; // the job keeps running on the server after this; the MoM is saved when it ends
const MAX_POLL_ERRORS = 5; // a few dropped polls (phone network) must not abort a job that is still running

function jobError(message, extra = {}) {
  return Object.assign(new Error(message), extra);
}

export async function runAiMomJob({
  start,
  poll,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = () => Date.now(),
  pollMs = AI_MOM_POLL_MS,
  maxWaitMs = AI_MOM_MAX_WAIT_MS,
  onTick,
}) {
  const first = await start();
  if (!first || first.status !== "processing") return first; // old backend: it already answered in one request

  const began = now();
  let pollErrors = 0;
  for (;;) {
    await sleep(pollMs);
    if (now() - began > maxWaitMs) {
      throw jobError("The AI is still working on this long call. Check again in a few minutes - the MoM is saved automatically when it finishes.", { code: "AI_MOM_STILL_RUNNING" });
    }
    let st;
    try {
      st = await poll();
      pollErrors = 0;
    } catch (err) {
      pollErrors += 1;
      if (pollErrors >= MAX_POLL_ERRORS) throw err;
      continue;
    }
    if (typeof onTick === "function") onTick(st, Math.round((now() - began) / 1000));
    switch (st?.status) {
      case "processing":
        break;
      case "done":
        return { success: true, call: st.call };
      case "skipped":
        throw jobError(st.message || "No AI summary is generated for calls that did not connect.", { skipped: true });
      case "failed":
        throw jobError(st.message || "AI processing failed.");
      default: // "idle": the server no longer knows this job (it was restarted) - ask the user to try again
        throw jobError("The AI job was interrupted (the server restarted). Please click Generate AI MoM again.", { code: "AI_MOM_LOST" });
    }
  }
}
