import { kahnOrder, prerequisiteLinks } from "@/lib/graph/topoSort";
import type { LessonRequest } from "@/lib/prompt";
import type { Phase } from "@/lib/schema";
import type { DraftGraph, DraftNode } from "@/types/learning";

export const TOPICS_PATH = "/topics";

export function topicPath(id: string): string {
  return `${TOPICS_PATH}/${id}`;
}

export function modulePath(id: string, nodeId: string): string {
  return `${topicPath(id)}/module/${nodeId}`;
}

export function moduleChatPath(id: string, nodeId: string): string {
  return `${modulePath(id, nodeId)}/chat`;
}

/** Nodes with children group their children; they are not lessons themselves. */
function containerIds(graph: DraftGraph): Set<string> {
  const ids = new Set(graph.nodes.map((n) => n.id));
  return new Set(graph.nodes.map((n) => n.parentId).filter((id): id is string => !!id && ids.has(id)));
}

/**
 * The nodes the learner studies, in learning order: included leaves (known and excluded topics are
 * skipped, containers only group), prerequisites first. A graph with a cycle falls back to array order for the nodes inside it.
 */
export function moduleNodes(graph: DraftGraph): DraftNode[] {
  const containers = containerIds(graph);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const { order, remaining } = kahnOrder(
    graph.nodes.map((n) => n.id),
    prerequisiteLinks(graph),
  );
  return [...order, ...remaining]
    .map((id) => byId.get(id)!)
    .filter((n) => !containers.has(n.id) && n.scope === "included");
}

export function countModules(graph: DraftGraph): number {
  return moduleNodes(graph).length;
}

/** The study module with this id; null for containers, known/excluded topics and unknown ids. */
export function findNode(graph: DraftGraph, nodeId: string): DraftNode | null {
  return moduleNodes(graph).find((n) => n.id === nodeId) ?? null;
}

function phaseOf(node: DraftNode): Phase {
  return node.kind === "optional" ? "advanced" : "core";
}

/** What the lesson writer needs to know about one node and where it sits in the roadmap. */
export function lessonRequest(goal: string, graph: DraftGraph, node: DraftNode): LessonRequest {
  const modules = moduleNodes(graph);
  const needs = graph.edges
    .filter((e) => e.kind === "prerequisite" && e.target === node.id)
    .map((e) => graph.nodes.find((n) => n.id === e.source)?.title)
    .filter((t): t is string => !!t);
  const outline = modules
    .map((n, i) => `${i + 1}. [${phaseOf(n)}] ${n.title}: ${n.summary}${n.id === node.id ? "  <- this lesson" : ""}`)
    .join("\n");
  return {
    topic: graph.title || goal,
    node: {
      name: node.title,
      subtitle: node.objectives?.length ? node.objectives.join(", ") : node.summary,
      description: [node.summary, needs.length ? `Builds on: ${needs.join(", ")}.` : ""].filter(Boolean).join(" "),
    },
    phase: phaseOf(node),
    roadmap: outline,
  };
}
