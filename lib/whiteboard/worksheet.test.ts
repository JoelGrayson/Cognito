/**
 * Worksheet anchoring. The printed lines here are in the shape Mathpix v3/text
 * returns them: prose with the maths wrapped in \( ... \).
 *
 *   node --experimental-strip-types lib/whiteboard/worksheet.test.ts
 */
import { anchorsFrom, mathFromPrintedLine, premiseFor, problemFor, type PriorStep } from "./worksheet.ts";
import type { Bounds } from "./strokes.ts";

let pass = 0, total = 0;
function check(label: string, got: unknown, want: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `   (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
}
const box = (minX: number, minY: number, maxX: number, maxY: number): Bounds => ({ minX, minY, maxX, maxY });

check("numbered inequality", mathFromPrintedLine("1. Solve \\( -2 x>6 \\)"), "-2*x>6");
check("relation wins over the 'for x'", mathFromPrintedLine("Solve \\( 2 x+3=11 \\) for \\( x \\)"), "2*x+3=11");
check("expression to simplify", mathFromPrintedLine("3. Simplify \\( 3(x+2) \\)"), "3*(x+2)");
check("undelimited relation", mathFromPrintedLine("2) 3x + 2 = 11"), "3*x + 2 = 11");
check("prose is not a problem", mathFromPrintedLine("Name: ________"), null);
check("a lone variable is not a problem", mathFromPrintedLine("Solve each for \\( x \\)."), null);
check("two problems on one row", mathFromPrintedLine("1. \\( 2x=4 \\)   2. \\( 3x=9 \\)"), null);

const anchors = anchorsFrom([
  { text: "Name: ________", bounds: box(50, 20, 300, 40) },
  { text: "2. \\( 3x+2=11 \\)", bounds: box(50, 400, 250, 430) },
  { text: "1. \\( -2x>6 \\)", bounds: box(50, 100, 250, 130) },
  { text: "3. \\( x-1=0 \\)", bounds: box(450, 100, 650, 130) },
  { text: "4. \\( 2x=4 \\)   5. \\( 3x=9 \\)", bounds: box(50, 700, 650, 730) },
]);
check("anchors: prose dropped, numbered top to bottom", anchors.map((a) => [a.id, a.parsed]), [
  [-1, "-2*x>6"],
  [-2, "x-1=0"],
  [-3, "3*x+2=11"],
  [-4, null],
]);

check("working beneath problem 1", problemFor(box(60, 150, 200, 180), anchors)?.parsed, "-2*x>6");
check("working beside problem 1", problemFor(box(270, 102, 400, 128), anchors)?.parsed, "-2*x>6");
check("working in the right column", problemFor(box(460, 150, 600, 180), anchors)?.parsed, "x-1=0");
check("working beneath problem 2", problemFor(box(60, 450, 200, 480), anchors)?.parsed, "3*x+2=11");
check("working beneath the ambiguous row", problemFor(box(60, 750, 200, 780), anchors)?.id, -4);
check("above every problem", problemFor(box(60, 0, 200, 10), anchors), null);
check("blank canvas", problemFor(box(60, 150, 200, 180), []), null);

const steps: PriorStep[] = [
  { lineId: 0, problemId: -1, parsed: "x>-3", confidence: 0.9 },
  { lineId: 1, problemId: -3, parsed: "3*x=9", confidence: 0.9 },
  { lineId: 2, problemId: -3, parsed: "x=8", confidence: 0.2 },
];
check("first line of a problem follows from the print", premiseFor([], 0, anchors[0], 0.5), { text: "-2*x>6", lineId: -1 });
check("later line follows from the same problem, skipping a misread", premiseFor(steps, 3, anchors[2], 0.5), { text: "3*x=9", lineId: 1 });
check("never from another problem's working", premiseFor(steps, 3, anchors[1], 0.5), { text: "x-1=0", lineId: -2 });
check("ambiguous print offers no premise", premiseFor(steps, 3, anchors[3], 0.5), null);
check("blank canvas: previous line", premiseFor([{ lineId: 0, problemId: null, parsed: "2*x=4", confidence: null }], 1, null, 0.5), { text: "2*x=4", lineId: 0 });
check("blank canvas: first line", premiseFor([], 0, null, 0.5), null);

console.log(`\n${pass}/${total} correct`);
if (pass !== total) process.exit(1);
