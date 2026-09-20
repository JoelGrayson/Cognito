"use client";

import Image from "next/image";
import { useState } from "react";
import { classSummary, percent, scoreOf } from "@/lib/teacher/grading";
import { GRADED_EXAMPLES, submissionOf } from "@/lib/teacher/library";
import { cn } from "@/lib/utils";
import { GradedPaper, card } from "./GradedPaper";

const PAPERS = GRADED_EXAMPLES.map((example) => ({ example, submission: submissionOf(example) }));
const SUMMARY = classSummary(PAPERS.map((p) => p.submission));

/** One pastel per student, so a stack of the same worksheet still reads as three people. */
const TINTS = [
  { tint: "#dfeaf6", ink: "#3f6b9c" },
  { tint: "#e9e4f7", ink: "#5d4a9c" },
  { tint: "#fbe6d4", ink: "#a8622a" },
];

function gradeStyle(pct: number): string {
  if (pct >= 90) return "bg-(--wb-good) text-(--wb-good-ink)";
  if (pct >= 75) return "bg-(--wb-butter) text-(--wb-butter-ink)";
  return "bg-(--wb-bad) text-(--wb-bad-ink)";
}

/** Papers graded ahead of time, to look through before uploading your own. */
export function Library() {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = PAPERS.find((p) => p.example.id === openId);

  return (
    <section aria-labelledby="library" className="mt-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="library" className="wb-serif text-2xl font-medium tracking-tight sm:text-3xl">
            Graded papers
          </h2>
          <p className="mt-2 text-(--wb-muted)">One worksheet, three students. Open a paper to see how it came back.</p>
        </div>
        <p className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-(--wb-good) px-3.5 py-1.5 text-(--wb-good-ink)">Class average {SUMMARY.average}%</span>
          {SUMMARY.trouble.slice(0, 2).map((t) => (
            <span key={t.label} className="rounded-full bg-(--wb-bad) px-3.5 py-1.5 text-(--wb-bad-ink)">
              Q{t.label} missed by {t.missed} of {t.of}
            </span>
          ))}
        </p>
      </div>
      <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PAPERS.map(({ example, submission }, i) => {
          const score = scoreOf(submission.state);
          const page = example.pages[0];
          const { tint, ink } = TINTS[i % TINTS.length];
          return (
            <li key={example.id}>
              <button
                type="button"
                aria-expanded={example.id === openId}
                onClick={() => setOpenId(example.id === openId ? null : example.id)}
                className={cn(card, "block w-full overflow-hidden text-left transition-transform hover:-translate-y-0.5", example.id === openId && "ring-2 ring-(--wb-primary)")}
              >
                <span className="flex items-center gap-3 px-5 py-4" style={{ background: tint, color: ink }}>
                  <span aria-hidden="true" className="wb-serif flex size-10 flex-none items-center justify-center rounded-full bg-(--wb-card) text-lg">
                    {example.student[0]}
                  </span>
                  <span className="wb-serif min-w-0 flex-1 truncate text-xl">{example.student}</span>
                  {score && (
                    <span className={cn("flex-none rounded-lg px-2.5 py-1 text-sm", gradeStyle(percent(score)))}>
                      {score.earned}/{score.possible} · {percent(score)}%
                    </span>
                  )}
                </span>
                <Image src={page.src} alt="" width={page.w} height={page.h} className="h-44 w-full border-y border-(--wb-line) object-cover object-top" />
                <span className="block p-5">
                  <span className="block text-sm text-(--wb-muted)">{example.topic}</span>
                  <span className="mt-1 block text-lg leading-snug">{example.title}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {open && (
        <div className="mt-6">
          <GradedPaper submission={open.submission} />
        </div>
      )}
    </section>
  );
}
