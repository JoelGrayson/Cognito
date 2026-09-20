/**
 * The second opinion between the checker and the tutor's mouth.
 *
 * The checker's asymmetry (see checker/numeric.ts): "equivalent" proves safety,
 * "not equivalent" proves nothing — the learner may have substituted, divided
 * both sides, or started a sub-derivation it cannot model, and the handwriting
 * may simply have been misread. Today that doubt is spent on an LLM call, or
 * worse, on an interruption.
 *
 * Jev answers both doubts as probabilities in one ~200ms call, which the pure
 * policy then gates on via `StepState.errorConfidence`. Null when Jev is
 * unavailable: the verdict alone decides, exactly as before.
 */
import { jevConfigured, noul, tryAsk } from "@/lib/ai/jev";
import type { Equivalence } from "@/lib/whiteboard/checker/numeric";

export interface StepEvidence {
  /** The line the step is derived from, as read. */
  premise: string;
  /** The step itself, as read. */
  current: string;
  /** What the deterministic checker concluded. */
  verdict: Equivalence;
}

export interface ErrorConfidence {
  /** How sure we are this is a real mistake, after both questions. */
  confidence: number;
  realError: number;
  readable: number;
  model: string;
  ms: number;
}

const REAL_ERROR =
  "Is `current` genuinely a mistake, given `premise`? A checker found the two sides not " +
  "equivalent, but that is not proof: no if the learner did something legitimate the checker " +
  "cannot model — substituting a value, operating on both sides, starting a sub-derivation, " +
  "restating a definition, or beginning a new problem.";

/** Jev answers in well under a second; past this the learner has moved on. */
const DEADLINE_MS = 1500;

const READABLE =
  "Do `premise` and `current` read like mathematics a person actually wrote, rather than a " +
  "garbled transcription? No if symbols are missing, duplicated or nonsensical in a way that " +
  "would make any comparison between the two lines meaningless.";

/** Null when Jev cannot answer, which leaves the checker's verdict as the only evidence. */
export async function confirmError(step: StepEvidence): Promise<ErrorConfidence | null> {
  if (!jevConfigured()) return null;

  const result = await tryAsk(
    { premise: step.premise, current: step.current, checker: describe(step.verdict) },
    {
      realError: noul(REAL_ERROR, {
        true: "The step does not follow from the premise.",
        false: "A legitimate move, or a new line of work.",
      }),
      readable: noul(READABLE),
    },
    // The learner is writing while we ask. A second opinion that has not landed
    // by then is worth less than the board staying responsive: give up and let
    // the existing path decide.
    { timeoutMs: DEADLINE_MS },
  );
  if (!result) return null;

  const { realError, readable } = result.answers;
  return {
    // A misread line makes the verdict meaningless, so doubt about the reading
    // discounts the error rather than sitting beside it.
    confidence: realError.noul * readable.noul,
    realError: realError.noul,
    readable: readable.noul,
    model: result.model,
    ms: result.ms,
  };
}

/** The verdict as evidence, not as a conclusion: Jev is told what was found, not what to say. */
function describe(verdict: Equivalence) {
  switch (verdict.kind) {
    case "direction":
      return { finding: "the relation direction changed", expected: verdict.expected, got: verdict.got };
    case "rescaled":
      return { finding: "a bare expression was multiplied by a constant", by: verdict.by };
    case "not-equivalent":
      return {
        finding: "the two lines disagree numerically",
        at: `${verdict.witness.variable}=${verdict.witness.at}`,
        premiseValue: verdict.witness.previousValue,
        currentValue: verdict.witness.currentValue,
      };
    default:
      return { finding: verdict.kind };
  }
}
