"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LessonView, type LessonState } from "@/components/Lesson";
import { emptyDraft, type LessonDraft, type OutlineDraft } from "@/lib/drafts";
import { moduleChatPath, modulePath, topicPath } from "@/lib/legacy-paths";
import { ensureOk, readNdjson } from "@/lib/ndjson";
import type { LegacyRoadmapRecord } from "@/lib/repo";
import { lessonKey, nodeAt, type NodeRef } from "@/lib/roadmap";
import type { Lesson, MapNode, Resource, Video } from "@/lib/schema";
import { trpc } from "@/lib/trpc";

interface Props {
  roadmap: LegacyRoadmapRecord;
  /** The block this page is about. */
  selected: NodeRef;
  /** Null when the lesson has not been written yet; it is written on open. */
  lesson: Lesson | null;
  writtenKeys: string[];
}

/** One block's lesson. Writes it the first time the block is opened. */
export function LessonPane({ roadmap, selected, lesson, writtenKeys }: Props) {
  const router = useRouter();
  const map = roadmap.map;
  const key = lessonKey(nodeAt(map, selected)!.node);
  const [state, setState] = useState<LessonState>(lesson ? { status: "ready", lesson } : { status: "loading" });
  const written = new Set(writtenKeys);
  const abort = useRef<AbortController | null>(null);

  /** Stream the lesson in, saving it on the server as it finishes. */
  function write() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const node = nodeAt(map, selected)!.node;
    let draft = emptyDraft(node);
    const show = (next: LessonDraft) => {
      draft = next;
      setState({ status: "streaming", draft: next });
    };
    setState({ status: "loading" });
    void (async () => {
      try {
        const res = await fetch("/api/lesson", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roadmapId: roadmap.id, key }),
        });
        await ensureOk(res);
        let finished = false;
        await readNdjson(res, (event) => {
          switch (event.type) {
            case "outline": {
              const o = event.outline as OutlineDraft;
              show({
                ...draft,
                title: o.title || node.name,
                summary: o.summary || node.description,
                tldr: o.tldr,
                sections: o.sections.map((sec, i) => ({
                  heading: sec.heading,
                  body: draft.sections[i]?.body ?? "",
                  done: draft.sections[i]?.done ?? false,
                })),
                keyTakeaways: o.keyTakeaways,
              });
              break;
            }
            case "section": {
              const index = Number(event.index);
              const sections = draft.sections.slice();
              sections[index] = {
                heading: sections[index]?.heading ?? "",
                body: String(event.body),
                done: Boolean(event.done),
              };
              show({ ...draft, sections });
              break;
            }
            case "resources":
              show({ ...draft, resources: event.resources as Resource[] });
              break;
            case "video":
              show({ ...draft, video: event.video as Video });
              break;
            case "done":
              finished = true;
              setState({ status: "ready", lesson: event.lesson as Lesson });
              break;
            case "error":
              throw new Error(String(event.error));
          }
        });
        if (!finished) throw new Error("The lesson never finished.");
        router.refresh();
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Something went wrong.",
          draft: draft.sections.length > 0 ? draft : undefined,
        });
      }
    })();
  }

  // Written once, the first time the block is opened.
  const started = useRef(false);
  useEffect(() => {
    if (lesson || started.current) return;
    started.current = true;
    write();
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson]);

  /** The tutor rewrote the lesson. */
  async function onLessonChange(next: Lesson) {
    setState({ status: "ready", lesson: next });
    await trpc.legacy.saveLesson.mutate({ id: roadmap.id, key, lesson: next });
    router.refresh();
  }

  const hrefFor = (ref: NodeRef) => {
    const at = nodeAt(map, ref);
    return at ? modulePath(roadmap.id, lessonKey(at.node)) : undefined;
  };

  return (
    <LessonView
      topic={roadmap.topic}
      map={map}
      selected={selected}
      state={state}
      providerId={roadmap.provider}
      onSelectNode={(ref) => router.push(hrefFor(ref) ?? topicPath(roadmap.id))}
      onBack={() => router.push(topicPath(roadmap.id))}
      onRetry={write}
      onLessonChange={(next) => void onLessonChange(next)}
      lessonHref={hrefFor}
      isReady={(node: MapNode) => written.has(lessonKey(node))}
      chatHref={moduleChatPath(roadmap.id, key)}
    />
  );
}
