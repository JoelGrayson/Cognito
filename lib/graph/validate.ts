import { NodeId, type DraftGraph, type PlanGraph } from "@/types/learning";
import { findCycle, kahnOrder } from "./topoSort";

export const MAX_NODES = 30;

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

/** Checks every rule in the spec and returns all violations (they feed retry prompts). */
export function validateGraph(graph: DraftGraph | PlanGraph): ValidationResult {
  const errors: string[] = [];
  const { nodes, edges } = graph;

  if (nodes.length > MAX_NODES) {
    errors.push(`Graph has ${nodes.length} nodes; the maximum is ${MAX_NODES}.`);
  }

  const byId = new Map<string, (typeof nodes)[number]>();
  const reportedDuplicates = new Set<string>();
  for (const node of nodes) {
    if (!NodeId.safeParse(node.id).success) {
      errors.push(`Node id "${node.id}" is invalid: use 1 to 60 characters from a-z, 0-9 and underscore.`);
    }
    if (byId.has(node.id)) {
      if (!reportedDuplicates.has(node.id)) errors.push(`Duplicate node id "${node.id}".`);
      reportedDuplicates.add(node.id);
    } else {
      byId.set(node.id, node);
    }
  }

  const parentIds = new Set<string>();
  for (const node of nodes) {
    if (node.parentId === undefined) continue;
    if (node.parentId === node.id) {
      errors.push(`Node "${node.id}" is its own parent.`);
      continue;
    }
    const parent = byId.get(node.parentId);
    if (!parent) {
      errors.push(`Node "${node.id}" has parentId "${node.parentId}", which does not exist.`);
      continue;
    }
    parentIds.add(parent.id);
    if (parent.parentId !== undefined) {
      errors.push(
        `Node "${node.id}" has parent "${parent.id}", which is itself a child of "${parent.parentId}" (max depth is 2).`,
      );
    }
  }

  for (const id of parentIds) {
    const container = byId.get(id);
    if (container && container.estMinutes !== 0) {
      errors.push(`Container "${id}" has estMinutes ${container.estMinutes}; containers must have estMinutes 0.`);
    }
  }

  const seenEdgeIds = new Set<string>();
  const links: { source: string; target: string }[] = [];
  for (const edge of edges) {
    if (seenEdgeIds.has(edge.id)) {
      errors.push(`Duplicate edge id "${edge.id}".`);
      continue;
    }
    seenEdgeIds.add(edge.id);
    let usable = true;
    if (!byId.has(edge.source)) {
      errors.push(`Edge "${edge.id}" has source "${edge.source}", which does not exist.`);
      usable = false;
    }
    if (!byId.has(edge.target)) {
      errors.push(`Edge "${edge.id}" has target "${edge.target}", which does not exist.`);
      usable = false;
    }
    if (edge.source === edge.target) {
      errors.push(`Edge "${edge.id}" is a self loop on "${edge.source}".`);
      usable = false;
    }
    if (usable && edge.kind === "prerequisite") links.push(edge);
  }

  const { remaining } = kahnOrder([...byId.keys()], links);
  if (remaining.length > 0) {
    errors.push(`Prerequisite edges contain a cycle: ${findCycle(remaining, links).join(" -> ")}.`);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
