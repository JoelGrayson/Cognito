import Link from "next/link";
import { moduleNodes, modulePath } from "@/lib/modules";
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
    return <p className="px-4 py-3 text-sm text-neutral-500">This roadmap has no modules to open yet.</p>;
  }
  return (
    <ol className={compact ? "module-list module-list-compact" : "module-list"} aria-label="Modules">
      {modules.map((node, i) => {
        const current = node.id === currentId;
        return (
          <li key={node.id}>
            <Link
              href={modulePath(roadmapId, node.id)}
              className="module-link"
              aria-current={current ? "page" : undefined}
              data-written={done.has(node.id) ? "true" : undefined}
              data-known={node.scope === "known" ? "true" : undefined}
            >
              <span className="module-index">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{node.title}</span>
                {!compact && node.summary && <span className="block truncate text-sm text-neutral-500">{node.summary}</span>}
              </span>
              {!compact && (
                <span className="shrink-0 text-xs text-neutral-400">
                  {node.scope === "known" ? "known" : done.has(node.id) ? "written" : `${node.estMinutes} min`}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
