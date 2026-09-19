/**
 * Assessing a spoken explanation. Built from things a learner actually says --
 * including the two real transcripts captured during testing.
 *
 *   node --experimental-strip-types lib/whiteboard/explanation.test.ts
 */
import { assessExplanation, replyTo } from "./explanation.ts";
import type { Equivalence } from "./checker/numeric.ts";

const DIRECTION: Equivalence = { kind: "direction", expected: "<", got: ">", scale: -2 };
const RESCALED: Equivalence = { kind: "rescaled", by: 2 };

let pass = 0, total = 0;
function check(label: string, got: string, want: string) {
  total++;
  const ok = got === want;
  if (ok) pass++;
  console.log(`${ok ? "ok  " : "FAIL"} ${want.padEnd(9)} ${label}${ok ? "" : `   (got ${got})`}`);
}
const a = (t: string, v: Equivalence = DIRECTION) => assessExplanation(t, v).kind;

// --- real transcripts captured while testing -------------------------------
check('"I thought I got it right. Seems right to me."', a("I thought I got it right. I don't know. Seems right to me."), "stuck");
check('"Yeah, no, I don\'t know this guy. Um, I think"', a("Yeah, no, I don't know this guy. Um, I think"), "stuck");

// --- they found it ----------------------------------------------------------
check('"I forgot to flip the sign"', a("oh I forgot to flip the sign"), "found-it");
check('"should have reversed the inequality"', a("I should have reversed the inequality"), "found-it");
check('"I didn\'t switch it round"', a("I didn't switch it round"), "found-it");
// Unsure phrasing must not mask a correct answer.
check('"I don\'t know, did I forget to flip it?"', a("I don't know, did I forget to flip it?"), "found-it");

// --- said something, but not the thing --------------------------------------
check('"I divided both sides by minus two"', a("I divided both sides by minus two"), "not-yet");
check('"because that\'s how you solve it"', a("because that's how you solve it"), "not-yet");
check("silence", a(""), "not-yet");

// --- a different misconception has different signals ------------------------
check('"I halved it" (rescaled)', a("I halved it", RESCALED), "found-it");
check('"I flipped it" is NOT right for rescaled', a("I flipped it", RESCALED), "not-yet");

// --- replies ----------------------------------------------------------------
total++;
const reply = replyTo({ kind: "found-it" }, DIRECTION);
const ok = reply.includes("flips it");
if (ok) pass++;
console.log(`${ok ? "ok  " : "FAIL"} confirmation names the rule back`);

console.log(`\n${pass}/${total} correct`);
if (pass !== total) process.exit(1);
