import type { GenerateRequest, MindMap } from "@/lib/schema";

export type ProviderId = "anthropic" | "openai" | "xai" | "local";

export interface ProviderInfo {
  id: ProviderId;
  /** Human-facing name, e.g. "Claude". */
  label: string;
  /** Model that will be used. */
  model: string;
  /** Whether the server has what it needs to call this provider. */
  configured: boolean;
  /** What to do if it is not configured. */
  hint: string;
}

export interface Provider {
  id: ProviderId;
  label: string;
  /** Resolve the model name (env override or default). */
  model(): string;
  /** Cheap check: is this provider usable right now? */
  info(): Promise<ProviderInfo>;
  /** Generate or revise a roadmap. Throws on failure. */
  generate(req: GenerateRequest, model?: string): Promise<GenerateResult>;
}

export interface GenerateResult {
  mindMap: MindMap;
  /** The model that actually produced it. */
  model: string;
}

export class ProviderError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}
