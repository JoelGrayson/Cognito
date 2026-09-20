/**
 * Marks drawn on the call whiteboard: circle a line, strike it through, leave a note
 * in the margin.
 *
 * These are emitted as ordinary BoardElements, so they animate in exactly like the
 * tutor's own drawings and need no new rendering. Ids are namespaced `mark:` so they
 * can be cleared without touching the tutor's work or the learner's ink.
 *
 * WHAT THE MARKS MEAN — they carry the verdict, they are not decoration:
 *   margin "?"   something above is wrong, no location given    (rung 1)
 *   circle       look at THIS line                              (rung 3)
 *   strike       this value changed                             (a rescaled verdict)
 *   note         what kind of mistake it is                     (rung 4)
 */
import type { BoardElement } from "@/lib/board";
import type { Bounds } from "./strokes.ts";

/** Padding so a circle clears the ink instead of cutting through it. */
const PAD = 14;
const MARGIN_GAP = 24;
/** Board is 1000 wide; keep notes on-canvas even for a line that runs long. */
const BOARD_W = 1000;

let seq = 0;
const key = () => `mark${(seq += 1)}`;

export const MARK_PREFIX = "mark:";

/** Remove every mark, leaving the tutor's drawings and the learner's strokes alone. */
export function clearMarks(elements: BoardElement[]): BoardElement[] {
  return elements.filter((e) => !e.id.startsWith(MARK_PREFIX));
}

export interface MarkOptions {
  /** 1-5. Higher rungs give more away; see lib/whiteboard/policy.ts. */
  rung: number;
  /** Verdict kind from whichever checker ran. */
  verdict: string;
  /** Short description of the mistake, shown only from rung 4. */
  detail?: string;
}

/**
 * Marks for one line of the learner's work. Returns [] when there is nothing to say,
 * which is the common case and the point of the whole design.
 */
export function marksForLine(bounds: Bounds, { rung, verdict, detail }: MarkOptions): BoardElement[] {
  const ok = verdict === "equivalent" || verdict === "balanced";
  if (ok || verdict === "undetermined" || rung < 1) return [];

  const id = key();
  // BoardElement is a discriminated union, so each mark is built as its own literal
  // rather than through one generic helper - Omit does not distribute over a union.
  const stamp = <T extends { id: string }>(e: T, delay = 0) =>
    ({ ...e, key: `${e.id}:${seq}`, delay }) as unknown as BoardElement;

  // Rung 1-2: the margin only. Naming the line does the re-reading for them.
  if (rung <= 2) {
    return [
      stamp({
        type: "text" as const,
        id: `${MARK_PREFIX}${id}`,
        x: Math.min(bounds.maxX + MARGIN_GAP, BOARD_W - 60),
        y: bounds.minY,
        text: rung === 1 ? "?" : "look here",
        size: "medium" as const,
        color: "red" as const,
      }),
    ];
  }

  const out: BoardElement[] = [];

  if (verdict === "rescaled") {
    // The value changed, so strike it: the mark states the diagnosis.
    const midY = Math.round((bounds.minY + bounds.maxY) / 2);
    out.push(
      stamp({
        type: "line" as const,
        id: `${MARK_PREFIX}${id}s`,
        x1: bounds.minX - PAD / 2,
        y1: midY,
        x2: bounds.maxX + PAD / 2,
        y2: midY,
        color: "red" as const,
      }),
    );
  } else {
    out.push(
      stamp({
        type: "circle" as const,
        id: `${MARK_PREFIX}${id}c`,
        cx: Math.round((bounds.minX + bounds.maxX) / 2),
        cy: Math.round((bounds.minY + bounds.maxY) / 2),
        r: Math.round(Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2) + PAD,
        color: "red" as const,
        fill: false,
      }),
    );
  }

  // Rung 4+: name the mistake. Below that, the mark points without explaining.
  if (rung >= 4 && detail) {
    out.push(
      stamp({
        type: "text" as const,
        id: `${MARK_PREFIX}${id}n`,
        x: Math.min(bounds.maxX + MARGIN_GAP, BOARD_W - 260),
        y: bounds.minY,
        text: detail.length > 60 ? `${detail.slice(0, 57)}...` : detail,
        size: "small" as const,
        color: "red" as const,
      }, 250),
    );
  }

  return out;
}

/** Bounds of one written line, from the strokes that make it up. */
export function lineBounds(strokes: readonly { points: number[] }[]): Bounds | null {
  let b: Bounds | null = null;
  for (const s of strokes) {
    for (let i = 0; i + 1 < s.points.length; i += 2) {
      const x = s.points[i];
      const y = s.points[i + 1];
      b = b
        ? { minX: Math.min(b.minX, x), minY: Math.min(b.minY, y), maxX: Math.max(b.maxX, x), maxY: Math.max(b.maxY, y) }
        : { minX: x, minY: y, maxX: x, maxY: y };
    }
  }
  return b;
}
