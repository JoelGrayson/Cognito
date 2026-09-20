/**
 * Did the learner's spoken explanation actually name the error?
 *
 * This closes the loop: the tutor asks "why did you do that?", the learner answers,
 * and what happens next depends on whether they FOUND it.
 *
 *   found it   -> confirm, and stop. They did the work; say so and get out of the way.
 *   didn't     -> go one rung deeper.
 *
 * SPEAKING IS THE HINT REQUEST. The learner never has to press anything to ask for
 * more help -- explaining and not getting there IS the request. That keeps the
 * invariant intact (the system still never volunteers a rung) while removing the
 * awkwardness of making someone admit they're stuck.
 *
 * Keyword matching, not a model call. It is crude, and deliberately biased: a miss
 * costs one extra rung, a false positive would congratulate someone who is still
 * wrong. So it only claims "found it" on a fairly specific phrase.
 */
import type { Verdict } from "./checker/circuit.ts";

export type Outcome =
  /** They named the actual error. Confirm and stop. */
  | { kind: "found-it" }
  /** They said something, but not the thing. Escalate one rung. */
  | { kind: "not-yet" }
  /** They explicitly gave up. Escalate, and don't make them ask twice. */
  | { kind: "stuck" };

/** Phrases that mean "I can't see it" -- worth treating as a direct request. */
const GIVING_UP = /\b(i don'?t know|no idea|not sure|i'?m stuck|give up|can'?t see it|seems right|looks right|thought i got it right|what'?s wrong)\b/i;

/** What naming THIS misconception sounds like out loud. */
function signals(verdict: Verdict): RegExp | null {
  switch (verdict.kind) {
    case "sign":
      // "the drop should be negative", "I had the current going the wrong way"
      return /\b(sign|polarity|negative|minus|plus|wrong way|other way|direction|flip|flipped|drop|rise)\b/i;
    case "wrong-value":
      return /\b(arithmetic|miscalculat\w*|divided|multiplied|added|subtracted|should be \d|is \d|equals \d|wrong number|calculat\w*)\b/i;
    case "not-holding":
      return /\b(forgot|missed|dropped|left out|extra|shouldn'?t be there|wrong (resistor|element|loop|node|branch)|should(?:'ve| have))\b/i;
    case "direction":
      // "I forgot to flip the sign", "should have reversed the inequality"
      return /\b(flip|flipped|flipping|reverse|reversed|switch|switched|swap|swapped)\b/i;
    case "rescaled":
      return /\b(divided|halved|doubled|scaled|multiplied|factor of|times)\b/i;
    case "not-equivalent":
      return /\b(forgot|missed|dropped|left out|should(?:'ve| have)|mistake|wrong sign|didn'?t distribute)\b/i;
    default:
      return null;
  }
}

export function assessExplanation(transcript: string, verdict: Verdict): Outcome {
  const said = transcript.trim();
  if (said.length === 0) return { kind: "not-yet" };

  const signal = signals(verdict);
  // Check for the right answer BEFORE giving-up language: "I don't know, did I forget
  // to flip it?" is someone who got there while sounding unsure.
  if (signal?.test(said)) return { kind: "found-it" };
  if (GIVING_UP.test(said)) return { kind: "stuck" };
  return { kind: "not-yet" };
}
