import { isMockAi } from "./client";
import { generateConcepts as realGenerateConcepts } from "./functions/generateConcepts";
import { mockConcepts } from "./mock/concepts";

export { AiValidationError } from "./tools";

// Entry point for the rest of the app: MOCK_AI=true swaps every function for its mock.
export const generateConcepts = (goal: string): Promise<string[]> =>
  isMockAi() ? mockConcepts(goal) : realGenerateConcepts(goal);
