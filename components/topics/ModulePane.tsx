"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LessonView, type LessonState } from "@/components/Lesson";
import { emptyDraft, type LessonDraft, type OutlineDraft } from "@/lib/drafts";
import { lessonRequest, moduleChatPath, topicPath } from "@/lib/modules";
import { ensureOk, readNdjson } from "@/lib/ndjson";
import type { ProviderId } from "@/lib/providers/types";
import type { RoadmapRecord } from "@/lib/repo";
import type { Lesson, Resource, Video } from "@/lib/schema";
import { trpc } from "@/lib/trpc";
import type { DraftNode } from "@/types/learning";
import { ModuleList } from "./ModuleList";

interface Props {
  roadmap: RoadmapRecord;
  /** The node this page is about. */
  node: DraftNode;
  /** Null when the lesson has not been written yet; it is written on open. */
  lesson: Lesson | null;
  written: string[];
  providerId: ProviderId;
}

/** One node's lesson. Writes it the first time the node is opened. */
export function ModulePane({ roadmap, node, lesson, written, providerId }: Props) {
  const router = useRouter();
  const [state, setState] = useState<LessonState>(lesson ? { status: "ready", lesson } : { status: "loading" });
  const abort = useRef<AbortController | null>(null);
  // The same framing the server writes from: name, subtitle, description and phase.
  const { node: heading, phase } = lessonRequest(roadmap.goal, roadmap.graph, node);

  /** Stream the lesson in; the server saves it as it finishes. */
  function write() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    let draft = emptyDraft(heading);
    const show = (next: LessonDraft) => {
      draft = next;
      setState({ status: "streaming", draft: next });
    };
    void (async () => {
      try {
        setState({ status: "loading" });
        const res = await fetch("/api/lesson", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roadmapId: roadmap.id, nodeId: node.id }),
        });
        await ensureOk(res);
        let finished = false;
        await readNdjson(res, (event) => {
          switch (event.type) {
            case "outline": {
              const o = event.outline as OutlineDraft;
              show({
                ...draft,
                title: o.title || heading.name,
                summary: o.summary || heading.description,
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

  // Written the first time the node is opened; an unmounted pane stops its own stream.
  useEffect(() => {
    if (lesson) return;
    write();
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson]);

  /** The tutor rewrote the lesson. */
  async function onLessonChange(next: Lesson) {
    setState({ status: "ready", lesson: next });
    await trpc.topics.saveLesson.mutate({ id: roadmap.id, nodeId: node.id, lesson: next });
    router.refresh();
  }

  return (
    <LessonView
      topic={roadmap.title}
      node={heading}
      phase={phase}
      state={state}
      providerId={providerId}
      backHref={topicPath(roadmap.id)}
      minimap={<ModuleList roadmapId={roadmap.id} graph={roadmap.graph} written={written} currentId={node.id} compact />}
      onRetry={write}
      onLessonChange={(next) => void onLessonChange(next)}
      chatHref={moduleChatPath(roadmap.id, node.id)}
    />
  );
}
