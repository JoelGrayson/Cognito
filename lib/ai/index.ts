/**
 * Entry point of the AI layer. Routes import from "@/lib/ai", never from lib/ai/functions.
 *
 * MOCK_AI=true swaps every function for a deterministic mock (no API calls). Mock failure
 * switches: MOCK_AI_FAIL_CONCEPTS=true, MOCK_AI_FAIL_GRAPH=true, MOCK_AI_FAIL_EDIT=true,
 * MOCK_AI_FAIL_ENRICH=true|<coreNodeId>; MOCK_AI_DELAY_MS adds latency to every mock.
 *
 * FALLBACK POLICY. Every function makes one forced tool call, validates it with zod (plus
 * validateGraph / applyOps where relevant), retries once with the errors appended, and then
 * throws AiValidationError. The functions never fall back on their own; the ROUTES apply the
 * fallback from the matrix in docs/onboarding-spec.md section 5:
 *
 *   generateConcepts fails  -> beginner/intermediate/advanced selector (client side)
 *   generateGraph fails     -> buildFallbackGraph(profile) from @/lib/graph/fallback, usedFallback = true
 *   editGraph fails         -> reply with a message only, graph unchanged, banner
 *   enrichModule fails      -> fallbackObjectives(node.title) for that module's leaves, plan still ships
 *
 * Routes should treat ANY thrown error (AiValidationError, Anthropic API or network errors after
 * the SDK's own retries, timeouts) the same way and apply the fallback. Catch AiValidationError
 * separately only to log its `issues`. The mocks throw AiValidationError to simulate a failure.
 *
 * Every function takes an optional last argument `{ client?, onAttempt? }`; `onAttempt` reports
 * each model round trip (attempt 1 or 2, ok, issues, ms), which the eval script uses to measure
 * first-try and after-retry pass rates.
 */
import type { DraftGraph, LearnerProfile } from "@/types/learning";
import { isMockAi } from "./client";
import { editGraph as realEditGraph, type EditGraphInput, type EditGraphResult } from "./functions/editGraph";
import { enrichModule as realEnrichModule, type EnrichModuleInput, type EnrichModuleResult } from "./functions/enrichModule";
import { generateConcepts as realGenerateConcepts } from "./functions/generateConcepts";
import { generateGraph as realGenerateGraph } from "./functions/generateGraph";
import { mockConcepts } from "./mock/concepts";
import { mockEditGraph } from "./mock/edit";
import { mockEnrichModule } from "./mock/enrich";
import { mockGenerateGraph } from "./mock/graph";
import type { AiCallOptions } from "./withRetry";

export { AiValidationError, type AiCallOptions, type AttemptReport, type ToolClient } from "./withRetry";
export { fallbackObjectives } from "./functions/enrichModule";
export { generateConceptsWithProvider, generateGraphWithProvider, pickProvider } from "./provider";
export type { EditGraphInput, EditGraphResult, EnrichModuleInput, EnrichModuleResult };

// Mocks succeed on the first try; report that so observers behave the same in both modes.
async function mocked<T>(run: () => Promise<T>, options?: AiCallOptions): Promise<T> {
  const started = Date.now();
  try {
    const result = await run();
    options?.onAttempt?.({ attempt: 1, ok: true, issues: [], ms: Date.now() - started });
    return result;
  } catch (error) {
    const issues = error instanceof Error ? [error.message] : ["mock failure"];
    options?.onAttempt?.({ attempt: 1, ok: false, issues, ms: Date.now() - started });
    throw error;
  }
}

export const generateConcepts = (goal: string): Promise<string[]> =>
  isMockAi() ? mockConcepts(goal) : realGenerateConcepts(goal);

export const generateGraph = (profile: LearnerProfile, options?: AiCallOptions): Promise<DraftGraph> =>
  isMockAi() ? mocked(() => mockGenerateGraph(profile), options) : realGenerateGraph(profile, options);

export const editGraph = (input: EditGraphInput, options?: AiCallOptions): Promise<EditGraphResult> =>
  isMockAi() ? mocked(() => mockEditGraph(input), options) : realEditGraph(input, options);

export const enrichModule = (input: EnrichModuleInput, options?: AiCallOptions): Promise<EnrichModuleResult> =>
  isMockAi() ? mocked(() => mockEnrichModule(input), options) : realEnrichModule(input, options);
