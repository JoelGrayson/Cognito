/**
 * The bridge: SVG board strokes -> lines -> the right checker -> a block the tutor reads.
 *   node --experimental-strip-types lib/whiteboard/board-bridge.test.ts
 */
import { groupIntoLines, payloadFor, checkLine, describeLearnerWork, type FlatStroke } from "./board-bridge.ts";

let pass = 0, total = 0;
function check(label: string, got: unknown, want: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`}`);
}
/** A stroke as a box, in board coordinates. */
const s = (id: string, x: number, y: number, w = 40, h = 30): FlatStroke => ({
  id,
  points: [x, y, x + w / 2, y + h / 2, x + w, y + h],
});

console.log("--- grouping strokes into written lines ---");
{
  // Two lines of working, the second starting below and back at the margin.
  const lines = groupIntoLines([s("a", 100, 100), s("b", 160, 100), s("c", 220, 100), s("d", 102, 190), s("e", 165, 190)]);
  check("two lines", lines.map((l) => l.length), [3, 2]);
}
{
  // Writing rightwards is the SAME line, not a new one.
  const lines = groupIntoLines([s("a", 100, 100), s("b", 160, 100), s("c", 220, 100), s("d", 300, 100)]);
  check("rightward continuation stays one line", lines.length, 1);
}
{
  // The second stroke of an "x" must not split the line.
  const lines = groupIntoLines([s("a", 100, 100), s("b", 140, 100, 30, 34), s("c", 142, 102, -28, 30)]);
  check("a two-stroke character does not split", lines.length, 1);
}
check("no strokes -> no lines", groupIntoLines([]).length, 0);

console.log("\n--- Mathpix payload shape ---");
{
  const [line] = groupIntoLines([s("a", 10, 20, 4, 6)]);
  check("x/y arrays, one per stroke", payloadFor(line), { strokes: { x: [[10, 12, 14]], y: [[20, 23, 26]] } });
}

console.log("\n--- routing each line to the right checker ---");
check("algebra: legal step", checkLine("2*x + 3 = 7", "2*x = 4").verdict, "equivalent");
check("algebra: sign flip", checkLine("-2*x > 6", "x > -3").verdict, "direction");
check("chemistry: unbalanced", checkLine(null, "H2 + O2 -> H2O").verdict, "unbalanced");
check("chemistry: balanced", checkLine(null, "2H2 + O2 -> 2H2O").verdict, "balanced");
check("units: dimensions wrong", checkLine("2 kg * 3 m/s^2", "6 kg*m/s").verdict, "dimension-mismatch");
check("units: correct", checkLine("2 mol * 18 g/mol", "36 g").verdict, "equivalent");

console.log("\n--- what the tutor is handed ---");
{
  const block = describeLearnerWork([
    { index: 0, latex: "2x + 3 = 7", parsed: "2*x + 3 = 7", confidence: 1, verdict: "equivalent", detail: "" },
    { index: 1, latex: "2x = 10", parsed: "2*x = 10", confidence: 1, verdict: "not-equivalent", detail: "at x=0.61 the line above gives -2.77, this gives -8.77" },
  ]);
  total++;
  const ok =
    block.includes('"2x = 10"') &&
    block.includes("DOES NOT FOLLOW") &&
    block.includes("do not re-derive");
  if (ok) pass++;
  console.log(`${ok ? "ok  " : "FAIL"} names the line, the verdict, and forbids re-deriving it`);
  console.log(block.split("\n").map((l) => "        " + l).join("\n"));
}
check("nothing written -> nothing appended", describeLearnerWork([]), "");

console.log(`\n${pass}/${total} correct`);
if (pass !== total) process.exit(1);
