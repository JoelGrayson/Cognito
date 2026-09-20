import { notFound } from "next/navigation";
import { ModulePane } from "@/components/topics/ModulePane";
import { module } from "../../data";

export async function generateMetadata({ params }: PageProps<"/topics/[id]/module/[nodeId]">) {
  const { id, nodeId } = await params;
  const found = await module(id, nodeId);
  return { title: found ? `${found.lesson?.title ?? found.node.title} | Cognito` : "Lesson | Cognito" };
}

export default async function ModulePage({ params }: PageProps<"/topics/[id]/module/[nodeId]">) {
  const { id, nodeId } = await params;
  const found = await module(id, nodeId);
  if (!found) notFound();
  return (
    <main className="flex flex-1 flex-col px-4 pb-10 sm:px-8">
      <div className="mx-auto mt-4 w-full max-w-6xl">
        <ModulePane
          roadmap={found.roadmap}
          node={found.node}
          lesson={found.lesson}
          written={found.written}
          providerId={found.provider}
        />
      </div>
    </main>
  );
}
