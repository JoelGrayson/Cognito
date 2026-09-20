import { samplePlanGraph } from "@/fixtures/samplePlanGraph";
import { slugify } from "@/lib/graph/fallback";
import { conceptMatchesNode } from "@/lib/graph/known";
import type { DraftGraph, DraftNode, Edge, LearnerProfile } from "@/types/learning";
import { AiValidationError } from "../withRetry";
import { mockDelay } from "./delay";

function titleFor(profile: LearnerProfile): string {
  if (/linear algebra/i.test(profile.goal)) return samplePlanGraph.title;
  return `Roadmap: ${profile.goal.trim()}`.slice(0, 80);
}

const STAGES = [
  { id: "foundations", title: "foundations", summary: "The vocabulary and mental models everything else builds on." },
  { id: "core_skills", title: "core skills", summary: "The main techniques you will use day to day." },
  { id: "in_practice", title: "in practice", summary: "Applying the core skills to real problems." },
  { id: "going_further", title: "going further", summary: "Deeper and more specialized material." },
] as const;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const clip = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…");

/** Goal minus filler verbs, used to flavor node titles. */
function topicOf(goal: string): string {
  const t = goal.trim().replace(/^(learn|learning|study|master|get good at|how to)\s+/i, "");
  return clip(t || goal.trim(), 50);
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  for (let n = 2; used.has(id); n++) {
    const suffix = `_${n}`;
    id = base.slice(0, 60 - suffix.length) + suffix;
  }
  used.add(id);
  return id;
}

/**
 * A goal-shaped stand-in for goals outside the linear algebra fixture: four containers
 * named for the goal, with the rated concepts dealt in as leaves (level 2 = "known")
 * and a filler leaf wherever a container would otherwise be empty.
 */
function synthesizeGraph(profile: LearnerProfile): DraftGraph {
  const topic = topicOf(profile.goal);
  const used = new Set<string>();
  const nodes: DraftNode[] = [];
  const edges: Edge[] = [];

  const concepts = profile.priorKnowledge
    .map((k) => ({ name: k.concept.trim(), level: k.level }))
    .filter((k) => k.name.length > 0)
    .slice(0, 12);
  const buckets: { name: string; level: number }[][] = [[], [], []];
  concepts.forEach((concept, i) => buckets[i % 3].push(concept));
  if (concepts.length === 0) buckets[0].push({ name: topic, level: 0 });

  for (const [i, stage] of STAGES.entries()) {
    nodes.push({
      id: stage.id,
      title: clip(cap(`${topic} ${stage.title}`), 80),
      summary: stage.summary,
      kind: "core",
      estMinutes: 0,
      scope: "included",
    });
    const leaves = i < 3 ? buckets[i] : [];
    const children = leaves.length
      ? leaves
      : [{ name: `${topic} ${stage.title}`, level: 0 }];
    children.forEach((leaf, j) => {
      nodes.push({
        id: uniqueId(slugify(leaf.name) || `${stage.id}_${j + 1}`, used),
        title: clip(cap(leaf.name), 80),
        summary: leaf.level === 2 ? "You rated this as known." : stage.summary,
        kind: "core",
        parentId: stage.id,
        estMinutes: 45 + ((i * 3 + j) * 15) % 45,
        scope: leaf.level === 2 ? "known" : "included",
      });
    });
    if (i > 0) edges.push({ id: `${STAGES[i - 1].id}__${stage.id}`, source: STAGES[i - 1].id, target: stage.id, kind: "prerequisite" });
  }

  nodes.push({
    id: "capstone_project",
    title: clip(`Capstone: apply ${topic}`, 80),
    summary: "A small project that ties the roadmap together.",
    kind: "optional",
    estMinutes: 90,
    scope: "included",
  });
  edges.push({ id: "capstone_project__in_practice", source: "capstone_project", target: "in_practice", kind: "related" });

  return { title: titleFor(profile), nodes, edges };
}

/**
 * Deterministic draft graph for MOCK_AI=true. Goals about linear algebra reuse the sample
 * plan graph as a DraftGraph (no objectives); other goals get a synthesized skeleton named
 * for the goal. Either way, concepts the profile rates 2 (can explain) are marked `known`.
 * A concept matching a container also marks all of its children known.
 * MOCK_AI_FAIL_GRAPH=true throws an AiValidationError so callers can exercise the fallback graph.
 */
export async function mockGenerateGraph(profile: LearnerProfile): Promise<DraftGraph> {
  await mockDelay();
  if (process.env.MOCK_AI_FAIL_GRAPH === "true") throw new AiValidationError(["Mock graph failure (forced)"]);
  if (!/linear algebra/i.test(profile.goal)) return synthesizeGraph(profile);

  const known = profile.priorKnowledge.filter((k) => k.level === 2).map((k) => k.concept);
  const knownIds = new Set<string>();
  for (const node of samplePlanGraph.nodes) {
    if (known.some((concept) => conceptMatchesNode(concept, node.title))) {
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
