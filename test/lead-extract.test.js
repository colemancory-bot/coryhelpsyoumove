const test = require("node:test");
const assert = require("node:assert/strict");
const { extractLeadFromConversation } = require("../lead-extract.js");

// The real Steve Metcalf chat that exposed the bug (parcel # read as phone,
// "I am interested" read as the name).
const steve = [
  { role: "assistant", content: "Greeted visitor." },
  { role: "user", content: "I want to sell" },
  { role: "assistant", content: "That's great! What's your name? And are you looking to sell a property here in Western North Carolina?" },
  { role: "user", content: "I am interested in selling 2 acres of land that I have in Thorn Ridge in Cullowhee" },
  { role: "assistant", content: "That sounds like a great piece of property in Cullowhee! To help you best, what's your name? And have you had the land long?" },
  { role: "user", content: "My name is Steve Metcalf and I have had the land about 20 years, was planning in retiring there but plans have changed. The land is Lot #1 Thorn Ridge Map #7549020943. My email is steve3156@charter.net" },
  { role: "assistant", content: "Nice to meet you, Steve! What's the best phone number for Cory to reach you at?" },
];

test("extracts the real name from 'my name is', not 'I am interested'", () => {
  const r = extractLeadFromConversation(steve);
  assert.equal(r.first_name, "Steve");
  assert.equal(r.last_name, "Metcalf");
});

test("does NOT treat a parcel/map number as a phone", () => {
  const r = extractLeadFromConversation(steve);
  assert.equal(r.phone, ""); // 7549020943 is a Map #, and no phone was ever given
});

test("captures the email from the conversation", () => {
  const r = extractLeadFromConversation(steve);
  assert.equal(r.email, "steve3156@charter.net");
});

test("captures a phone when the assistant asked and the user replied with one", () => {
  const convo = [
    { role: "assistant", content: "What's the best phone number to reach you?" },
    { role: "user", content: "My name is Jane Doe, you can reach me at 828-506-6413" },
  ];
  const r = extractLeadFromConversation(convo);
  assert.equal(r.phone, "(828) 506-6413");
  assert.equal(r.first_name, "Jane");
  assert.equal(r.last_name, "Doe");
});

test("assumes the 828 area code for a 7-digit number", () => {
  const convo = [
    { role: "assistant", content: "What number can Cory call you at?" },
    { role: "user", content: "call me at 506-6413" },
  ];
  const r = extractLeadFromConversation(convo);
  assert.equal(r.phone, "(828) 506-6413");
});

test("does not invent a name from filler like 'I am interested'", () => {
  const convo = [
    { role: "assistant", content: "How can I help?" },
    { role: "user", content: "I am interested in a cabin near Sylva" },
  ];
  const r = extractLeadFromConversation(convo);
  assert.equal(r.first_name, "");
});

test("strips a leading country code", () => {
  const convo = [
    { role: "assistant", content: "Best phone number?" },
    { role: "user", content: "I'm Bob. It's 1-828-555-1234" },
  ];
  const r = extractLeadFromConversation(convo);
  assert.equal(r.phone, "(828) 555-1234");
  assert.equal(r.first_name, "Bob");
});

test("does not grab a number from non-phone context when never asked", () => {
  const convo = [
    { role: "assistant", content: "Tell me about the property." },
    { role: "user", content: "My name is Pat Lee, parcel number 1234567890, looking to sell" },
  ];
  const r = extractLeadFromConversation(convo);
  assert.equal(r.phone, "");
  assert.equal(r.first_name, "Pat");
  assert.equal(r.last_name, "Lee");
});
