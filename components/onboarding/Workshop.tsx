"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/Mascot";
import { TopicGraph, type NodeAction } from "@/components/TopicGraph";
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
import { applyOps, conceptMatchesNode, validateGraph } from "@/lib/graph";
import { findNode, modulePath, topicPath } from "@/lib/modules";
import type { DraftGraph, DraftNode, GraphOp } from "@/types/learning";


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
  /** Nodes to pulse briefly — set after a topic is added so its placement is visible. */
  const [pulseIds, setPulseIds] = useState<string[]>([]);
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

  /**
   * Applies ops optimistically, saves through the ops route, rolls back on failure.
   * `build` sees the current graph and returns null to abort.
   */
  const submitOps = (build: (graph: DraftGraph) => GraphOp[] | null, onApplied?: (next: DraftGraph) => void) => {
    if (status.kind !== "ready") return;
    const graph = status.graph;
    const ops = build(graph);
    if (!ops?.length) return;
    let next: DraftGraph;
    try {
      next = applyOps(graph, ops);
    } catch {
      return;
    }
    if (!validateGraph(next).ok) return;
    setStatus({ ...status, graph: next });
    onApplied?.(next);
    void fetch("/api/workshop/ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ops }),
    })
      .then(async (res) => {
        if (res.ok) return;
        const body = await res.json().catch(() => null);
        throw new Error(body?.errors?.[0] ?? "Could not save the change.");
      })
      .catch(() => {
        setStatus((cur) => (cur.kind === "ready" ? { ...cur, graph } : cur));
      });
  };

  /** Hover actions on a node. Scope changes cover the node's children too; delete cascades server-side. */
  const handleNodeAction = (node: DraftNode, action: NodeAction) => {
    if (action === "delete") {
      submitOps(() => [{ op: "remove_node", id: node.id }]);
      return;
    }
    const scope =
      action === "known"
        ? node.scope === "known" ? "included" : "known"
        : node.scope === "excluded" ? "included" : "excluded";
    submitOps((graph) =>
      [node.id, ...graph.nodes.filter((n) => n.parentId === node.id).map((n) => n.id)].map((id) => ({
        op: "update_node" as const,
        id,
        patch: { scope },
      })),
    );
  };

  /** Words shared between the typed topic and a node's title + summary. */
  const overlap = (query: string, node: DraftNode): number => {
    const words = new Set(`${node.title} ${node.summary}`.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2));
    return query.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => words.has(w)).length;
  };

  /** Right-click composer: slug the title, attach under the best-matching section, else add a standalone topic. */
  const handleAddTopic = (title: string) => {
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
    if (!id) return;
    let before = new Set<string>();
    submitOps(
      (graph) => {
        before = new Set(graph.nodes.map((n) => n.id));
        // Best-matching container wins; a leaf match borrows its container.
        const parents = new Set(graph.nodes.map((n) => n.parentId).filter(Boolean));
        let best: string | undefined;
        let bestScore = 0;
        for (const node of graph.nodes) {
          const score = overlap(title, node) + (conceptMatchesNode(title, node.title) ? 2 : 0);
          if (score <= bestScore) continue;
          const target = parents.has(node.id) ? node.id : node.parentId;
          if (target) {
            best = target;
            bestScore = score;
          }
        }
        const node: DraftNode = {
          id,
          title,
          summary: "",
          kind: best ? "core" : "optional",
          ...(best ? { parentId: best } : {}),
          estMinutes: 45,
          scope: "included",
        };
        return [{ op: "add_node", node }];
      },
      (next) => {
        const added = next.nodes.find((n) => !before.has(n.id));
        if (added) setPulseIds([added.id]);
      },
    );
  };

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
            <Mascot size={72} />
            <p className="wb-serif text-xl">Mapping your roadmap...</p>
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
            onNodeAction={handleNodeAction}
            onAddTopic={handleAddTopic}
            highlightIds={pulseIds}
          />
        )}
      </div>
    </main>
  );
}
