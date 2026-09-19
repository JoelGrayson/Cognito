/**
 * Locating the operator. Pure geometry + string indexing, so it's fully testable
 * without a pen. The realistic case is modelled on the actual line the user wrote:
 * "-2x > 6", six strokes, the ">" fifth.
 *
 *   node --experimental-strip-types lib/whiteboard/locate.test.ts
 */
import { operatorFraction, strokeNearFraction, locateOperator } from "./locate.ts";
import { boundsOf, type TimedStroke, type Bounds } from "./strokes.ts";

function s(x: number, w = 22, y = 100, h = 30): TimedStroke {
  const pts = [{ x, y }, { x: x + w, y: y + h }];
  return { id: `s${x}`, startedAt: 0, endedAt: null, points: pts, bounds: boundsOf(pts) };
}

let pass = 0, total = 0;
function check(label: string, got: unknown, want: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
}

// ---- finding the operator in the string ------------------------------------
check("no operator -> null", operatorFraction("2x+6"), null);
{
  total++;
  // "-2x>6": chars are - 2 x > 6, so ">" is index 3 of 5 -> (3+0.5)/5 = 0.7
  const f = operatorFraction("-2 x>6");
  const ok = f !== null && Math.abs(f - 0.7) < 1e-9;
  if (ok) pass++;
  console.log(`${ok ? "ok  " : "FAIL"} "-2 x>6" puts ">" at 0.70 across the line  (got ${f})`);
}
{
  total++;
  const f = operatorFraction("3x \\leq 12");
  const ok = f !== null && f > 0.2 && f < 0.6;
  if (ok) pass++;
  console.log(`${ok ? "ok  " : "FAIL"} "\\leq" is found and lands mid-line  (got ${f?.toFixed(2)})`);
}

// ---- snapping to real ink ---------------------------------------------------
{
  // "-2x > 6" as six strokes left to right; the ">" is the fifth, near x=200.
  const strokes = [s(20), s(55), s(95), s(110), s(200), s(250)];
  const line: Bounds = { minX: 20, minY: 100, maxX: 272, maxY: 130 };
  const got = strokeNearFraction(strokes, line, 0.7);
  check("fraction 0.70 snaps to the '>' stroke at x=200", [got.minX, got.maxX], [200, 222]);

  const whole = locateOperator(strokes, "-2 x>6");
  check("locateOperator returns that same stroke, not the whole line", whole && [whole.minX, whole.maxX], [200, 222]);
}
check("no operator -> null, caller falls back to circling the line",
  locateOperator([s(20), s(55)], "2x+6"), null);
check("no strokes -> null", locateOperator([], "x>3"), null);

console.log(`\n${pass}/${total} correct`);
if (pass !== total) process.exit(1);
