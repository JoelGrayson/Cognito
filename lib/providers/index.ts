import { anthropicProvider } from "./anthropic";
import { createOpenAICompatibleProvider } from "./openai-compatible";
import type { Provider, ProviderId, ProviderInfo } from "./types";

export type { Provider, ProviderId, ProviderInfo } from "./types";
export { ProviderError } from "./types";
export type { GenerateResult } from "./types";

export const openaiProvider = createOpenAICompatibleProvider({
  id: "openai",
  label: "OpenAI",
  defaultModel: "gpt-5",
  modelEnv: "OPENAI_MODEL",
  apiKeyEnv: "OPENAI_API_KEY",
  hint: "Set OPENAI_API_KEY in .env.local",
});

export const xaiProvider = createOpenAICompatibleProvider({
  id: "xai",
  label: "Grok",
  defaultModel: "grok-4",
  modelEnv: "XAI_MODEL",
  apiKeyEnv: "XAI_API_KEY",
  defaultBaseUrl: "https://api.x.ai/v1",
  hint: "Set XAI_API_KEY in .env.local",
});

/** Ollama by default; works with LM Studio, vLLM or llama.cpp via LOCAL_BASE_URL. */
export const localProvider = createOpenAICompatibleProvider({
  id: "local",
  label: "Local",
  defaultModel: "qwen3:8b",
  modelEnv: "LOCAL_MODEL",
  apiKeyEnv: "LOCAL_API_KEY",
  apiKeyFallback: "ollama",
  baseUrlEnv: "LOCAL_BASE_URL",
  defaultBaseUrl: "http://localhost:11434/v1",
  hint: "Start Ollama and pull a model, e.g. `ollama pull qwen3:8b`",
  probe: true,
  autoDetectModel: true,
  preferModel: "qwen",
});

export const PROVIDERS: Record<ProviderId, Provider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  xai: xaiProvider,
  local: localProvider,
};

export const PROVIDER_ORDER: ProviderId[] = ["anthropic", "openai", "xai", "local"];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && value in PROVIDERS;
}

export async function listProviders(): Promise<ProviderInfo[]> {
  return Promise.all(PROVIDER_ORDER.map((id) => PROVIDERS[id].info()));
}
