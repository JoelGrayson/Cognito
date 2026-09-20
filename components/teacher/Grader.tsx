"use client";

import { useMemo, useReducer, useState } from "react";
import { Board } from "@/components/Board";
import { ProviderSelect } from "@/components/ProviderSelect";
import { ensureAnonymousSession } from "@/lib/auth-client";
import { applyActions } from "@/lib/board";
import { ensureOk } from "@/lib/ndjson";
import type { ProviderId, ProviderInfo } from "@/lib/providers/types";
import type { ProblemStatus } from "@/lib/schema";
import {
  NEXT_STATUS,
  classSummary,
  finalProblems,
  percent,
  reduce,
  scoreOf,
  splitPages,
  studentFromFile,
  toCsv,
  type PageGrade,
  type Submission,
} from "@/lib/teacher/grading";
import { pagesOf } from "@/lib/whiteboard/pdf";
import { cn } from "@/lib/utils";

/** A class set scanned as one PDF: 35 students at two pages each, with room to spare. */
const MAX_STACK_PAGES = 80;
/** Pages graded at once. Enough to feel quick, few enough to stay under provider rate limits. */
const PARALLEL = 3;

const STATUS_STYLE: Record<ProblemStatus, string> = {
  correct: "bg-(--wb-good) text-(--wb-good-ink)",
  partial: "bg-(--wb-butter) text-(--wb-butter-ink)",
  wrong: "bg-(--wb-bad) text-(--wb-bad-ink)",
  blank: "bg-(--wb-hover) text-(--wb-muted)",
};

const card = "rounded-3xl border border-(--wb-line) bg-(--wb-card) shadow-[0_2px_10px_rgb(59_42_31/0.06)]";
const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-(--wb-primary) px-5 text-(--wb-card) transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50";
const quietButton =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-(--wb-line) px-5 hover:bg-(--wb-hover) disabled:opacity-50";

async function gradePage(page: Submission["pages"][number], answerKey: string, provider: ProviderId): Promise<PageGrade> {
  const res = await fetch("/api/teacher/grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: page.src, width: page.w, height: page.h, answerKey: answerKey || undefined, provider }),
  });
  await ensureOk(res);
  return (await res.json()) as PageGrade;
}

export function Grader({ providers }: { providers: ProviderInfo[] }) {
  const [submissions, dispatch] = useReducer(reduce, []);
  const [answerKey, setAnswerKey] = useState("");
  const [stacked, setStacked] = useState(false);
  const [perStudent, setPerStudent] = useState(1);
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<ProviderId | null>(null);

  // Only OpenAI and Claude read pictures; fall back to whichever of them is set up.
  const readers = providers.filter((p) => p.id === "openai" || p.id === "anthropic");
  const usable = readers.filter((p) => p.configured);
  const providerId: ProviderId = picked && usable.some((p) => p.id === picked) ? picked : (usable[0]?.id ?? "openai");

  const summary = useMemo(() => classSummary(submissions), [submissions]);
  const waiting = submissions.filter((s) => s.state.kind === "queued" || s.state.kind === "failed");
  const open = submissions.find((s) => s.id === openId) ?? null;

  async function addFiles(files: File[]) {
    setError(null);
    setReading(true);
    try {
      const added: Submission[] = [];
      for (const file of files) {
        const pages = await pagesOf(file, MAX_STACK_PAGES);
        const name = studentFromFile(file.name);
        const groups = stacked ? splitPages(pages, perStudent) : [pages];
        groups.forEach((group, i) =>
          added.push({
            id: crypto.randomUUID(),
            student: groups.length > 1 ? `${name} · student ${i + 1}` : name,
            pages: group,
            state: { kind: "queued" },
          }),
        );
      }
      dispatch({ type: "add", submissions: added });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setReading(false);
    }
  }

  async function gradeAll() {
    const queue = [...waiting];
    setRunning(true);
    setError(null);
    try {
      await ensureAnonymousSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start a session.");
      setRunning(false);
      return;
    }
    const worker = async () => {
      for (let s = queue.shift(); s; s = queue.shift()) {
        dispatch({ type: "start", id: s.id });
        try {
          const pages: PageGrade[] = [];
          for (const page of s.pages) pages.push(await gradePage(page, answerKey, providerId));
          dispatch({ type: "graded", id: s.id, pages });
        } catch (err) {
          dispatch({ type: "failed", id: s.id, error: err instanceof Error ? err.message : "Grading failed." });
        }
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    setRunning(false);
  }

  function downloadCsv() {
    const url = URL.createObjectURL(new Blob([toCsv(submissions)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "grades.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-10 grid gap-6">
      <section className={cn(card, "grid gap-6 p-6 lg:grid-cols-2")}>
        <div>
          <h2 className="wb-serif text-2xl">1. Add the worksheets</h2>
          <label
            className="mt-4 flex min-h-40 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-(--wb-line) p-6 text-center hover:bg-(--wb-hover)"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void addFiles([...e.dataTransfer.files]);
            }}
          >
            <span className="text-lg">{reading ? "Reading pages…" : "Drop scans or photos here, or click to choose"}</span>
            <span className="text-sm text-(--wb-muted)">PDF, PNG or JPEG. Pick as many as you like; up to {MAX_STACK_PAGES} pages per PDF.</span>
            <input
              type="file"
              multiple
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={reading}
              onChange={(e) => {
                void addFiles([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </label>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={stacked} onChange={(e) => setStacked(e.target.checked)} />
            One scan holds the whole class, with
            <input
              type="number"
              min={1}
              max={8}
              value={perStudent}
              disabled={!stacked}
              onChange={(e) => setPerStudent(Math.max(1, Number(e.target.value) || 1))}
              className="h-8 w-14 rounded-lg border border-(--wb-line) bg-(--wb-card) px-2 disabled:opacity-50"
              aria-label="Pages per student"
            />
            page(s) per student
          </label>
        </div>
        <div className="flex flex-col">
          <h2 className="wb-serif text-2xl">2. Answer key (optional)</h2>
          <textarea
            value={answerKey}
            onChange={(e) => setAnswerKey(e.target.value)}
            maxLength={4000}
            placeholder={"1. x = 4\n2. x > -3\n3. (x + 2)(x - 5)\nAccept unsimplified fractions."}
            className="mt-4 min-h-40 flex-1 rounded-2xl border border-(--wb-line) bg-(--wb-card) p-4 font-mono text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <p className="mt-2 text-sm text-(--wb-muted)">Without a key, each problem is worked out and checked from scratch.</p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={primaryButton} disabled={running || waiting.length === 0} onClick={() => void gradeAll()}>
          {running ? "Grading…" : `Grade ${waiting.length} worksheet${waiting.length === 1 ? "" : "s"}`}
        </button>
        <button type="button" className={quietButton} disabled={summary.graded === 0} onClick={downloadCsv}>
          Export gradebook (CSV)
        </button>
        <button type="button" className={quietButton} disabled={running || submissions.length === 0} onClick={() => dispatch({ type: "clear" })}>
          Clear
        </button>
        <span className="ml-auto">
          <ProviderSelect providers={readers} value={providerId} onChange={setPicked} disabled={running} />
        </span>
      </div>
      {error && <p className="rounded-2xl bg-(--wb-bad) px-4 py-3 text-(--wb-bad-ink)">{error}</p>}
      {usable.length === 0 && (
        <p className="rounded-2xl bg-(--wb-butter) px-4 py-3 text-(--wb-butter-ink)">
          Grading needs a model that reads pictures. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.
        </p>
      )}

      {summary.graded > 0 && (
        <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className={cn(card, "p-6")}>
            <p className="text-sm text-(--wb-muted)">Class average</p>
            <p className="wb-serif mt-1 text-5xl">{summary.average}%</p>
            <p className="mt-2 text-sm text-(--wb-muted)">
              {summary.graded} of {submissions.length} graded
            </p>
          </div>
          <div className={cn(card, "p-6")}>
            <p className="text-sm text-(--wb-muted)">Where the class lost credit</p>
            {summary.trouble.length === 0 ? (
              <p className="mt-2 text-lg">Nobody missed anything.</p>
            ) : (
              <ul className="mt-3 grid gap-3">
                {summary.trouble.slice(0, 4).map((t) => (
                  <li key={t.label} className="flex gap-3">
                    <span className="flex-none rounded-lg bg-(--wb-bad) px-2.5 py-1 text-sm text-(--wb-bad-ink)">
                      Q{t.label} · {t.missed}/{t.of}
                    </span>
                    <span className="text-sm leading-relaxed text-(--wb-muted)">{t.notes.slice(0, 3).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {submissions.length > 0 && (
        <section className={cn(card, "overflow-hidden")}>
          <ul className="divide-y divide-(--wb-line)">
            {submissions.map((s) => {
              const score = scoreOf(s.state);
              return (
                <li key={s.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3", s.id === openId && "bg-(--wb-hover)")}>
                  <input
                    value={s.student}
                    onChange={(e) => dispatch({ type: "rename", id: s.id, student: e.target.value })}
                    aria-label="Student name"
                    className="w-52 rounded-lg border border-transparent bg-transparent px-2 py-1 hover:border-(--wb-line) focus:border-(--wb-line) focus:outline-none"
                  />
                  <span className="w-20 text-right tabular-nums">
                    {score ? `${score.earned}/${score.possible}` : s.state.kind === "grading" ? "Grading…" : s.state.kind === "failed" ? "Failed" : "Waiting"}
                  </span>
                  <span className="flex flex-1 flex-wrap gap-1.5">
                    {s.state.kind === "graded" &&
                      finalProblems(s.state).map((p, i) => (
                        <button
                          key={i}
                          type="button"
                          title={`${p.status}${p.note ? `: ${p.note}` : ""}. Click to change.`}
                          onClick={() => dispatch({ type: "override", id: s.id, problem: i, status: NEXT_STATUS[p.status] })}
                          className={cn(
                            "rounded-lg px-2 py-0.5 text-sm",
                            STATUS_STYLE[p.status],
                            s.state.kind === "graded" && i in s.state.overrides && "ring-2 ring-(--wb-primary)",
                          )}
                        >
                          {p.label}
                        </button>
                      ))}
                    {s.state.kind === "failed" && <span className="text-sm text-(--wb-bad-ink)">{s.state.error}</span>}
                    {s.state.kind === "queued" && (
                      <span className="text-sm text-(--wb-muted)">
                        {s.pages.length} page{s.pages.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </span>
                  <button type="button" className="text-sm underline-offset-4 hover:underline" onClick={() => setOpenId(s.id === openId ? null : s.id)}>
                    {s.id === openId ? "Close" : "View"}
                  </button>
                  <button
                    type="button"
                    className="text-sm text-(--wb-muted) underline-offset-4 hover:underline disabled:opacity-50"
                    disabled={s.state.kind === "grading"}
                    onClick={() => dispatch({ type: "remove", id: s.id })}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {open && <Detail submission={open} />}
    </div>
  );
}

function Detail({ submission }: { submission: Submission }) {
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
