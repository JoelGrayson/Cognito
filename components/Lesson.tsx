"use client";

import { draftFromLesson, type LessonDraft } from "@/lib/drafts";
import type { ProviderId } from "@/lib/providers/types";
import { nodeAt, type NodeRef } from "@/lib/roadmap";
import type { Lesson, MindMap, Video } from "@/lib/schema";
import { LessonChat } from "./LessonChat";
import { QuizPanel } from "./Quiz";
import { RichText } from "./RichText";
import { Roadmap } from "./Roadmap";

export type LessonState =
  | { status: "loading" }
  | { status: "streaming"; draft: LessonDraft }
  | { status: "error"; message: string; draft?: LessonDraft }
  | { status: "ready"; lesson: Lesson };

interface Props {
  topic: string;
  map: MindMap;
  selected: NodeRef;
  state: LessonState;
  providerId: ProviderId;
  onSelectNode: (ref: NodeRef) => void;
  onBack: () => void;
  onRetry: () => void;
  /** The roadmap is still streaming in; its newest block is not clickable yet. */
  mapStreaming?: boolean;
  /** Address of a block's lesson, so mini-map blocks open in a new tab too. */
  lessonHref?: (ref: NodeRef) => string | undefined;
  onLessonChange: (lesson: Lesson) => void;
}

export function LessonView({
  topic,
  map,
  selected,
  state,
  providerId,
  onSelectNode,
  onBack,
  onRetry,
  mapStreaming,
  lessonHref,
  onLessonChange,
}: Props) {
  const at = nodeAt(map, selected);
  if (!at) return null;
  const { node, phase } = at;

  const lesson = state.status === "ready" ? state.lesson : null;
  const draft: LessonDraft | null =
    state.status === "streaming"
      ? state.draft
      : state.status === "error"
        ? (state.draft ?? null)
        : lesson
          ? draftFromLesson(lesson)
          : null;

  return (
    <div className="lesson-layout">
      <div className="min-w-0">
        <div className="lesson-top">
          <div className="minimap">
            <Roadmap map={map} compact selected={selected} onSelect={onSelectNode} streaming={mapStreaming} hrefFor={lessonHref} />
            <button type="button" className="minimap-expand" onClick={onBack} title="Back to the roadmap" aria-label="Back to the roadmap">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-neutral-500">
              <span className="capitalize">{phase}</span> · {node.subtitle}
            </p>
            <h1 className="mt-1 text-3xl font-medium tracking-tight sm:text-4xl">{draft?.title || node.name}</h1>
            <p className="mt-2 text-neutral-600">{draft?.summary || node.description}</p>
          </div>
        </div>

        {state.status === "error" && (
          <div className="panel mt-10 px-6 py-8 text-center">
            <p className="text-red-600">{state.message}</p>
            <button
              type="button"
              className="mt-4 text-sm text-neutral-600 underline underline-offset-4 hover:text-neutral-900"
              onClick={onRetry}
            >
              Try again
            </button>
          </div>
        )}

        {!draft && state.status !== "error" && <LessonSkeleton />}

        {draft && (
          <>
            <div className="lesson-hero">
              <section>
                <h2 className="lesson-h2">Useful resources</h2>
                {draft.resources === null ? (
                  <div className="mt-3 space-y-2" aria-busy="true" aria-label="Checking links">
                    <div className="skeleton-line w-52" />
                    <div className="skeleton-line w-64" />
                    <div className="skeleton-line w-44" />
                    <p className="pt-1 text-xs text-neutral-400">Checking links…</p>
                  </div>
                ) : draft.resources.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {draft.resources.map((r) => (
                      <li key={r.url}>
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="lesson-link">
                          {r.title}
                        </a>
                        <span className="text-sm text-neutral-500"> · {r.why}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-neutral-500">
                    None of the suggested links checked out.{" "}
                    <a
                      className="lesson-link"
                      href={`https://www.google.com/search?q=${encodeURIComponent(`${node.name} ${topic}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Search the web
                    </a>
                    .
                  </p>
                )}
              </section>
              {draft.video === null ? (
                <div className="video video-pending" aria-busy="true">
                  Finding a video…
                </div>
              ) : (
                <VideoBox video={draft.video} />
              )}
            </div>

            {draft.sections.length === 0
              ? [0, 1, 2].map((i) => <SectionSkeleton key={i} />)
              : draft.sections.map((s, i) => (
                  <section key={i} className="mt-10">
                    <h2 className="lesson-h2">{s.heading}</h2>
                    {s.body ? (
                      <div className="mt-3 text-[17px] leading-relaxed text-neutral-800">
                        <RichText text={s.body} />
                        {!s.done && <span className="stream-cursor" aria-hidden="true" />}
                      </div>
                    ) : s.done ? null : (
                      <div className="mt-3 space-y-2" aria-busy="true">
                        <div className="skeleton-line w-full" />
                        <div className="skeleton-line w-11/12" />
                        <div className="skeleton-line w-4/5" />
                      </div>
                    )}
                  </section>
                ))}

            {draft.keyTakeaways.length > 0 && (
              <section className="panel mt-10 px-6 py-5">
                <h2 className="lesson-h2">Key takeaways</h2>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-neutral-800">
                  {draft.keyTakeaways.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </section>
            )}

            {lesson && <QuizPanel lesson={lesson} providerId={providerId} />}
          </>
        )}
      </div>

      <aside className="lesson-aside">
        {lesson ? (
          <LessonChat topic={topic} lesson={lesson} providerId={providerId} onLessonChange={onLessonChange} />
        ) : (
          <div className="chat-panel items-center justify-center">
            <p className="px-6 text-center text-sm text-neutral-500">The tutor joins once the lesson is ready.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function VideoBox({ video }: { video: Video }) {
  if (video.id) {
    return (
      <div>
        <div className="video">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.id}`}
            title={video.title ?? "Lesson video"}
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
        {video.title && <p className="mt-2 truncate text-sm text-neutral-500">{video.title}</p>}
      </div>
    );
  }
  return (
    <a href={video.searchUrl} target="_blank" rel="noopener noreferrer" className="video video-fallback">
      Find a video on YouTube ↗
    </a>
  );
}

function SectionSkeleton() {
  return (
    <div className="mt-10 space-y-3" aria-busy="true">
      <div className="skeleton-line h-6 w-52" />
      <div className="skeleton-line w-full" />
      <div className="skeleton-line w-11/12" />
      <div className="skeleton-line w-4/5" />
    </div>
  );
}

function LessonSkeleton() {
  return (
    <div className="mt-10" aria-busy="true" aria-label="Writing the lesson">
      <div className="lesson-hero">
        <div className="space-y-3">
          <div className="skeleton-line h-5 w-40" />
          <div className="skeleton-line w-64" />
          <div className="skeleton-line w-56" />
          <div className="skeleton-line w-60" />
        </div>
        <div className="skeleton video" />
      </div>
      {[0, 1, 2].map((i) => (
        <SectionSkeleton key={i} />
      ))}
    </div>
  );
}
