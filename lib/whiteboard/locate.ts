/**
 * Find WHERE in a line a particular symbol was written.
 *
 * Mathpix returns the LaTeX for a set of strokes but no per-symbol coordinates, so
 * circling the ">" in "-2x > 6" means locating it ourselves.
 *
 * Two steps, and the second is what keeps it honest:
 *   1. ESTIMATE from the string. Handwriting runs left to right at roughly even
 *      spacing, so a symbol at character i of n sits near minX + (i/n) * width.
 *   2. SNAP to the nearest real stroke. The estimate alone would put a circle on
 *      empty canvas whenever the spacing is uneven; snapping guarantees the mark
 *      lands on ink the learner actually made, which reads as deliberate even when
 *      the estimate is a little off.
 *
 * Deliberately NOT a model call: this runs on every wrong step and needs to be free.
 */
import type { Bounds, TimedStroke } from "./strokes.ts";
import { boundsOf } from "./strokes.ts";

/** Strip LaTeX markup so character positions track what was actually written. */
function visibleChars(latex: string): string {
  return latex
    .replace(/\\left|\\right|\\,|\;|\\!/g, "")
    .replace(/\\(?:text|mathrm|operatorname)\s*\{([^{}]*)\}/g, "$1")
    .replace(/[{}$]/g, "")
    .replace(/\s+/g, "");
}

/**
 * Where does the relational operator sit, as a fraction across the line (0..1)?
 * Returns null when there isn't one.
 */
export function operatorFraction(latex: string): number | null {
  const chars = visibleChars(latex);
  if (chars.length === 0) return null;

  // \leq and \geq survive as words; check those first so the index is the symbol's.
  const named = chars.match(/\\(leq|geq|neq|lt|gt)/);
  const idx = named ? named.index! : chars.search(/[<>=≤≥]/);
  if (idx < 0) return null;

  // Centre of the glyph, not its left edge.
  return (idx + 0.5) / chars.length;
}

/**
 * Bounds of the stroke nearest a horizontal fraction across the line.
 * Returns the whole line when there are no strokes to snap to.
 */
export function strokeNearFraction(
  strokes: readonly TimedStroke[],
  line: Bounds,
  fraction: number,
): Bounds {
  if (strokes.length === 0) return line;
  const targetX = line.minX + (line.maxX - line.minX) * fraction;

  let best = strokes[0];
  let bestDist = Infinity;
  for (const s of strokes) {
    const centre = (s.bounds.minX + s.bounds.maxX) / 2;
    const d = Math.abs(centre - targetX);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best.bounds;
}

/**
 * Bounds of the relational operator in a written line, or null if we can't tell.
 * `null` is a real answer -- the caller falls back to circling the whole line, which
 * is a lower rung anyway, so being unsure degrades gracefully instead of pointing at
 * the wrong symbol.
 */
export function locateOperator(
  strokes: readonly TimedStroke[],
  latex: string,
): Bounds | null {
  const f = operatorFraction(latex);
  if (f === null || strokes.length === 0) return null;
  const line = strokes.map((s) => s.bounds).reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }));
  return strokeNearFraction(strokes, line, f);
}

export { boundsOf };
