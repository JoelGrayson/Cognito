"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AlertCircle, ArrowLeft, ExternalLink, Lightbulb, MessageCircle, PenLine, Play, Search, Video } from "lucide-react";
import { draftFromLesson, type LessonDraft } from "@/lib/drafts";
import type { ProviderId } from "@/lib/providers/types";
import type { Lesson, MapNode, Phase } from "@/lib/schema";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LessonChat } from "./LessonChat";
import { QuizPanel } from "./Quiz";
import { RichText } from "./RichText";
import { Explainer } from "./Explainer";
import { VideoCall } from "./VideoCall";
import type { VideoJudging as Judging } from "@/lib/video";
import { VideoJudging, VideoSlot, useScoresOnScreen } from "./VideoJudging";
import { CodeExercise, lessonWantsCode } from "./CodeExercise";

export type LessonState =
  | { status: "loading" }
  | { status: "streaming"; draft: LessonDraft }
  | { status: "error"; message: string; draft?: LessonDraft }
  | { status: "ready"; lesson: Lesson };

interface Props {
  topic: string;
  node: MapNode;
  phase: Phase;
  state: LessonState;
  providerId: ProviderId;
  /** Where the back link goes: the whole roadmap. */
  backHref: string;
  /** A compact view of the roadmap, shown in the sidebar. */
  minimap?: ReactNode;
  onRetry: () => void;
  onLessonChange: (lesson: Lesson) => void;
  /** Address of the tutor's own page. Given one, the aside links there instead of holding the chat. */
  chatHref?: string;
  /** How this lesson's video was chosen. Kept by the caller, because the saved lesson
   *  has no room for it and the panel should outlive the writing of the lesson. */
  videoJudging?: Judging;
  /** Where "practice by hand" goes — set for roadmaps a whiteboard subject can check. */
  practiceHref?: string;
}

export function LessonView({
  topic,
  node,
  phase,
  state,
  providerId,
  backHref,
  minimap,
  onRetry,
  onLessonChange,
  chatHref,
  practiceHref,
  videoJudging,
}: Props) {
  const [calling, setCalling] = useState(false);
  const [watching, setWatching] = useState(false);
  const [scoresOpen, setScoresOpen] = useState(false);

  const lesson = state.status === "ready" ? state.lesson : null;
  const draft: LessonDraft | null =
    state.status === "streaming"
      ? state.draft
      : state.status === "error"
        ? (state.draft ?? null)
        : lesson
          ? draftFromLesson(lesson)
          : null;
  const judging = draft?.videoJudging ?? videoJudging;
  const racing = useScoresOnScreen(judging, draft?.video ?? null);
  const streaming = state.status === "streaming" || state.status === "loading";

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
      <div className="min-w-0">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={backHref}>
            <ArrowLeft aria-hidden="true" />
            Back to the roadmap
          </Link>
        </Button>

        <header className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="capitalize">
              {phase}
            </Badge>
            <span className="text-sm text-muted-foreground">{node.subtitle}</span>
            {streaming && (
              <Badge variant="outline" className="gap-1.5 text-muted-foreground">
                <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
                Writing
              </Badge>
            )}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{draft?.title || node.name}</h1>
          <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">{draft?.summary || node.description}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button type="button" size="lg" onClick={() => setCalling(true)} disabled={!lesson}>
                    <Video aria-hidden="true" />
                    Start video lesson
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {lesson ? "Learn this with a tutor who talks and draws on a whiteboard" : "Available once the lesson is written"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button type="button" size="lg" variant="outline" onClick={() => setWatching(true)} disabled={!lesson}>
                    <Play aria-hidden="true" />
                    Watch explainer
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {lesson ? "A narrated explainer that draws itself, with an article version" : "Available once the lesson is written"}
              </TooltipContent>
            </Tooltip>
            {practiceHref && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild size="lg" variant="outline">
                    <Link href={practiceHref}>
                      <PenLine aria-hidden="true" />
                      Practice on the whiteboard
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Work problems by hand and get each step checked</TooltipContent>
              </Tooltip>
            )}
          </div>
        </header>

        {state.status === "error" && (
          <Alert variant="destructive" className="mt-8">
            <AlertCircle />
            <AlertTitle>The lesson could not be written</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
            <AlertAction>
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                Try again
              </Button>
            </AlertAction>
          </Alert>
        )}

        {!draft && state.status !== "error" && <LessonSkeleton />}

        {draft && (
          <>
            {/* Lessons written before TL;DRs existed have none; only show the placeholder while writing. */}
            {(draft.tldr || state.status === "streaming") && (
              <Card className="mt-8 bg-brand-soft/60 ring-brand/15" aria-label="TL;DR">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                    <Lightbulb className="size-3.5" aria-hidden="true" />
                    TL;DR
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {draft.tldr ? (
                    <p className="text-[17px] leading-relaxed text-foreground">{draft.tldr}</p>
                  ) : (
                    <div className="space-y-2" aria-busy="true">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className={`mt-8 grid gap-6 ${draft.video && !draft.video.id && !racing ? "" : "md:grid-cols-2 md:items-start"}`}>
              <Card>
                <CardHeader>
                  <CardTitle>Useful resources</CardTitle>
                  <CardDescription>Hand-picked reading and references for this module.</CardDescription>
                </CardHeader>
                <CardContent>
                  {draft.resources === null ? (
                    <div className="space-y-2.5" aria-busy="true" aria-label="Checking links">
                      <Skeleton className="h-4 w-52" />
                      <Skeleton className="h-4 w-64" />
                      <Skeleton className="h-4 w-44" />
                      <p className="pt-1 text-xs text-muted-foreground">Checking links…</p>
                    </div>
                  ) : draft.resources.length > 0 ? (
                    <ul className="space-y-3">
                      {draft.resources.map((r) => (
                        <li key={r.url} className="flex gap-2.5">
                          <ExternalLink className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <div className="min-w-0">
                            <a href={r.url} target="_blank" rel="noopener noreferrer" className="lesson-link font-medium">
                              {r.title}
                            </a>
                            <p className="text-sm text-muted-foreground">{r.why}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      None of the suggested links checked out.{" "}
                      <a
                        className="lesson-link inline-flex items-center gap-1"
                        href={`https://www.google.com/search?q=${encodeURIComponent(`${node.name} ${topic}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Search className="size-3.5" aria-hidden="true" />
                        Search the web
                      </a>
                      .
                    </p>
                  )}
                </CardContent>
              </Card>
              <VideoSlot
                video={draft.video}
                judging={judging}
                racing={racing}
                onShowScores={() => setScoresOpen((open) => !open)}
                renderVideo={(id, title) => <VideoBox id={id} title={title} />}
              />
            </div>

            {judging?.judgement && scoresOpen && (
              <div className="mt-6">
                <VideoJudging judging={judging} />
              </div>
            )}

            <article className="mt-4">
              {draft.sections.length === 0
                ? [0, 1, 2].map((i) => <SectionSkeleton key={i} />)
                : draft.sections.map((s, i) => (
                    <section key={i} className="mt-10">
                      <h2 className="lesson-h2">{s.heading}</h2>
                      {s.body ? (
                        <div className="mt-3 text-[17px] leading-relaxed text-foreground/90">
                          <RichText text={s.body} />
                          {!s.done && <span className="stream-cursor" aria-hidden="true" />}
                        </div>
                      ) : s.done ? null : (
                        <div className="mt-3 space-y-2.5" aria-busy="true">
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-11/12" />
                          <Skeleton className="h-4 w-4/5" />
                        </div>
                      )}
                    </section>
                  ))}
            </article>

            {draft.keyTakeaways.length > 0 && (
              <Card className="mt-10 bg-muted/40">
                <CardHeader>
                  <CardTitle className="text-lg">Key takeaways</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-[15px] leading-relaxed">
                    {draft.keyTakeaways.map((t, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                          {i + 1}
                        </span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {lesson && lessonWantsCode(topic, lesson) && (
              <CodeExercise key={lesson.title} topic={topic} lesson={lesson} providerId={providerId} />
            )}
            {lesson && <QuizPanel lesson={lesson} providerId={providerId} />}
          </>
        )}
      </div>

      <aside className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
        {minimap && (
          <Card size="sm">
            <CardHeader>
              <CardTitle>Roadmap</CardTitle>
              <CardAction>
                <Button asChild variant="ghost" size="xs" className="text-muted-foreground">
                  <Link href={backHref}>View all</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="px-1.5">
              <ScrollArea className="max-h-56 [&>[data-slot=scroll-area-viewport]]:max-h-56">{minimap}</ScrollArea>
            </CardContent>
          </Card>
        )}

        {chatHref ? (
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="size-4 text-primary" aria-hidden="true" />
                Tutor
              </CardTitle>
              <CardDescription>
                {lesson ? "Ask questions or have the lesson rewritten." : "The tutor joins once the lesson is ready."}
              </CardDescription>
            </CardHeader>
            {lesson && (
              <CardContent>
                <Button asChild variant="outline" className="w-full">
                  <Link href={chatHref}>Ask the tutor about this lesson</Link>
                </Button>
              </CardContent>
            )}
          </Card>
        ) : lesson ? (
          <LessonChat topic={topic} lesson={lesson} providerId={providerId} onLessonChange={onLessonChange} />
        ) : (
          <Card size="sm">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">The tutor joins once the lesson is ready.</CardContent>
          </Card>
        )}
      </aside>
      {calling && lesson && <VideoCall topic={topic} lesson={lesson} onClose={() => setCalling(false)} />}
      {watching && lesson && <Explainer topic={topic} lesson={lesson} providerId={providerId} onClose={() => setWatching(false)} />}
    </div>
  );
}

/** Only shown when a video was judged genuinely helpful; otherwise the slot is left out. */
function VideoBox({ id, title }: { id: string; title: string | null }) {
  return (
    <div>
      <div className="video ring-1 ring-foreground/10">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}`}
          title={title ?? "Lesson video"}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
      {title && <p className="mt-2 truncate text-sm text-muted-foreground">{title}</p>}
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="mt-10 space-y-3" aria-busy="true">
      <Skeleton className="h-6 w-52" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  );
}

function LessonSkeleton() {
  return (
    <div className="mt-8" aria-busy="true" aria-label="Writing the lesson">
      <Card>
        <CardContent className="space-y-2.5">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-60" />
          </CardContent>
        </Card>
        <Skeleton className="aspect-video w-full rounded-xl" />
      </div>
      {[0, 1, 2].map((i) => (
        <SectionSkeleton key={i} />
      ))}
    </div>
  );
}
