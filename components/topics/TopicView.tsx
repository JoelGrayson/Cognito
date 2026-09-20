"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, PenLine, Wand2 } from "lucide-react";
import { TopicGraph } from "@/components/TopicGraph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { countModules, findNode, modulePath } from "@/lib/modules";
import { practiceHref } from "@/lib/subjects";
import type { RoadmapRecord } from "@/lib/repo";
import { ModuleList } from "./ModuleList";

interface Props {
  roadmap: RoadmapRecord;
  written: string[];
}

/** A roadmap: the graph, whose nodes open their lessons, and the same modules as a list. */
export function TopicView({ roadmap, written }: Props) {
  const router = useRouter();
  const total = countModules(roadmap.graph);
  const practice = practiceHref(roadmap.goal, roadmap.title);

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 py-6 sm:px-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
        <Link href="/topics">
          <ArrowLeft aria-hidden="true" />
          Topics
        </Link>
      </Button>
      <header className="mt-3 mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{roadmap.title}</h1>
            <Badge variant="secondary">
              {total === 0 ? "No modules" : `${written.length} of ${total} lessons`}
            </Badge>
          </div>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            &ldquo;{roadmap.goal}&rdquo; · click a topic to open its lesson.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {practice && (
            <Button asChild>
              <Link href={practice}>
                <PenLine aria-hidden="true" />
                Practice on the whiteboard
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={`/onboarding/workshop?from=${roadmap.id}`}>
              <Wand2 aria-hidden="true" />
              Refine in the workshop
            </Link>
          </Button>
        </div>
      </header>

      <div className="h-[65vh] min-h-[480px] overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <TopicGraph
          graph={roadmap.graph}
          mode="view"
          onNodeClick={(node) => {
            if (findNode(roadmap.graph, node.id)) router.push(modulePath(roadmap.id, node.id));
          }}
        />
      </div>

      <Card className="mt-8">
        <CardHeader className="border-b">
          <CardTitle className="text-lg">Modules</CardTitle>
          <CardDescription>In learning order. Open one to write or read its lesson.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 [&:last-child]:-mb-(--card-spacing)">
          <ModuleList roadmapId={roadmap.id} graph={roadmap.graph} written={written} />
        </CardContent>
      </Card>
    </main>
  );
}
