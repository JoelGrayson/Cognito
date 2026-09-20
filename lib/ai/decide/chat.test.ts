import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, LessonContent } from "@/lib/schema";
import { ANSWER_FLOOR, answerOnly, routeTutorTurn } from "./chat";

const lesson: LessonContent = {
  title: "Gradient descent",
  summary: "Walking downhill on a loss surface.",
  tldr: "Step against the gradient, slowly enough not to overshoot.",
  keyTakeaways: ["The gradient points uphill."],
  sections: [
    { heading: "The update rule", body: "Step against the gradient." },
    { heading: "Learning rate", body: "Too large overshoots." },
  ],
  resources: [],
  videoQuery: "gradient descent explained",
};
const messages: ChatMessage[] = [{ role: "user", content: "why does a big learning rate diverge?" }];

function reply(choice: "answer" | "rewrite", p: number) {
  return new Response(
    JSON.stringify({
      model: "jev-1.13.0",
      answers: {
        route: {
          type: "choice",
          choice,
          probabilities: { answer: choice === "answer" ? p : 1 - p, rewrite: choice === "rewrite" ? p : 1 - p },
          confidence: p,
        },
      },
    }),
    { status: 200 },
  );
}

describe("routeTutorTurn", () => {
  beforeEach(() => {
    vi.stubEnv("MOCK_AI", "");
    vi.stubEnv("TYPESAFE_API_KEY", "key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends the conversation and the lesson's shape, not its full text", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(reply("answer", 0.97));
    const routing = await routeTutorTurn(lesson, messages);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.state).toEqual({
      lesson: {
        title: "Gradient descent",
        summary: "Walking downhill on a loss surface.",
        sections: ["The update rule", "Learning rate"],
      },
      conversation: ["Learner: why does a big learning rate diverge?"],
    });
    expect(body.questions.route.type).toBe("choice");
    expect(routing).toEqual({ route: "answer", probability: 0.97, model: "jev-1.13.0", ms: expect.any(Number) });
  });

  it("returns null when Jev is unavailable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect(await routeTutorTurn(lesson, messages)).toBeNull();

    vi.stubEnv("TYPESAFE_API_KEY", "");
    expect(await routeTutorTurn(lesson, messages)).toBeNull();
  });
});

describe("answerOnly", () => {
  const routing = (route: "answer" | "rewrite", probability: number) => ({
    route,
    probability,
    model: "jev-1.13.0",
    ms: 120,
  });

  it("narrows the schema only when Jev is sure nothing needs rewriting", () => {
    expect(answerOnly(routing("answer", 0.97))).toBe(true);
    expect(answerOnly(routing("answer", ANSWER_FLOOR))).toBe(true);
  });

  it("keeps the rewrite schema whenever being wrong would cost the learner the edit", () => {
    expect(answerOnly(routing("answer", 0.7))).toBe(false);
    expect(answerOnly(routing("rewrite", 0.99))).toBe(false);
    expect(answerOnly(null)).toBe(false);
  });
});
