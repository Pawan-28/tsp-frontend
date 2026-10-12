// Run: node src/lib/whatsappNameFallback.test.mjs
// E-15: a lead named after its phone number was greeted as "Hi 9876543210".
import assert from "node:assert/strict";
import { resolveWhatsAppScriptBody } from "./whatsappScripts.js";

const body = (name) => resolveWhatsAppScriptBody("Hi {name}, this is {repName}", { lead: { name }, employee: { name: "Sarita" } });
assert.equal(body("Rahul Sharma"), "Hi Rahul Sharma, this is Sarita");
assert.equal(body("9876543210"), "Hi there, this is Sarita");
assert.equal(body("+91 98765-43210"), "Hi there, this is Sarita");
assert.equal(body(""), "Hi there, this is Sarita");
assert.equal(body(undefined), "Hi there, this is Sarita");
console.log("whatsappNameFallback: a phone-like lead name is greeted as 'there' - OK");
