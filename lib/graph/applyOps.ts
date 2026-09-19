import type { DraftGraph, DraftNode, Edge, GraphOp, PlanGraph, PlanNode } from "@/types/learning";

export class GraphOpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphOpError";
  }
}

type Graph<N extends DraftNode> = { title: string; nodes: N[]; edges: Edge[] };

const MAX_ID = 60;

/** `base`, else `base_2`, `base_3`, ... (base is truncated so the id stays within 60 characters). */
function dedupe(base: string, taken: (candidate: string) => boolean, maxLength = Infinity): string {
  if (!taken(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `_${n}`;
    const candidate = base.slice(0, Math.max(1, maxLength - suffix.length)) + suffix;
    if (!taken(candidate)) return candidate;
  }
}

/**
 * Shared implementation. Decisions where the spec is silent:
 * - `add_node` / `add_edge` id collisions get a `_2`, `_3` suffix. Renames made earlier in the same
 *   batch are applied to later `add_node.parentId` and `add_edge.source/target` (so "add x, then
 *   edge to x" still points at the new node). `update_node` / `remove_*` always address ids as given.
 * - References to ids that do not exist (parentId, edge endpoints) are NOT rejected here, because
 *   a batch may legitimately add an edge before its node; `validateGraph` reports them.
 * - `update_node` skips `undefined` patch values and may not change `id`. It does not fix
 *   `estMinutes` when a node becomes a container; `validateGraph` catches that.
 */
function run<N extends DraftNode>(
  input: Graph<N>,
  ops: GraphOp[],
  mode: "draft" | "plan",
  toNode: (node: DraftNode, op: number) => N,
): Graph<N> {
  const graph = structuredClone(input);
  const renamed = new Map<string, string>();
  const remap = (id: string) => renamed.get(id) ?? id;

  ops.forEach((op, i) => {
    const at = `op ${i + 1} (${op.op})`;
    switch (op.op) {
      case "add_node": {
        const node = toNode(structuredClone(op.node), i);
        const id = dedupe(node.id, (c) => graph.nodes.some((n) => n.id === c), MAX_ID);
        if (id !== node.id) renamed.set(node.id, id);
        graph.nodes.push({ ...node, id, ...(node.parentId !== undefined ? { parentId: remap(node.parentId) } : {}) });
        return;
      }
      case "update_node": {
        const node = graph.nodes.find((n) => n.id === op.id);
        if (!node) throw new GraphOpError(`${at}: node "${op.id}" does not exist.`);
        const patch = op.patch as Record<string, unknown>;
        if ("id" in patch && patch.id !== op.id) throw new GraphOpError(`${at}: node ids are immutable.`);
        if (mode === "plan" && "objectives" in patch && patch.objectives !== undefined) {
          if (!Array.isArray(patch.objectives) || patch.objectives.length === 0) {
            throw new GraphOpError(`${at}: a saved plan node needs at least one objective.`);
          }
        }
        for (const [key, value] of Object.entries(patch)) {
          if (value !== undefined && key !== "id") (node as Record<string, unknown>)[key] = structuredClone(value);
        }
        return;
      }
      case "remove_node": {
        if (!graph.nodes.some((n) => n.id === op.id)) throw new GraphOpError(`${at}: node "${op.id}" does not exist.`);
        const doomed = new Set<string>([op.id]);
        for (let grew = true; grew; ) {
          grew = false;
          for (const n of graph.nodes) {
            if (n.parentId !== undefined && doomed.has(n.parentId) && !doomed.has(n.id)) {
              doomed.add(n.id);
              grew = true;
            }
          }
        }
        if (mode === "draft") {
          graph.nodes = graph.nodes.filter((n) => !doomed.has(n.id));
          graph.edges = graph.edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target));
        } else {
          for (const n of graph.nodes) if (doomed.has(n.id)) n.scope = "excluded";
        }
        return;
      }
      case "add_edge": {
        const edge: Edge = { ...op.edge, source: remap(op.edge.source), target: remap(op.edge.target) };
        edge.id = dedupe(edge.id, (c) => graph.edges.some((e) => e.id === c));
        graph.edges.push(edge);
        return;
      }
      case "remove_edge": {
        if (!graph.edges.some((e) => e.id === op.id)) throw new GraphOpError(`${at}: edge "${op.id}" does not exist.`);
        graph.edges = graph.edges.filter((e) => e.id !== op.id);
        return;
      }
    }
  });
  return graph;
}

/** Pure: returns a new draft graph. Draft `remove_node` deletes the node, its children and incident edges. */
export function applyOps(graph: DraftGraph, ops: GraphOp[]): DraftGraph {
  return run(graph, ops, "draft", (node) => node);
}

/**
 * Pure: returns a new saved-plan graph. Nodes are never deleted: `remove_node` sets
 * `scope: "excluded"` on the node and its children and keeps every edge. `add_node` must carry
 * `objectives` (PlanNode). `remove_edge` is allowed.
 */
export function applyPlanOps(graph: PlanGraph, ops: GraphOp[]): PlanGraph {
  return run(graph, ops, "plan", (node, i): PlanNode => {
    if (!node.objectives || node.objectives.length === 0) {
      throw new GraphOpError(`op ${i + 1} (add_node): node "${node.id}" needs at least one objective in a saved plan.`);
    }
    return { ...node, objectives: node.objectives };
  });
}
