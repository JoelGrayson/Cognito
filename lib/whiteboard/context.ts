/**
 * What the tutor is allowed to KNOW, gated by rung.
 *
 * The voice agent hears the learner directly, so nothing between them can filter
 * what it says. The filter therefore has to sit on the other side: this is the
 * only thing the agent is ever told about the page, and it is built here, in one
 * pure function, from the deterministic checker's verdict.
 *
 * The robust way to stop a model revealing something is not to ask it nicely - it
 * is to not tell it. At rung 1 the agent is given neither the working nor the
 * verdict, so it cannot leak "you flipped the sign": it has never seen those
 * words. Detail is released as the learner earns it.
 *
 * (Found in testing on the previous, text-only version of this: given the full
 * verdict at rung 1, the model said "look at how the inequality sign behaves" -
 * which names the rule three rungs early.)
 */
import type { Verdict } from "./checker/circuit.ts";
import type { HintLevel } from "./policy.ts";

/** What the tutor may say at each rung. Sent verbatim; the prompt says obey it. */
export const RUNG_LIMITS: Record<number, string> = {
  0: "Say nothing about their working at all.",
  1: "You may say only that something is wrong somewhere. Do NOT say which line, which symbol, or what kind of mistake it is.",
  2: "You may say roughly where to look (which step), but NOT what is wrong with it.",
  3: "You may point at the specific step, but NOT name the rule they broke.",
  4: "You may name the rule they broke, but do NOT give them the corrected line.",
  5: "You may explain the error fully, but still do not write the corrected line for them.",
};

export function describeVerdict(verdict: Verdict): string {
  switch (verdict.kind) {
    case "sign":
      return `Their equation would hold if the sign of the term "${verdict.term}" were flipped: a voltage drop written as a rise, or a current counted into a node instead of out of it. The circuit itself, not the line above, is the premise.`;
    case "wrong-value":
      return `They wrote ${verdict.variable} = ${verdict.got}; the circuit gives ${verdict.variable} = ${verdict.expected.toFixed(3)}. The setup may be right and the arithmetic wrong. Do not tell them the correct number.`;
    case "not-holding":
      return `Substituting the circuit's true currents and voltages, their left side is ${verdict.lhs.toFixed(3)} and their right side ${verdict.rhs.toFixed(3)}. The equation is not one this circuit satisfies: a term is missing, extra, or refers to the wrong element.`;
    case "direction":
      return `They divided or multiplied by a negative and kept the inequality pointing the same way. It should have flipped to "${verdict.expected}".`;
    case "rescaled":
      return `They changed the VALUE of a bare expression by scaling it by ${verdict.by.toFixed(2)}. You may scale both sides of an equation, never a lone expression.`;
    case "not-equivalent":
      return `The step does not follow from the one above it. At ${verdict.witness.variable}=${verdict.witness.at.toFixed(2)} the previous step gives ${verdict.witness.previousValue.toFixed(2)} and theirs gives ${verdict.witness.currentValue.toFixed(2)}.`;
    default:
      return "The step does not follow from the one above it.";
  }
}

/** A step as the learner can see it: what they wrote, and what the page says about it. */
export interface StepView {
  position: number;
  text: string;
  status: "follows" | "marked" | "unjudged";
}

/** The step under discussion, with the hint depth it has reached. */
export interface OpenStep {
  position: number;
  premise: string;
  step: string;
  verdict: Verdict;
  rung: HintLevel;
}

export interface Work {
  subject: string;
  steps: StepView[];
  open: OpenStep | null;
  /** The learner has just named the error themselves. */
  justFound: boolean;
}

/**
 * The payload for the agent's read_work tool: everything it may know, and nothing
 * it may not. JSON rather than prose because it is machine-assembled and the
 * limit has to stand out from the content it applies to.
 */
export function workContext(work: Work): string {
  const { open } = work;

  if (work.justFound) {
    return JSON.stringify({
      subject: work.subject,
      they_just_named_the_error: true,
      still_marked: open ? `step ${open.position}` : "nothing",
      you_may_reveal:
        open
          ? "They got it. Say so warmly in one short sentence, then point them at the other step still marked."
          : "They got it. Say so warmly in one short sentence and stop helping.",
    });
  }

  if (!open) {
    return JSON.stringify({
      subject: work.subject,
      steps: work.steps,
      marked_step: null,
      you_may_reveal:
        "Nothing is marked wrong. Answer what they asked, or talk about the working in front of you. Do NOT hunt for mistakes yourself - a checker does that, and it has not flagged anything.",
    });
  }

  // Rungs 1-2 withhold LOCATION, so the working itself cannot be shown: given the
  // steps, the model finds the error and points at it, whatever the limit says.
  if (open.rung <= 2) {
    return JSON.stringify({
      subject: work.subject,
      step_count: work.steps.length,
      marked_step: open.rung === 2 ? "the step they just wrote" : "one of them; you do not know which",
      what_you_know:
        open.rung <= 1
          ? "One of their steps does not follow. You do not know which, and you must not guess."
          : "The step they just wrote is the one that does not follow. You do not know why.",
      you_may_reveal: RUNG_LIMITS[open.rung] ?? RUNG_LIMITS[1],
    });
  }

  return JSON.stringify({
    subject: work.subject,
    steps: work.steps,
    marked_step: { position: open.position, came_from: open.premise, they_wrote: open.step },
    what_you_know: describeVerdict(open.verdict),
    you_may_reveal: RUNG_LIMITS[open.rung] ?? RUNG_LIMITS[5],
  });
}
