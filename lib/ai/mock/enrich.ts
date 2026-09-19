import { samplePlanGraph } from "@/fixtures/samplePlanGraph";
import type { EnrichModuleInput, EnrichModuleResult } from "../functions/enrichModule";
import { ENRICH_MINUTES_MAX, ENRICH_MINUTES_MIN } from "../tools";
import { AiValidationError } from "../withRetry";
import { mockDelay } from "./delay";

const clamp = (n: number) => Math.min(ENRICH_MINUTES_MAX, Math.max(ENRICH_MINUTES_MIN, Math.round(n)));

/**
 * Deterministic objectives for MOCK_AI=true: the sample plan's objectives for leaves it knows,
 * two generic ones for anything else. Returns exactly the requested ids.
 * Failure switch for scenario 7: MOCK_AI_FAIL_ENRICH=true fails every module, or
 * MOCK_AI_FAIL_ENRICH=<coreNodeId> fails only that module (throws AiValidationError).
 */
export async function mockEnrichModule({ coreNode, nodes }: EnrichModuleInput): Promise<EnrichModuleResult> {
  await mockDelay();
  const fail = process.env.MOCK_AI_FAIL_ENRICH;
  if (fail === "true" || (fail && fail === coreNode.id)) {
    throw new AiValidationError([`Mock enrichment failure (forced) for ${coreNode.id}`]);
  }
  const known = new Map(samplePlanGraph.nodes.map((n) => [n.id, n]));
  return {
    nodes: nodes.map((node) => {
      const fixture = known.get(node.id);
      const title = node.title.slice(0, 60);
      const objectives = [...(fixture?.objectives ?? [])];
      if (objectives.length === 0) objectives.push(`Explain ${title} in your own words`);
      if (objectives.length === 1) objectives.push(`Apply ${title} to a small worked example`);
      return {
        id: node.id,
        objectives: objectives.slice(0, 4),
        estMinutes: clamp(fixture && fixture.estMinutes > 0 ? fixture.estMinutes : node.estMinutes),
      };
    }),
  };
}
