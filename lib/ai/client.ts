import Anthropic from "@anthropic-ai/sdk";

// One client per server process. Reads ANTHROPIC_API_KEY from the environment.
// Rebuilds when the key changes so dev-server env reloads take effect
// (globalThis survives Next.js HMR, so a stale key would otherwise persist).
const g = globalThis as typeof globalThis & { __anthropic?: Anthropic; __anthropicKey?: string };

export function getClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!g.__anthropic || g.__anthropicKey !== key) {
    g.__anthropic = new Anthropic();
    g.__anthropicKey = key;
  }
  return g.__anthropic;
}

export const isMockAi = () => process.env.MOCK_AI === "true";
