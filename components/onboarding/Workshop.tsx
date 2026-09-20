"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { TopicGraph } from "@/components/TopicGraph";
import { Info, Pencil, RefreshCw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertAction, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { findNode, modulePath, topicPath } from "@/lib/modules";
import type { DraftGraph } from "@/types/learning";


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
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 py-6 sm:px-8">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your roadmap</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Click a topic to open its lesson. Topics you marked &ldquo;can explain&rdquo; are grayed out — we&rsquo;ll skip them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status.kind === "ready" && status.roadmapId && (
            <Button asChild>
              <Link href={topicPath(status.roadmapId)}>Start learning</Link>
            </Button>
          )}
          {status.kind === "ready" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="outline">
                  <RefreshCw aria-hidden="true" />
                  Regenerate
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Generate a new roadmap?</AlertDialogTitle>
                  <AlertDialogDescription>Your current roadmap will be replaced.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setStatus({ kind: "loading" });
                      generate(true);
                    }}
                  >
                    Regenerate
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button asChild variant="ghost" className="text-primary">
            <Link href="/onboarding?edit=1">
              <Pencil aria-hidden="true" />
              Edit answers
            </Link>
          </Button>
        </div>
      </header>

      {status.kind === "ready" && status.usedFallback && !bannerDismissed && (
        <Alert className="mb-4 border-amber-500/40 bg-amber-50 text-amber-900">
          <Info />
          <AlertTitle>We built a simple roadmap from your answers. Tell us what to change.</AlertTitle>
          <AlertAction>
            <Button type="button" variant="ghost" size="sm" className="text-amber-900" onClick={() => setBannerDismissed(true)}>
              Dismiss
            </Button>
          </AlertAction>
        </Alert>
      )}

      <div className="h-[75vh] min-h-[540px] overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {status.kind === "loading" && (
          <div aria-busy="true" aria-label="Generating roadmap" className="flex h-full flex-col items-center justify-center gap-4">
            <p className="text-[15px] font-medium text-muted-foreground">Mapping your roadmap...</p>
            <div className="grid w-full max-w-md grid-cols-3 gap-3 px-6">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          </div>
        )}
        {status.kind === "error" && (
          <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-lg font-semibold">{status.message}</p>
            <Button
              type="button"
              size="xl"
              onClick={() => {
                setStatus({ kind: "loading" });
                generate();
              }}
            >
              Try again
            </Button>
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
  );
}
