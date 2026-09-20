"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RoadmapSummary } from "@/lib/repo";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]";

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

/** Past generated roadmaps, like chat history — clicking one reopens it in the workshop. */
export function PastRoadmaps() {
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

  if (!roadmaps?.length) return null;

  return (
    <div className="mt-8">
      <p className="mb-2 text-sm font-medium text-[#444]">Pick up where you left off</p>
      <ul className="space-y-2">
        {roadmaps.map((roadmap) => (
          <li key={roadmap.id}>
            <Link
              href={`/onboarding/workshop?from=${roadmap.id}`}
              className={`flex items-center justify-between gap-3 rounded-2xl bg-[var(--panel)] px-4 py-3 text-left hover:bg-[#efefeb] ${focus}`}
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold text-[#222]">{roadmap.title}</span>
                <span className="block truncate text-[13px] text-[#6b6b67]">{roadmap.goal}</span>
              </span>
              <span className="shrink-0 text-xs text-[#8a8a8a]">{formatDate(roadmap.updatedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
