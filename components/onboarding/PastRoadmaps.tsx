"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RoadmapSummary } from "@/lib/repo";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--wb-primary)]";

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

/** Past generated roadmaps, like chat history — clicking one reopens it in the workshop. */
export function PastRoadmaps({ heading = "Pick up where you left off", emptyText }: { heading?: string; emptyText?: string }) {
  const [roadmaps, setRoadmaps] = useState<RoadmapSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/roadmaps")
      .then(async (res) => (res.ok ? ((await res.json()) as { roadmaps: RoadmapSummary[] }).roadmaps : []))
      .then((list) => {
        if (!cancelled) setRoadmaps(list);
      })
      .catch(() => {
        if (!cancelled) setRoadmaps([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!roadmaps?.length && !emptyText) return null;

  return (
    <div className="mt-8">
      <p className="mb-2 text-sm font-medium text-(--wb-muted)">{heading}</p>
      {!roadmaps?.length ? (
        <p className="text-sm text-(--wb-muted)">{emptyText}</p>
      ) : (
      <ul className="space-y-2">
        {roadmaps.map((roadmap) => (
          <li key={roadmap.id}>
            <Link
              href={`/onboarding/workshop?from=${roadmap.id}`}
              className={`flex items-center justify-between gap-3 rounded-2xl bg-(--wb-hover) px-4 py-3 text-left hover:bg-(--wb-line) ${focus}`}
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium text-(--wb-ink)">{roadmap.title}</span>
                <span className="block truncate text-[13px] text-(--wb-muted)">{roadmap.goal}</span>
              </span>
              <span className="shrink-0 text-xs text-(--wb-muted)">{formatDate(roadmap.updatedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}
