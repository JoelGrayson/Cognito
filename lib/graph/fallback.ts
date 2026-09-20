import type { DraftGraph, DraftNode, Edge, LearnerProfile, OnboardingProfile } from "@/types/learning";
import { MAX_NODES } from "./validate";

const MAX_ID = 60;
const MAX_TITLE = 80;
const LEAF_MINUTES = 60;

/** snake_case ascii slug within the id pattern; "" when nothing usable is left. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_ID)
    .replace(/_+$/g, "");
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  for (let n = 2; used.has(id); n++) {
    const suffix = `_${n}`;
    id = base.slice(0, MAX_ID - suffix.length) + suffix;
  }
  used.add(id);
  return id;
}

const clip = (text: string, max: number) => (text.length <= max ? text : text.slice(0, max - 1).trimEnd() + "…");

const SUMMARY: Record<0 | 1 | 2, string> = {
  0: "New to you: start from the basics.",
  1: "Some familiarity: fill in the gaps.",
  2: "You rated this as known.",
};
const GOAL_ONLY_SUMMARY = "A first pass at your goal.";
const FALLBACK_SUMMARIES = new Set<string>([...Object.values(SUMMARY), GOAL_ONLY_SUMMARY]);

/**
 * Whether a graph came from buildFallbackGraph: a flat chain of 60-minute core leaves whose
 * summaries are the fixed fallback strings. Model output has containers and prose summaries,
 * so the shape identifies a fallback even after the profile it was built from has changed.
 */
export function isFallbackGraph(graph: DraftGraph): boolean {
  return (
    graph.nodes.length > 0 &&
    graph.nodes.every(
      (node) =>
        node.parentId == null &&
        node.kind === "core" &&
        node.estMinutes === LEAF_MINUTES &&
        FALLBACK_SUMMARIES.has(node.summary),
    ) &&
    graph.edges.length === graph.nodes.length - 1 &&
    graph.edges.every((edge, i) => edge.source === graph.nodes[i].id && edge.target === graph.nodes[i + 1].id)
  );
}

/**
 * Linear fallback graph (spec section 5): each rated concept becomes a core leaf of 60 minutes,
 * chained by prerequisite edges in ascending self-rating order (stable for ties); rating 2 is
 * `scope: "known"`. Concepts with blank names are skipped and the list is capped at
 * MAX_NODES (the lowest-rated concepts are kept). With no concepts, a single leaf is built from
 * the goal. The result always passes validateGraph.
 */
export function buildFallbackGraph(profile: OnboardingProfile | LearnerProfile): DraftGraph {
  const goal = profile.goal?.trim() ?? "";
  const title = clip(goal || "Learning plan", MAX_TITLE);

  const concepts = (profile.priorKnowledge ?? [])
    .map((entry, index) => ({ name: entry.concept.trim(), level: entry.level, index }))
    .filter((entry) => entry.name.length > 0)
    .sort((a, b) => a.level - b.level || a.index - b.index)
    .slice(0, MAX_NODES);

  const used = new Set<string>();
  const nodes: DraftNode[] =
    concepts.length > 0
      ? concepts.map(({ name, level }) => ({
          id: uniqueId(slugify(name) || "concept", used),
          title: clip(name, MAX_TITLE),
          summary: SUMMARY[level],
          kind: "core",
          estMinutes: LEAF_MINUTES,
          scope: level === 2 ? "known" : "included",
        }))
      : [
          {
            id: uniqueId(slugify(goal) || "getting_started", used),
            title: clip(goal || "Getting started", MAX_TITLE),
            summary: GOAL_ONLY_SUMMARY,
            kind: "core",
            estMinutes: LEAF_MINUTES,
            scope: "included",
          },
        ];

  const edges: Edge[] = nodes.slice(1).map((node, i) => ({
    id: `${nodes[i].id}__${node.id}`,
    source: nodes[i].id,
    target: node.id,
    kind: "prerequisite",
  }));

  return { title, nodes, edges };
}
