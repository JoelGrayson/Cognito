import type { DraftNode, LearnerProfile } from "@/types/learning";
import { STRONG_MODEL } from "../models";
import { serializeProfile } from "../serialize";
import {
  callForcedTool,
  ENRICH_MINUTES_MAX,
  ENRICH_MINUTES_MIN,
  OBJECTIVE_MAX_CHARS,
  setObjectivesTool,
  type AiCallOptions,
  type SetObjectivesOutput,
} from "../tools";

export interface EnrichModuleInput {
  profile: LearnerProfile;
  /** The core node (container, or a lone core leaf) being enriched. */
  coreNode: DraftNode;
  /** The leaves to write objectives for: the container's included children (or the node itself). */
  nodes: DraftNode[];
}

export type EnrichModuleResult = SetObjectivesOutput;

export const ENRICH_MODULE_SYSTEM = `You write learning objectives for topics in a learner's study plan. Call set_objectives exactly once, with an entry for every requested topic id and no other ids.

For each topic:
- 2 to 4 objectives. Each is one assessable statement that starts with an action verb (explain, derive, compare, implement, predict, critique, compute, apply, ...). A learner or tutor could check it with a question or exercise.
- Each objective is under ${OBJECTIVE_MAX_CHARS} characters. Never just a topic name ("Eigenvalues" is wrong; "Compute the eigenvalues of a 2x2 matrix" is right).
- Objectives are specific to the topic, ordered from foundational to deeper, and pitched at the learner's level and goal.
- Optionally set estMinutes (integer, ${ENRICH_MINUTES_MIN} to ${ENRICH_MINUTES_MAX}) when the current estimate is unrealistic for these objectives at this learner's level; otherwise omit it or repeat it.`;

function buildPrompt({ profile, coreNode, nodes }: EnrichModuleInput): string {
  const topics = nodes.map((n) => `${n.id} | ${n.title} | ${n.summary} | ${n.estMinutes} min`).join("\n");
  return [
    `Learner profile:\n${serializeProfile(profile)}`,
    `Module: ${coreNode.title} (${coreNode.summary})`,
    `Topics (id | title | summary | current estimate):\n${topics}`,
  ].join("\n\n");
}

const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();

/** Problems beyond the zod shape: exact id coverage, and objectives that are just a topic name. */
export function checkEnrichment(nodes: DraftNode[], output: EnrichModuleResult): string[] {
  const issues: string[] = [];
  const wanted = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  for (const entry of output.nodes) {
    if (!wanted.has(entry.id)) issues.push(`Unknown topic id "${entry.id}"; only request ids: ${[...wanted].join(", ")}.`);
    else if (seen.has(entry.id)) issues.push(`Duplicate entry for topic id "${entry.id}".`);
    seen.add(entry.id);
  }
  for (const id of wanted) if (!seen.has(id)) issues.push(`Missing topic id "${id}".`);
  for (const entry of output.nodes) {
    const node = nodes.find((n) => n.id === entry.id);
    if (!node) continue;
    for (const objective of entry.objectives) {
      if (norm(objective) === norm(node.title) || objective.trim().split(/\s+/).length < 3) {
        issues.push(`Objective "${objective}" for ${entry.id} is a bare topic name; write an assessable statement starting with an action verb.`);
      }
    }
  }
  return issues;
}

/** Objectives for the leaves of one module. Validates ids strictly (no missing, no extra). */
export async function enrichModule(input: EnrichModuleInput, options: AiCallOptions = {}): Promise<EnrichModuleResult> {
  return callForcedTool({
    model: STRONG_MODEL,
    system: ENRICH_MODULE_SYSTEM,
    prompt: buildPrompt(input),
    tool: setObjectivesTool,
    maxTokens: 2000,
    check: (output) => checkEnrichment(input.nodes, output),
    ...options,
  });
}

/** What routes use for a module whose enrichment failed after the retry. */
export function fallbackObjectives(nodeTitle: string): string[] {
  return [`Explain ${nodeTitle} in your own words`];
}
