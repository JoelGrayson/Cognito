import { samplePlanGraph } from "@/fixtures/samplePlanGraph";
import type { DraftGraph, DraftNode, LearnerProfile } from "@/types/learning";
import { AiValidationError } from "../withRetry";
import { mockDelay } from "./delay";

const stem = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean).map((w) => w.replace(/(es|s)$/, "")).join(" ");

// A concept matches a node when either contains the other after simple singularizing.
function matches(concept: string, title: string): boolean {
  const a = stem(concept);
  const b = stem(title);
  return a.length > 2 && b.length > 2 && (a.includes(b) || b.includes(a));
}

function titleFor(profile: LearnerProfile): string {
  if (/linear algebra/i.test(profile.goal)) return samplePlanGraph.title;
  return `Roadmap: ${profile.goal.trim()}`.slice(0, 80);
}

/**
 * Deterministic draft graph for MOCK_AI=true: the sample plan graph as a DraftGraph (no objectives),
 * titled for the goal, with topics the profile rates 2 (can explain) marked `known`.
 * A concept matching a container also marks all of its children known.
 * MOCK_AI_FAIL_GRAPH=true throws an AiValidationError so callers can exercise the fallback graph.
 */
export async function mockGenerateGraph(profile: LearnerProfile): Promise<DraftGraph> {
  await mockDelay();
  if (process.env.MOCK_AI_FAIL_GRAPH === "true") throw new AiValidationError(["Mock graph failure (forced)"]);

  const known = profile.priorKnowledge.filter((k) => k.level === 2).map((k) => k.concept);
  const knownIds = new Set<string>();
  for (const node of samplePlanGraph.nodes) {
    if (known.some((concept) => matches(concept, node.title))) {
      knownIds.add(node.id);
      if (!node.parentId) samplePlanGraph.nodes.filter((n) => n.parentId === node.id).forEach((n) => knownIds.add(n.id));
    }
  }

  const nodes: DraftNode[] = samplePlanGraph.nodes.map((source) => {
    const node: DraftNode = { ...source, scope: knownIds.has(source.id) ? "known" : source.scope };
    delete node.objectives; // objectives come from enrichModule at plan generation
    return node;
  });
  return { title: titleFor(profile), nodes, edges: samplePlanGraph.edges.map((e) => ({ ...e })) };
}
