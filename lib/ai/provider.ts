/**
 * Runs the onboarding AI calls through lib/providers when the learner picks a
 * non-default provider on screen 1. Anthropic stays on the functions/ path
 * (retry-with-errors, eval instrumentation); mocks bypass provider choice.
 */
import { validateGraph } from "@/lib/graph/validate";
import { ConceptsResponse } from "@/lib/onboarding/schemas";
import { PROVIDERS, isProviderId, type ProviderContext, type ProviderId } from "@/lib/providers";
import { DraftGraph, type LearnerProfile } from "@/types/learning";
import { GENERATE_CONCEPTS_SYSTEM } from "./functions/generateConcepts";
import { GENERATE_GRAPH_SYSTEM, buildGenerateGraphPrompt } from "./functions/generateGraph";
import { isMockAi } from "./client";
import { AiValidationError } from "./withRetry";

/** The provider the call should go through, or null for the default Anthropic path. */
export function pickProvider(id: unknown): ProviderId | null {
  return !isMockAi() && isProviderId(id) && id !== "anthropic" ? id : null;
}

/** Generates the draft graph via the chosen provider; one retry with errors, like callForcedTool. */
export async function generateGraphWithProvider(
  providerId: ProviderId,
  profile: LearnerProfile,
  ctx: ProviderContext,
): Promise<DraftGraph> {
  const provider = PROVIDERS[providerId];
  const prompt = buildGenerateGraphPrompt(profile);
  const request = (user: string) =>
    provider.structured(
      { name: "draft_graph", schema: DraftGraph, system: GENERATE_GRAPH_SYSTEM, user, maxTokens: 8000 },
      undefined,
      ctx,
    );

  const first = await request(prompt);
  let errors = validateGraph(first.output);
  if (errors.ok) return first.output;

  const retry = await request(
    `${prompt}\n\nThe previous draft failed these checks: ${errors.errors.join("; ")}. Return a corrected roadmap.`,
  );
  errors = validateGraph(retry.output);
  if (!errors.ok) throw new AiValidationError(errors.errors);
  return retry.output;
}

/** Concept chips via the chosen provider. Schema (6–8 short unique concepts) is enforced by zod. */
export async function generateConceptsWithProvider(
  providerId: ProviderId,
  goal: string,
  ctx: ProviderContext,
): Promise<string[]> {
  const result = await PROVIDERS[providerId].structured(
    {
      name: "concepts",
      schema: ConceptsResponse,
      system: GENERATE_CONCEPTS_SYSTEM,
      user: `The learner wants to learn: ${goal}`,
      maxTokens: 400,
    },
    undefined,
    ctx,
  );
  return result.output.concepts;
}
