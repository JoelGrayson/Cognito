import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConceptList } from "@/lib/onboarding/schemas";
import { generateConcepts as generateConceptsAi } from "./index";
import { generateConcepts as realGenerateConcepts } from "./functions/generateConcepts";
import { mockConcepts } from "./mock/concepts";
import { AiValidationError, type ToolClient } from "./tools";

afterEach(() => vi.unstubAllEnvs());

describe("mockConcepts", () => {
  it("returns a fixed, valid list for linear algebra goals", async () => {
    const concepts = await mockConcepts("I want to learn Linear Algebra");
    expect(ConceptList.safeParse(concepts).success).toBe(true);
    expect(concepts).toEqual(await mockConcepts("linear algebra"));
    expect(concepts[0]).toBe("Vectors");
  });

  it("returns a valid, deterministic generic list for any other goal", async () => {
    for (const goal of ["Conversational Spanish", "abc", "I want to learn Rust for backend work"]) {
      const concepts = await mockConcepts(goal);
      expect(ConceptList.safeParse(concepts).success, goal).toBe(true);
      expect(concepts).toEqual(await mockConcepts(goal));
    }
    expect((await mockConcepts("I want to learn Rust for backend work"))[0]).toBe("Rust basics");
  });

  it("fails when the goal contains failtest", async () => {
    await expect(mockConcepts("learn failtest things")).rejects.toThrow();
  });

  it("fails when MOCK_AI_FAIL_CONCEPTS=true", async () => {
    vi.stubEnv("MOCK_AI_FAIL_CONCEPTS", "true");
    await expect(mockConcepts("linear algebra")).rejects.toThrow();
  });

  it("honors MOCK_AI_DELAY_MS", async () => {
    vi.stubEnv("MOCK_AI_DELAY_MS", "60");
    const start = Date.now();
    await mockConcepts("linear algebra");
    expect(Date.now() - start).toBeGreaterThanOrEqual(50);
  });
});

describe("generateConcepts entry point", () => {
  it("uses the mock under MOCK_AI=true", async () => {
    vi.stubEnv("MOCK_AI", "true");
    expect(await generateConceptsAi("linear algebra")).toHaveLength(8);
    await expect(generateConceptsAi("failtest")).rejects.toThrow();
  });
});

function toolUse(input: unknown, id = "tu_1"): Anthropic.Message {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "m",
    content: [{ type: "tool_use", id, name: "set_concepts", input }],
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Anthropic.Message;
}

const good = { concepts: ["One", "Two", "Three", "Four", "Five", "Six"] };

describe("real generateConcepts (fake client)", () => {
  it("forces the set_concepts tool with a JSON schema derived from zod", async () => {
    const create = vi.fn().mockResolvedValue(toolUse(good));
    const client = { messages: { create } } as unknown as ToolClient;
    expect(await realGenerateConcepts("Rust", client)).toEqual(good.concepts);
    const params = create.mock.calls[0][0];
    expect(params.tool_choice).toEqual({ type: "tool", name: "set_concepts" });
    expect(params.tools[0].name).toBe("set_concepts");
    expect(params.tools[0].input_schema.type).toBe("object");
    expect(params.tools[0].input_schema.properties.concepts.minItems).toBe(6);
    expect(params.tools[0].input_schema.$schema).toBeUndefined();
  });

  it("retries once with the validation errors appended", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(toolUse({ concepts: ["Only", "Two"] }))
      .mockResolvedValueOnce(toolUse(good, "tu_2"));
    const client = { messages: { create } } as unknown as ToolClient;
    expect(await realGenerateConcepts("Rust", client)).toEqual(good.concepts);
    expect(create).toHaveBeenCalledTimes(2);
    const retry = create.mock.calls[1][0].messages;
    expect(retry).toHaveLength(3);
    expect(retry[2].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "tu_1", is_error: true });
  });

  it("throws AiValidationError after a second invalid response", async () => {
    const create = vi.fn().mockResolvedValue(toolUse({ concepts: ["a"] }));
    const client = { messages: { create } } as unknown as ToolClient;
    await expect(realGenerateConcepts("Rust", client)).rejects.toBeInstanceOf(AiValidationError);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
