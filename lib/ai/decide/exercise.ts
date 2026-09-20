/**
 * Did the learner's code solve the exercise?
 *
 * The review call decides that and writes the feedback in one generation, so a
 * verdict that the test results already settle is produced by the same sampling
 * that writes prose: a run where every test passes can still come back "almost"
 * because the model talked itself into a style note. Jev reads the task, the
 * code and the run and answers the verdict on its own, with a probability.
 *
 * Above `VERDICT_FLOOR` the verdict is fixed and the provider only writes: the
 * feedback and the hint, told which verdict they are explaining. Below it, or
 * with Jev unavailable, the provider decides as it always has.
 */
import { choice, jevConfigured, tryAsk } from "@/lib/ai/jev";
import type { CodeReview } from "@/lib/schema";

/** How sure Jev must be before the provider is told the verdict instead of asked for it. */
export const VERDICT_FLOOR = 0.85;

/** Jev answers in well under a second; anything slower is not worth delaying the review for. */
const DEADLINE_MS = 1500;

export type Verdict = CodeReview["verdict"];

export interface Triage {
  verdict: Verdict;
  /** Probability of the chosen verdict, before the floor is applied. */
  probability: number;
  model: string;
  ms: number;
}

export interface Submission {
  exercise: { title: string; language: string; task: string; tests: { name: string; expression: string }[] };
  code: string;
  run: { output: string[]; error: string | null; results: { name: string; pass: boolean; error?: string }[] } | null;
}

const QUESTION =
  "Has the learner's `code` solved the `task`? Judge the task as written: a test failing on something " +
  "the task never asked for does not make the answer wrong, and style, naming or efficiency are not " +
  "correctness. When the code did not run in the browser there are no results to read, so trace it " +
  "against `tests` yourself.";

/** Null when Jev cannot answer, so the caller keeps the provider's own verdict. */
export async function triageExercise(submission: Submission): Promise<Triage | null> {
  if (!jevConfigured()) return null;

  const result = await tryAsk(
    {
      task: submission.exercise.task,
      language: submission.exercise.language,
      code: submission.code.slice(0, 8000),
      tests: submission.exercise.tests.map((t) => `${t.name}: ${t.expression}`),
      run: submission.run
        ? {
            error: submission.run.error,
            output: submission.run.output.slice(-40),
            results: submission.run.results.map((r) => `${r.pass ? "PASS" : "FAIL"} ${r.name}${r.error ? ` (${r.error})` : ""}`),
          }
        : "This language does not run in the browser: there is no output to read.",
    },
    {
      verdict: choice(QUESTION, {
        correct: "It solves the task. Remaining nits are style or polish, not the answer being wrong.",
        almost: "One small fix away: a single off-by-one, a wrong comparison, a missed edge case.",
        incorrect: "It does not solve the task: wrong approach, does not run, or most of the work is missing.",
      }),
    },
    // The review is what the learner is waiting for, and it still has to be
    // written after this. A decision that has not landed in a second is not
    // worth the wait: drop it and let the provider judge.
    { timeoutMs: DEADLINE_MS },
  );
  if (!result) return null;

  const { choice: verdict, probabilities } = result.answers.verdict;
  return { verdict, probability: probabilities[verdict], model: result.model, ms: result.ms };
}

/** The verdict to write feedback for, or null to let the provider decide it. */
export function settledVerdict(triage: Triage | null): Verdict | null {
  return triage !== null && triage.probability >= VERDICT_FLOOR ? triage.verdict : null;
}
