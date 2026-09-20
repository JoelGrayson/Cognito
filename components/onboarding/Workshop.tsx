"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/Mascot";
import { TopicGraph } from "@/components/TopicGraph";
import { findNode, modulePath, topicPath } from "@/lib/modules";
import type { DraftGraph } from "@/types/learning";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--wb-primary)]";

type Status =
  | { kind: "loading" }
  | { kind: "ready"; graph: DraftGraph; roadmapId: string | null; usedFallback: boolean }
  | { kind: "error"; message: string };

interface Props {
  draftGraph: DraftGraph | null;
  /** The saved record the draft belongs to; its nodes open as modules. */
  roadmapId: string | null;
}

export function Workshop({ draftGraph, roadmapId }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(
    draftGraph ? { kind: "ready", graph: draftGraph, roadmapId, usedFallback: false } : { kind: "loading" },
  );
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const cancelled = useRef(false);

  const generate = useCallback((regenerate = false) => {
    fetch("/api/workshop/generate", {
      method: "POST",
      ...(regenerate
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regenerate: true }) }
        : {}),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.errors?.[0] ?? "Could not build your roadmap.");
        if (!cancelled.current) {
          setStatus({
            kind: "ready",
            graph: body.graph,
            roadmapId: typeof body.roadmapId === "string" ? body.roadmapId : null,
            usedFallback: Boolean(body.usedFallback),
          });
        }
      })
      .catch((err) => {
        if (!cancelled.current)
          setStatus({ kind: "error", message: err instanceof Error ? err.message : "Could not build your roadmap." });
      });
  }, []);

  useEffect(() => {
    cancelled.current = false;
    if (!draftGraph) generate();
    return () => {
      cancelled.current = true;
    };
  }, [draftGraph, generate]);

  return (
    <div className="wb flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 py-6 sm:px-8">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="wb-serif text-3xl font-medium tracking-tight sm:text-4xl">Your roadmap</h1>
            <p className="mt-1 text-[15px] text-(--wb-muted)">
              Click a topic to open its lesson. Topics you marked &ldquo;can explain&rdquo; are grayed out — we&rsquo;ll skip them.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {status.kind === "ready" && status.roadmapId && (
              <Link
                href={topicPath(status.roadmapId)}
                className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-xl bg-(--wb-primary) px-5 text-sm text-(--wb-card) shadow-[0_6px_24px_rgb(59_42_31/0.18)] ${focus}`}
              >
                Start learning
              </Link>
            )}
            {status.kind === "ready" && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Generate a new roadmap? Your current one will be replaced.")) {
                    setStatus({ kind: "loading" });
                    generate(true);
                  }
                }}
                className={`inline-flex min-h-11 items-center rounded-xl border border-(--wb-line) bg-(--wb-card) px-4 text-sm text-(--wb-ink) hover:bg-(--wb-hover) ${focus}`}
              >
                Regenerate
              </button>
            )}
            <Link
              href="/onboarding?edit=1"
              className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-xl px-4 text-sm text-(--wb-muted) hover:bg-(--wb-hover) hover:text-(--wb-ink) ${focus}`}
            >
              Edit answers
            </Link>
          </div>
        </header>

        {status.kind === "ready" && status.usedFallback && !bannerDismissed && (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-(--wb-butter-ink)/15 bg-(--wb-butter) px-4 py-3 text-sm text-(--wb-butter-ink)">
            <p>We built a simple roadmap from your answers. Tell us what to change.</p>
            <button type="button" onClick={() => setBannerDismissed(true)} className={`rounded-lg px-2 font-medium ${focus}`}>
              Dismiss
            </button>
          </div>
        )}

        <div className="h-[75vh] min-h-[540px] overflow-hidden rounded-3xl border border-(--wb-line) bg-(--wb-card) shadow-[0_2px_10px_rgb(59_42_31/0.06)]">
          {status.kind === "loading" && (
            <div aria-busy="true" aria-label="Generating roadmap" className="flex h-full flex-col items-center justify-center gap-4">
              <Mascot size={72} />
              <p className="wb-serif text-xl text-(--wb-ink)">Mapping your roadmap...</p>
              <div className="grid w-full max-w-md grid-cols-3 gap-3 px-6">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="skeleton !min-h-16" />
                ))}
              </div>
            </div>
          )}
          {status.kind === "error" && (
            <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
              <p className="wb-serif text-xl">{status.message}</p>
              <button
                type="button"
                onClick={() => {
                  setStatus({ kind: "loading" });
                  generate();
                }}

                className={`min-h-12 rounded-2xl bg-(--wb-primary) px-7 text-[15px] text-(--wb-card) ${focus}`}
              >
                Try again
              </button>
            </div>
          )}
          {status.kind === "ready" && (
            <TopicGraph
              graph={status.graph}
              mode="view"
              onNodeClick={(node) => {
                const id = status.roadmapId;
                if (id && findNode(status.graph, node.id)) router.push(modulePath(id, node.id));
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}
