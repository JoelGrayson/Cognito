"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { TopicGraph } from "@/components/TopicGraph";
import type { DraftGraph } from "@/types/learning";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]";

type Status =
  | { kind: "loading" }
  | { kind: "ready"; graph: DraftGraph; usedFallback: boolean }
  | { kind: "error"; message: string };

export function Workshop({ draftGraph }: { draftGraph: DraftGraph | null }) {
  const [status, setStatus] = useState<Status>(
    draftGraph ? { kind: "ready", graph: draftGraph, usedFallback: false } : { kind: "loading" },
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
        if (!cancelled.current) setStatus({ kind: "ready", graph: body.graph, usedFallback: Boolean(body.usedFallback) });
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
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 py-6 sm:px-8">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your roadmap</h1>
          <p className="mt-1 text-[15px] text-[#6b6b6b]">
            Topics you marked &ldquo;can explain&rdquo; are grayed out — we&rsquo;ll skip them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status.kind === "ready" && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Generate a new roadmap? Your current one will be replaced.")) {
                  setStatus({ kind: "loading" });
                  generate(true);
                }
              }}
              className={`inline-flex min-h-10 items-center rounded-full border border-[#d5d5d1] bg-white px-4 text-sm font-medium text-[#333] hover:border-[#b9b9b4] ${focus}`}
            >
              Regenerate
            </button>
          )}
          <Link
            href="/onboarding?edit=1"
            className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium text-[var(--accent)] hover:bg-[#f0f0ee] ${focus}`}
          >
            Edit answers
          </Link>
        </div>
      </header>

      {status.kind === "ready" && status.usedFallback && !bannerDismissed && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-[#e8e4c8] bg-[#fbf7e8] px-4 py-3 text-sm text-[#6b5d1f]">
          <p>We built a simple roadmap from your answers. Tell us what to change.</p>
          <button type="button" onClick={() => setBannerDismissed(true)} className={`rounded-full px-2 font-medium ${focus}`}>
            Dismiss
          </button>
        </div>
      )}

      <div className="h-[75vh] min-h-[540px] overflow-hidden rounded-2xl border border-[#e4e3de]">
        {status.kind === "loading" && (
          <div aria-busy="true" aria-label="Generating roadmap" className="flex h-full flex-col items-center justify-center gap-4">
            <p className="text-[15px] font-medium text-[#6b6b6b]">Mapping your roadmap...</p>
            <div className="grid w-full max-w-md grid-cols-3 gap-3 px-6">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="skeleton !min-h-16" />
              ))}
            </div>
          </div>
        )}
        {status.kind === "error" && (
          <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-lg font-semibold">{status.message}</p>
            <button
              type="button"
              onClick={() => {
                setStatus({ kind: "loading" });
                generate();
              }}

              className={`min-h-12 rounded-full bg-[var(--accent)] px-7 text-[15px] font-semibold text-white ${focus}`}
            >
              Try again
            </button>
          </div>
        )}
        {status.kind === "ready" && <TopicGraph graph={status.graph} mode="view" />}
      </div>
    </main>
  );
}
