"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { TopicGraph } from "@/components/TopicGraph";
import { findNode, modulePath } from "@/lib/modules";
import type { RoadmapRecord } from "@/lib/repo";
import { ModuleList } from "./ModuleList";

interface Props {
  roadmap: RoadmapRecord;
  written: string[];
}

/** A roadmap: the graph, whose nodes open their lessons, and the same modules as a list. */
export function TopicView({ roadmap, written }: Props) {
  const router = useRouter();

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 py-6 sm:px-8">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href="/topics" className="text-sm text-neutral-500 hover:text-neutral-900">
            ← Topics
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{roadmap.title}</h1>
          <p className="mt-1 text-[15px] text-[#6b6b6b]">
            &ldquo;{roadmap.goal}&rdquo; · click a topic to open its lesson.
          </p>
        </div>
        <Link
          href={`/onboarding/workshop?from=${roadmap.id}`}
          className="inline-flex min-h-10 items-center rounded-full border border-[#d5d5d1] bg-white px-4 text-sm font-medium text-[#333] hover:border-[#b9b9b4]"
        >
          Refine in the workshop
        </Link>
      </header>

      <div className="h-[65vh] min-h-[480px] overflow-hidden rounded-2xl border border-[#e4e3de]">
        <TopicGraph
          graph={roadmap.graph}
          mode="view"
          onNodeClick={(node) => {
            if (findNode(roadmap.graph, node.id)) router.push(modulePath(roadmap.id, node.id));
          }}
        />
      </div>

      <section className="mt-8">
        <h2 className="lesson-h2">Modules</h2>
        <div className="panel mt-3">
          <ModuleList roadmapId={roadmap.id} graph={roadmap.graph} written={written} />
        </div>
      </section>
    </main>
  );
}
