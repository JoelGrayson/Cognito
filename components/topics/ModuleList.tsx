import Link from "next/link";
import { Check } from "lucide-react";
import { moduleNodes, modulePath } from "@/lib/modules";
import { cn } from "@/lib/utils";
import type { DraftGraph, DraftNode } from "@/types/learning";

interface Props {
  roadmapId: string;
  graph: DraftGraph;
  /** Ids of the nodes whose lesson has been written. */
  written: string[];
  /** The node whose page this list sits on. */
  currentId?: string;
  compact?: boolean;
}

interface Group {
  key: string;
  /** Container title; null for standalone topics not under any module. */
  title: string | null;
  nodes: DraftNode[];
}

/**
 * Lessons grouped under their module (container) headers, in learning order.
 * A leaf match under no container joins a "More topics" section — unless the
 * graph has no containers at all, in which case the list stays flat.
 */
function groups(graph: DraftGraph, modules: DraftNode[]): Group[] {
  const titleOf = new Map(graph.nodes.map((n) => [n.id, n.title]));
  const parents = new Set(graph.nodes.map((n) => n.parentId).filter((id): id is string => !!id));
  const grouped = new Map<string, DraftNode[]>();
  const order: string[] = [];
  for (const node of modules) {
    const key = node.parentId && parents.has(node.parentId) ? node.parentId : "";
    if (!grouped.has(key)) {
      grouped.set(key, []);
      order.push(key);
    }
    grouped.get(key)!.push(node);
  }
  const result = order.map((key) => ({ key, title: key ? (titleOf.get(key) ?? null) : null, nodes: grouped.get(key)! }));
  // Standalone topics only need a header when real module sections exist alongside them.
  const orphans = result.find((g) => g.key === "");
  if (orphans && result.length > 1) orphans.title = "More topics";
  return result;
}

/** The roadmap's modules grouped by section, each lesson a link to its page. */
export function ModuleList({ roadmapId, graph, written, currentId, compact }: Props) {
  const done = new Set(written);
  const modules = moduleNodes(graph);
  if (modules.length === 0) {
    return <p className="px-4 py-3 text-sm text-muted-foreground">This roadmap has no modules to open yet.</p>;
  }
  const sections = groups(graph, modules);
  const showHeaders = sections.some((g) => g.title !== null);

  return (
    <div className={cn(compact ? "space-y-3" : "divide-y divide-border")}>
      {sections.map((section) => (
        <section key={section.key || "__standalone"}>
          {showHeaders && (
            <h3
              className={cn(
                "font-medium uppercase tracking-[0.18em] text-(--wb-bad-ink)",
                compact ? "px-2 pb-1 pt-2 text-[10px]" : "px-4 pb-1 pt-4 text-xs",
              )}
            >
              {section.title}
            </h3>
          )}
          <ol
            className={cn("m-0 list-none p-0", compact ? "space-y-0.5" : !showHeaders && "divide-y divide-border")}
            aria-label={section.title ?? "Modules"}
          >
            {section.nodes.map((node, i) => {
              const current = node.id === currentId;
              const isWritten = done.has(node.id);
              return (
                <li key={node.id} className={cn(!compact && "px-1 py-0.5")}>
                  <Link
                    href={modulePath(roadmapId, node.id)}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted",
                      compact ? "rounded-md px-2 py-1.5 text-[13px]" : "rounded-lg px-3 py-2.5",
                      current && "bg-brand-soft font-medium text-primary hover:bg-brand-soft",
                    )}
                  >
                    <span
                      className={cn(
                        "flex shrink-0 items-center justify-center rounded-full border font-medium tabular-nums",
                        compact ? "size-5 text-[10px]" : "size-6 text-[11px]",
                        isWritten
                          ? "border-primary bg-primary text-primary-foreground"
                          : current
                            ? "border-primary text-primary"
                            : "border-border text-muted-foreground",
                      )}
                    >
                      {isWritten ? <Check className="size-3" aria-label="written" /> : String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{node.title}</span>
                      {!compact && node.summary && (
                        <span className="block truncate text-sm font-normal text-muted-foreground">{node.summary}</span>
                      )}
                    </span>
                    {!compact && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {isWritten ? "Written" : `${node.estMinutes} min`}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
