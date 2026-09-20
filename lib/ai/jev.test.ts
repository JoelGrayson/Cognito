import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ask, choice, JevError, jevConfigured, noul, score, tryAsk } from "./jev";

const QUESTIONS = {
  fits: noul("Does this video fit the lesson?"),
  intent: choice("What does the learner want?", { answer: "A question", rewrite: "A change to the lesson" }),
  depth: score("How specific is it?", ["Vague", "Specific"]),
};

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ANSWERS = {
  model: "jev-1.13.0",
  answers: {
    fits: { type: "noul", noul: 0.91 },
    intent: { type: "choice", choice: "rewrite", probabilities: { answer: 0.2, rewrite: 0.8 }, confidence: 0.77 },
    depth: {
      type: "score",
      score: 1,
      legend: { "0": "Vague", "1": "Specific" },
      probabilities: { "0": 0.1, "1": 0.9 },
      confidence: 0.9,
    },
  },
};

describe("ask", () => {
  beforeEach(() => {
    vi.stubEnv("MOCK_AI", "");
    vi.stubEnv("TYPESAFE_API_KEY", "key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends one request for every question and returns the answers by id", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(ANSWERS));
    const result = await ask("a state", QUESTIONS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer key");
    expect(JSON.parse(init.body as string)).toEqual({
      model: "jev-latest",
      state: "a state",
      questions: QUESTIONS,
    });
    expect(result.model).toBe("jev-1.13.0");
    expect(result.answers.fits.noul).toBe(0.91);
    expect(result.answers.intent.choice).toBe("rewrite");
    expect(result.answers.depth.score).toBe(1);
  });

  it("retries an overloaded response and gives up on a validation error", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(reply({ error: "overloaded" }, 529))
      .mockResolvedValueOnce(reply(ANSWERS));
    expect((await ask("s", QUESTIONS)).answers.fits.noul).toBe(0.91);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockResolvedValue(reply({ error: "bad question" }, 422));
    await expect(ask("s", QUESTIONS)).rejects.toMatchObject({ name: "JevError", status: 422 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws without a key rather than calling the API", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(ask("s", QUESTIONS)).rejects.toBeInstanceOf(JevError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(jevConfigured()).toBe(false);
  });

  it("rejects a body that does not match the documented shape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(reply({ model: "jev-1.13.0", answers: { fits: { type: "noul" } } }));
    await expect(ask("s", { fits: QUESTIONS.fits })).rejects.toBeInstanceOf(JevError);
  });

  it("rejects answers that do not match the questions asked", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const cases: [string, unknown][] = [
      ["a missing id", { fits: ANSWERS.answers.fits }],
      ["the wrong answer type", { ...ANSWERS.answers, fits: ANSWERS.answers.intent }],
      [
        "an option that was never offered",
        { ...ANSWERS.answers, intent: { ...ANSWERS.answers.intent, choice: "invented" } },
      ],
    ];
    for (const [, answers] of cases) {
      fetchMock.mockResolvedValue(reply({ model: "jev-1.13.0", answers }));
      await expect(ask("s", QUESTIONS)).rejects.toBeInstanceOf(JevError);
    }
  });

  it("wraps a non-JSON success body, so callers only ever catch JevError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>gateway</html>", { status: 200 }));
    await expect(ask("s", QUESTIONS)).rejects.toBeInstanceOf(JevError);
  });

  it("spends the timeout across the retries, not once per attempt", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 40));
      return reply({ error: "overloaded" }, 529);
    });
    const started = Date.now();
    await expect(ask("s", QUESTIONS, { timeoutMs: 60 })).rejects.toBeInstanceOf(JevError);
    expect(Date.now() - started).toBeLessThan(120);
    expect(fetchMock.mock.calls.length).toBeLessThan(3);
  });

  it("keeps the timeout when the caller passes its own signal", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(ANSWERS));
    const caller = new AbortController();
    await ask("s", QUESTIONS, { signal: caller.signal, timeoutMs: 50 });
    const { signal } = fetchMock.mock.calls[0][1] as RequestInit;
    expect(signal?.aborted).toBe(false);
    await new Promise((r) => setTimeout(r, 80));
    expect(signal?.aborted).toBe(true);
  });

  it("tryAsk returns null instead of throwing, so callers keep their own path", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    expect(await tryAsk("s", QUESTIONS)).toBeNull();
  });
});

describe("MOCK_AI", () => {
  beforeEach(() => vi.stubEnv("MOCK_AI", "true"));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("answers without a network call: yes, the first option, the top level", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { answers } = await ask("s", QUESTIONS);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(answers.fits.noul).toBeGreaterThan(0.9);
    expect(answers.intent.choice).toBe("answer");
    expect(answers.depth.score).toBe(1);
    expect(answers.depth.legend).toEqual({ "0": "Vague", "1": "Specific" });
  });

  it("MOCK_JEV_FAIL exercises the caller's fallback", async () => {
    vi.stubEnv("MOCK_JEV_FAIL", "true");
    await expect(ask("s", QUESTIONS)).rejects.toBeInstanceOf(JevError);
  });
});
