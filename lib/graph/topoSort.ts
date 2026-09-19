import type { DraftGraph, PlanGraph } from "@/types/learning";

type Link = { source: string; target: string };

/**
 * Kahn's algorithm over the given ids and links. Whenever several nodes are ready, the one that
 * appears first in `ids` goes first, so the output is deterministic. Links whose endpoints are not
 * in `ids` are ignored. `remaining` lists nodes that could not be placed (cycle members and
 * everything downstream of a cycle).
 */
export function kahnOrder(ids: readonly string[], links: readonly Link[]): { order: string[]; remaining: string[] } {
  const index = new Map<string, number>();
  ids.forEach((id, i) => {
    if (!index.has(id)) index.set(id, i);
  });
  const indegree = new Map<number, number>();
  const outgoing = new Map<number, number[]>();
  for (const i of index.values()) indegree.set(i, 0);
  for (const { source, target } of links) {
    const s = index.get(source);
    const t = index.get(target);
    if (s === undefined || t === undefined) continue;
    indegree.set(t, (indegree.get(t) ?? 0) + 1);
    outgoing.set(s, [...(outgoing.get(s) ?? []), t]);
  }
  const ready = [...index.values()].filter((i) => indegree.get(i) === 0);
  const order: string[] = [];
  const placed = new Set<number>();
  while (ready.length > 0) {
    let best = 0;
    for (let k = 1; k < ready.length; k++) if (ready[k] < ready[best]) best = k;
    const [i] = ready.splice(best, 1);
    placed.add(i);
    order.push(ids[i]);
    for (const t of outgoing.get(i) ?? []) {
      const left = (indegree.get(t) ?? 0) - 1;
      indegree.set(t, left);
      if (left === 0) ready.push(t);
    }
  }
  const remaining = [...index.values()].filter((i) => !placed.has(i)).map((i) => ids[i]);
  return { order, remaining };
}

/** One concrete cycle (in edge direction, first node repeated at the end) among `remaining` nodes. */
export function findCycle(remaining: readonly string[], links: readonly Link[]): string[] {
  const left = new Set(remaining);
  const predecessor = new Map<string, string>();
  for (const { source, target } of links) {
    if (left.has(source) && left.has(target) && !predecessor.has(target)) predecessor.set(target, source);
  }
  const walk: string[] = [];
  const seenAt = new Map<string, number>();
  let node: string | undefined = remaining[0];
  while (node !== undefined && !seenAt.has(node)) {
    seenAt.set(node, walk.length);
    walk.push(node);
    node = predecessor.get(node);
  }
  if (node === undefined) return [...remaining];
  const cycle = walk.slice(seenAt.get(node)).reverse();
  return [...cycle, cycle[0]];
}

export function prerequisiteLinks(graph: DraftGraph | PlanGraph): Link[] {
  return graph.edges.filter((e) => e.kind === "prerequisite");
}

/**
 * Order all node ids so every prerequisite source comes before its target. Only `prerequisite`
 * edges count. Ties are broken by array order. Edges to unknown ids are ignored (validateGraph
 * reports them). Throws on a cycle.
 */
export function topoSort(graph: DraftGraph | PlanGraph): string[] {
  const ids = graph.nodes.map((n) => n.id);
  const links = prerequisiteLinks(graph);
  const { order, remaining } = kahnOrder(ids, links);
  if (remaining.length > 0) {
    throw new Error(`Prerequisite edges contain a cycle: ${findCycle(remaining, links).join(" -> ")}`);
  }
  return order;
}
