import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonChatPane } from "@/components/legacy/LessonChatPane";
import { modulePath } from "@/lib/legacy-paths";
import { legacyLesson } from "../../../data";

export const metadata = { title: "Tutor | Cognition" };

export default async function ModuleChatPage({ params }: PageProps<"/legacy/topic/[id]/module/[slug]/chat">) {
  const { id, slug } = await params;
  const found = await legacyLesson(id, slug);
  if (!found) notFound();
  if (!found.lesson) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-16 sm:px-8">
        <p className="text-neutral-600">The tutor joins once the lesson is written.</p>
        <Link href={modulePath(id, slug)} className="lesson-link mt-3 text-sm">
          Open the lesson
        </Link>
      </main>
    );
  }
  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-8">
      <LessonChatPane roadmap={found.roadmap} lessonKey={slug} lesson={found.lesson} />
    </main>
  );
}
