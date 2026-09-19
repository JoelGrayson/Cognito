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

/** One model round trip, reported through `onAttempt` (attempt 1 is the first try, 2 is the retry). */
export interface AttemptReport {
  attempt: 1 | 2;
  ok: boolean;
  /** Validation problems that made this attempt fail. Empty when `ok`. */
  issues: string[];
  ms: number;
}

/** Options every AI function accepts: a fake client for tests, an observer for the eval script. */
export interface AiCallOptions {
  client?: ToolClient;
  onAttempt?: (report: AttemptReport) => void;
}

export interface ForcedToolCall<S extends z.ZodType> {
  model: string;
  system: string;
  prompt: string;
  tool: { name: string; description: string; schema: S };
  maxTokens?: number;
  /**
   * Second validation pass that runs on zod-valid output (for example applyOps + validateGraph).
   * Return the problems, or an empty array when the output is acceptable.
   */
  check?: (data: z.output<S>) => string[];
  client?: ToolClient;
  onAttempt?: (report: AttemptReport) => void;
}

/** JSON Schema for a tool's `input_schema`, derived from zod. */
export function toInputSchema(schema: z.ZodType): Anthropic.Tool.InputSchema {
  const inputSchema: Record<string, unknown> = z.toJSONSchema(schema);
  delete inputSchema.$schema;
  return inputSchema as Anthropic.Tool.InputSchema;
}

function zodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message));
}

const MAX_ISSUES_SHOWN = 20;

/**
 * Forces one tool call, validates its input with zod (then `check`, if given), and retries once
 * with every problem appended as an is_error tool_result. Throws AiValidationError after the
 * second failure. Model output is only ever read from the tool input, never parsed from text.
 * API and network errors are not caught here; they propagate to the caller.
 */
export async function callForcedTool<S extends z.ZodType>(call: ForcedToolCall<S>): Promise<z.output<S>> {
  const client = call.client ?? getClient();
  const { name, description, schema } = call.tool;
  const tools = [{ name, description, input_schema: toInputSchema(schema) }];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: call.prompt }];

  let issues: string[] = [];
  for (const attempt of [1, 2] as const) {
    const started = Date.now();
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
    const checked = parsed?.success ? (call.check?.(parsed.data) ?? []) : [];

    if (parsed?.success && checked.length === 0) {
      call.onAttempt?.({ attempt, ok: true, issues: [], ms: Date.now() - started });
      return parsed.data;
    }

    issues = parsed ? (parsed.success ? checked : zodIssues(parsed.error)) : [`The response did not call ${name}.`];
    if (response.stop_reason === "max_tokens") issues.push("The response was cut off; keep it shorter.");
    call.onAttempt?.({ attempt, ok: false, issues, ms: Date.now() - started });

    if (block) {
      const shown = issues.slice(0, MAX_ISSUES_SHOWN);
      const more = issues.length > shown.length ? ` (and ${issues.length - shown.length} more)` : "";
      messages.push(
        { role: "assistant", content: response.content },
        {
          role: "user",
          content: [{
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: `Invalid input: ${shown.join("; ")}${more}. Call ${name} again with corrected input.`,
          }],
        },
      );
    }
  }
  throw new AiValidationError(issues);
}
