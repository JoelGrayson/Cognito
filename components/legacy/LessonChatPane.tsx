"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LessonChat } from "@/components/LessonChat";
import { modulePath } from "@/lib/legacy-paths";
import type { LegacyRoadmapRecord } from "@/lib/repo";
import type { Lesson } from "@/lib/schema";
import { trpc } from "@/lib/trpc";

interface Props {
  roadmap: LegacyRoadmapRecord;
  lessonKey: string;
  lesson: Lesson;
}

/** The tutor for one lesson, on its own page. Rewrites it keeps are saved. */
export function LessonChatPane({ roadmap, lessonKey, lesson }: Props) {
  const router = useRouter();
  const [current, setCurrent] = useState(lesson);

  async function onLessonChange(next: Lesson) {
    setCurrent(next);
    await trpc.legacy.saveLesson.mutate({ id: roadmap.id, key: lessonKey, lesson: next });
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link href={modulePath(roadmap.id, lessonKey)} className="text-sm text-neutral-500 hover:text-neutral-900">
        ← {current.title}
      </Link>
      <h1 className="mt-2 text-2xl font-medium tracking-tight">Tutor</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Ask about this lesson, or ask for it to be rewritten. Rewrites are saved to the lesson.
      </p>
      <div className="mt-4">
        <LessonChat
          topic={roadmap.topic}
          lesson={current}
          providerId={roadmap.provider}
          onLessonChange={(next) => void onLessonChange(next)}
        />
      </div>
    </div>
  );
}
