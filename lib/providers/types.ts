import type { z } from "zod";

export type ProviderId = "anthropic" | "openai" | "chatgpt" | "xai" | "local";

export interface ProviderContext {
  userId?: string;
}

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

/** One call that must come back as JSON matching a schema. */
export interface StructuredRequest<T> {
  /** Identifier for the output schema, e.g. "mind_map". */
  name: string;
  schema: z.ZodType<T>;
  system: string;
  user: string;
  maxTokens?: number;
  /** How hard a reasoning model should think. Unset means the model's default. */
  effort?: "minimal" | "low" | "medium" | "high";
  /** A picture the model should look at, as a data URL. Only OpenAI and Claude read these. */
  image?: string;
  /**
   * When given, the reply is streamed and this is called with the raw JSON
   * text accumulated so far, each time more arrives.
   */
  onText?: (text: string) => void;
}

export interface StructuredResult<T> {
  output: T;
  /** The model that actually produced it. */
  model: string;
}

export interface Provider {
  id: ProviderId;
  label: string;
  /** Resolve the model name (env override or default). */
  model(): string;
  /** Cheap check: is this provider usable right now? */
  info(ctx?: ProviderContext): Promise<ProviderInfo>;
  /** Ask the model for output matching a schema. Throws ProviderError on failure. */
  structured<T>(
    req: StructuredRequest<T>,
    model?: string,
    ctx?: ProviderContext,
  ): Promise<StructuredResult<T>>;
}

export class ProviderError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}
