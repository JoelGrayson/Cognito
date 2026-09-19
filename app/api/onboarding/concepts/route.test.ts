import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConceptsResponse } from "@/lib/onboarding/schemas";
import { POST } from "./route";

vi.mock("@/lib/session", () => ({ requireUserId: async () => "concepts-test-user" }));

const post = (body: unknown) =>
  POST(new Request("http://test/api/onboarding/concepts", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  vi.stubEnv("MOCK_AI", "true");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/onboarding/concepts", () => {
  it("returns 6 to 8 valid concepts for a goal", async () => {
    const res = await post({ goal: "Linear algebra" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(ConceptsResponse.safeParse(json).success).toBe(true);
    expect(json.concepts[0]).toBe("Vectors");
  });

  it("returns valid concepts for goals without a canned list", async () => {
    const res = await post({ goal: "Conversational Spanish" });
    expect(ConceptsResponse.safeParse(await res.json()).success).toBe(true);
  });

  it.each([{}, { goal: "ab" }, { goal: "x".repeat(201) }, { goal: 42 }])("rejects an invalid goal %j with 400", async (body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect((await res.json()).errors.length).toBeGreaterThan(0);
  });

  it("rejects a body that is not JSON", async () => {
    expect((await post("nope")).status).toBe(400);
  });

  it("returns 500 with a generic message when generation fails (failtest goal)", async () => {
    const res = await post({ goal: "failtest topic" });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.errors).toEqual(["Something went wrong. Please try again."]);
  });

  it("returns 500 when MOCK_AI_FAIL_CONCEPTS=true", async () => {
    vi.stubEnv("MOCK_AI_FAIL_CONCEPTS", "true");
    expect((await post({ goal: "Linear algebra" })).status).toBe(500);
  });
});
