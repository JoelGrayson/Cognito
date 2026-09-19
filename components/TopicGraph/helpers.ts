// Pure helpers for <TopicGraph>: display maths and the GraphOp builders used by the inspector.
// The component never mutates a graph; it only turns user intent into ops with these.

import type { DraftGraph, DraftNode, GraphOp, PlanGraph, Progress } from "@/types/learning";

export type AnyGraph = DraftGraph | PlanGraph;

export const MAX_TITLE = 80;
export const MAX_SUMMARY = 140;
export const NEW_LEAF_MINUTES = 30;

export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function childrenOf(graph: AnyGraph, id: string): DraftNode[] {
  return graph.nodes.filter((n) => n.parentId === id);
}

export function isContainer(graph: AnyGraph, id: string): boolean {
  return graph.nodes.some((n) => n.parentId === id);
}

/**
 * Minutes a container stands for: the sum of its children that are still to be studied
 * (scope "included"). Known and excluded children are not study time.
 */
export function containerMinutes(graph: AnyGraph, id: string): number {
  return childrenOf(graph, id)
    .filter((n) => n.scope === "included")
    .reduce((sum, n) => sum + n.estMinutes, 0);
}

/** Progress for every node. Containers without an explicit entry are derived from their leaves. */
export function resolveProgress(
  graph: AnyGraph,
  progress: Record<string, Progress>,
): Record<string, Progress> {
  const result: Record<string, Progress> = {};
  for (const node of graph.nodes) {
    const explicit = progress[node.id];
    const kids = childrenOf(graph, node.id).filter((n) => n.scope === "included");
    if (explicit || kids.length === 0) {
      result[node.id] = explicit ?? "todo";
      continue;
    }
    const states = kids.map((k) => progress[k.id] ?? "todo");
    result[node.id] = states.every((s) => s === "done")
      ? "done"
      : states.some((s) => s !== "todo")
        ? "in_progress"
        : "todo";
  }
  return result;
}

/**
 * A saved PlanGraph has objectives on every node; a draft usually does not. This only decides
 * wording ("Remove" versus "Delete"), never behaviour, and callers can override it.
 */
export function looksLikePlanGraph(graph: AnyGraph): boolean {
  return graph.nodes.length > 0 && graph.nodes.every((n) => (n.objectives?.length ?? 0) > 0);
}

/** Ids are `/^[a-z0-9_]{1,60}$/`. Derive one from a title and make it unique with `_2`, `_3`, ... */
export function makeNodeId(title: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base =
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 50)
      .replace(/_+$/g, "") || "topic";
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** A child may only be added under a top-level node (depth is capped at 2). */
export function canAddChild(node: DraftNode): boolean {
  return node.parentId === undefined;
}

export function buildEditOps(
  node: DraftNode,
  next: { title: string; summary: string },
): GraphOp[] {
  const patch: Partial<Pick<DraftNode, "title" | "summary">> = {};
  const title = next.title.trim();
  const summary = next.summary.trim();
  if (title && title !== node.title) patch.title = title;
  if (summary !== node.summary) patch.summary = summary;
  return Object.keys(patch).length > 0 ? [{ op: "update_node", id: node.id, patch }] : [];
}

/** Scope applies to a container's children too, so a container never disagrees with its leaves. */
export function buildScopeOps(
  graph: AnyGraph,
  node: DraftNode,
  scope: DraftNode["scope"],
): GraphOp[] {
  return [node, ...childrenOf(graph, node.id)]
    .filter((n) => n.scope !== scope)
    .map((n): GraphOp => ({ op: "update_node", id: n.id, patch: { scope } }));
}

/**
 * "Delete" on a draft, "Remove" on a saved plan: both are a single remove_node. The consumer
 * decides what it means (applyOps deletes, applyPlanOps sets scope "excluded").
 */
export function buildRemoveOps(node: DraftNode): GraphOp[] {
  return [{ op: "remove_node", id: node.id }];
}

/**
 * Add a leaf under a top-level node. If the parent was a leaf it becomes a container, and a
 * container must have estMinutes 0, so it is zeroed first. Objectives are always included so
 * the node is valid in a PlanGraph as well as a DraftGraph.
 */
export function buildAddChildOps(
  graph: AnyGraph,
  parent: DraftNode,
  title: string,
): GraphOp[] {
  const cleanTitle = title.trim().slice(0, MAX_TITLE);
  if (!cleanTitle || !canAddChild(parent)) return [];
  const ops: GraphOp[] = [];
  if (parent.estMinutes !== 0) {
    ops.push({ op: "update_node", id: parent.id, patch: { estMinutes: 0 } });
  }
  ops.push({
    op: "add_node",
    node: {
      id: makeNodeId(cleanTitle, graph.nodes.map((n) => n.id)),
      title: cleanTitle,
      summary: "",
      kind: parent.kind,
      parentId: parent.id,
      estMinutes: NEW_LEAF_MINUTES,
      scope: "included",
      objectives: [`Explain ${cleanTitle} in your own words`],
    },
  });
  return ops;
}
