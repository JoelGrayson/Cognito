/**
 * How the learner is doing on each problem, derived from the step verdicts the page
 * already holds. Pure: nothing here is stored, so it describes this session only. A
 * saved history (for spaced repetition) would persist these records, not replace them.
 */
import type { Verdict } from "./checker/circuit";
import type { ProblemAnchor } from "./worksheet";

export type StepMark = "followed" | "flagged" | "unjudged";
export type ProblemState = "not-started" | "in-progress" | "needs-a-look" | "on-track";

export interface ProblemMastery {
  /** The anchor's id, or null for work that belongs to no printed problem. */
  id: number | null;
  label: string;
  steps: StepMark[];
  state: ProblemState;
}

export interface Mastery {
  problems: ProblemMastery[];
  /** Share of problems on track, 0-100. */
  percent: number;
}

interface JudgedLine {
  problemId: number | null;
  verdict: Verdict | null;
  /** Held back until the learner asks: shown as written, never as right or wrong. */
  hidden: boolean;
}

function markOf(line: JudgedLine): StepMark {
  if (line.hidden || !line.verdict || line.verdict.kind === "undetermined") return "unjudged";
  return line.verdict.kind === "equivalent" ? "followed" : "flagged";
}

function stateOf(steps: StepMark[]): ProblemState {
  if (steps.length === 0) return "not-started";
  if (steps.includes("flagged")) return "needs-a-look";
  return steps.includes("followed") ? "on-track" : "in-progress";
}

export function masteryOf(lines: JudgedLine[], anchors: ProblemAnchor[]): Mastery {
  const printed = anchors.filter((a) => a.parsed).sort((a, b) => a.bounds.minY - b.bounds.minY);
  const known = new Set(printed.map((a) => a.id));
  const loose = lines.filter((l) => l.problemId === null || !known.has(l.problemId));

  const problems: ProblemMastery[] = printed.map((anchor, i) => {
    const steps = lines.filter((l) => l.problemId === anchor.id).map(markOf);
    return { id: anchor.id, label: `Problem ${i + 1}`, steps, state: stateOf(steps) };
  });
  if (loose.length > 0 || printed.length === 0) {
    const steps = loose.map(markOf);
    problems.push({ id: null, label: printed.length === 0 ? "This board" : "Other working", steps, state: stateOf(steps) });
  }

  const onTrack = problems.filter((p) => p.state === "on-track").length;
  return { problems, percent: Math.round((onTrack / problems.length) * 100) };
}
