"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { RoadmapSummary } from "@/lib/repo";

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
      <p className="mb-2 text-sm font-medium text-foreground/80">{heading}</p>
      {!roadmaps?.length ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 divide-y divide-border">
          {roadmaps.map((roadmap) => (
            <li key={roadmap.id}>
              <Link
                href={`/onboarding/workshop?from=${roadmap.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium">{roadmap.title}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">{roadmap.goal}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {formatDate(roadmap.updatedAt)}
                  <ChevronRight className="size-4" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
