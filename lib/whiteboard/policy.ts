/**
 * THE HELP LADDER — the core product decision, isolated to this one file.
 *
 * The evidence this is built on: a 2025 RCT found students using AI scored 57.5% on a
 * retention test 45 days later versus 68.5% for students who used none. AI tutors make
 * people feel helped and remember less. Bjork's "desirable difficulties" explains why:
 * storage strength grows most when retrieval is HARD. Smooth feels like learning and
 * isn't.
 *
 * So this system optimizes for the opposite of every other tutor: not how much it
 * helped, but HOW LITTLE IT HAD TO.
 *
 * The mechanism is withholding LOCATION, not just withholding the answer. Telling a
 * student "line 3 is wrong" does the re-reading for them. Telling them "something in
 * here doesn't hold up" makes them audit their own reasoning, which is the learning
 * event. So help is a ladder, and:
 *
 *   THE SYSTEM NEVER VOLUNTEERS PAST RUNG 1. Rungs 2+ are only ever reached because
 *   the student asked. That invariant is the product; everything else is plumbing.
 */
import type { Equivalence } from "./checker/numeric.ts";

/** How much of the answer has been given away. Monotonic within a step. */
export type HintLevel = 0 | 1 | 2 | 3 | 4 | 5;

export const HINT_LADDER: Record<HintLevel, string> = {
  0: "(silence)",
  1: "Something in your work doesn't hold up. Want to find it?",
  2: "It's in one of these lines.",
  3: "Look at this line.",
  4: "Think about what you did to both sides here.",
  5: "(shows the corrected step)",
};

export type SilenceReason =
  | "no-error"
  | "still-writing"
  | "checker-abstained"
  | "low-recognition-confidence"
  | "already-offered"
  | "student-is-working-on-it"
  | "student-self-corrected";

export type Move =
  | { act: "stay-silent"; because: SilenceReason }
  /** Rung 1. The ONLY thing the system ever says unprompted. */
  | { act: "offer-check" }
  /** Rungs 2-5. Reachable only via `requestHint`, never volunteered. */
  | { act: "give-hint"; level: HintLevel; text: string };

export interface StepState {
  lineId: number;
  verdict: Equivalence;
  recognitionConfidence: number;
  /** Set when rung 1 was offered for this step. */
  offeredAt: number | null;
  /** Highest rung the student has pulled down for this step. */
  hintsUsed: HintLevel;
  /** How the error went away, once it did. `self` is the outcome worth maximizing. */
  resolvedBy: "self" | "hint" | null;
}

export interface Config {
  /** Don't speak while the pen is still moving; a step mid-write isn't a claim yet. */
  minIdleMsBeforeSpeaking: number;
  /** Below this recognition confidence we assume WE misread, not that they erred.
   *  Accusing a student of a mistake they didn't make costs more trust than missing
   *  one costs learning. */
  recognitionConfidenceFloor: number;
  /** Having offered once, don't nag; they know something is wrong. */
  reofferCooldownMs: number;
}

export const DEFAULT_CONFIG: Config = {
  minIdleMsBeforeSpeaking: 900,
  recognitionConfidenceFloor: 0.6,
  reofferCooldownMs: 15000,
};

export interface PolicyInput {
  now: number;
  step: StepState | null;
  msSinceStrokeIdle: number;
}

/**
 * What, if anything, to say. Pure and synchronous: no clock of its own, no I/O, no
 * model call. Feed it a plain object, assert the Move.
 *
 * Silence is the default and the common case. Twenty correct steps produce twenty
 * silences and zero tokens.
 */
export function decide(input: PolicyInput, cfg: Config = DEFAULT_CONFIG): Move {
  const { step, now, msSinceStrokeIdle } = input;

  if (!step) return { act: "stay-silent", because: "no-error" };
  if (step.resolvedBy === "self") return { act: "stay-silent", because: "student-self-corrected" };

  // A verdict computed from a misread expression is not evidence of anything.
  // This check comes BEFORE reading the verdict, deliberately.
  if (step.recognitionConfidence < cfg.recognitionConfidenceFloor) {
    return { act: "stay-silent", because: "low-recognition-confidence" };
  }

  if (step.verdict.kind === "equivalent") return { act: "stay-silent", because: "no-error" };
  // Abstention is not an error. "I couldn't tell" must never become an interruption.
  if (step.verdict.kind === "undetermined") {
    return { act: "stay-silent", because: "checker-abstained" };
  }

  // Still writing: they may be mid-thought, and the step isn't a claim yet.
  if (msSinceStrokeIdle < cfg.minIdleMsBeforeSpeaking) {
    return { act: "stay-silent", because: "still-writing" };
  }

  if (step.offeredAt === null) return { act: "offer-check" };

  // Offered already. Now we wait for them — silence is the whole point. We do NOT
  // climb the ladder on our own, however long they take.
  if (now - step.offeredAt < cfg.reofferCooldownMs) {
    return { act: "stay-silent", because: "student-is-working-on-it" };
  }
  return { act: "stay-silent", because: "already-offered" };
}

/**
 * The student pulled the next rung down. This is the ONLY path to rungs 2-5, and it
 * exists so that descending is always a choice the learner made, never something that
 * happened to them.
 */
export function requestHint(step: StepState): { step: StepState; move: Move } {
  const level = Math.min(step.hintsUsed + 1, 5) as HintLevel;
  const next: StepState = { ...step, hintsUsed: level, resolvedBy: level >= 5 ? "hint" : step.resolvedBy };
  return { step: next, move: { act: "give-hint", level, text: HINT_LADDER[level] } };
}

/** The student fixed it themselves. The outcome this product exists to produce. */
export function markSelfCorrected(step: StepState): StepState {
  return { ...step, resolvedBy: step.hintsUsed === 0 ? "self" : "hint" };
}

export interface SessionScore {
  errorsMade: number;
  selfCorrected: number;
  /** The headline number: share of your own mistakes you caught unaided.
   *  Other tutors report how much they helped. This reports how little they had to. */
  selfCorrectionRate: number;
  /** Mean rungs given away per error. Lower is better. 0 means it stayed silent. */
  averageHintDepth: number;
}

export function scoreSession(steps: StepState[]): SessionScore {
  const errors = steps.filter((s) => s.verdict.kind !== "equivalent" && s.verdict.kind !== "undetermined");
  if (errors.length === 0) {
    return { errorsMade: 0, selfCorrected: 0, selfCorrectionRate: 1, averageHintDepth: 0 };
  }
  const selfCorrected = errors.filter((s) => s.resolvedBy === "self").length;
  const depth = errors.reduce((sum, s) => sum + s.hintsUsed, 0) / errors.length;
  return {
    errorsMade: errors.length,
    selfCorrected,
    selfCorrectionRate: selfCorrected / errors.length,
    averageHintDepth: depth,
  };
}
