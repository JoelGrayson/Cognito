"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Roadmap, RoadmapLegend, RoadmapSkeleton } from "@/components/Roadmap";
import { RoadmapChat } from "@/components/RoadmapChat";
import { RichText } from "@/components/RichText";
import { ensureOk, readNdjson } from "@/lib/ndjson";
import { modulePath, topicPath } from "@/lib/legacy-paths";
import type { LegacyRoadmapRecord } from "@/lib/repo";
import { allRefs, lessonKey, moveNode, nodeAt, removeNode, updateNode, type NodeRef } from "@/lib/roadmap";
import { readSettings } from "@/lib/settings";
import { asList, type MapNode, type MindMap } from "@/lib/schema";
import { trpc } from "@/lib/trpc";
import { EditBlock } from "./EditBlock";

interface Props {
  roadmap: LegacyRoadmapRecord;
  /** Blocks whose lesson is already written. */
  lessonKeys: string[];
}

/** Lessons written at once by "Generate all". Each lesson already makes several calls in parallel. */
const BULK_CONCURRENCY = 3;

/** One roadmap: streams its map in the first time, then lets the learner open, edit and revise blocks. */
export function RoadmapView({ roadmap, lessonKeys }: Props) {
  const router = useRouter();
  const [map, setMap] = useState<MindMap>(roadmap.map);
  /** True while the map is streaming in, so blocks are not clickable yet. */
  const [writing, setWriting] = useState(!roadmap.complete && !roadmap.error);
  const [error, setError] = useState<string | null>(roadmap.error);
  const [written, setWritten] = useState(() => new Set(lessonKeys));
  const [editing, setEditing] = useState<NodeRef | null>(null);
  /** Progress of "Generate all"; null when it is not running. */
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const bulkAbort = useRef<AbortController | null>(null);
  const started = useRef(false);
  /** Lets the streaming effect start the bulk write without depending on it. */
  const generateAllRef = useRef<(map: MindMap) => void>(() => {});

  // A roadmap row starts empty: the map is written here, once, the first time it is opened.
  useEffect(() => {
    if (roadmap.complete || roadmap.error || started.current) return;
    started.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/mindmap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roadmapId: roadmap.id }),
        });
        await ensureOk(res);
        let finalMap: MindMap | null = null;
        await readNdjson(res, (event) => {
          if (cancelled) return;
          if (event.type === "partial" || event.type === "done") setMap(event.mindMap as MindMap);
          if (event.type === "done") finalMap = event.mindMap as MindMap;
          if (event.type === "error") throw new Error(String(event.error));
        });
        if (!finalMap) throw new Error("The roadmap never finished.");
        if (cancelled) return;
        setWriting(false);
        router.refresh();
        if (readSettings().autoGenerateLessons) generateAllRef.current(finalMap);
      } catch (err) {
        if (cancelled) return;
        setWriting(false);
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roadmap.complete, roadmap.error, roadmap.id, router]);

  const isReady = (node: MapNode) => written.has(lessonKey(node));
  const unwritten = allRefs(map).filter((ref) => !isReady(nodeAt(map, ref)!.node)).length;

  /** Write every lesson that is not written yet, a few at a time, in roadmap order. */
  async function generateAll(current = map) {
    if (bulkAbort.current) return;
    const done = new Set(written);
    const queue = allRefs(current)
      .map((ref) => lessonKey(nodeAt(current, ref)!.node))
      .filter((key) => !done.has(key));
    if (queue.length === 0) return;

    const controller = new AbortController();
    bulkAbort.current = controller;
    const total = queue.length;
    let finished = 0;
    setBulk({ done: 0, total });

    const worker = async () => {
      for (let key = queue.shift(); key && !controller.signal.aborted; key = queue.shift()) {
        try {
          const res = await fetch("/api/lesson", {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roadmapId: roadmap.id, key }),
          });
          await ensureOk(res);
          await readNdjson(res, (event) => {
            if (event.type === "done") setWritten((s) => new Set(s).add(key));
            if (event.type === "error") throw new Error(String(event.error));
          });
        } catch {
          // One lesson failing does not stop the rest; opening the block writes it again.
        }
        if (controller.signal.aborted) return;
        finished += 1;
        setBulk({ done: finished, total });
      }
    };
    await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, total) }, worker));
    if (bulkAbort.current === controller) {
      bulkAbort.current = null;
      setBulk(null);
      router.refresh();
    }
  }

  generateAllRef.current = (current: MindMap) => void generateAll(current);

  function stopGenerateAll() {
    bulkAbort.current?.abort();
    bulkAbort.current = null;
    setBulk(null);
  }

  /** The assistant revised the roadmap: it becomes a new roadmap, with its own page. */
  async function applyRevisedMap(next: MindMap, instruction: string) {
    stopGenerateAll();
    const created = await trpc.legacy.revise.mutate({ id: roadmap.id, map: next, instruction });
    router.push(topicPath(created.id));
  }

  /** The learner edited the map by hand. Their version is saved in place. */
  async function applyEdit(next: MindMap) {
    setMap(next);
    setEditing(null);
    await trpc.legacy.update.mutate({ id: roadmap.id, map: next });
    router.refresh();
  }

  const openHref = (ref: NodeRef) => {
    const at = nodeAt(map, ref);
    return at ? modulePath(roadmap.id, lessonKey(at.node)) : undefined;
  };

  return (
    <div className="roadmap-layout">
      <div className="min-w-0">
        <h1 className="mt-6 text-center text-4xl font-medium tracking-tight sm:text-5xl">{map.topic || roadmap.topic}</h1>

        <RoadmapIntro map={map} writing={writing} />

        <div className="mt-10">
          {map.stages.length === 0 && writing ? <RoadmapSkeleton /> : null}
          {map.stages.length > 0 ? (
            <Roadmap
              map={map}
              pending={writing ? Math.max(1, 5 - map.stages.length) : undefined}
              streaming={writing}
              onSelect={writing ? undefined : (ref) => router.push(openHref(ref) ?? topicPath(roadmap.id))}
              hrefFor={openHref}
              isReady={isReady}
              onEdit={writing ? undefined : setEditing}
              onDelete={writing ? undefined : (ref) => void applyEdit(removeNode(map, ref))}
              onMove={writing ? undefined : (from, to) => void applyEdit(moveNode(map, from, to))}
            />
          ) : null}
          {map.stages.length === 0 && !writing && error ? (
            <div className="panel px-6 py-16 text-center">
              <p className="text-red-600">{error}</p>
            </div>
          ) : null}
        </div>

        {map.stages.length > 0 && <RoadmapLegend structure={map.stages.length > 1} />}

        {!writing && map.stages.length > 0 && (
          <p className="mt-4 text-center text-sm text-neutral-500">
            {/* The outcome at the top says the same thing, better. */}
            {asList(map.outcome).length === 0 && map.summary}
            {roadmap.model && roadmap.generationMs !== null && (
              <span className="text-neutral-400">
                {" "}· {roadmap.provider} · {roadmap.model} · {(roadmap.generationMs / 1000).toFixed(1)}s
              </span>
            )}
            <span className="mt-1 block text-neutral-400">Click a block to open its lesson.</span>
          </p>
        )}

        {!writing && (bulk || unwritten > 0) && map.stages.length > 0 && (
          <div className="mt-4 flex items-center justify-center gap-3 text-sm text-neutral-600">
            {bulk ? (
              <>
                <span aria-live="polite">
                  Writing lessons: {bulk.done} of {bulk.total} done
                </span>
                <button type="button" className="bulk-button" onClick={stopGenerateAll}>
                  Stop
                </button>
              </>
            ) : (
              <button type="button" className="bulk-button" onClick={() => void generateAll()} disabled={writing}>
                {unwritten === 1 ? "Write the lesson" : `Generate all ${unwritten} lessons`}
              </button>
            )}
          </div>
        )}

        {error && map.stages.length > 0 && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}

        {!writing && (map.nextSteps ?? []).length > 0 && (
          <section className="mt-10" aria-labelledby="next-steps">
            <h2 id="next-steps" className="text-center text-sm font-medium text-neutral-500">
              Next steps
            </h2>
            <ul className="next-steps">
              {(map.nextSteps ?? []).map((n) => (
                <li key={n.topic}>
                  <NextStep topic={n.topic} why={n.why} provider={roadmap.provider} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {editing && nodeAt(map, editing) && (
        <EditBlock
          node={nodeAt(map, editing)!.node}
          onCancel={() => setEditing(null)}
          onSave={(patch) => void applyEdit(updateNode(map, editing, patch))}
        />
      )}

      <aside className="roadmap-aside">
        <RoadmapChat
          topic={roadmap.topic}
          map={map}
          providerId={roadmap.provider}
          onMapChange={(next, instruction) => void applyRevisedMap(next, instruction)}
          busy={writing}
        />
      </aside>
    </div>
  );
}

/** A topic to learn next: starts its own roadmap, with the same provider. */
function NextStep({ topic, why, provider }: { topic: string; why: string; provider: LegacyRoadmapRecord["provider"] }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  return (
    <button
      type="button"
      className="next-step"
      disabled={starting}
      onClick={() => {
        setStarting(true);
        trpc.legacy.create
          .mutate({ topic, provider })
          .then((created) => router.push(topicPath(created.id)))
          .catch(() => setStarting(false));
      }}
    >
      <span className="block font-medium text-neutral-900">{topic} →</span>
      {why && <span className="mt-0.5 block text-sm text-neutral-500">{why}</span>}
    </button>
  );
}

/** How the stages are ordered, said plainly above the map. */
const ORDER_LABEL: Record<Exclude<MindMap["order"], "mixed">, string> = {
  chronological: "Roughly chronological",
  difficulty: "Easiest first",
  parts: "By parts of the system",
};

/** "What you need to know" and "What you will know at the end", under the roadmap's title. */
function RoadmapIntro({ map, writing }: { map: MindMap; writing: boolean }) {
  // Roadmaps saved before these lists existed have neither; early ones stored a sentence.
  const start = asList(map.startingPoint);
  const end = asList(map.outcome);
  if (!writing && start.length === 0 && end.length === 0) return null;
  const line = (label: string, items: string[], className: string) => (
    <div className={`intro-card ${className}`}>
      <p className="intro-label">{label}</p>
      {items.length > 0 ? (
        <RichText text={items.map((item) => `- ${item}`).join("\n")} className="intro-list mt-1.5" />
      ) : (
        <div className="mt-2.5 space-y-2" aria-busy="true">
          <div className="skeleton-line w-full" />
          <div className="skeleton-line w-2/3" />
        </div>
      )}
    </div>
  );
  return (
    <div className="intro">
      {line("What you need to know", start, "intro-start")}
      {line("What you will know at the end", end, "intro-end")}
      {(map.order && map.order !== "mixed") || map.plan ? (
        <p className="intro-plan">
          {map.order && map.order !== "mixed" && <span className="order-badge">{ORDER_LABEL[map.order]}</span>}
          {map.plan}
        </p>
      ) : null}
    </div>
  );
}
