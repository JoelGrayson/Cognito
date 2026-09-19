/**
 * DEMO SCENARIOS — every line pair we might write in front of a judge, checked before
 * anyone picks up a pen.
 *
 * Why this file exists: "-2x > 6" is one case. A demo needs range (so it doesn't look
 * like three hardcoded rules) and it needs certainty (so nothing surprises you on
 * stage). Each scenario names what to write, which verdict it must produce, and what
 * the whiteboard should visibly do.
 *
 *   node --experimental-strip-types scripts/scenarios.ts
 */
import { latexToMathjs } from "../lib/whiteboard/ink.ts";
import { checkStep, type Equivalence } from "../lib/whiteboard/checker/numeric.ts";
import { marksFor } from "../lib/whiteboard/marks.ts";
import type { HintLevel } from "../lib/whiteboard/policy.ts";

type Kind = Equivalence["kind"];

interface Scenario {
  /** Shown to the presenter. */
  name: string;
  /** Write these lines, in order, one under the other. */
  write: string[];
  /** Verdict expected for the LAST line, checked against the one before it. */
  expect: Kind;
  /** Why this one is worth showing. */
  beat: string;
}

export const SCENARIOS: Scenario[] = [
  // ---- the headline: a deterministic catch, no model involved ---------------
  {
    name: "The sign flip",
    write: ["-2x > 6", "x > -3"],
    expect: "direction",
    beat: "The canonical algebra mistake. Caught in 0.03ms with zero tokens, and the verdict names the misconception rather than just saying 'wrong'.",
  },
  {
    name: "The sign flip, done right",
    write: ["-2x > 6", "x < -3"],
    expect: "equivalent",
    beat: "Same setup, correct answer: total silence. Proves it isn't just pattern-matching on the shape of the problem.",
  },

  // ---- range: not three hardcoded rules ------------------------------------
  {
    name: "Dropped a term",
    write: ["5x - 2 = 3x + 8", "2x - 2 = 8 + 3x"],
    expect: "not-equivalent",
    beat: "Moved a term but left it behind. Comes with a counterexample: 'at x=-4.5 your line gives -5.5, the previous gives -18.9'.",
  },
  {
    name: "Distribution error",
    write: ["3(x + 2) = 12", "3x + 2 = 12"],
    expect: "not-equivalent",
    beat: "Forgot to distribute over the second term.",
  },
  {
    name: "Scaled an expression",
    write: ["2(x + 3)", "x + 3"],
    expect: "rescaled",
    beat: "You may scale both sides of an EQUATION, never a lone expression. Distinct verdict, so the mark is a strikethrough instead of a circle.",
  },
  {
    name: "Bad factoring",
    write: ["x^2 - 1 = 0", "(x-1)^2 = 0"],
    expect: "not-equivalent",
    beat: "Difference of squares mis-factored.",
  },
  {
    name: "Correct factoring",
    write: ["x^2 + 5x + 6 = 0", "(x+2)(x+3) = 0"],
    expect: "equivalent",
    beat: "Silence again — and note it verified a factorisation without a CAS.",
  },

  // ---- the range slide: it isn't only algebra ------------------------------
  {
    name: "Trig identity",
    write: ["\\sin(2x)", "2\\sin(x)\\cos(x)"],
    expect: "equivalent",
    beat: "Double-angle identity, verified numerically. Same 24 random points, no special case.",
  },
  {
    name: "Trig identity, dropped a factor",
    write: ["\\sin(2x)", "\\sin(x)\\cos(x)"],
    expect: "rescaled",
    beat: "Off by exactly 2 — and the verdict says 'rescaled by 2.00', which is precisely what went wrong.",
  },
  {
    name: "Log rule",
    write: ["\\log(x) + \\log(3)", "\\log(3x)"],
    expect: "equivalent",
    beat: "Products become sums. Still no CAS.",
  },
  {
    name: "Log rule, misapplied",
    write: ["\\log(x) + \\log(3)", "\\log(x + 3)"],
    expect: "not-equivalent",
    beat: "The mistake every student makes once.",
  },

  // ---- a subtle one most tools miss ----------------------------------------
  {
    name: "The absolute-value trap",
    write: ["\\sqrt{x^2}", "x"],
    expect: "not-equivalent",
    beat: "sqrt(x^2) is |x|, not x. Caught because the prober samples NEGATIVE values too — a symbolic simplifier would happily agree with the student here.",
  },

  // ---- abstention: the safety property -------------------------------------
  {
    name: "It abstains rather than accuse",
    write: ["2x = 4", "y = 2"],
    expect: "undetermined",
    beat: "The variable changed, so it probably misread the handwriting. It says 'I can't tell' and stays SILENT — abstention never becomes an accusation.",
  },
];

// ---------------------------------------------------------------------------
let pass = 0;
const fails: string[] = [];

for (const s of SCENARIOS) {
  const parsed = s.write.map(latexToMathjs);
  let verdict: Equivalence = { kind: "equivalent", scale: 1 };
  for (let i = 1; i < parsed.length; i++) verdict = checkStep(parsed[i - 1], parsed[i]);

  const ok = verdict.kind === s.expect;
  if (ok) pass++;
  else fails.push(`  ${s.name}: got ${verdict.kind}, want ${s.expect}\n      ${JSON.stringify(parsed)}`);

  const marks = marksFor(verdict, 1, 4 as HintLevel);
  console.log(
    `${ok ? "ok  " : "FAIL"} ${s.name.padEnd(30)} ${verdict.kind.padEnd(15)} ${
      marks.length ? marks.map((m) => m.kind).join("+") : "(no marks — silence)"
    }`,
  );
}

console.log(`\n${pass}/${SCENARIOS.length} scenarios behave as scripted`);
if (fails.length) {
  console.log("\nFAILURES:\n" + fails.join("\n"));
  process.exit(1);
}
