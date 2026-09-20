import { notFound } from "next/navigation";
import { RoadmapView } from "@/components/legacy/RoadmapView";
import { legacyRoadmap } from "./data";

export async function generateMetadata({ params }: PageProps<"/legacy/topic/[id]">) {
  const { id } = await params;
  const found = await legacyRoadmap(id);
  return { title: found ? `${found.roadmap.map.topic || found.roadmap.topic} | Cognition` : "Roadmap | Cognition" };
}

export default async function TopicPage({ params }: PageProps<"/legacy/topic/[id]">) {
  const { id } = await params;
  const found = await legacyRoadmap(id);
  if (!found) notFound();
  return (
    <main className="flex flex-1 flex-col px-4 pb-10 sm:px-8">
      <RoadmapView roadmap={found.roadmap} lessonKeys={found.lessonKeys} />
    </main>
  );
}
