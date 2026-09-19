/**
 * Fixture table for the numeric checker. Every row is a real consecutive-step pair
 * a student could write. Run: node --experimental-strip-types lib/whiteboard/checker/numeric.test.ts
 */
import { checkStep, type Equivalence } from "./numeric.ts";

type Expect = "equivalent" | "direction" | "caught" | "rescaled" | "undetermined";

// "caught" = anything that is not `equivalent` and not `undetermined`, i.e. we
// successfully refused to bless a wrong step (either outright or by escalating).
function bucket(e: Equivalence): Expect {
  if (e.kind === "equivalent") return "equivalent";
  if (e.kind === "direction") return "direction";
  if (e.kind === "rescaled") return "rescaled";
  if (e.kind === "undetermined") return "undetermined";
  return "caught";
}

const CASES: [string | null, string, Expect, string][] = [
  // --- equations: legal moves -------------------------------------------------
  ["2x + 3 = 7",       "2x = 4",           "equivalent", "subtract 3 from both sides"],
  ["2x = 4",           "x = 2",            "equivalent", "divide both sides by 2"],
  ["3(x+2) = 12",      "3x + 6 = 12",      "equivalent", "distribute"],
  ["(x+1)/2 = 3",      "x + 1 = 6",        "equivalent", "multiply both sides by 2"],
  ["5x - 2 = 3x + 8",  "2x - 2 = 8",       "equivalent", "collect like terms"],
  ["x^2 - 1 = 0",      "(x-1)(x+1) = 0",   "equivalent", "factor difference of squares"],
  ["x^2 + 2x + 1 = 0", "(x+1)^2 = 0",      "equivalent", "perfect square"],
  [null,               "2x + 3 = 7",       "equivalent", "first step of a problem"],

  // --- equations: errors ------------------------------------------------------
  ["2x + 3 = 7",       "2x = 10",          "caught", "added 3 instead of subtracting"],
  ["2x = 4",           "x = 4",            "caught", "forgot to divide the RHS"],
  ["3(x+2) = 12",      "3x + 2 = 12",      "caught", "distributed over only one term"],
  ["(x+1)/2 = 3",      "x + 1 = 3",        "caught", "forgot to multiply the RHS"],
  ["x^2 - 1 = 0",      "(x-1)^2 = 0",      "caught", "wrong factoring"],
  ["5x - 2 = 3x + 8",  "2x - 2 = 8 + 3x",  "caught", "moved a term but left it behind"],

  // --- inequalities: the direction rule --------------------------------------
  ["-2x > 6",          "x < -3",           "equivalent", "divide by -2 AND flip"],
  ["-2x > 6",          "x > -3",           "direction",  "*** forgot to flip ***"],
  ["-x < 5",           "x > -5",           "equivalent", "multiply by -1 and flip"],
  ["3x <= 12",         "x <= 4",           "equivalent", "divide by positive, keep"],
  ["3x <= 12",         "x >= 4",           "direction",  "flipped when it should not"],
  ["2x + 1 > 9",       "2x > 8",           "equivalent", "subtract 1"],
  ["2x + 1 > 9",       "2x > 10",          "caught",     "sign error on the constant"],

  // --- bare expressions: k must be EXACTLY 1 ---------------------------------
  ["2(x+3)",           "2x + 6",           "equivalent",   "correct distribute"],
  ["2(x+3)",           "x + 3",            "rescaled", "halved it (equation rule would pass this)"],
  ["2(x+3)",           "4x + 12",          "rescaled", "doubled it (equation rule would pass this)"],
  ["2(x+3)",           "2x + 3",           "caught",       "forgot to distribute"],
  ["x^2 - 1",          "(x-1)(x+1)",       "equivalent",   "correct factor, k=1"],
];

let pass = 0;
const fails: string[] = [];
for (const [prev, cur, want, label] of CASES) {
  const got = checkStep(prev, cur);
  const b = bucket(got);
  const ok = b === want;
  if (ok) pass++;
  else fails.push(`  ${prev} -> ${cur}  got=${b} want=${want}  (${label})`);
  const mark = ok ? "ok  " : "FAIL";
  const detail = got.kind === "direction" ? ` expected "${got.expected}" got "${got.got}"`
    : got.kind === "not-equivalent" ? ` witness: at ${got.witness.variable}=${got.witness.at.toFixed(3)} prev=${got.witness.previousValue.toFixed(3)} yours=${got.witness.currentValue.toFixed(3)}`
    : got.kind === "rescaled" ? ` by ${got.by.toFixed(3)}`
    : got.kind === "undetermined" ? ` (${got.why})` : "";
  console.log(`${mark} ${String(prev).padEnd(18)} -> ${cur.padEnd(18)} ${b.padEnd(13)}${detail}`);
}

console.log(`\n${pass}/${CASES.length} correct`);
if (fails.length) { console.log("\nFAILURES:\n" + fails.join("\n")); process.exit(1); }

const t = performance.now();
const N = 2000;
for (let i = 0; i < N; i++) checkStep("5x - 2 = 3x + 8", "2x - 2 = 8");
console.log(`mean latency over ${N} runs: ${((performance.now() - t) / N).toFixed(4)} ms`);
