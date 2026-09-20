import { notFound, redirect } from "next/navigation";
import { ModuleChatPane } from "@/components/topics/ModuleChatPane";
import { modulePath } from "@/lib/modules";
import { module } from "../../../data";

export async function generateMetadata({ params }: PageProps<"/topics/[id]/module/[nodeId]/chat">) {
  const { id, nodeId } = await params;
  const found = await module(id, nodeId);
  return { title: found ? `Tutor: ${found.lesson?.title ?? found.node.title} | Cognito` : "Tutor | Cognito" };
}

export default async function ModuleChatPage({ params }: PageProps<"/topics/[id]/module/[nodeId]/chat">) {
  const { id, nodeId } = await params;
  const found = await module(id, nodeId);
  if (!found) notFound();
  // The tutor needs a written lesson; the module page writes it.
  if (!found.lesson) redirect(modulePath(id, nodeId));
  return (
    <main className="flex flex-1 flex-col px-4 pb-10 sm:px-8">
      <div className="mx-auto mt-6 w-full max-w-6xl">
        <ModuleChatPane roadmap={found.roadmap} node={found.node} lesson={found.lesson} providerId={found.provider} />
      </div>
    </main>
  );
}
