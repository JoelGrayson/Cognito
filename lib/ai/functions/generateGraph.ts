import { validateGraph } from "@/lib/graph/validate";
import type { DraftGraph, LearnerProfile } from "@/types/learning";
import { STRONG_MODEL } from "../models";
import { availableStudyTime, serializeProfile } from "../serialize";
import { callForcedTool, setGraphTool, type AiCallOptions } from "../tools";

export const GENERATE_GRAPH_SYSTEM = `You design a personalized learning roadmap as a graph, for a self-learner.
Call set_graph exactly once with the whole roadmap.

Structure:
- 5 to 8 nodes with kind "core" and no parentId: the spine, in learning order. These are containers.
- Every spine node has 2 to 4 child nodes (kind "core", parentId = the spine node's id). The children are the leaf topics the learner actually studies. Children never have children of their own.
- Add 2 to 4 kind "optional" leaf nodes with no parentId for enrichment topics (they are studied last).
- Never create a node that is both a parent and a child. The graph is exactly two levels deep.
- Hard limit: at most 30 nodes in total, counting containers, children and optional nodes. Pick the spine size and children per spine so the total stays under 30 (for example 6 spine nodes with 3 children each plus 3 optional nodes is 27). Count before you answer.

Edges:
- Connect consecutive spine nodes with kind "prerequisite" edges (a chain, or a small DAG when two spine nodes are truly independent). Prerequisite edges only ever go between spine nodes and must never form a cycle.
- Link an optional node to the spine node it extends with a kind "related" edge.
- Edge id is "<source>__<target>". Every edge source and target must be an existing node id. No self loops.

Nodes:
- id: stable lowercase snake_case, matches ^[a-z0-9_]{1,60}$, unique.
- title: 80 characters or fewer, no "|" character. summary: one sentence, under 140 characters.
- estMinutes: containers have estMinutes 0 exactly. Leaves have realistic study time, 30 to 90 minutes each.
- scope: "included" by default. Concepts the learner rated 2 (can explain) become scope "known" (mark a container and all its children "known" when the whole area is already known). Do not use objectives; they are added later.
- Tailor content to the goal, goal type, prior knowledge and constraints. Skip what they already know; start where they are.

Time budget:
- The sum of estMinutes of included leaves should fit hoursPerWeek up to the deadline (keep about 20 percent of each week for review). The user message states the budget when a deadline is set.
- If the full roadmap would not fit, demote lower-priority topics to kind "optional" or scope "excluded" until it fits, and never drop the topics the goal depends on.
- Without a deadline, aim for a roadmap of roughly 8 to 16 weeks at the given hoursPerWeek.`;

export function buildGenerateGraphPrompt(profile: LearnerProfile, now: Date = new Date()): string {
  const available = availableStudyTime(profile, now);
  const budget = available
    ? `Time budget: ${available.weeks} weeks until the deadline, about ${available.minutes} minutes of study available. Included leaves must total at most that.`
    : "Time budget: no deadline; use hoursPerWeek to size the roadmap.";
  return `Learner profile:\n${serializeProfile(profile)}\n\nToday: ${now.toISOString().slice(0, 10)}\n${budget}\n\nBuild the roadmap now.`;
}

/**
 * Generates the initial draft graph. Validated with the DraftGraph zod schema, then
 * validateGraph; on failure retries once with every error listed, then throws AiValidationError.
 */
export async function generateGraph(profile: LearnerProfile, options: AiCallOptions = {}): Promise<DraftGraph> {
  return callForcedTool({
    model: STRONG_MODEL,
    system: GENERATE_GRAPH_SYSTEM,
    prompt: buildGenerateGraphPrompt(profile),
    tool: setGraphTool,
    maxTokens: 8000,
    check: (graph) => {
      const result = validateGraph(graph);
      return result.ok ? [] : result.errors;
    },
    ...options,
  });
}
