import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MindMapSchema, type GenerateRequest } from "@/lib/schema";
import { SYSTEM_PROMPT, userPrompt } from "@/lib/prompt";
import { ProviderError, type GenerateResult, type Provider, type ProviderInfo } from "./types";

const DEFAULT_MODEL = "claude-opus-5";

function model(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

function configured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

async function info(): Promise<ProviderInfo> {
  return {
    id: "anthropic",
    label: "Claude",
    model: model(),
    configured: configured(),
    hint: "Set ANTHROPIC_API_KEY in .env.local",
  };
}

async function generate(req: GenerateRequest, override?: string): Promise<GenerateResult> {
  if (!configured()) {
    throw new ProviderError("Claude is not configured. Set ANTHROPIC_API_KEY in .env.local.", 400);
  }
  const client = new Anthropic();
  const chosen = override || model();
  let response;
  try {
    response = await client.messages.parse({
      model: chosen,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: {
        format: zodOutputFormat(MindMapSchema),
        effort: "medium",
      },
      messages: [{ role: "user", content: userPrompt(req) }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new ProviderError("Claude rejected the API key. Check ANTHROPIC_API_KEY.", 401);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ProviderError("Claude is rate limited. Try again in a moment.", 429);
    }
    if (error instanceof Anthropic.APIError) {
      throw new ProviderError(`Claude error ${error.status}: ${error.message}`, 502);
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    const why = response.stop_details?.explanation ?? "no explanation given";
    throw new ProviderError(`Claude declined this request (${why}).`, 422);
  }
  if (response.stop_reason === "max_tokens") {
    throw new ProviderError("Claude ran out of output tokens before finishing the map.", 502);
  }
  if (!response.parsed_output) {
    throw new ProviderError("Claude returned output that did not match the schema.", 502);
  }
  return { mindMap: response.parsed_output, model: chosen };
}

export const anthropicProvider: Provider = {
  id: "anthropic",
  label: "Claude",
  model,
  info,
  generate,
};
