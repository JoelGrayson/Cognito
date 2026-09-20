import Link from "next/link";
import { TRPCError } from "@trpc/server";
import { DeleteTopic } from "@/components/topics/DeleteTopic";
import { topicPath } from "@/lib/modules";
import type { RoadmapSummary } from "@/lib/repo";
import { serverTrpc } from "@/server/caller";

export const metadata = { title: "Topics | Cognito" };

export default async function TopicsPage() {
  const trpc = await serverTrpc();
  let topics: RoadmapSummary[] = [];
  let signedOut = false;
  try {
    topics = await trpc.topics.list();
  } catch (error) {
    if (error instanceof TRPCError && error.code === "UNAUTHORIZED") signedOut = true;
    else throw error;
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-medium tracking-tight">Topics</h1>
        <Link href="/onboarding?new=1" className="lesson-link text-sm">
          Learn something new
        </Link>
      </div>

      {signedOut || topics.length === 0 ? (
        <p className="mt-8 text-neutral-600">
          {signedOut ? "Sign in to see the topics you have started." : "No topics yet."}{" "}
          <Link href="/onboarding?new=1" className="lesson-link">
            Start one
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-100">
          {topics.map((topic) => (
            <li key={topic.id} className="history-item">
              <Link href={topicPath(topic.id)} className="history-link">
                <span className="block truncate text-[15px] text-neutral-900">{topic.title}</span>
                <span className="block truncate text-sm text-neutral-500">&ldquo;{topic.goal}&rdquo;</span>
              </Link>
              <span className="shrink-0 text-right text-xs text-neutral-400">
                {topic.modules === 0 ? "no modules" : `${topic.lessonsWritten} of ${topic.modules} lessons`}
                <br />
                {timeAgo(topic.createdAt)}
              </span>
              <DeleteTopic id={topic.id} title={topic.title} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", then a date. */
function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(iso).toLocaleDateString();
}
