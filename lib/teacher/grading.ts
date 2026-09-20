/**
 * A class set of worksheets being graded. Pure: no React, no DOM, no network.
 *
 * The model's grade is never edited. A teacher's change of mind is an override laid
 * over it, so the table can show where the two disagree and an override can be undone.
 */
import type { ResolvedAction } from "@/lib/board";
import type { GradedPage, ProblemStatus } from "@/lib/schema";

/** What the grading route returns for one page. */
export type PageGrade = Omit<GradedPage, "marks"> & { marks: ResolvedAction[] };

export interface SheetPage {
  src: string;
  w: number;
  h: number;
}

export interface GradedProblem {
  /** Index into the submission's pages. */
  page: number;
  label: string;
  status: ProblemStatus;
  note: string;
}

export type GradeState =
  | { kind: "queued" }
  | { kind: "grading" }
  | {
      kind: "graded";
      problems: GradedProblem[];
      /** Teacher's status per index into `problems`. */
      overrides: Record<number, ProblemStatus>;
      feedback: string;
      /** Red-pen marks per page, same order as the submission's pages. */
      marks: ResolvedAction[][];
    }
  | { kind: "failed"; error: string };

export interface Submission {
  id: string;
  student: string;
  pages: SheetPage[];
  state: GradeState;
}

export type Action =
  | { type: "add"; submissions: Submission[] }
  | { type: "remove"; id: string }
  | { type: "rename"; id: string; student: string }
  | { type: "start"; id: string }
  | { type: "graded"; id: string; pages: PageGrade[] }
  | { type: "failed"; id: string; error: string }
  | { type: "override"; id: string; problem: number; status: ProblemStatus }
  | { type: "clear" };

const POINTS: Record<ProblemStatus, number> = { correct: 1, partial: 0.5, wrong: 0, blank: 0 };

/** The order a teacher's click cycles a problem through. */
export const NEXT_STATUS: Record<ProblemStatus, ProblemStatus> = {
  correct: "partial",
  partial: "wrong",
  wrong: "blank",
  blank: "correct",
};

/** "period3_maria-lopez.pdf" -> "period3 maria lopez". A name written on the page beats it. */
export function studentFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

function graded(student: string, pages: PageGrade[]): Pick<Submission, "student" | "state"> {
  const written = pages.map((p) => p.studentName.trim()).find(Boolean);
  return {
    student: written ?? student,
    state: {
      kind: "graded",
      problems: pages.flatMap((p, page) => p.problems.map((problem) => ({ ...problem, page }))),
      overrides: {},
      feedback: pages.map((p) => p.feedback.trim()).filter(Boolean).join(" "),
      marks: pages.map((p) => p.marks),
    },
  };
}

export function reduce(all: Submission[], action: Action): Submission[] {
  if (action.type === "add") return [...all, ...action.submissions];
  if (action.type === "clear") return [];
  if (action.type === "remove") return all.filter((s) => s.id !== action.id);
  return all.map((s) => {
    if (s.id !== action.id) return s;
    switch (action.type) {
      case "rename":
        return { ...s, student: action.student };
      case "start":
        return { ...s, state: { kind: "grading" } };
      case "graded":
        return { ...s, ...graded(s.student, action.pages) };
      case "failed":
        return { ...s, state: { kind: "failed", error: action.error } };
      case "override": {
        if (s.state.kind !== "graded") return s;
        const overrides = { ...s.state.overrides };
        // Overriding back to what the model said is no override at all.
        if (s.state.problems[action.problem]?.status === action.status) delete overrides[action.problem];
        else overrides[action.problem] = action.status;
        return { ...s, state: { ...s.state, overrides } };
      }
    }
  });
}

/** The statuses that count: the teacher's where they overrode, else the model's. */
export function finalProblems(state: Extract<GradeState, { kind: "graded" }>): GradedProblem[] {
  return state.problems.map((p, i) => ({ ...p, status: state.overrides[i] ?? p.status }));
}

export interface Score {
  earned: number;
  possible: number;
}

export function scoreOf(state: GradeState): Score | null {
  if (state.kind !== "graded") return null;
  const problems = finalProblems(state);
  return { earned: problems.reduce((sum, p) => sum + POINTS[p.status], 0), possible: problems.length };
}

export function percent(score: Score): number {
  return score.possible === 0 ? 0 : Math.round((score.earned / score.possible) * 100);
}

/**
 * What identifies a problem across students. The model's labels are only unique within a
 * page, so a label that repeats across a submission's pages is qualified with its page:
 * "1" on a one-page sheet, "1 (p2)" when both pages print a problem 1.
 */
export function problemKey(problems: GradedProblem[], p: GradedProblem): string {
  const repeated = problems.some((q) => q !== p && q.label === p.label && q.page !== p.page);
  return repeated ? `${p.label} (p${p.page + 1})` : p.label;
}

export interface ProblemStat {
  label: string;
  /** Students who lost credit on it, out of `of` who were graded on it. */
  missed: number;
  of: number;
  /** What went wrong, one note per student who lost credit. */
  notes: string[];
}

export interface ClassSummary {
  graded: number;
  average: number | null;
  /** Most-missed first; problems nobody missed are left out. */
  trouble: ProblemStat[];
}

export function classSummary(all: Submission[]): ClassSummary {
  const stats = new Map<string, ProblemStat>();
  const percents: number[] = [];
  for (const s of all) {
    if (s.state.kind !== "graded") continue;
    const score = scoreOf(s.state);
    if (score) percents.push(percent(score));
    const problems = finalProblems(s.state);
    for (const p of problems) {
      const key = problemKey(problems, p);
      const stat = stats.get(key) ?? { label: key, missed: 0, of: 0, notes: [] };
      stat.of += 1;
      if (p.status !== "correct") {
        stat.missed += 1;
        if (p.note) stat.notes.push(p.note);
      }
      stats.set(key, stat);
    }
  }
  return {
    graded: percents.length,
    average: percents.length ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length) : null,
    trouble: [...stats.values()].filter((t) => t.missed > 0).sort((a, b) => b.missed / b.of - a.missed / a.of),
  };
}

function cell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A gradebook: one row per graded student, one column per problem. */
export function toCsv(all: Submission[]): string {
  const rows = all.flatMap((s) => {
    if (s.state.kind !== "graded") return [];
    const problems = finalProblems(s.state);
    return [{ s, state: s.state, byKey: new Map(problems.map((p) => [problemKey(problems, p), p.status])) }];
  });
  const keys = [...new Set(rows.flatMap(({ byKey }) => [...byKey.keys()]))];
  const header = ["Student", "Score", "Out of", "Percent", ...keys.map((k) => `Q${k}`), "Feedback"];
  const lines = rows.map(({ s, state, byKey }) => {
    const score = scoreOf(state) ?? { earned: 0, possible: 0 };
    return [s.student, score.earned, score.possible, percent(score), ...keys.map((k) => byKey.get(k) ?? ""), state.feedback];
  });
  return [header, ...lines].map((row) => row.map(cell).join(",")).join("\n");
}

/** Cut a stacked class scan into one run of pages per student. */
export function splitPages<T>(pages: T[], perStudent: number): T[][] {
  const size = Math.max(1, Math.floor(perStudent));
  const out: T[][] = [];
  for (let i = 0; i < pages.length; i += size) out.push(pages.slice(i, i + size));
  return out;
}
