import { notFound } from "next/navigation";
import { LessonPane } from "@/components/legacy/LessonPane";
import { legacyLesson, legacyRoadmap } from "../../data";

export async function generateMetadata({ params }: PageProps<"/legacy/topic/[id]/module/[slug]">) {
  const { id, slug } = await params;
  const found = await legacyLesson(id, slug);
  return { title: found ? `${found.lesson?.title ?? slug} | Cognition` : "Lesson | Cognition" };
}

export default async function ModulePage({ params }: PageProps<"/legacy/topic/[id]/module/[slug]">) {
  const { id, slug } = await params;
  const [found, roadmap] = await Promise.all([legacyLesson(id, slug), legacyRoadmap(id)]);
  if (!found || !roadmap) notFound();
  return (
    <main className="flex flex-1 flex-col px-4 pb-10 sm:px-8">
      <div className="mx-auto mt-4 w-full max-w-6xl">
        <LessonPane
          roadmap={found.roadmap}
          selected={found.ref}
          lesson={found.lesson}
          writtenKeys={roadmap.lessonKeys}
        />
      </div>
    </main>
  );
}
