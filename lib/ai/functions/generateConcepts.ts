import { FAST_MODEL } from "../models";
import { callForcedTool, setConceptsTool, type ToolClient } from "../tools";

const SYSTEM = `You help a self-learner describe where they are starting from.
Given what they want to learn, list the concepts they might already know, to be rated "never heard", "heard of" or "can explain".

Rules:
- 6 to 8 concepts.
- Ordered from foundational to advanced.
- 1 to 4 words each.
- Specific to the goal, not generic study skills.
- No duplicates.`;

export async function generateConcepts(goal: string, client?: ToolClient): Promise<string[]> {
  const { concepts } = await callForcedTool({
    model: FAST_MODEL,
    system: SYSTEM,
    prompt: `The learner wants to learn: ${goal}`,
    tool: setConceptsTool,
    maxTokens: 400,
    client,
  });
  return concepts;
}
