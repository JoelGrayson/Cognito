import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as concepts from "@/app/api/onboarding/concepts/route";
import * as onboarding from "@/app/api/onboarding/route";
import { onboardingRepo } from "@/lib/repo";
import { CONCEPTS_TIMEOUT_MS, resetOnboardingStore, useOnboarding } from "./onboarding";

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/session", () => ({ requireUserId: async () => session.userId }));

/** Routes fetch calls to the real route handlers, so the store is tested against the real API. */
function serve() {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push(`${method} ${url}`);
      const request = new Request(`http://test${url}`, { method, body: init.body });
      if (url === "/api/onboarding") return method === "PATCH" ? onboarding.PATCH(request) : onboarding.GET();
      if (url === "/api/onboarding/concepts") return concepts.POST(request);
      return new Response("not found", { status: 404 });
    }),
  );
  return calls;
}

const store = () => useOnboarding.getState();
const saved = () => onboardingRepo.get(session.userId);

async function answerStep1(goal = "Learn linear algebra") {
  store().setProfile({ goal });
  store().advance();
}

beforeEach(() => {
  session.userId = `store-${crypto.randomUUID()}`;
  vi.stubEnv("MOCK_AI", "true");
  vi.stubEnv("MOCK_AI_DELAY_MS", "0");
  resetOnboardingStore();
});
afterEach(() => {
  resetOnboardingStore();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("hydrate", () => {
  it("starts a new learner at step 1 and captures the timezone silently", async () => {
    serve();
    await store().hydrate();
    expect(store().step).toBe(1);
    expect(store().profile.availability?.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(store().concepts.status).toBe("idle");
  });

  it("shows an error state when the API is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await store().hydrate();
    expect(store().status).toBe("error");
  });

  it("resumes at step 2 with answers intact after a refresh (scenario 1)", async () => {
    serve();
    await store().hydrate();
    await answerStep1();
    expect(store().step).toBe(2);
    await vi.waitFor(async () => expect((await saved()).profile.goal).toBe("Learn linear algebra"));

    resetOnboardingStore(); // a page refresh
    await store().hydrate();
    expect(store().step).toBe(2);
    expect(store().profile).toMatchObject({ goal: "Learn linear algebra" });
    expect((await saved()).step).toBe("questionnaire");
  });

  it("refetches concepts on resume so step 2 has chips", async () => {
    serve();
    await store().hydrate();
    await answerStep1();
    await vi.waitFor(async () => expect((await saved()).profile.goal).toBe("Learn linear algebra"));
    resetOnboardingStore();
    await store().hydrate();
    await vi.waitFor(() => expect(store().concepts.status).toBe("ready"));
    expect(store().concepts.items).toHaveLength(8);
  });

  it("flags a finished questionnaire so the page can redirect", async () => {
    serve();
    await store().hydrate();
    await answerStep1();
    expect(
      await store().finish({
        preferences: { formats: ["reading"] },
        priorKnowledge: [{ concept: "Vectors", level: 1 }],
      }),
    ).toBe(true);
    resetOnboardingStore();
    await store().hydrate();
    expect(store().serverStep).toBe("workshop");
  });
});

describe("concepts prefetch", () => {
  it("starts right after step 1 without blocking navigation (scenario 2)", async () => {
    vi.stubEnv("MOCK_AI_DELAY_MS", "50");
    const calls = serve();
    await store().hydrate();
    store().setProfile({ goal: "Linear algebra" });
    store().advance();
    expect(store().step).toBe(2);
    expect(store().concepts).toMatchObject({ status: "loading", goal: "Linear algebra" });
    expect(calls).toContain("POST /api/onboarding/concepts");
    await vi.waitFor(() => expect(store().concepts.status).toBe("ready"));
    expect(store().concepts.items).toHaveLength(8);
  });

  it("does not refetch when the goal is unchanged after Back", async () => {
    const calls = serve();
    await store().hydrate();
    store().setProfile({ goal: "Linear algebra" });
    store().advance();
    store().back();
    store().advance();
    expect(calls.filter((c) => c.includes("/concepts"))).toHaveLength(1);
  });

  it("refetches and drops old ratings when the goal changes after Back", async () => {
    const calls = serve();
    await store().hydrate();
    store().setProfile({ goal: "Linear algebra" });
    store().advance();
    await vi.waitFor(() => expect(store().concepts.status).toBe("ready"));
    store().setProfile({ priorKnowledge: [{ concept: "Vectors", level: 2 }] });
    store().back();
    store().setProfile({ goal: "Conversational Spanish" });
    store().advance();
    expect(calls.filter((c) => c.includes("/concepts"))).toHaveLength(2);
    expect(store().profile.priorKnowledge).toEqual([]);
    await vi.waitFor(() => expect(store().concepts).toMatchObject({ status: "ready", goal: "Conversational Spanish" }));
    expect(store().concepts.items[0]).toBe("Conversational Spanish basics");
  });

  it("ignores a stale response from the previous goal", async () => {
    vi.stubEnv("MOCK_AI_DELAY_MS", "30");
    serve();
    await store().hydrate();
    store().setProfile({ goal: "Linear algebra" });
    store().advance();
    store().back();
    store().setProfile({ goal: "Rust" });
    store().advance();
    await vi.waitFor(() => expect(store().concepts.status).toBe("ready"));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(store().concepts.goal).toBe("Rust");
  });

  it("falls back to the level selector when the call fails (scenario 3)", async () => {
    serve();
    await store().hydrate();
    store().setProfile({ goal: "failtest" });
    store().advance();
    await vi.waitFor(() => expect(store().concepts.status).toBe("error"));
    expect(store().concepts.items).toEqual([]);
  });

  it("gives up after 8 seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit = {}) => {
        if (url === "/api/onboarding") return Promise.resolve(Response.json({ step: "questionnaire", profile: {}, draftGraph: null, messages: [] }));
        if (init.method === "PATCH") return Promise.resolve(Response.json({ step: "questionnaire", profile: {} }));
        return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      }),
    );
    await store().hydrate();
    store().setProfile({ goal: "Linear algebra" });
    store().advance();
    await vi.advanceTimersByTimeAsync(CONCEPTS_TIMEOUT_MS - 1);
    expect(store().concepts.status).toBe("loading");
    await vi.advanceTimersByTimeAsync(2);
    expect(store().concepts.status).toBe("error");
  });

  it("retryConcepts tries again after a failure", async () => {
    const calls = serve();
    await store().hydrate();
    store().setProfile({ goal: "failtest" });
    store().advance();
    await vi.waitFor(() => expect(store().concepts.status).toBe("error"));
    store().retryConcepts();
    expect(store().concepts.status).toBe("loading");
    expect(calls.filter((c) => c.includes("/concepts"))).toHaveLength(2);
  });
});

describe("navigation and persistence", () => {
  it("Back keeps answers and never goes below step 1", async () => {
    serve();
    await store().hydrate();
    await answerStep1();
    store().back();
    store().back();
    store().back();
    expect(store().step).toBe(1);
    expect(store().profile.goal).toBe("Learn linear algebra");
  });

  it("does not persist invalid drafts", async () => {
    serve();
    await store().hydrate();
    store().setProfile({ goal: "ab" });
    store().advance(); // step 1 invalid: the component blocks this, the store must still be safe
    await vi.waitFor(async () => expect((await saved()).profile.availability?.timezone).toBeDefined());
    expect((await saved()).profile.goal).toBeUndefined();
  });

  it("finish saves step workshop and fails cleanly when answers are missing", async () => {
    serve();
    await store().hydrate();
    expect(await store().finish({ preferences: { formats: ["reading"] } })).toBe(false);
    expect(store().save).toBe("error");
    expect(store().serverStep).toBe("questionnaire");
    expect((await saved()).step).toBe("questionnaire");

    await answerStep1();
    expect(
      await store().finish({
        preferences: { formats: ["reading"] },
        priorKnowledge: [{ concept: "Learn linear algebra", level: 0 }],
      }),
    ).toBe(true);
    expect(store().serverStep).toBe("workshop");
    expect((await saved()).step).toBe("workshop");
  });
});
