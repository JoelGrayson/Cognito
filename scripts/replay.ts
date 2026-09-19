/**
 * Replay every captured reading through the LaTeX bridge and the checker.
 * No network, no Mathpix, no tablet, no human. Run after changing latexToMathjs()
 * or numeric.ts to see what you broke or fixed.
 *
 *   node --experimental-strip-types scripts/replay.ts
 */
import { loadFixtures } from "../lib/whiteboard/fixtures.ts";
import { latexToMathjs } from "../lib/whiteboard/ink.ts";
import { checkStep } from "../lib/whiteboard/checker/numeric.ts";

const fixtures = await loadFixtures();
if (fixtures.length === 0) {
  console.log("No fixtures yet. Write on /spike and press Read to capture some.");
  process.exit(0);
}

console.log(`${fixtures.length} captured readings\n`);

let parseFailures = 0;
let previous: string | null = null;

for (const [i, f] of fixtures.entries()) {
  const raw = f.latex || f.text;
  const parsed = latexToMathjs(raw);
  const verdict = checkStep(previous, parsed);

  // A reading the bridge can't turn into something parseable is the most actionable
  // failure here -- it means latexToMathjs needs another case.
  const unparseable = verdict.kind === "undetermined" && verdict.why.includes("parse");
  if (unparseable) parseFailures++;

  const conf = f.confidence !== null ? f.confidence.toFixed(2) : "?";
  console.log(
    `${String(i + 1).padStart(3)}  ${f.ms}ms conf=${conf}  ${JSON.stringify(raw)}\n` +
      `     -> ${JSON.stringify(parsed)}\n` +
      `     vs previous: ${verdict.kind}${
        verdict.kind === "direction"
          ? ` (expected "${verdict.expected}", got "${verdict.got}")`
          : verdict.kind === "undetermined"
            ? ` -- ${verdict.why}`
            : ""
      }${unparseable ? "   <-- BRIDGE GAP" : ""}\n`,
  );
  previous = parsed;
}

console.log(`\n${fixtures.length - parseFailures}/${fixtures.length} readings produced a parseable expression.`);
if (parseFailures > 0) {
  console.log(`${parseFailures} need a new case in latexToMathjs() -- see "BRIDGE GAP" above.`);
}
