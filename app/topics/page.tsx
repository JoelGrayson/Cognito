import Link from "next/link";
import { TRPCError } from "@trpc/server";
import { BookOpen, Plus } from "lucide-react";
import { DeleteTopic } from "@/components/topics/DeleteTopic";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Topics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every roadmap you have started, newest first.</p>
        </div>
        <Button asChild>
          <Link href="/onboarding?new=1">
            <Plus aria-hidden="true" />
            Learn something new
          </Link>
        </Button>
      </div>

      {signedOut || topics.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="flex flex-col items-center py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-primary">
              <BookOpen className="size-6" aria-hidden="true" />
            </span>
            <p className="mt-4 font-medium">{signedOut ? "Sign in to see your topics" : "No topics yet"}</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {signedOut
                ? "The topics you have started are tied to your account."
                : "Tell us what you want to learn and we'll build a roadmap with lessons for each step."}
            </p>
            <Button asChild variant="outline" className="mt-5">
              <Link href="/onboarding?new=1">Start one</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="mt-6 space-y-3">
          {topics.map((topic) => {
            const percent = topic.modules === 0 ? 0 : Math.round((topic.lessonsWritten / topic.modules) * 100);
            return (
              <li key={topic.id}>
                <Card size="sm" className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-start gap-4">
                    <Link href={topicPath(topic.id)} className="min-w-0 flex-1 outline-none focus-visible:underline">
                      <span className="block truncate text-[15px] font-medium text-foreground">{topic.title}</span>
                      <span className="block truncate text-sm text-muted-foreground">&ldquo;{topic.goal}&rdquo;</span>
                      <span className="mt-3 flex items-center gap-3">
                        <Progress value={percent} className="h-1.5 max-w-48" aria-label="Lessons written" />
                        <span className="text-xs text-muted-foreground">
                          {topic.modules === 0 ? "No modules" : `${topic.lessonsWritten} of ${topic.modules} lessons`} · {timeAgo(topic.createdAt)}
                        </span>
                      </span>
                    </Link>
                    <DeleteTopic id={topic.id} title={topic.title} />
                  </CardContent>
                </Card>
              </li>
            );
          })}
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
