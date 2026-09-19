/**
 * Stroke capture with timing, and the endpointer that decides when a line is done.
 *
 * ENDPOINTING, THE SHORT VERSION: we do NOT try to detect "she stopped writing."
 * We detect "she started the NEXT line." When you solve math you write line by line,
 * top to bottom, so beginning a new row is an unambiguous signal that the previous
 * row is finished -- and it needs no timer, so you can pause mid-line to think for as
 * long as you like and nothing fires.
 *
 * This is deliberately much smaller than the 5-signal endpointer this started as
 * (completeness gating, reading-stability convergence, confidence-tiered delays).
 * Once the primary signal is spatial, none of that earns its complexity.
 *
 * It also lands the interrupt at the right MOMENT: the previous step is judged while
 * the pen is already moving on the next line, which is exactly when a human tutor
 * says "wait --". Better than waiting for the student to stop and sit there.
 *
 * The only timer is a fallback for the LAST line, which by definition has no line
 * after it to trigger the commit.
 */
import { b64Vecs, type TLDrawShape } from "@tldraw/tlschema";
import type { Editor } from "tldraw";

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface TimedStroke {
  id: string;
  /** Pen-down, ms epoch. */
  startedAt: number;
  /** Pen-up. null while the stroke is still being drawn. */
  endedAt: number | null;
  /** Page-space points. */
  points: Point[];
  bounds: Bounds;
}

/**
 * Every threshold the endpointer uses, in one place -- same discipline as the
 * interrupt policy. These are geometry ratios, not pixels, so they survive zoom
 * and different handwriting sizes.
 */
export interface EndpointConfig {
  /** A new stroke counts as "lower" when its top is below this fraction of the
   *  current line's height, measured from the line's top. >1 means strictly below
   *  the line's bottom edge. Keeps fraction denominators (written just under the
   *  numerator) from looking like a new line. */
  belowRatio: number;
  /** A new stroke counts as a carriage return when it starts within this fraction
   *  of the line's width from the line's left edge. This is the real discriminator:
   *  a new line goes back toward the margin; a subscript or denominator does not. */
  carriageReturnRatio: number;
  /** Minimum line height in px, so a single dot or dash doesn't produce a degenerate
   *  line box that makes every later stroke look like a new line. */
  minLineHeight: number;
  /** A line must be at least this wide before a break can fire against it.
   *  WHY: the first stroke of a new line is often one diagonal of an "x" or the stem
   *  of a "4". Compared against a box that narrow, the SECOND stroke of the same
   *  character looks like a carriage return, and the character gets split across two
   *  lines -- observed live as "x > -3" committing as 1 stroke then "1>-3".
   *  One stroke is not a line. Wait until there's a line to compare against. */
  minLineWidthForBreak: number;
  /** Fallback only, for the final line: commit after the pen is idle this long.
   *  Tuned DOWN from a cautious 2500ms because the commit is provisional -- firing
   *  early costs one wasted read and a briefly-wrong line in the panel, both of which
   *  self-correct, while waiting long is felt on every single final line. When the
   *  cost of being wrong is near zero, bias toward being fast. */
  finalLineIdleMs: number;
}

export const DEFAULT_ENDPOINT_CONFIG: EndpointConfig = {
  belowRatio: 0.75,
  carriageReturnRatio: 0.35,
  minLineHeight: 12,
  minLineWidthForBreak: 40,
  finalLineIdleMs: 1200,
};

export function boundsOf(points: Point[]): Bounds {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function mergeBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * Does `stroke` begin a new line, given the bounds of the line being written?
 *
 * Pure geometry, no clock. Requires BOTH conditions, because either alone
 * misfires on ordinary math notation:
 *   - vertical alone  -> a fraction denominator looks like a new line
 *   - horizontal alone -> writing "=" after a long term looks like a new line
 */
export function startsNewLine(
  line: Bounds,
  stroke: TimedStroke,
  cfg: EndpointConfig = DEFAULT_ENDPOINT_CONFIG,
): boolean {
  const lineHeight = Math.max(line.maxY - line.minY, cfg.minLineHeight);
  const lineWidth = Math.max(line.maxX - line.minX, 1);
  const start = stroke.points[0];
  if (!start) return false;

  // Too little written to judge against -- see minLineWidthForBreak.
  if (lineWidth < cfg.minLineWidthForBreak) return false;

  const isBelow = stroke.bounds.minY > line.minY + lineHeight * cfg.belowRatio;
  const isCarriageReturn = start.x < line.minX + lineWidth * cfg.carriageReturnRatio;
  return isBelow && isCarriageReturn;
}

/** Page-space points for one draw shape, decoded from tldraw's base64 segment paths. */
function pointsOf(shape: TLDrawShape): Point[] {
  const out: Point[] = [];
  for (const seg of shape.props.segments) {
    for (const p of b64Vecs.decodePoints(seg.path, seg.dim ?? 3)) {
      out.push({ x: p.x + shape.x, y: p.y + shape.y });
    }
  }
  return out;
}

/**
 * Why a commit fired. The distinction matters downstream: a line-break commit is
 * FINAL (the student has moved on), an idle commit is PROVISIONAL (they may still be
 * mid-line, just thinking).
 */
export type CommitReason = "line-break" | "idle";

export interface Commit {
  strokes: TimedStroke[];
  /** Monotonic id for the line these strokes belong to. A provisional commit and the
   *  later final commit of the same line share an id, so the consumer can REPLACE the
   *  earlier reading instead of recording a phantom extra step. */
  lineId: number;
  reason: CommitReason;
}

export interface StrokeRecorder {
  /** Strokes in the line currently being written, oldest first. */
  current(): TimedStroke[];
  /** Bounds of the current line, or null when nothing has been written. */
  currentBounds(): Bounds | null;
  /** Drop the current line (call after committing it). */
  clear(): void;
  stop(): void;
}

/**
 * Watches the editor and maintains a timed stroke log.
 *
 * WHY THIS EXISTS: tldraw stores x/y/pressure per point but NO timestamps, so timing
 * is unrecoverable after the fact. We record it as it happens, which is what lets the
 * idle fallback be tuned against real writing offline instead of by guessing.
 *
 * `onLineBreak` fires with the completed line's strokes the moment a new line starts.
 */
export function recordStrokes(
  editor: Editor,
  onCommit: (commit: Commit) => void,
  cfg: EndpointConfig = DEFAULT_ENDPOINT_CONFIG,
): StrokeRecorder {
  let line: TimedStroke[] = [];
  let bounds: Bounds | null = null;
  let lineId = 0;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let idleFiredFor = -1;

  const cancelIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  };

  /**
   * The LAST line has no line after it to commit it, so it needs a timer -- the one
   * timer in this design. It is a fallback, deliberately long, and PROVISIONAL: if
   * the student was only pausing mid-line and writes more, the same lineId is
   * re-submitted and the consumer replaces the earlier reading rather than treating
   * the continuation as a new step. That is what makes firing early harmless.
   */
  const armIdle = () => {
    cancelIdle();
    idleTimer = setTimeout(() => {
      if (line.length === 0) return;
      idleFiredFor = lineId;
      onCommit({ strokes: [...line], lineId, reason: "idle" });
    }, cfg.finalLineIdleMs);
  };

  const unlisten = editor.store.listen(
    (entry) => {
      for (const record of Object.values(entry.changes.added)) {
        if (record.typeName !== "shape" || record.type !== "draw") continue;
        const shape = record as TLDrawShape;
        const points = pointsOf(shape);
        if (points.length === 0) continue;

        const stroke: TimedStroke = {
          id: shape.id,
          startedAt: Date.now(),
          endedAt: null,
          points,
          bounds: boundsOf(points),
        };

        // Decide BEFORE folding this stroke into the line, or it contaminates the
        // bounds it is being compared against.
        if (bounds && startsNewLine(bounds, stroke, cfg)) {
          // Only emit a final commit if idle hasn't already spoken for this line;
          // if it has, the reading already exists and re-sending would duplicate it.
          if (idleFiredFor !== lineId) {
            onCommit({ strokes: [...line], lineId, reason: "line-break" });
          }
          lineId += 1;
          line = [];
          bounds = null;
        }

        line.push(stroke);
        bounds = bounds ? mergeBounds(bounds, stroke.bounds) : stroke.bounds;
        armIdle();
      }

      // Pen-up and in-progress growth both arrive as updates.
      for (const [, next] of Object.values(entry.changes.updated)) {
        if (next.typeName !== "shape" || next.type !== "draw") continue;
        const shape = next as TLDrawShape;
        const stroke = line.find((s) => s.id === shape.id);
        if (!stroke) continue;
        stroke.points = pointsOf(shape);
        stroke.bounds = boundsOf(stroke.points);
        if (shape.props.isComplete && stroke.endedAt === null) stroke.endedAt = Date.now();
        bounds = line.map((s) => s.bounds).reduce(mergeBounds);
        armIdle();
      }
    },
    { source: "user", scope: "document" },
  );

  return {
    current: () => line,
    currentBounds: () => bounds,
    clear: () => {
      cancelIdle();
      line = [];
      bounds = null;
      lineId += 1;
    },
    stop: () => {
      cancelIdle();
      unlisten();
    },
  };
}

/** Mathpix payload for a set of strokes. Same wire shape as ink.ts, scoped to one line. */
export function toStrokePayload(strokes: TimedStroke[]): { strokes: { x: number[][]; y: number[][] } } | null {
  const x: number[][] = [];
  const y: number[][] = [];
  for (const s of strokes) {
    if (s.points.length === 0) continue;
    x.push(s.points.map((p) => Math.round(p.x)));
    y.push(s.points.map((p) => Math.round(p.y)));
  }
  return x.length > 0 ? { strokes: { x, y } } : null;
}
