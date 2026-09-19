import Anthropic from "@anthropic-ai/sdk";

// One client per server process. Reads ANTHROPIC_API_KEY from the environment.
const g = globalThis as typeof globalThis & { __anthropic?: Anthropic };

export function getClient(): Anthropic {
  return (g.__anthropic ??= new Anthropic());
}

export const isMockAi = () => process.env.MOCK_AI === "true";
