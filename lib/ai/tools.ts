import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getClient } from "./client";

export class AiValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Model output failed validation: ${issues.join("; ")}`);
    this.name = "AiValidationError";
  }
}

/** The slice of the SDK this helper uses, so tests can pass a fake. */
export interface ToolClient {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
}

interface ForcedToolCall<S extends z.ZodType> {
  model: string;
  system: string;
  prompt: string;
  tool: { name: string; description: string; schema: S };
  maxTokens?: number;
  client?: ToolClient;
}

/**
 * Forces one tool call, validates its input with zod, and retries once with the
 * validation errors appended. Throws AiValidationError after the second failure.
 * Model output is only ever read from the tool input, never parsed from text.
 */
export async function callForcedTool<S extends z.ZodType>(call: ForcedToolCall<S>): Promise<z.output<S>> {
  const client = call.client ?? getClient();
  const { name, description, schema } = call.tool;
  const inputSchema: Record<string, unknown> = z.toJSONSchema(schema);
  delete inputSchema.$schema;
  const tools = [{ name, description, input_schema: inputSchema as Anthropic.Tool.InputSchema }];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: call.prompt }];

  let issues: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model: call.model,
      max_tokens: call.maxTokens ?? 1024,
      system: call.system,
      tools,
      tool_choice: { type: "tool", name },
      messages,
    });
    const block = response.content.find(
      (item): item is Anthropic.ToolUseBlock => item.type === "tool_use" && item.name === name,
    );
    const parsed = block ? schema.safeParse(block.input) : null;
    if (parsed?.success) return parsed.data;

    issues = parsed
      ? parsed.error.issues.map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
      : [`The response did not call ${name}.`];
    if (block) {
      messages.push(
        { role: "assistant", content: response.content },
        {
          role: "user",
          content: [{
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: `Invalid input: ${issues.join("; ")}. Call ${name} again with corrected input.`,
          }],
        },
      );
    }
  }
  throw new AiValidationError(issues);
}
