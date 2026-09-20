/**
 * What the tutor says, in words. The saying itself is the Deepgram voice agent's
 * job (lib/ai/whiteboard-agent.ts); these are the lines the page puts in its
 * mouth verbatim, because they are the deterministic checker's verdict and
 * nothing may rephrase them into an accusation the checker never made.
 */

/**
 * What the tutor says out loud at each rung.
 *
 * Note what rung 1 does NOT say: which line, or what is wrong. It asks the learner
 * to go find it. And after a correction it asks "why" rather than explaining -- the
 * point is to make them articulate the reasoning, not to hand it over.
 */
export const SPOKEN: Record<number, string> = {
  1: "Something in there doesn't hold up. Want to take another look?",
  2: "It's in one of these lines. Have another go.",
  3: "Check that step.",
  4: "Think about what you did to both sides there.",
  5: "That step doesn't follow from the one above it.",
};

/**
 * What to say at rungs 4 and 5, where the words depend on WHICH mistake it was.
 *
 * Rungs 1-3 reveal nothing about the nature of the error, so one phrase serves them
 * all. Rung 4 names the misconception - so a rung-only lookup asserted a negative
 * division had happened no matter what the verdict was, and told a learner who had
 * halved an expression that they "divided by a negative". Confidently wrong tutoring
 * is worse than vague tutoring.
 */
export function spokenFor(rung: number, verdictKind: string): string {
  if (rung < 4) return SPOKEN[rung] ?? SPOKEN[1];

  switch (verdictKind) {
    case "direction":
      return rung >= 5
        ? "You divided both sides by a negative, so the inequality has to turn around."
        : "You divided by a negative there. What should happen to the sign?";
    case "rescaled":
      return rung >= 5
        ? "You can scale both sides of an equation, but not a lone expression — its value changed."
        : "That changed the value, not just the form. What did you multiply through by?";
    case "sign":
      return rung >= 5
        ? "One term in that equation has the wrong sign — a drop written as a rise, or a current counted the wrong way through the node."
        : "Check the sign on each term there. Which way does the current go through it?";
    case "wrong-value":
      return rung >= 5
        ? "Your equations were fine; the number at the end isn't what the circuit gives. Redo the arithmetic."
        : "Put that value back into the circuit. Does it satisfy the loop?";
    case "not-holding":
      return rung >= 5
        ? "That equation isn't true of this circuit — a term is missing or doesn't belong. Walk the loop or the node once more."
        : "Trace it against the diagram — does every term correspond to an element there?";
    default:
      return rung >= 5
        ? "That step doesn't follow from the one above it."
        : "Compare it with the line above — something doesn't carry over.";
  }
}

/** Asked after a step is marked, to make the learner explain rather than be told. */
export const ASK_WHY = [
  "Why did you do that step?",
  "Talk me through that line.",
  "Why doesn't that one work?",
] as const;
