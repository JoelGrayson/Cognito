"use client";

import { useState } from "react";
import type { QuestionDraft } from "@/lib/drafts";
import { ensureOk, readNdjson } from "@/lib/ndjson";
import type { ProviderId } from "@/lib/providers/types";
import type { Lesson, Quiz } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { Check, ClipboardCheck, Loader2, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RichText } from "./RichText";

interface Props {
  lesson: Lesson;
  providerId: ProviderId;
}

type State =
  | { status: "idle" }
  | { status: "loading"; questions: QuestionDraft[] }
  | { status: "error"; message: string }
  | { status: "ready"; quiz: Quiz };

/** "Take Quiz" button that turns into a multiple-choice quiz on the lesson. */
export function QuizPanel({ lesson, providerId }: Props) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);

  async function load() {
    setState({ status: "loading", questions: [] });
    setAnswers({});
    setChecked(false);
    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson, provider: providerId }),
      });
      await ensureOk(res);
      let finished = false;
      await readNdjson(res, (event) => {
        if (event.type === "partial") {
          setState({ status: "loading", questions: event.questions as QuestionDraft[] });
        } else if (event.type === "done") {
          finished = true;
          const quiz = event.quiz as Quiz;
          if (!quiz.questions.length) throw new Error("The quiz came back empty.");
          setState({ status: "ready", quiz });
        } else if (event.type === "error") {
          throw new Error(String(event.error));
        }
      });
      if (!finished) throw new Error("The quiz never finished.");
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  }

  const ready = state.status === "ready";
  const questions: QuestionDraft[] =
    state.status === "ready" ? state.quiz.questions : state.status === "loading" ? state.questions : [];

  if (questions.length === 0) {
    return (
      <Card className="mt-14 bg-muted/40">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-brand-soft text-primary">
            <ClipboardCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-lg font-semibold">Check your understanding</p>
            <p className="mt-1 text-sm text-muted-foreground">A short multiple-choice quiz written from this lesson.</p>
          </div>
          <Button type="button" size="lg" className="mt-1" onClick={load} disabled={state.status === "loading"}>
            {state.status === "loading" ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" /> Writing your quiz…
              </>
            ) : (
              "Take quiz"
            )}
          </Button>
          {state.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}
        </CardContent>
      </Card>
    );
  }

  const total = questions.length;
  const answered = Object.keys(answers).length;
  const score = questions.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);

  return (
    <section className="mt-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="lesson-h2">Quiz</h2>
        <Badge variant="secondary">
          {checked ? `${score} of ${total} correct` : `${answered} of ${total} answered`}
        </Badge>
      </div>
      <ol className="mt-4 space-y-4">
        {questions.map((q, i) => {
          const picked = answers[i];
          return (
            <li key={i}>
              <Card size="sm">
                <CardContent>
                  <p className="text-[15px] font-medium">
                    {i + 1}. {q.prompt}
                  </p>
                  <div className="mt-3 grid gap-2">
                    {q.choices.map((choice, j) => {
                      const isPicked = picked === j;
                      const isRight = q.answer === j;
                      let tone: "idle" | "picked" | "right" | "wrong" = "idle";
                      if (checked) tone = isRight ? "right" : isPicked ? "wrong" : "idle";
                      else if (isPicked) tone = "picked";
                      return (
                        <button
                          key={j}
                          type="button"
                          disabled={checked || !ready}
                          aria-pressed={isPicked}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-left text-[15px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default",
                            tone === "idle" && "border-border enabled:hover:border-muted-foreground/40 enabled:hover:bg-muted/50",
                            tone === "picked" && "border-primary bg-brand-soft/70",
                            tone === "right" && "border-emerald-600 bg-emerald-50",
                            tone === "wrong" && "border-destructive bg-destructive/5",
                          )}
                          onClick={() => setAnswers((a) => ({ ...a, [i]: j }))}
                        >
                          <span
                            className={cn(
                              "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                              tone === "idle" && "bg-muted text-muted-foreground",
                              tone === "picked" && "bg-primary text-primary-foreground",
                              tone === "right" && "bg-emerald-600 text-white",
                              tone === "wrong" && "bg-destructive text-white",
                            )}
                          >
                            {tone === "right" ? <Check className="size-3.5" aria-label="Correct" /> : tone === "wrong" ? <X className="size-3.5" aria-label="Incorrect" /> : String.fromCharCode(65 + j)}
                          </span>
                          <span>{choice}</span>
                        </button>
                      );
                    })}
                  </div>
                  {checked && q.explanation && <RichText text={q.explanation} className="mt-3 text-sm text-muted-foreground" />}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {!ready ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Writing more questions…
          </p>
        ) : !checked ? (
          <Button type="button" size="lg" disabled={answered < total} onClick={() => setChecked(true)}>
            Check answers{answered < total ? ` (${answered}/${total})` : ""}
          </Button>
        ) : (
          <>
            <p className="text-lg font-medium">
              You got {score} of {total}.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAnswers({});
                setChecked(false);
              }}
            >
              <RotateCcw aria-hidden="true" />
              Try again
            </Button>
            <Button type="button" variant="ghost" onClick={load}>
              New quiz
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
