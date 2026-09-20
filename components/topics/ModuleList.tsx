import Link from "next/link";
import { Check } from "lucide-react";
import { moduleNodes, modulePath } from "@/lib/modules";
import { cn } from "@/lib/utils";
import type { DraftGraph } from "@/types/learning";

interface Props {
  roadmapId: string;
  graph: DraftGraph;
  /** Ids of the nodes whose lesson has been written. */
  written: string[];
  /** The node whose page this list sits on. */
  currentId?: string;
  compact?: boolean;
}

/** The roadmap's modules in learning order, each a link to its lesson. */
export function ModuleList({ roadmapId, graph, written, currentId, compact }: Props) {
  const done = new Set(written);
  const modules = moduleNodes(graph);
  if (modules.length === 0) {
    return <p className="px-4 py-3 text-sm text-muted-foreground">This roadmap has no modules to open yet.</p>;
  }
  return (
    <ol className={cn("m-0 list-none p-0", compact ? "space-y-0.5" : "divide-y divide-border")} aria-label="Modules">
      {modules.map((node, i) => {
        const current = node.id === currentId;
        const isWritten = done.has(node.id);
        return (
          <li key={node.id}>
            <Link
              href={modulePath(roadmapId, node.id)}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted",
                compact ? "rounded-md px-2 py-1.5 text-[13px]" : "px-4 py-3",
                current && "bg-brand-soft font-medium text-primary hover:bg-brand-soft",
              )}
            >
              <span
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-full border text-[11px] font-medium tabular-nums",
                  compact ? "size-5 text-[10px]" : "size-6",
                  isWritten
                    ? "border-primary bg-primary text-primary-foreground"
                    : current
                      ? "border-primary text-primary"
                      : "border-border text-muted-foreground",
                )}
              >
                {isWritten ? <Check className="size-3" aria-label="written" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{node.title}</span>
                {!compact && node.summary && <span className="block truncate text-sm font-normal text-muted-foreground">{node.summary}</span>}
              </span>
              {!compact && (
                <span className="shrink-0 text-xs text-muted-foreground">{isWritten ? "Written" : `${node.estMinutes} min`}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
