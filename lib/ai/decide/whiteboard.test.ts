import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Equivalence } from "@/lib/whiteboard/checker/numeric";
import { confirmError } from "./whiteboard";

const verdict: Equivalence = {
  kind: "not-equivalent",
  witness: { variable: "x", at: 1.718, previousValue: 12.481, currentValue: 9.481 },
};
const step = { premise: "2*x + 4 = 10", current: "2*x = 10", verdict };

function reply(realError: number, readable: number) {
  return new Response(
    JSON.stringify({
      model: "jev-1.13.0",
      answers: { realError: { type: "noul", noul: realError }, readable: { type: "noul", noul: readable } },
    }),
    { status: 200 },
  );
}

describe("confirmError", () => {
  beforeEach(() => {
    vi.stubEnv("MOCK_AI", "");
    vi.stubEnv("TYPESAFE_API_KEY", "key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("hands Jev both lines and the checker's finding, never a conclusion", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(0.9, 1));
    const got = await confirmError(step);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.state).toEqual({
      premise: "2*x + 4 = 10",
      current: "2*x = 10",
      checker: {
        finding: "the two lines disagree numerically",
        at: "x=1.718",
        premiseValue: 12.481,
        currentValue: 9.481,
      },
    });
    expect(Object.keys(body.questions)).toEqual(["realError", "readable"]);
    expect(got).toMatchObject({ confidence: 0.9, realError: 0.9, readable: 1, model: "jev-1.13.0" });
  });

  it("discounts the error by doubt about the reading: a misread line proves nothing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(0.95, 0.4));
    expect((await confirmError(step))?.confidence).toBeCloseTo(0.38);
  });

  it("returns null when Jev is unavailable, leaving the verdict as the only evidence", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect(await confirmError(step)).toBeNull();

    vi.stubEnv("TYPESAFE_API_KEY", "");
    expect(await confirmError(step)).toBeNull();
  });
});
