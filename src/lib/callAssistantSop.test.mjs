// Run: node src/lib/callAssistantSop.test.mjs
// Call Assistant: every SOP question must show as a labelled question + its own answer field (never blank, never shared).
import assert from "node:assert/strict";
import { mapAdminSopsForEmployee, normalizeCallSop, normalizeDiscoveryFields, normalizeStepQuestions, LOCAL_SOPS } from "../data/employeeMock.js";

// exact shape of the real "National Media Podcast Sales" SOP row from the API
const REAL = {
  id: 10, title: "National Media Podcast Sales", category: "Sales Call", status: "Active", estimated_time: "15 min",
  description: "This SOP is designed to help sales executives qualify consultants, coaches, doctors...",
  script: "Agent: Hello [Lead Name], thank you for showing interest in our solutions.",
  questions: [
    "Could you briefly tell me about your business/profession and what you currently do?",
    "Who is your primary target audience?",
    "What are you currently doing for your personal branding or social media?",
    "What would you ideally like to achieve from your personal brand over the next 6-12 months?",
    "If someone searches your name on Google today, how satisfied are you with what they see?",
  ],
  frameworks: ["BANT (Budget, Authority, Need, Timeline)", "MEDDIC"],
  instruction_steps: [
    { step: 1, title: "Greet the client and establish a positive tone." },
    { step: 2, title: "Perform initial discovery by asking about pain points." },
    { step: 3, title: "Log interaction outcomes and next follow-up date in the CRM." },
  ],
  questions_answers: [],
};

const [sop] = mapAdminSopsForEmployee([REAL]);
const step1 = sop.steps[0];

// 1. Dynamic Qualification Questions: the SOP questions are listed (they were EMPTY before)
assert.equal(step1.questions.length, 5);
assert.deepEqual(step1.questions.map((q) => q.text), REAL.questions);
assert.equal(new Set(step1.questions.map((q) => q.id)).size, 5, "unique ids");

// 2. Discovery Information: one LABELLED answer field per question, each with its OWN key (a missing key shared one answer across all inputs)
assert.equal(step1.discovery.length, 5);
assert.deepEqual(step1.discovery.map((f) => f.label), REAL.questions, "the question is the label");
assert.equal(new Set(step1.discovery.map((f) => f.key)).size, 5, "each field has its own key");
assert.ok(step1.discovery.every((f) => f.key && f.label && f.placeholder), "never a blank label / key / placeholder");

// 3. the questions are also there on the discovery-style step, with the SAME keys (an answer typed once shows in both places)
const discoveryStep = sop.steps.find((s) => /discover/i.test(s.label));
assert.ok(discoveryStep && discoveryStep !== step1);
assert.deepEqual(discoveryStep.discovery.map((f) => f.key), step1.discovery.map((f) => f.key));
assert.equal(sop.steps[2].discovery.length, 0, "the logging step has no discovery fields");

// 4. admin question + answer GUIDELINES: question = label, the admin's answer = guideline under it
const [qaSop] = mapAdminSopsForEmployee([{ ...REAL, id: 11, questions_answers: [
  { question: "What is your budget?", answer: "Anything above 1L is qualified; below that, offer the starter pack." },
  { question: "Who decides?", answer: "" },
  { question: "  ", answer: "ignored (no question)" },
] }]);
assert.deepEqual(qaSop.steps[0].discovery.map((f) => f.label), ["What is your budget?", "Who decides?"]);
assert.equal(qaSop.steps[0].discovery[0].guide, "Anything above 1L is qualified; below that, offer the starter pack.");
assert.equal(qaSop.steps[0].discovery[1].guide, undefined);
assert.deepEqual(qaSop.steps[0].questions.map((q) => q.text), ["What is your budget?", "Who decides?"]);

// 5. the app's own (mock) SOP shape is untouched
const mock = normalizeCallSop(LOCAL_SOPS[0]);
for (const st of mock.steps) {
  for (const f of st.discovery) assert.ok(f.key && f.label && f.placeholder);
  for (const q of st.questions) assert.ok(q.id && q.text);
}

// 6. odd inputs never produce blank or duplicate fields
assert.deepEqual(normalizeDiscoveryFields(["A?", { q: "B?", hint: "say it" }, { id: "x", question: "C?" }, "", null]).map((f) => [f.key, f.label, f.placeholder]),
  [["d0", "A?", "Type the customer's answer..."], ["d1", "B?", "say it"], ["x", "C?", "Type the customer's answer..."]]);
assert.deepEqual(normalizeStepQuestions(["Q1", { text: "Q2" }, { question: "Q3", id: 9 }, ""]).map((q) => [q.id, q.text]), [["q0", "Q1"], ["q1", "Q2"], [9, "Q3"]]);
assert.deepEqual(normalizeDiscoveryFields(undefined), []);

// 7. an SOP with no questions at all still opens (no crash, empty sections)
const [bare] = mapAdminSopsForEmployee([{ id: 12, title: "Bare", status: "Active", instruction_steps: [{ title: "Only step" }] }]);
assert.deepEqual([bare.steps[0].questions.length, bare.steps[0].discovery.length], [0, 0]);

console.log("callAssistantSop: questions + answer fields OK (real SOP shape, Q&A guidelines, mock shape)");
