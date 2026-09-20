"use client";

import Image from "next/image";
import { useState } from "react";
import { percent, scoreOf } from "@/lib/teacher/grading";
import { GRADED_EXAMPLES, submissionOf } from "@/lib/teacher/library";
import { cn } from "@/lib/utils";
import { GradedPaper, card } from "./GradedPaper";

const PAPERS = GRADED_EXAMPLES.map((example) => ({ example, submission: submissionOf(example) }));

/** Papers graded ahead of time, to look through before uploading your own. */
export function Library() {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = PAPERS.find((p) => p.example.id === openId);

  return (
    <section aria-labelledby="library" className="mt-14">
      <h2 id="library" className="wb-serif text-2xl font-medium tracking-tight sm:text-3xl">
        Graded papers
      </h2>
      <p className="mt-2 text-(--wb-muted)">Open one to see how a page comes back.</p>
      <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PAPERS.map(({ example, submission }) => {
          const score = scoreOf(submission.state);
          const page = example.pages[0];
          return (
            <li key={example.id}>
              <button
                type="button"
                aria-expanded={example.id === openId}
                onClick={() => setOpenId(example.id === openId ? null : example.id)}
                className={cn(card, "block w-full overflow-hidden text-left transition-transform hover:-translate-y-0.5", example.id === openId && "ring-2 ring-(--wb-primary)")}
              >
                <Image src={page.src} alt="" width={page.w} height={page.h} className="h-44 w-full border-b border-(--wb-line) object-cover object-top" />
                <span className="block p-5">
                  <span className="block text-sm text-(--wb-muted)">{example.topic}</span>
                  <span className="wb-serif mt-1 block text-xl">{example.title}</span>
                  {score && (
                    <span className="mt-3 inline-block rounded-lg bg-(--wb-good) px-2.5 py-1 text-sm text-(--wb-good-ink)">
                      {score.earned}/{score.possible} · {percent(score)}%
                    </span>
                  )}
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
