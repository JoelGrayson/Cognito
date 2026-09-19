import type Anthropic from "@anthropic-ai/sdk";
import { vi } from "vitest";
import type { ToolClient } from "./withRetry";

/** Test helper: a Message whose only content is one tool_use block. */
export function toolUse(name: string, input: unknown, id = "tu_1", stopReason = "tool_use"): Anthropic.Message {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "m",
    content: [{ type: "tool_use", id, name, input }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Anthropic.Message;
}

/** Test helper: a fake client that returns the given responses in order (the last one repeats). */
export function fakeClient(...responses: Anthropic.Message[]) {
  let call = 0;
  // Params are typed loosely so tests can index into calls without narrowing SDK unions.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const create = vi.fn<(params: any) => Promise<Anthropic.Message>>(async () => responses[Math.min(call++, responses.length - 1)]);
  const client = { messages: { create } } as unknown as ToolClient;
  return { client, create };
}
