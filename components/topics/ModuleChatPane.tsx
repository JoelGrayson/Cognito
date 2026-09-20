"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LessonChat } from "@/components/LessonChat";
import { modulePath } from "@/lib/modules";
import type { ProviderId } from "@/lib/providers/types";
import type { RoadmapRecord } from "@/lib/repo";
import type { Lesson } from "@/lib/schema";
import { trpc } from "@/lib/trpc";
import type { DraftNode } from "@/types/learning";

interface Props {
  roadmap: RoadmapRecord;
  node: DraftNode;
  lesson: Lesson;
  providerId: ProviderId;
}

/** The tutor for one lesson, on its own page. Rewrites it keeps are saved. */
export function ModuleChatPane({ roadmap, node, lesson, providerId }: Props) {
  const router = useRouter();
  const [current, setCurrent] = useState(lesson);

  async function onLessonChange(next: Lesson) {
    setCurrent(next);
    await trpc.topics.saveLesson.mutate({ id: roadmap.id, nodeId: node.id, lesson: next });
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2 max-w-full text-muted-foreground">
        <Link href={modulePath(roadmap.id, node.id)}>
          <ArrowLeft aria-hidden="true" />
          <span className="truncate">{current.title}</span>
        </Link>
      </Button>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Tutor</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Ask about this lesson, or ask for it to be rewritten. Rewrites are saved to the lesson.
      </p>
      <div className="mt-4">
        <LessonChat
          topic={roadmap.title}
          lesson={current}
          providerId={providerId}
          onLessonChange={(next) => void onLessonChange(next)}
        />
      </div>
    </div>
  );
}
