import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { chatgptProvider, invalidateChatGPTModelCache } from "./chatgpt";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn<typeof fetch>() }));

vi.mock("@/lib/chatgpt/tokens", async () => {
  const { resolveConfig } = await import("@opencoredev/loginwithchatgpt-core");
  return {
    chatgptConfig: resolveConfig({ fetch: fetchMock }),
    getChatGPTAuth: vi.fn().mockResolvedValue({ accessToken: "test-token", accountId: "test-account" }),
  };
});

describe("ChatGPT request input", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    invalidateChatGPTModelCache("test-user");
  });

  afterEach(() => vi.restoreAllMocks());

  it.each([false, true])("sends message lists through the transport (format rejected: %s)", async (rejectFormat) => {
    const requests: Record<string, unknown>[] = [];
    fetchMock.mockImplementation(async (url, init) => {
      if (new URL(String(url)).pathname.endsWith("/models")) {
        return Response.json({ models: [{ slug: "test-model" }] });
      }
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      if (!Array.isArray(body.input)) {
        return Response.json({ detail: "Input must be a list" }, { status: 400 });
      }
      if (rejectFormat && body.text?.format) {
        return Response.json({ detail: "Unsupported format" }, { status: 400 });
      }
      const event = { type: "response.output_text.delta", delta: '{"answer":"ok"}' };
      return new Response(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`, {
        headers: { "content-type": "text/event-stream" },
      });
    });
    const onText = vi.fn();
    const result = await chatgptProvider.structured({
      name: "answer",
      schema: z.object({ answer: z.string() }),
      system: "Return an answer.",
      user: "Explain lists.\nPreserve this prompt exactly.",
      onText,
    }, "test-model", { userId: "test-user" });

    expect(result).toEqual({ output: { answer: "ok" }, model: "test-model" });
    expect(requests).toHaveLength(rejectFormat ? 2 : 1);
    for (const body of requests) {
      expect(body.input).toEqual([{ role: "user", content: "Explain lists.\nPreserve this prompt exactly." }]);
      expect(body.stream).toBe(true);
    }
    expect(onText).toHaveBeenCalledWith('{"answer":"ok"}');
  });
});
