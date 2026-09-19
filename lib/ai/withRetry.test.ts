import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { fakeClient, toolUse } from "./fakeClient";
import { AiValidationError, callForcedTool, toInputSchema, type AttemptReport } from "./withRetry";

const schema = z.object({ n: z.number().int().min(1) });
const tool = { name: "set_n", description: "Set n.", schema };
const base = { model: "m", system: "s", prompt: "p", tool };

describe("callForcedTool", () => {
  it("returns the first valid output and reports one ok attempt", async () => {
    const { client, create } = fakeClient(toolUse("set_n", { n: 3 }));
    const reports: AttemptReport[] = [];
    const result = await callForcedTool({ ...base, client, onAttempt: (r) => reports.push(r) });
    expect(result).toEqual({ n: 3 });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].tool_choice).toEqual({ type: "tool", name: "set_n" });
    expect(reports).toEqual([{ attempt: 1, ok: true, issues: [], ms: expect.any(Number) }]);
  });

  it("reports a failed first attempt and an ok retry, so callers can measure retry rates", async () => {
    const { client } = fakeClient(toolUse("set_n", { n: 0 }), toolUse("set_n", { n: 2 }, "tu_2"));
    const reports: AttemptReport[] = [];
    await callForcedTool({ ...base, client, onAttempt: (r) => reports.push(r) });
    expect(reports.map((r) => [r.attempt, r.ok])).toEqual([[1, false], [2, true]]);
    expect(reports[0].issues[0]).toContain("n:");
  });

  it("retries when the semantic check fails and feeds every check issue back", async () => {
    const check = vi.fn((data: { n: number }) => (data.n < 5 ? ["too small", "still too small"] : []));
    const { client, create } = fakeClient(toolUse("set_n", { n: 1 }), toolUse("set_n", { n: 9 }, "tu_2"));
    expect(await callForcedTool({ ...base, client, check })).toEqual({ n: 9 });
    const retry = create.mock.calls[1][0].messages;
    expect(retry).toHaveLength(3);
    expect(retry[2].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "tu_1", is_error: true });
    expect(retry[2].content[0].content).toContain("too small; still too small");
  });

  it("throws AiValidationError with the last issues after the second failure", async () => {
    const { client, create } = fakeClient(toolUse("set_n", { n: 1 }));
    const error = await callForcedTool({ ...base, client, check: () => ["nope"] }).catch((e) => e);
    expect(error).toBeInstanceOf(AiValidationError);
    expect(error.issues).toEqual(["nope"]);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("treats a response without the tool call as a failed attempt", async () => {
    const empty = { ...toolUse("other", {}), content: [{ type: "text", text: "hi" }] } as never;
    const { client, create } = fakeClient(empty);
    await expect(callForcedTool({ ...base, client })).rejects.toBeInstanceOf(AiValidationError);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("mentions truncation when the model hit max_tokens", async () => {
    const { client } = fakeClient(toolUse("set_n", { n: 0 }, "tu_1", "max_tokens"));
    const error = await callForcedTool({ ...base, client }).catch((e) => e);
    expect(error.issues.join(" ")).toContain("cut off");
  });

  it("does not swallow API errors", async () => {
    const client = { messages: { create: vi.fn().mockRejectedValue(new Error("529 overloaded")) } };
    await expect(callForcedTool({ ...base, client: client as never })).rejects.toThrow("529");
    expect(client.messages.create).toHaveBeenCalledTimes(1);
  });
});

describe("toInputSchema", () => {
  it("emits an object schema without $schema", () => {
    const json = toInputSchema(schema);
    expect(json.type).toBe("object");
    expect((json as Record<string, unknown>).$schema).toBeUndefined();
  });
});
