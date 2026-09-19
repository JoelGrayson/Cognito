/**
 * Line-break geometry. Unlike handwriting recognition, this IS synthesizable --
 * it's pure geometry over stroke bounds, no model involved. So it gets a real
 * fixture table covering the notation that would fool a naive rule.
 *
 *   node --experimental-strip-types lib/whiteboard/strokes.test.ts
 */
import { startsNewLine, boundsOf, type TimedStroke, type Bounds } from "./strokes.ts";

/** A stroke occupying a box, starting at its top-left. */
function stroke(x: number, y: number, w = 20, h = 24): TimedStroke {
  const points = [
    { x, y },
    { x: x + w / 2, y: y + h / 2 },
    { x: x + w, y: y + h },
  ];
  return { id: "s", startedAt: 0, endedAt: null, points, bounds: boundsOf(points) };
}

// A written line of math: "2x + 3 = 7" occupying x 50..300, y 100..130.
const LINE: Bounds = { minX: 50, minY: 100, maxX: 300, maxY: 130 };

const CASES: [string, TimedStroke, boolean][] = [
  ["next line, back at the left margin",        stroke(55, 165),        true],
  ["next line, slightly indented",              stroke(70, 170),        true],
  ["next line far below",                       stroke(50, 260),        true],

  // These are the ones a naive vertical-only rule gets wrong.
  ["fraction denominator (below, NOT at margin)", stroke(200, 138),     false],
  ["denominator further down but still mid-line", stroke(210, 160),     false],

  // These are the ones a naive horizontal-only rule gets wrong.
  ["writing '=' after a long term (right, level)", stroke(310, 104),    false],
  ["continuing the same line rightward",           stroke(305, 110),    false],

  // Ordinary within-line notation.
  ["subscript just below-right",                 stroke(305, 128),      false],
  ["superscript above-right",                    stroke(305, 92),       false],
  ["second stroke of a letter, same height",     stroke(60, 104),       false],
  ["crossing a 't' mid-line",                    stroke(120, 102, 12, 4), false],
];

let pass = 0;
const fails: string[] = [];
for (const [label, s, want] of CASES) {
  const got = startsNewLine(LINE, s);
  if (got === want) pass++;
  else fails.push(`  ${label}: got ${got}, want ${want}  (stroke starts at ${s.points[0].x},${s.points[0].y})`);
  console.log(`${got === want ? "ok  " : "FAIL"}  ${String(want).padEnd(5)} ${label}`);
}

// A degenerate first line (a single dot) must not make everything after it a new line.
const DOT: Bounds = { minX: 100, minY: 100, maxX: 102, maxY: 102 };
const nearDot = startsNewLine(DOT, stroke(104, 101));
console.log(`${nearDot === false ? "ok  " : "FAIL"}  false continuing next to a single-dot line (minLineHeight guard)`);
if (nearDot === false) pass++; else fails.push("  single-dot line guard failed");

console.log(`\n${pass}/${CASES.length + 1} correct`);
if (fails.length) { console.log("\nFAILURES:\n" + fails.join("\n")); process.exit(1); }
