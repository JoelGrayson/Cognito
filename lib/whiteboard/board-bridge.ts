/**
 * Lets the call tutor READ the learner's handwriting instead of guessing at it.
 *
 * Today `describeBoard` hands the model raw coordinates —
 *   LEARNER stroke you1 (blue): (120,340) (128,352) ...
 * — and the system prompt tells it "hand drawing is wobbly: interpret generously".
 * So the tutor is being asked to be charitable about a point cloud. It cannot read
 * the working, and it certainly cannot tell whether the algebra is right.
 *
 * This groups those strokes into lines, has them recognised, checks each line
 * against the one above it, and produces a block the tutor can be given alongside
 * the coordinates. The tutor then knows exactly what was written AND whether it
 * follows — while the deterministic verdict stays out of the model's hands.
 *
 * Board space is 1000x600 (see lib/board.ts), so the geometry thresholds are tuned
 * for that, not for a tldraw canvas.
 */
import { startsNewLine, boundsOf, mergeBounds, type Bounds, type TimedStroke } from "./strokes.ts";
import { checkStep, type Equivalence } from "./checker/numeric.ts";
import { checkBalance, isChemicalEquation, describeBalance } from "./checker/equation.ts";
import { checkUnitStep, hasUnits, describeUnitVerdict } from "./checker/units.ts";
import { latexToMathjs, isMultiLineReading } from "./ink.ts";

/** A learner stroke as the SVG board stores it: a flat [x,y,x,y,...] list. */
export interface FlatStroke {
  id: string;
  points: number[];
}

/** Board coordinates are ~1000x600, so a "line" is wider and shorter than on a tablet. */
const BOARD_ENDPOINT = {
  belowRatio: 0.75,
  carriageReturnRatio: 0.35,
  minLineHeight: 14,
  minStrokesForBreak: 2,
  minLineWidthForBreak: 45,
  minStrokesForIdleCommit: 2,
  settleAfterIdleMs: 0,
  finalLineIdleMs: 0,
};

function toTimed(s: FlatStroke): TimedStroke | null {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < s.points.length; i += 2) pts.push({ x: s.points[i], y: s.points[i + 1] });
  if (pts.length === 0) return null;
  return { id: s.id, startedAt: 0, endedAt: null, points: pts, bounds: boundsOf(pts) };
}

/**
 * Split strokes into written lines, reusing the same geometry the tablet whiteboard
 * uses: a new line starts when a stroke drops BELOW the current line and returns
 * toward the left margin. Requiring both is what stops a fraction denominator or
 * the second stroke of an "x" from starting a phantom line.
 */
export function groupIntoLines(strokes: readonly FlatStroke[]): TimedStroke[][] {
  const lines: TimedStroke[][] = [];
  let line: TimedStroke[] = [];
  let bounds: Bounds | null = null;

  for (const raw of strokes) {
    const stroke = toTimed(raw);
    if (!stroke) continue;
    if (
      line.length >= BOARD_ENDPOINT.minStrokesForBreak &&
      bounds &&
      startsNewLine(bounds, stroke, BOARD_ENDPOINT)
    ) {
      lines.push(line);
      line = [];
      bounds = null;
    }
    line.push(stroke);
    bounds = bounds ? mergeBounds(bounds, stroke.bounds) : stroke.bounds;
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

/** Mathpix wire format for one line. */
export function payloadFor(line: readonly TimedStroke[]) {
  const x: number[][] = [];
  const y: number[][] = [];
  for (const s of line) {
    if (s.points.length === 0) continue;
    x.push(s.points.map((p) => Math.round(p.x)));
    y.push(s.points.map((p) => Math.round(p.y)));
  }
  return x.length > 0 ? { strokes: { x, y } } : null;
}

export interface LineReading {
  index: number;
  latex: string;
  parsed: string;
  confidence: number | null;
  /** Whichever checker applies to this line. */
  verdict: string;
  detail: string;
}

/**
 * Route a line to the checker that understands it. Chemistry first (an arrow plus
 * element symbols is unambiguous), then units, then algebra — algebra is the
 * fallback because random-point probing is meaningless for "2 mol" or "Fe2O3".
 */
export function checkLine(previous: string | null, current: string): { verdict: string; detail: string } {
  if (isChemicalEquation(current)) {
    const v = checkBalance(current);
    return { verdict: v.kind, detail: describeBalance(v) };
  }
  if (hasUnits(current)) {
    const v = checkUnitStep(previous, current);
    return { verdict: v.kind, detail: describeUnitVerdict(v) };
  }
  const v: Equivalence = checkStep(previous, current);
  const detail =
    v.kind === "direction" ? `should have flipped to "${v.expected}"`
    : v.kind === "rescaled" ? `the value changed by a factor of ${v.by.toFixed(2)}`
    : v.kind === "not-equivalent"
      ? `at ${v.witness.variable}=${v.witness.at.toFixed(2)} the line above gives ${v.witness.previousValue.toFixed(2)}, this gives ${v.witness.currentValue.toFixed(2)}`
      : v.kind === "undetermined" ? v.why : "";
  return { verdict: v.kind, detail };
}

/**
 * The block appended to the board description. Deliberately states the verdict as
 * settled fact and tells the tutor not to re-derive it: the checker is
 * deterministic and the model is not, so letting it disagree would make the tutor
 * confidently wrong about arithmetic it never needed to do.
 */
export function describeLearnerWork(readings: readonly LineReading[]): string {
  if (readings.length === 0) return "";
  const lines = readings.map((r) => {
    const ok = r.verdict === "equivalent" || r.verdict === "balanced";
    const note = ok
      ? "follows"
      : r.verdict === "undetermined"
        ? `could not be checked (${r.detail})`
        : `DOES NOT FOLLOW - ${r.verdict}${r.detail ? `: ${r.detail}` : ""}`;
    const shaky = r.confidence !== null && r.confidence < 0.6 ? " [read with low confidence]" : "";
    return `  line ${r.index + 1}: "${r.latex}"${shaky} - ${note}`;
  });
  return [
    "",
    "WHAT THE LEARNER ACTUALLY WROTE (recognised from their strokes, and checked",
    "deterministically - treat these verdicts as settled and do not re-derive them):",
    ...lines,
  ].join("\n");
}

/**
 * Read and check everything the learner has written. Client-side: one recognition
 * request per line, run together, then each line checked against the one above it.
 *
 * Returns [] when nothing is legible rather than throwing, because this runs inside
 * the tutor's turn loop — a recognition failure should cost the tutor its READING,
 * not the turn.
 */
export async function readLearnerWork(strokes: readonly FlatStroke[]): Promise<LineReading[]> {
  const lines = groupIntoLines(strokes);
  if (lines.length === 0) return [];

  const recognised = await Promise.all(
    lines.map(async (line): Promise<{ latex: string; confidence: number | null } | null> => {
      const payload = payloadFor(line);
      if (!payload) return null;
      try {
        const res = await fetch("/api/whiteboard/strokes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const latex: string = data.latex || data.text || "";
        // Several lines read as one means the grouping was wrong; a multi-line blob
        // must never become the premise for the next line's check.
        if (!latex || isMultiLineReading(latex)) return null;
        return { latex, confidence: data.confidence ?? null };
      } catch {
        return null;
      }
    }),
  );

  const readings: LineReading[] = [];
  let previous: string | null = null;
  for (const [index, r] of recognised.entries()) {
    if (!r) continue;
    const parsed = latexToMathjs(r.latex);
    const { verdict, detail } = checkLine(previous, parsed);
    readings.push({ index, latex: r.latex, parsed, confidence: r.confidence, verdict, detail });
    // Only a line we trust becomes the premise for the next one. Judging good work
    // against a misread line produces an accusation caused by our own OCR.
    if (r.confidence === null || r.confidence >= 0.6) previous = parsed;
  }
  return readings;
}
