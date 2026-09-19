import type { DraftGraph, Edge, GraphOp } from "@/types/learning";
import { AiValidationError } from "../withRetry";
import type { EditGraphInput, EditGraphResult } from "../functions/editGraph";
import { leafNodes } from "../serialize";
import { mockDelay } from "./delay";

const CALCULUS = /calculus|gradient|derivativ/i;

/** A prerequisite edge that closes a cycle: the reverse of an existing prerequisite edge. */
function cycleOps(graph: DraftGraph): GraphOp[] {
  const forward = graph.edges.find((e) => e.kind === "prerequisite");
  if (forward) {
    const edge: Edge = {
      id: `${forward.target}__${forward.source}`,
      source: forward.target,
      target: forward.source,
      kind: "prerequisite",
    };
    return [{ op: "add_edge", edge }];
  }
  // No prerequisite edges yet: add two opposite ones between the first two nodes.
  const [a, b] = graph.nodes;
  if (!a || !b) return [];
  return [
    { op: "add_edge", edge: { id: `${a.id}__${b.id}`, source: a.id, target: b.id, kind: "prerequisite" } },
    { op: "add_edge", edge: { id: `${b.id}__${a.id}`, source: b.id, target: a.id, kind: "prerequisite" } },
  ];
}

function hoursIn(message: string): number {
  const match = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i.exec(message);
  return match ? Number(match[1]) : 3;
}

/** Ops that exclude the calculus container, its leaves, and any optional topic that hangs off it. */
function skipCalculusOps(graph: DraftGraph): { ops: GraphOp[]; names: string[] } {
  const roots = graph.nodes.filter((n) => !n.parentId && n.scope !== "excluded" && CALCULUS.test(`${n.id} ${n.title}`));
  const ids = new Set<string>();
  for (const root of roots) {
    ids.add(root.id);
    graph.nodes.filter((n) => n.parentId === root.id).forEach((n) => ids.add(n.id));
    // Optional topics linked to the container by a "related" edge are parked too.
    for (const edge of graph.edges) {
      if (edge.kind === "related" && edge.source === root.id) ids.add(edge.target);
    }
  }
  const affected = graph.nodes.filter((n) => ids.has(n.id) && n.scope !== "excluded");
  return {
    ops: affected.map((n): GraphOp => ({ op: "update_node", id: n.id, patch: { scope: "excluded" } })),
    names: roots.map((n) => n.title),
  };
}

/**
 * Deterministic edit replies for MOCK_AI=true. The mock never validates its own ops; the route's
 * applyOps + validateGraph layer is responsible for rejecting bad ones.
 *
 * - message contains "cycle": returns ops that add a prerequisite edge closing a cycle
 *   (acceptance scenario 5, "Invalid ops rejected").
 * - message mentions "calculus", "gradient" or "derivative": excludes that container and its
 *   leaves (the canned "skip the calculus, I only have 3 hours a week" scenario) and reports
 *   whether the remaining plan fits the deadline at the stated hours per week.
 * - message contains "failtest" or MOCK_AI_FAIL_EDIT=true: throws AiValidationError.
 * - anything else: no ops and a generic helpful message.
 */
export async function mockEditGraph(input: EditGraphInput): Promise<EditGraphResult> {
  await mockDelay();
  const { graph, profile, message } = input;
  if (process.env.MOCK_AI_FAIL_EDIT === "true" || /failtest/i.test(message)) {
    throw new AiValidationError(["Mock edit failure (forced)"]);
  }

  if (/cycle/i.test(message)) {
    return { message: "Done, I linked those topics so each one depends on the other.", ops: cycleOps(graph) };
  }

  if (CALCULUS.test(message)) {
    const { ops, names } = skipCalculusOps(graph);
    if (ops.length === 0) {
      return { message: "There is no calculus left in the roadmap to skip. Want me to trim something else?", ops: [] };
    }
    const excluded = new Set(ops.flatMap((op) => (op.op === "update_node" ? [op.id] : [])));
    const remaining = leafNodes(graph)
      .filter((n) => n.scope === "included" && !excluded.has(n.id))
      .reduce((sum, n) => sum + n.estMinutes, 0);
    const hours = hoursIn(message);
    const weeks = Math.ceil(remaining / (hours * 60 * 0.8));
    const deadline = profile.deadline;
    const label = names.join(" and ") || "calculus";
    const fit = deadline
      ? `That leaves about ${Math.round(remaining / 60)} hours, roughly ${weeks} weeks at ${hours} hours a week, so it only fits your ${deadline} deadline if you have that many weeks left.`
      : `That leaves about ${Math.round(remaining / 60)} hours, roughly ${weeks} weeks at ${hours} hours a week, so the schedule fits.`;
    return { message: `I moved ${label} out of the plan and parked its related optional topics. ${fit}`, ops };
  }

  return {
    message:
      "I can add, rename, reorder, or drop topics, and I will flag it if the plan will not fit your time. What would you like to change, for example skipping a topic you already know?",
    ops: [],
  };
}
