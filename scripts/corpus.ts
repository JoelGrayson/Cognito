/**
 * The real test harness. Feeds realistic Mathpix-STYLE LaTeX straight into the
 * bridge and the checker, skipping Mathpix and the tablet entirely.
 *
 * Why this and not more handwriting: whether Mathpix reads ink is already answered
 * (confidence 1.00 on real writing). What is NOT answered is whether everything
 * DOWNSTREAM of it survives the shapes Mathpix actually emits -- \text{} wrappers,
 * spaced braces, \frac, \cdot, \leq, \operatorname. Those are LaTeX strings, so
 * they need no pen.
 *
 *   node --experimental-strip-types scripts/corpus.ts
 */
import { latexToMathjs } from "../lib/whiteboard/ink.ts";
import { checkStep } from "../lib/whiteboard/checker/numeric.ts";

type Want = "equivalent" | "direction" | "caught" | "rescaled" | "undetermined";
type Case = [prev: string, next: string, want: Want, note: string];

// LaTeX written the way Mathpix actually emits it: spaces inside braces,
// \text{} around loose operators, \cdot for multiplication, explicit \left\right.
const CASES: Case[] = [
  // ---- linear algebra steps --------------------------------------------------
  ["2 x + 3 = 7", "2 x = 4", "equivalent", "subtract 3"],
  ["2 x + 3 = 7", "2 x = 10", "caught", "added instead of subtracted"],
  ["2 x = 4", "x = 2", "equivalent", "divide by 2"],
  ["5 x - 2 = 3 x + 8", "2 x - 2 = 8", "equivalent", "collect terms"],
  ["5 x - 2 = 3 x + 8", "2 x - 2 = 8 + 3 x", "caught", "moved but left behind"],
  ["\\frac{ x + 1 }{ 2 } = 3", "x + 1 = 6", "equivalent", "\\frac, multiply up"],
  ["\\frac{ x + 1 }{ 2 } = 3", "x + 1 = 3", "caught", "forgot to multiply RHS"],
  ["3 \\left( x + 2 \\right) = 12", "3 x + 6 = 12", "equivalent", "\\left\\right distribute"],
  ["3 \\left( x + 2 \\right) = 12", "3 x + 2 = 12", "caught", "partial distribute"],
  ["2 \\cdot x = 8", "x = 4", "equivalent", "\\cdot multiplication"],

  // ---- inequalities: the direction rule -------------------------------------
  ["-2 x > 6", "x < -3", "equivalent", "divide by negative, flip"],
  ["-2 x > 6", "x > -3", "direction", "*** forgot to flip ***"],
  ["3 x \\leq 12", "x \\leq 4", "equivalent", "\\leq, positive divide"],
  ["3 x \\leq 12", "x \\geq 4", "direction", "flipped without cause"],
  ["-x < 5", "x > -5", "equivalent", "multiply by -1"],
  ["\\text { } -4 x \\geq 8 \\text { }", "x \\leq -2", "equivalent", "\\text noise around it"],
  ["-4 x \\geq 8", "x \\geq -2", "direction", "forgot to flip with \\geq"],

  // ---- quadratics / factoring -----------------------------------------------
  ["x^{2} - 1 = 0", "\\left( x - 1 \\right)\\left( x + 1 \\right) = 0", "equivalent", "difference of squares"],
  ["x^{2} - 1 = 0", "\\left( x - 1 \\right)^{2} = 0", "caught", "wrong factoring"],
  ["x^{2} + 2 x + 1 = 0", "\\left( x + 1 \\right)^{2} = 0", "equivalent", "perfect square"],
  ["x^{2} + 5 x + 6 = 0", "\\left( x + 2 \\right)\\left( x + 3 \\right) = 0", "equivalent", "factor trinomial"],
  ["x^{2} + 5 x + 6 = 0", "\\left( x + 1 \\right)\\left( x + 6 \\right) = 0", "caught", "wrong factor pair"],

  // ---- bare expressions: scaling is NOT allowed ------------------------------
  ["2 \\left( x + 3 \\right)", "2 x + 6", "equivalent", "expression distribute"],
  ["2 \\left( x + 3 \\right)", "x + 3", "rescaled", "halved a bare expression"],
  ["\\left( x + 1 \\right)^{2}", "x^{2} + 2 x + 1", "equivalent", "expand"],
  ["\\left( x + 1 \\right)^{2}", "x^{2} + 1", "caught", "the classic expansion error"],

  // ---- trig ------------------------------------------------------------------
  ["\\sin^{2}( x ) + \\cos^{2}( x )", "1", "equivalent", "pythagorean identity"],
  ["\\sin ( 2 x )", "2 \\sin ( x ) \\cos ( x )", "equivalent", "double angle"],
  ["\\sin ( 2 x )", "\\sin ( x ) \\cos ( x )", "rescaled", "dropped the 2 -- sin(2x)=2 sin x cos x, so this IS exactly a rescale"],

  // ---- fractions with radicals ----------------------------------------------
  ["\\sqrt{ x^{2} }", "x", "undetermined", "true only for x>=0 -- abstaining is correct"],
  ["\\frac{ 2 x }{ 4 }", "\\frac{ x }{ 2 }", "equivalent", "reduce fraction"],
  ["\\frac{ 2 x }{ 4 }", "\\frac{ x }{ 4 }", "rescaled", "reduced only the numerator"],
];

function bucket(v: ReturnType<typeof checkStep>): Want {
  if (v.kind === "equivalent") return "equivalent";
  if (v.kind === "direction") return "direction";
  if (v.kind === "rescaled") return "rescaled";
  if (v.kind === "undetermined") return "undetermined";
  return "caught";
}

let pass = 0;
const fails: string[] = [];

for (const [prevTex, nextTex, want, note] of CASES) {
  const prev = latexToMathjs(prevTex);
  const next = latexToMathjs(nextTex);
  const v = checkStep(prev, next);
  const got = bucket(v);
  const ok = got === want;
  if (ok) pass++;
  else fails.push(`  ${prevTex}  ->  ${nextTex}\n      bridge: ${JSON.stringify(prev)} -> ${JSON.stringify(next)}\n      got ${got}, want ${want}   (${note})${v.kind === "undetermined" ? `  [${v.why}]` : ""}`);
}

console.log(`${pass}/${CASES.length} correct\n`);
if (fails.length) {
  console.log("FAILURES:\n" + fails.join("\n\n"));
  process.exit(1);
}
console.log("Bridge + checker handle every Mathpix-shaped case in the corpus.");
