/**
 * What the tutor is allowed to PLOT.
 *
 * The graph is a second mouth: a curve that crosses the axis at the answer says
 * as much as reading the answer out. So plotting goes through the same gate the
 * words do - the rung of the step under discussion - and is decided here rather
 * than by the model, which is only ever asked to choose the expressions.
 *
 * Nothing in here touches Desmos; it is the plan, and the panel carries it out.
 */
import type { HintLevel } from "./policy.ts";

/** One curve on the graph, with the id the panel syncs it under. */
export interface Plot {
  /** Stable across calls, so re-plotting replaces rather than piles up. */
  id: string;
  latex: string;
}

export type PlotPlan =
  | { ok: true; plots: Plot[]; message: string }
  | { ok: false; message: string };

/** Six curves is already a busy graph, and the panel is narrow. */
export const MAX_PLOTS = 6;
/** Long enough for anything hand-written, short enough not to be a payload. */
const MAX_LATEX = 200;
/** The tutor's curves are namespaced: whatever the learner types is left alone. */
export const PLOT_ID_PREFIX = "tutor-";

/**
 * The lowest rung at which the tutor may draw anything about their working.
 *
 * At rungs 0-1 the learner is owed only "something is wrong somewhere", and a
 * graph of the step they just wrote points straight at it.
 */
const PLOT_FROM_RUNG = 2;

/**
 * Desmos parses LaTeX, and the page's own steps are held as mathjs source, so
 * `*` arrives where `\cdot` is meant. Nothing else is rewritten: a wrong guess
 * about the notation is worse than an expression the calculator rejects, which
 * the learner can see and the tutor is told about.
 */
export function toDesmosLatex(expression: string): string {
  return expression.replace(/\s+/g, " ").replace(/\*+/g, " \\cdot ").replace(/\s+/g, " ").trim();
}

/**
 * Decide what the graph should show. `rung` is the hint depth of the step under
 * discussion, or null when nothing is marked - an unmarked page is just a
 * calculator, and asking to see a parabola gives nothing away.
 */
export function planPlot(expressions: readonly string[] | null, rung: HintLevel | null): PlotPlan {
  if (expressions === null) {
    return { ok: false, message: "Nothing to plot: send one or more expressions as Desmos LaTeX, like y=2x+3." };
  }

  // Wiping the graph is the one call no rung can forbid: it only takes information
  // away. It is also how the tutor gets the last answer off the screen.
  if (expressions.length === 0) {
    return { ok: true, plots: [], message: "Cleared what you had graphed. Anything they typed in themselves is still there." };
  }

  if (rung !== null && rung < PLOT_FROM_RUNG) {
    return {
      ok: false,
      message:
        "Refused: you may only say that something is wrong somewhere, and a graph of their working would point at the step. Say it in words instead.",
    };
  }

  const latex = expressions.map(toDesmosLatex).filter((e) => e.length > 0 && e.length <= MAX_LATEX);
  if (latex.length === 0) {
    return { ok: false, message: "Nothing to plot: send one or more expressions as Desmos LaTeX, like y=2x+3." };
  }

  const plots = latex.slice(0, MAX_PLOTS).map((l, i) => ({ id: `${PLOT_ID_PREFIX}${i}`, latex: l }));
  const dropped = latex.length - plots.length;
  return {
    ok: true,
    plots,
    message: `Graphing ${plots.map((p) => p.latex).join(", ")}. It is on screen beside their page - say what to look at, don't read the curve out.${
      dropped > 0 ? ` (${dropped} left off: ${MAX_PLOTS} curves at a time.)` : ""
    }`,
  };
}

/**
 * The arguments come off the socket as a JSON string written by a model, so
 * anything at all may be in there. A single string is accepted as well as a
 * list: asked for one curve, models send one.
 *
 * Null is unreadable arguments, which is NOT the same as an empty list - that is a
 * request to wipe the graph, and a garbled call must not be read as one.
 */
export function parsePlotArgs(json: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const value = (parsed as Record<string, unknown>).expressions;
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return null;
  return value.filter((e): e is string => typeof e === "string");
}
