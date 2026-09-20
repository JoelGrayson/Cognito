/**
 * Balancing chemical equations.
 *   node --experimental-strip-types lib/whiteboard/checker/equation.test.ts
 */
import { parseFormula, checkBalance, describeBalance, isChemicalEquation } from "./equation.ts";

let pass = 0, total = 0;
function eq(label: string, got: unknown, want: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`}`);
}
function bal(equation: string, want: string, label: string) {
  total++;
  const v = checkBalance(equation);
  const ok = v.kind === want;
  if (ok) pass++;
  console.log(`${ok ? "ok  " : "FAIL"} ${v.kind.padEnd(16)} ${describeBalance(v).padEnd(34)} ${label}`);
}

console.log("--- reading formulas ---");
eq("Fe2O3", parseFormula("Fe2O3"), { Fe: 2, O: 3 });
eq("Ca(OH)2  (nested group)", parseFormula("Ca(OH)2"), { Ca: 1, O: 2, H: 2 });
eq("Fe2(SO4)3", parseFormula("Fe2(SO4)3"), { Fe: 2, S: 3, O: 12 });
eq("CuSO4·5H2O  (hydrate)", parseFormula("CuSO4·5H2O"), { Cu: 1, S: 1, O: 9, H: 10 });
eq("Fe₂O₃  (unicode subscripts)", parseFormula("Fe₂O₃"), { Fe: 2, O: 3 });
eq("NaCl", parseFormula("NaCl"), { Na: 1, Cl: 1 });

console.log("\n--- balancing ---");
bal("Fe2O3 + 3C -> 2Fe + 3CO", "balanced", "iron oxide reduction, balanced");
bal("Fe2O3 + C -> Fe + CO2", "unbalanced", "*** the unbalanced version a student writes ***");
bal("2H2 + O2 -> 2H2O", "balanced", "the canonical one");
bal("H2 + O2 -> H2O", "unbalanced", "*** classic: oxygen is off ***");
bal("CH4 + 2O2 -> CO2 + 2H2O", "balanced", "methane combustion");
bal("CH4 + O2 -> CO2 + H2O", "unbalanced", "combustion, uncoefficiented");
bal("2Na + Cl2 -> 2NaCl", "balanced", "salt");
bal("Na + Cl2 -> NaCl", "unbalanced", "sodium and chlorine both off");
bal("Ca(OH)2 + 2HCl -> CaCl2 + 2H2O", "balanced", "with a nested group");
bal("Fe2O3 + 3CO -> 2Fe + 3CO2", "balanced", "blast furnace");
bal("2Fe + O2 -> Fe2O3", "unbalanced", "oxygen is on both sides, just not conserved");
bal("Fe2O3 + 3C -> 2Fe", "missing-species", "*** carbon vanished: a species is missing entirely ***");

console.log("\n--- what the learner is actually told ---");
{
  const v = checkBalance("H2 + O2 -> H2O");
  total++;
  const said = describeBalance(v);
  const ok = said.includes("O") && said.includes("2") && said.includes("1");
  if (ok) pass++;
  console.log(`${ok ? "ok  " : "FAIL"} names the element and both counts: "${said}"`);
}

console.log("\n--- routing ---");
for (const [s, want] of [["Fe2O3 + C -> Fe + CO2", true], ["2H2 + O2 -> 2H2O", true], ["2x + 3 = 7", false], ["y = m*x + c", false]] as [string, boolean][]) {
  total++;
  const got = isChemicalEquation(s);
  if (got === want) pass++;
  console.log(`${got === want ? "ok  " : "FAIL"} isChemicalEquation(${JSON.stringify(s)}) = ${got}`);
}

console.log(`\n${pass}/${total} correct`);
if (pass !== total) process.exit(1);
