"use client";

import { useState } from "react";
import type { ProviderId } from "@/lib/providers/types";
import type { Lesson, Quiz } from "@/lib/schema";
import { RichText } from "./RichText";

interface Props {
  lesson: Lesson;
  providerId: ProviderId;
}

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; quiz: Quiz };

/** "Take Quiz" button that turns into a multiple-choice quiz on the lesson. */
export function QuizPanel({ lesson, providerId }: Props) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);

  async function load() {
    setState({ status: "loading" });
    setAnswers({});
    setChecked(false);
    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson, provider: providerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      if (!data.quiz?.questions?.length) throw new Error("The quiz came back empty.");
      setState({ status: "ready", quiz: data.quiz });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  }

  if (state.status !== "ready") {
    return (
      <div className="mt-14 flex flex-col items-center gap-3">
        <button type="button" className="quiz-cta" onClick={load} disabled={state.status === "loading"}>
          {state.status === "loading" ? (
            <>
              <span className="spinner spinner-dark" /> Writing your quiz…
            </>
          ) : (
            "Take Quiz"
          )}
        </button>
        {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}
      </div>
    );
  }

  const { quiz } = state;
  const total = quiz.questions.length;
  const answered = Object.keys(answers).length;
  const score = quiz.questions.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);

  return (
    <section className="mt-14">
      <h2 className="lesson-h2">Quiz</h2>
      <ol className="mt-4 space-y-5">
        {quiz.questions.map((q, i) => {
          const picked = answers[i];
          return (
            <li key={i} className="panel px-5 py-4">
              <p className="font-medium">
                {i + 1}. {q.prompt}
              </p>
              <div className="mt-3 grid gap-2">
                {q.choices.map((choice, j) => {
                  const isPicked = picked === j;
                  const isRight = q.answer === j;
                  let tone = "";
                  if (checked) tone = isRight ? "quiz-right" : isPicked ? "quiz-wrong" : "";
                  else if (isPicked) tone = "quiz-picked";
                  return (
                    <button
                      key={j}
                      type="button"
                      disabled={checked}
                      aria-pressed={isPicked}
                      className={`quiz-choice ${tone}`}
                      onClick={() => setAnswers((a) => ({ ...a, [i]: j }))}
                    >
                      <span className="quiz-letter">{String.fromCharCode(65 + j)}</span>
                      <span>{choice}</span>
                    </button>
                  );
                })}
              </div>
              {checked && <RichText text={q.explanation} className="mt-3 text-sm text-neutral-600" />}
            </li>
          );
        })}
      </ol>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
        {!checked ? (
          <button type="button" className="quiz-cta" disabled={answered < total} onClick={() => setChecked(true)}>
            Check answers{answered < total ? ` (${answered}/${total})` : ""}
          </button>
        ) : (
          <>
            <p className="text-lg font-medium">
              You got {score} of {total}.
            </p>
            <button
              type="button"
              className="text-sm text-neutral-600 underline underline-offset-4 hover:text-neutral-900"
              onClick={() => {
                setAnswers({});
                setChecked(false);
              }}
            >
              Try again
            </button>
            <button
              type="button"
              className="text-sm text-neutral-600 underline underline-offset-4 hover:text-neutral-900"
              onClick={load}
            >
              New quiz
            </button>
          </>
        )}
      </div>
    </section>
  );
}
