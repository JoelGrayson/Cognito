/**
 * Verdict -> marks. Pure: no editor, no DOM, no clock. Given what the checker found
 * and how much help the learner has earned, decide what to draw.
 *
 * The rung is the whole point. Rung 1 marks the MARGIN and names no location, because
 * telling someone which line is wrong does their re-reading for them. Each rung after
 * gives away more, and is only reached because they asked.
 */
import type { Equivalence } from "./checker/numeric.ts";
import type { HintLevel } from "./policy.ts";
import type { Mark } from "./annotate.ts";
import type { Bounds } from "./strokes.ts";

export function marksFor(
  verdict: Equivalence,
  lineId: number,
  rung: HintLevel,
  /** Bounds of the offending symbol, when we could locate it. Null degrades to
   *  circling the whole step, which is a lower rung anyway - so being unsure gives
   *  away LESS rather than pointing at the wrong glyph. */
  symbol?: Bounds | null,
  /** The step this one was judged against. Not always the line before it: on a
   *  worksheet it may be the printed problem, or an earlier line of the same problem
   *  with another problem's working in between. */
  premiseLineId: number = Math.max(0, lineId - 1),
): Mark[] {
  if (verdict.kind === "undetermined") return [];
  // A step that follows is ticked at every rung but silent: the tick gives nothing
  // away, and without it a correct page looks the same as an unread one.
  if (verdict.kind === "equivalent") return rung === 0 ? [] : [{ kind: "tick", lineId }];

  switch (rung) {
    case 0:
      return [];

    // Rung 1: something is wrong, somewhere above. No location.
    case 1:
      return [{ kind: "margin-note", lineId, text: "?", tone: "problem" }];

    // Rung 2: narrow it to this step, still without saying what.
    case 2:
      return [{ kind: "margin-note", lineId, text: "look here", tone: "problem" }];

    // Rung 3: mark the step itself. This is where Chiron-style tools START.
    case 3:
      return verdict.kind === "rescaled"
        // The value changed, so strike it -- the mark carries the diagnosis.
        ? [{ kind: "strike", lineId }]
        : [{ kind: "circle", lineId, tone: "problem" }];

    // Rung 4: point at the symbol itself and name the error. A tutor circling your
    // ">" is worth more than circling the line, so it costs a rung.
    case 4:
      return [
        { kind: "circle", lineId, tone: "problem", ...(symbol ? { bounds: symbol } : {}) },
        { kind: "margin-note", lineId, text: noteFor(verdict), tone: "problem" },
      ];

    // Rung 5: link it back to the step it contradicts, and say it outright.
    case 5:
      return [
        { kind: "circle", lineId, tone: "problem", ...(symbol ? { bounds: symbol } : {}) },
        { kind: "arrow", lineId, toLineId: premiseLineId },
        { kind: "margin-note", lineId, text: noteFor(verdict), tone: "problem" },
      ];
  }
}

/** Short enough to live in a margin. The checker's `kind` IS the misconception. */
function noteFor(verdict: Equivalence): string {
  switch (verdict.kind) {
    case "direction":
      return `÷ by a negative → flip to ${verdict.expected}`;
    case "rescaled":
      return `scaled by ${verdict.by.toFixed(2)} — value changed`;
    case "not-equivalent":
      return "doesn't follow from the line above";
    default:
      return "?";
  }
}
