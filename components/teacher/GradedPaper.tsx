"use client";

import { Board } from "@/components/Board";
import { applyActions } from "@/lib/board";
import type { ProblemStatus } from "@/lib/schema";
import { finalProblems, percent, scoreOf, type Submission } from "@/lib/teacher/grading";
import { cn } from "@/lib/utils";

export const STATUS_STYLE: Record<ProblemStatus, string> = {
  correct: "bg-(--wb-good) text-(--wb-good-ink)",
  partial: "bg-(--wb-butter) text-(--wb-butter-ink)",
  wrong: "bg-(--wb-bad) text-(--wb-bad-ink)",
  blank: "bg-(--wb-hover) text-(--wb-muted)",
};

export const card = "rounded-3xl border border-(--wb-line) bg-(--wb-card) shadow-[0_2px_10px_rgb(59_42_31/0.06)]";

/** One student's pages with the red-pen marks drawn on, beside the score and the notes. */
export function GradedPaper({ submission }: { submission: Submission }) {
  const { state, pages } = submission;
  const score = scoreOf(state);
  return (
    <section className={cn(card, "grid gap-6 p-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]")}>
      <div className="grid gap-4">
        {pages.map((page, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-(--wb-line)">
            <Board
              elements={state.kind === "graded" ? applyActions([], state.marks[i] ?? []) : []}
              width={page.w}
              height={page.h}
              background={page.src}
              plain
              canDraw={false}
              penColor="red"
              onStroke={() => {}}
            />
          </div>
        ))}
      </div>
      <div>
        <h2 className="wb-serif text-2xl">{submission.student}</h2>
        {score && (
          <p className="mt-1 text-(--wb-muted)">
            {score.earned} of {score.possible} · {percent(score)}%
          </p>
        )}
        {state.kind === "graded" && (
          <>
            <p className="mt-4 rounded-2xl bg-(--wb-butter)/60 p-4 leading-relaxed">{state.feedback}</p>
            <ul className="mt-4 grid gap-2">
              {finalProblems(state).map((p, i) => (
                <li key={i} className="flex items-baseline gap-3">
                  <span className={cn("flex-none rounded-lg px-2 py-0.5 text-sm", STATUS_STYLE[p.status])}>
                    {p.label} · {p.status}
                  </span>
                  <span className="text-sm text-(--wb-muted)">{p.note}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {state.kind !== "graded" && <p className="mt-4 text-(--wb-muted)">Not graded yet.</p>}
      </div>
    </section>
  );
}
