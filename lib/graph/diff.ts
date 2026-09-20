import type { DraftGraph, GraphOp } from "@/types/learning";

/**
 * Ids named by the ops, in first-seen order, without duplicates. Node ids for node ops and edge
 * ids for edge ops. For `add_node` this is the id as requested; the server may dedupe it, so use
 * diffGraphs on the before/after graphs when the exact result matters.
 */
export function touchedIds(ops: GraphOp[]): string[] {
  const ids: string[] = [];
  for (const op of ops) {
    const id =
      op.op === "add_node" ? op.node.id : op.op === "add_edge" ? op.edge.id : op.id;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/**
 * Compares two graphs by id, covering nodes and edges together (edge ids and node ids share one
 * list). `added` and `changed` follow `next` order, `removed` follows `prev` order. Node fields
 * are compared deeply; key order and undefined values do not matter.
 */
export function diffGraphs(
  prev: DraftGraph,
  next: DraftGraph,
): { added: string[]; changed: string[]; removed: string[] } {
  const items = (g: DraftGraph) =>
    new Map<string, unknown>([
      ...g.nodes.map((n) => [n.id, { node: n }] as const),
      ...g.edges.map((e) => [e.id, { edge: e }] as const),
    ]);
  const before = items(prev);
  const after = items(next);
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];
  for (const [id, value] of after) {
    if (!before.has(id)) added.push(id);
    else if (!deepEqual(before.get(id), value)) changed.push(id);
  }
  for (const id of before.keys()) if (!after.has(id)) removed.push(id);
  return { added, changed, removed };
}
