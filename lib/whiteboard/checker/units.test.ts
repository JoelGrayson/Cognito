/**
 * Unit-carrying steps: real chemistry and physics working.
 *   node --experimental-strip-types lib/whiteboard/checker/units.test.ts
 */
import { checkUnitStep, hasUnits, type UnitVerdict } from "./units.ts";

type Want = UnitVerdict["kind"];
let pass = 0, total = 0;
function t(prev: string | null, cur: string, want: Want, label: string) {
  total++;
  const v = checkUnitStep(prev, cur);
  const ok = v.kind === want;
  if (ok) pass++;
  const detail =
    v.kind === "value-mismatch" ? ` (${v.expected} -> ${v.got})`
    : v.kind === "dimension-mismatch" ? ` (${v.previous} vs ${v.current})`
    : v.kind === "equivalent" ? ` (${v.value})` : "";
  console.log(`${ok ? "ok  " : "FAIL"} ${v.kind.padEnd(18)}${detail.padEnd(26)} ${label}`);
}

console.log("--- chemistry: stoichiometry ---");
t("2 mol * 18 g/mol", "36 g", "equivalent", "mass from moles");
t("2 mol * 18 g/mol", "36 mol", "dimension-mismatch", "*** answered in mol, not g ***");
t("2 mol * 18 g/mol", "9 g", "value-mismatch", "divided instead of multiplied");
t("0.5 mol / 18 g/mol", "0.0278 mol^2/g", "dimension-mismatch", "*** inverted molar mass: the DIMENSIONS go wrong, not just the number ***");

console.log("\n--- chemistry: concentration and conversion ---");
t("5 mol/L * 2 L", "10 mol", "equivalent", "moles from molarity");
t("5 mol/L * 250 mL", "1.25 mol", "equivalent", "mL handled without a manual conversion");
t("5 mol/L * 250 mL", "1250 mol", "value-mismatch", "*** forgot to convert mL to L ***");
t("250 mL", "0.25 L", "equivalent", "the conversion itself");

console.log("\n--- physics: kinematics and forces ---");
t("2 kg * 3 m/s^2", "6 N", "equivalent", "F = ma, and it knows kg*m/s^2 is a newton");
t("2 kg * 3 m/s^2", "6 kg*m/s", "dimension-mismatch", "*** momentum units on a force ***");
t("(10 m/s)^2 + 2 * (2 m/s^2) * (5 m)", "120 m^2/s^2", "equivalent", "v^2 = u^2 + 2as");
t("0.5 * 4 kg * (3 m/s)^2", "18 J", "equivalent", "kinetic energy in joules");
t("0.5 * 4 kg * (3 m/s)^2", "18 N", "dimension-mismatch", "energy answered as a force");

console.log("\n--- a single step that cannot be true ---");
t(null, "5 m + 3 s", "incoherent", "*** adding a length to a time ***");
t(null, "2 kg * 3 m/s^2", "equivalent", "a coherent lone step is fine");

console.log("\n--- routing: which checker should take the step? ---");
for (const [e, want] of [["2 mol * 18 g/mol", true], ["5 mol/L * 2 L", true], ["2*x + 3 = 7", false], ["m*x + c", false], ["sin(2*x)", false]] as [string, boolean][]) {
  total++;
  const got = hasUnits(e);
  if (got === want) pass++;
  console.log(`${got === want ? "ok  " : "FAIL"} hasUnits(${JSON.stringify(e)}) = ${got}`);
}

console.log(`\n${pass}/${total} correct`);
if (pass !== total) process.exit(1);
