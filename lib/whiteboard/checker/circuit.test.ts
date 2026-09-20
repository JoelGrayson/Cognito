/**
 * Fixture table for the circuit checker: the sample sheet's circuits, and the lines a
 * learner would write under each. Run: node --experimental-strip-types lib/whiteboard/checker/circuit.test.ts
 */
import { checkCircuitLine, solveCircuit, stripUnits, type Circuit } from "./circuit.ts";
import { latexToMathjs } from "../ink.ts";
import key from "../../../fixtures/circuits/circuits-practice.key.json" with { type: "json" };

const circuits = key.circuits as (Circuit & { problem: number })[];
const by = (problem: number) => solveCircuit(circuits.find((c) => c.problem === problem)!);

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
let failures = 0;
function check(what: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
}

// --- solver -------------------------------------------------------------------
const q1 = by(1);
check("Q1 series: I = 12/6 = 2 A", near(q1.I, 2));
const q2 = by(2);
check("Q2 parallel: I1 = 2, I2 = 1, I = 3", near(q2.I1, 2) && near(q2.I2, 1) && near(q2.I, 3));
const q3 = by(3);
// Node a: (10-Va)/2 = Va/4 + (Va-4)/4  ->  20 - 2Va = Va + Va - 4  -> Va = 6
check("Q3 two loops: Va = 6, I1 = 2, I2 = 0.5, I3 = 1.5", near(q3.Va, 6) && near(q3.I1, 2) && near(q3.I2, 0.5) && near(q3.I3, 1.5));
const q4 = by(4);
// 3 = Va/4 + Va/4 -> Va = 6, Vb = 3
check("Q4 current source: Va = 6, Vb = 3", near(q4.Va, 6) && near(q4.Vb, 3));

// --- lines --------------------------------------------------------------------
const CASES: [number, string, string, string][] = [
  // [problem, line, expected kind, note]
  [1, "V1 - I*R1 - I*R2 = 0",   "holds",        "KVL round the loop"],
  [1, "12 = 4I + 2I",           "holds",        "KVL with values substituted"],
  [1, "I = 2",                  "holds",        "final answer"],
  [1, "I = 2A",                 "holds",        "final answer with a unit"],
  [1, "I = 2 \\mathrm{~A}",      "holds",        "final answer with a unit, as Mathpix writes it"],
  [1, "V_{1} - I R_{1} - I R_{2} = 0", "holds", "subscripts and implicit products, as Mathpix writes them"],
  [1, "12 \\mathrm{V} = I \\cdot 6 \\Omega", "holds", "every unit at once"],
  [1, "I_1 = 12/6",             "undetermined", "no such label on this diagram"],
  [1, "V1 + I*R1 - I*R2 = 0",   "sign",         "one drop written as a rise"],
  [1, "I = 3",                  "wrong-value",  "right method, wrong arithmetic"],
  [1, "12 = 4I + 2I + 3",       "not-holding",  "made-up term"],
  [1, "I > 0",                  "undetermined", "not an equation"],

  [2, "I = I1 + I2",            "holds",        "KCL at the top node"],
  [2, "I - I1 - I2 = 0",        "holds",        "KCL written as a sum to zero"],
  [2, "I + I1 - I2 = 0",        "sign",         "a current counted the wrong way"],
  [2, "I1 = V1/R1",             "holds",        "Ohm's law"],
  [2, "I1 = 6/3",               "holds",        "Ohm's law with values"],
  [2, "I2 = 2",                 "wrong-value",  "6/6 is 1, not 2"],
  [2, "I = 3",                  "holds",        "total current"],

  [3, "(10 - Va)/2 = Va/4 + (Va - 4)/4", "holds", "nodal analysis at a"],
  [3, "I1 = I2 + I3",           "holds",        "KCL at a"],
  [3, "10 - 2 I1 - 4 I3 = 0",   "holds",        "KVL left loop"],
  [3, "4 I3 - 4 I2 - 4 = 0",    "holds",        "KVL right loop"],
  [3, "4 I3 + 4 I2 - 4 = 0",    "sign",         "KVL right loop, V2 polarity wrong"],
  [3, "Va = 6",                 "holds",        "node voltage"],
  [3, "Va = 5.99",              "holds",        "rounded node voltage"],
  [3, "Va = 8",                 "wrong-value",  "wrong node voltage"],

  [4, "Is = Va/R1 + (Va - Vb)/R2", "holds",     "KCL at a"],
  [4, "(Va - Vb)/R2 = Vb/R3",   "holds",        "KCL at b"],
  [4, "3 = Va/4 + Va/4",        "holds",        "after the two 2Ω in series are combined"],
  [4, "Vb = 3 V",               "holds",        "node voltage with unit"],
  [4, "Vb = 6",                 "wrong-value",  "confused Va and Vb"],
];

for (const [problem, line, expected, note] of CASES) {
  const verdict = checkCircuitLine(stripUnits(latexToMathjs(line)), by(problem));
  check(`Q${problem} "${line}" -> ${verdict.kind} (${note})`, verdict.kind === (expected === "holds" ? "equivalent" : expected));
}

if (failures) {
  console.error(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");
