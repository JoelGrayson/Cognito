import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  ProviderError,
  type Provider,
  type ProviderContext,
  type ProviderInfo,
  type StructuredRequest,
  type StructuredResult,
} from "./types";

const DEFAULT_MODEL = "claude-opus-5";

function model(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

function configured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

async function info(_ctx?: ProviderContext): Promise<ProviderInfo> {
  void _ctx;
  return {
    id: "anthropic",
    label: "Claude",
    model: model(),
    configured: configured(),
    hint: "Set ANTHROPIC_API_KEY in .env.local",
  };
}

async function structured<T>(
  req: StructuredRequest<T>,
  override?: string,
  _ctx?: ProviderContext,
): Promise<StructuredResult<T>> {
  void _ctx;
  if (!configured()) {
    throw new ProviderError("Claude is not configured. Set ANTHROPIC_API_KEY in .env.local.", 400);
  }
  const client = new Anthropic();
  const chosen = override || model();
  const effort = req.effort === "minimal" ? "low" : (req.effort ?? "medium");
  const params = {
    model: chosen,
    max_tokens: req.maxTokens ?? 16000,
    system: req.system,
    output_config: {
      format: zodOutputFormat(req.schema),
      effort,
    },
    messages: [
      {
        role: "user" as const,
        content: req.image ? [{ type: "text" as const, text: req.user }, imageBlock(req.image)] : req.user,
      },
    ],
  };
  let stopReason: string | null;
  let explanation: string | null | undefined;
  let output: unknown;
  try {
    if (req.onText) {
      const onText = req.onText;
      const stream = client.messages.stream(params);
      stream.on("text", (_delta, snapshot) => onText(snapshot));
      const message = await stream.finalMessage();
      stopReason = message.stop_reason;
      explanation = message.stop_details?.explanation;
      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
      if (stopReason === "end_turn") {
        const parsed = req.schema.safeParse(JSON.parse(text));
        output = parsed.success ? parsed.data : undefined;
      }
    } else {
      const response = await client.messages.parse(params);
      stopReason = response.stop_reason;
      explanation = response.stop_details?.explanation;
      output = response.parsed_output ?? undefined;
    }
  } catch (error) {
    // output_config compiles the schema to a grammar; wide unions (e.g. the
    // board-action marks) overflow it. Retry once asking for plain JSON.
    if (error instanceof Anthropic.APIError && error.status === 400 && error.message.includes("grammar is too large")) {
      try {
        ({ stopReason, explanation, output } = await callPlainJson(client, chosen, req));
      } catch (retryError) {
        throw mapped(retryError);
      }
    } else {
      throw mapped(error);
    }
  }

  if (stopReason === "refusal") {
    throw new ProviderError(`Claude declined this request (${explanation ?? "no explanation given"}).`, 422);
  }
  if (stopReason === "max_tokens") {
    throw new ProviderError("Claude ran out of output tokens before finishing.", 502);
  }
  if (output === undefined) {
    throw new ProviderError("Claude returned output that did not match the schema.", 502);
  }
  return { output: output as T, model: chosen };
}

export const anthropicProvider: Provider = {
  id: "anthropic",
  label: "Claude",
  model,
  info,
  structured,
};

function mapped(error: unknown): ProviderError {
  if (error instanceof Anthropic.AuthenticationError) {
    return new ProviderError("Claude rejected the API key. Check ANTHROPIC_API_KEY.", 401);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ProviderError("Claude is rate limited. Try again in a moment.", 429);
  }
  if (error instanceof Anthropic.APIError) {
    return new ProviderError(`Claude error ${error.status}: ${error.message}`, 502);
  }
  if (error instanceof SyntaxError) {
    return new ProviderError("Claude returned invalid JSON.", 502);
  }
  return error instanceof ProviderError ? error : new ProviderError(String(error), 502);
}

/**
 * The same call without output_config: the schema goes in the prompt and the
 * text is parsed and checked here. Slower to fail, but has no grammar limit.
 */
async function callPlainJson<T>(
  client: Anthropic,
  model: string,
  req: StructuredRequest<T>,
): Promise<{ stopReason: string | null; explanation: string | null | undefined; output: unknown }> {
  const schemaJson = JSON.stringify(z.toJSONSchema(req.schema));
  const response = await client.messages.create({
    model,
    max_tokens: req.maxTokens ?? 16000,
    system: `${req.system}\n\nReply with a single JSON object matching this JSON Schema, and nothing else:\n${schemaJson}`,
    messages: [
      {
        role: "user",
        content: req.image ? [{ type: "text" as const, text: req.user }, imageBlock(req.image)] : req.user,
      },
    ],
  });
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  req.onText?.(text);
  if (response.stop_reason !== "end_turn") {
    return { stopReason: response.stop_reason, explanation: response.stop_details?.explanation, output: undefined };
  }
  const parsed = req.schema.safeParse(JSON.parse(stripJsonFences(text)));
  return {
    stopReason: response.stop_reason,
    explanation: response.stop_details?.explanation,
    output: parsed.success ? parsed.data : undefined,
  };
}

function stripJsonFences(text: string): string {
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text.trim());
  return match ? match[1] : text.trim();
}

/** A data URL as an image block Claude accepts. */
function imageBlock(dataUrl: string) {
  const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) throw new ProviderError("That picture is not a PNG, JPEG, GIF or WebP data URL.", 400);
  return {
    type: "image" as const,
    source: { type: "base64" as const, media_type: match[1] as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: match[2] },
  };
}
