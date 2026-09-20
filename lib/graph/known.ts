import type { DraftGraph, LearnerProfile } from "@/types/learning";

const stem = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean).map((w) => w.replace(/(es|s)$/, "")).join(" ");

// A concept matches a node when either contains the other after simple singularizing.
export function conceptMatchesNode(concept: string, title: string): boolean {
  const a = stem(concept);
  const b = stem(title);
  return a.length > 2 && b.length > 2 && (a.includes(b) || b.includes(a));
}

/**
 * Marks nodes covering concepts the learner rated 2 ("can explain") as known; a
 * container whose children are all known becomes known too. Marking only ever adds:
 * existing "known" and "excluded" scopes are kept, so model-set marks and marks from
 * earlier ratings survive when this is re-run with updated priorKnowledge. Returns
 * the same graph reference when nothing changed.
 */
export function applyKnownScope(graph: DraftGraph, priorKnowledge: LearnerProfile["priorKnowledge"]): DraftGraph {
  const known = priorKnowledge.filter((k) => k.level === 2).map((k) => k.concept);
  if (!known.length) return graph;

  const childrenOf = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (node.parentId) childrenOf.set(node.parentId, [...(childrenOf.get(node.parentId) ?? []), node.id]);
  }

  const scopeOf = new Map(graph.nodes.map((n) => [n.id, n.scope]));
  const mark = new Set<string>();
  for (const node of graph.nodes) {
    if (node.scope === "excluded") continue;
    if (known.some((concept) => conceptMatchesNode(concept, node.title))) {
      mark.add(node.id);
      // A known container means the whole area is known.
      for (const child of childrenOf.get(node.id) ?? []) if (scopeOf.get(child) !== "excluded") mark.add(child);
    }
  }
  // A container is known when every non-excluded child is (runs after leaf marking).
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of graph.nodes) {
      const children = (childrenOf.get(node.id) ?? []).filter((id) => scopeOf.get(id) !== "excluded");
      if (children.length && !mark.has(node.id) && children.every((id) => mark.has(id))) {
        mark.add(node.id);
        changed = true;
      }
    }
  }

  if (!mark.size) return graph;
  let touched = false;
  const nodes = graph.nodes.map((node) => {
    if (!mark.has(node.id) || node.scope === "known" || node.scope === "excluded") return node;
    touched = true;
    return { ...node, scope: "known" as const };
  });
  return touched ? { ...graph, nodes } : graph;
}
