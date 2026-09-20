import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settledVerdict, triageExercise, VERDICT_FLOOR, type Submission } from "./exercise";

const submission: Submission = {
  exercise: {
    title: "Reverse a string",
    language: "javascript",
    task: "Write reverse(s) that returns s backwards.",
    tests: [{ name: "reverses", expression: 'reverse("abc") === "cba"' }],
  },
  code: 'function reverse(s) { return [...s].reverse().join(""); }',
  run: { output: ["cba"], error: null, results: [{ name: "reverses", pass: true }] },
};

function reply(verdict: "correct" | "almost" | "incorrect", p: number) {
  const rest = (1 - p) / 2;
  return new Response(
    JSON.stringify({
      model: "jev-1.13.0",
      answers: {
        verdict: {
          type: "choice",
          choice: verdict,
          probabilities: {
            correct: verdict === "correct" ? p : rest,
            almost: verdict === "almost" ? p : rest,
            incorrect: verdict === "incorrect" ? p : rest,
          },
          confidence: p,
        },
      },
    }),
    { status: 200 },
  );
}

describe("triageExercise", () => {
  beforeEach(() => {
    vi.stubEnv("MOCK_AI", "");
    vi.stubEnv("TYPESAFE_API_KEY", "key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends the task, the code and what running it did", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(reply("correct", 0.96));
    const triage = await triageExercise(submission);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.state).toEqual({
      task: "Write reverse(s) that returns s backwards.",
      language: "javascript",
      code: submission.code,
      tests: ['reverses: reverse("abc") === "cba"'],
      run: { error: null, output: ["cba"], results: ["PASS reverses"] },
    });
    expect(body.questions.verdict.type).toBe("choice");
    expect(Object.keys(body.questions.verdict.criteria)).toEqual(["correct", "almost", "incorrect"]);
    expect(triage).toEqual({ verdict: "correct", probability: 0.96, model: "jev-1.13.0", ms: expect.any(Number) });
  });

  it("says so when the code never ran", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(reply("incorrect", 0.9));
    await triageExercise({ ...submission, run: null });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.state.run).toContain("does not run in the browser");
  });

  it("does not wait on Jev longer than the review can afford", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(reply("correct", 0.96));
    await triageExercise(submission);

    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal;
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("is null without a key, so the provider keeps deciding", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect(await triageExercise(submission)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is null when Jev fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await triageExercise(submission)).toBeNull();
  });
});

describe("settledVerdict", () => {
  const triage = (verdict: "correct" | "almost" | "incorrect", probability: number) => ({
    verdict,
    probability,
    model: "jev-1.13.0",
    ms: 80,
  });

  it("fixes the verdict once Jev is sure", () => {
    expect(settledVerdict(triage("correct", VERDICT_FLOOR))).toBe("correct");
    expect(settledVerdict(triage("incorrect", 0.99))).toBe("incorrect");
  });

  it("leaves a shaky verdict to the provider", () => {
    expect(settledVerdict(triage("almost", VERDICT_FLOOR - 0.01))).toBeNull();
    expect(settledVerdict(null)).toBeNull();
  });
});
