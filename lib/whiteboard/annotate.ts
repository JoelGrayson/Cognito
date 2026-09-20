/**
 * The tutor draws on your work.
 *
 * THE IDEA THAT MAKES THIS TRACTABLE: the model never produces coordinates. It names a
 * TARGET (a committed line, by `lineId`) and a MARK (circle, strike, margin note...),
 * and we resolve the geometry from bounds we already track in strokes.ts. Asking a
 * model for pixel positions is where these demos fall over; here the hard part is data
 * we already have.
 *
 * WHAT THE MARKS MEAN — they are not decoration, they carry the checker's verdict:
 *   circle      -> "look at this part"          (a specific operator or term)
 *   strike      -> "this value changed"         (a `rescaled` verdict)
 *   margin-note -> "something above is wrong"   (rung 1: deliberately NO location)
 *   arrow       -> "these two disagree"         (links a step to the one it broke)
 *   underline   -> "this part is right"         (confirmation, used sparingly)
 *   tick        -> "this step follows"          (a green check in the margin)
 *
 * The margin note is the important one. Chiron-style tools mark the error itself,
 * which does the re-reading for the learner. Rung 1 here marks the MARGIN and says
 * "something above here doesn't hold up" -- the circle is rung 3, and only on request.
 */
import { createShapeId, toRichText } from "@tldraw/tlschema";
import { getIndices } from "@tldraw/utils";
import type { Editor } from "tldraw";
import type { Bounds } from "./strokes.ts";

/** Line shapes key their points by a fractional IndexKey, not a plain string. */
const [IDX_A, IDX_B, IDX_C] = getIndices(3);

export type MarkKind = "circle" | "strike" | "margin-note" | "arrow" | "underline" | "tick";

export interface Mark {
  kind: MarkKind;
  /** The committed line this refers to. Geometry is resolved from its bounds. */
  lineId: number;
  /** `arrow` only: the line it points at. */
  toLineId?: number;
  /** `margin-note` only. Keep it short; it sits in the margin. */
  text?: string;
  /** Overrides the line's bounds, to mark ONE symbol rather than the whole step.
   *  Used at rung 4, where the tutor points at the operator itself. */
  bounds?: Bounds;
  /** Red for a problem, blue for a confirmation. */
  tone?: "problem" | "neutral";
}

/** Padding around a line's ink so a circle doesn't clip the glyphs. */
const PAD = 10;
/** Where the margin starts, relative to the right edge of the written line. */
const MARGIN_GAP = 28;

export interface Annotator {
  /** Draw marks. Returns the ids created, so they can be cleared later. */
  draw(marks: Mark[], boundsOf: (lineId: number) => Bounds | undefined): string[];
  /** Remove every mark this annotator has drawn. The student's own ink is untouched. */
  clear(): void;
}

/**
 * Marks are tagged in `meta` so `clear()` can remove only the tutor's ink and never
 * the student's. Do not identify them by shape type -- the student draws geo shapes
 * too if they pick up the rectangle tool.
 */
const MARK_META = { whiteboardMark: true } as const;

export function createAnnotator(editor: Editor): Annotator {
  const drawn = new Set<string>();

  function circle(b: Bounds, tone: Mark["tone"]) {
    const id = createShapeId();
    editor.createShape({
      id,
      type: "geo",
      x: b.minX - PAD,
      y: b.minY - PAD,
      meta: MARK_META,
      props: {
        geo: "ellipse",
        w: b.maxX - b.minX + PAD * 2,
        h: b.maxY - b.minY + PAD * 2,
        fill: "none",
        color: tone === "neutral" ? "blue" : "red",
        dash: "draw", // hand-drawn look: this should read as a person's pen, not a UI chrome box
        size: "s",
      },
    });
    return id;
  }

  function strike(b: Bounds) {
    const id = createShapeId();
    const midY = (b.minY + b.maxY) / 2;
    editor.createShape({
      id,
      type: "line",
      x: b.minX - PAD / 2,
      y: midY,
      meta: MARK_META,
      props: {
        color: "red",
        size: "s",
        dash: "draw",
        spline: "line",
        points: {
          a1: { id: "a1", index: IDX_A, x: 0, y: 0 },
          a2: { id: "a2", index: IDX_B, x: b.maxX - b.minX + PAD, y: 0 },
        },
      },
    });
    return id;
  }

  function underline(b: Bounds) {
    const id = createShapeId();
    editor.createShape({
      id,
      type: "line",
      x: b.minX,
      y: b.maxY + 6,
      meta: MARK_META,
      props: {
        color: "blue",
        size: "s",
        dash: "draw",
        spline: "line",
        points: {
          a1: { id: "a1", index: IDX_A, x: 0, y: 0 },
          a2: { id: "a2", index: IDX_B, x: b.maxX - b.minX, y: 0 },
        },
      },
    });
    return id;
  }

  /** In the margin, where a teacher puts it: beside the line, never over the ink. */
  function tick(b: Bounds) {
    const id = createShapeId();
    // Sized from the line so it reads the same beside small and large handwriting.
    const h = Math.min(Math.max(b.maxY - b.minY, 18), 40);
    editor.createShape({
      id,
      type: "line",
      x: b.maxX + MARGIN_GAP,
      y: (b.minY + b.maxY) / 2,
      meta: MARK_META,
      props: {
        color: "green",
        size: "m",
        dash: "draw",
        spline: "line",
        points: {
          a1: { id: "a1", index: IDX_A, x: 0, y: 0 },
          a2: { id: "a2", index: IDX_B, x: h * 0.3, y: h * 0.35 },
          a3: { id: "a3", index: IDX_C, x: h * 0.95, y: -h * 0.5 },
        },
      },
    });
    return id;
  }

  function marginNote(b: Bounds, text: string, tone: Mark["tone"]) {
    const id = createShapeId();
    editor.createShape({
      id,
      type: "text",
      x: b.maxX + MARGIN_GAP,
      y: b.minY,
      meta: MARK_META,
      props: {
        richText: toRichText(text),
        color: tone === "neutral" ? "blue" : "red",
        size: "s",
        font: "draw",
        autoSize: true,
      },
    });
    return id;
  }

  function arrow(from: Bounds, to: Bounds) {
    const id = createShapeId();
    editor.createShape({
      id,
      type: "arrow",
      x: 0,
      y: 0,
      meta: MARK_META,
      props: {
        color: "red",
        size: "s",
        dash: "draw",
        // Point from the right edge of one line to the right edge of the other, out in
        // the margin, so the arrow never crosses the student's writing.
        start: { x: from.maxX + MARGIN_GAP / 2, y: (from.minY + from.maxY) / 2 },
        end: { x: to.maxX + MARGIN_GAP / 2, y: (to.minY + to.maxY) / 2 },
      },
    });
    return id;
  }

  return {
    draw(marks, boundsOf) {
      const ids: string[] = [];
      for (const m of marks) {
        const b = m.bounds ?? boundsOf(m.lineId);
        if (!b) continue; // line was cleared or never committed; skip rather than throw
        let id: string | undefined;
        switch (m.kind) {
          case "circle": id = circle(b, m.tone); break;
          case "strike": id = strike(b); break;
          case "underline": id = underline(b); break;
          case "tick": id = tick(b); break;
          case "margin-note": id = marginNote(b, m.text ?? "?", m.tone); break;
          case "arrow": {
            const to = m.toLineId !== undefined ? boundsOf(m.toLineId) : undefined;
            if (to) id = arrow(b, to);
            break;
          }
        }
        if (id) { drawn.add(id); ids.push(id); }
      }
      return ids;
    },

    clear() {
      // Only shapes we tagged. Never touch the student's ink.
      const mine = editor
        .getCurrentPageShapes()
        .filter((s) => (s.meta as { whiteboardMark?: boolean })?.whiteboardMark)
        .map((s) => s.id);
      if (mine.length > 0) editor.deleteShapes(mine);
      drawn.clear();
    },
  };
}
