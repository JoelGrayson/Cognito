import { notFound } from "next/navigation";
import { TopicView } from "@/components/topics/TopicView";
import { topic } from "./data";

export async function generateMetadata({ params }: PageProps<"/topics/[id]">) {
  const { id } = await params;
  const found = await topic(id);
  return { title: found ? `${found.roadmap.title} | Cognition` : "Topic | Cognition" };
}

export default async function TopicPage({ params }: PageProps<"/topics/[id]">) {
  const { id } = await params;
  const found = await topic(id);
  if (!found) notFound();
  return <TopicView roadmap={found.roadmap} written={found.written} />;
}
