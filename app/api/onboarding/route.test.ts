import { beforeEach, describe, expect, it, vi } from "vitest";
import { onboardingRepo } from "@/lib/repo";
import { GET, PATCH } from "./route";

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/session", () => ({ requireUserId: async () => session.userId }));

const patch = (body: unknown) =>
  PATCH(new Request("http://test/api/onboarding", { method: "PATCH", body: typeof body === "string" ? body : JSON.stringify(body) }));

const completeProfile = {
  goal: "Learn linear algebra",
  priorKnowledge: [{ concept: "Vectors", level: 0 }],
  preferences: { formats: ["reading", "voice"] },
};

beforeEach(() => {
  session.userId = `user-${crypto.randomUUID()}`;
});

describe("GET /api/onboarding", () => {
  it("returns a fresh questionnaire state for a new user", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ step: "questionnaire", profile: {}, draftGraph: null, activeRoadmapId: null, messages: [] });
  });
});

describe("PATCH /api/onboarding", () => {
  it("saves answers and returns { step, profile }", async () => {
    const res = await patch({ profile: { goal: "  Learn Rust  ", goalType: "career" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ step: "questionnaire", profile: { goal: "Learn Rust", goalType: "career", preferences: {}, availability: {} } });
    expect((await (await GET()).json()).profile.goal).toBe("Learn Rust");
  });

  it("merges nested preferences and availability across patches", async () => {
    await patch({ profile: { preferences: { pace: "relaxed" }, availability: { timezone: "Europe/Paris" } } });
    const res = await patch({ profile: { preferences: { formats: ["video"] }, availability: { daysPerWeek: 2 } } });
    const { profile } = await res.json();
    expect(profile.preferences).toEqual({ pace: "relaxed", formats: ["video"] });
    expect(profile.availability).toEqual({ timezone: "Europe/Paris", daysPerWeek: 2 });
  });

  it("clears the deadline with null", async () => {
    await patch({ profile: { deadline: "2999-01-01" } });
    expect((await (await GET()).json()).profile.deadline).toBe("2999-01-01");
    await patch({ profile: { deadline: null } });
    expect((await (await GET()).json()).profile.deadline).toBeUndefined();
  });

  it("accepts an empty body as a no-op", async () => {
    expect((await patch({})).status).toBe(200);
  });

  it.each([
    ["a goal that is too short", { profile: { goal: "ab" } }],
    ["a goal that is too long", { profile: { goal: "x".repeat(201) } }],
    ["hours below 1", { profile: { hoursPerWeek: 0 } }],
    ["hours above 40", { profile: { hoursPerWeek: 41 } }],
    ["days above 7", { profile: { availability: { daysPerWeek: 8 } } }],
    ["a past deadline", { profile: { deadline: "2020-01-01" } }],
    ["a malformed deadline", { profile: { deadline: "next friday" } }],
    ["an unknown goal type", { profile: { goalType: "fun" } }],
    ["an unknown step", { step: "finished" }],
    ["a non-object profile", { profile: "hello" }],
  ])("rejects %s with 400 and { errors }", async (_name, body) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(Array.isArray(json.errors)).toBe(true);
    expect(json.errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(json)).not.toMatch(/\bat .*\.(ts|js)/);
  });

  it("rejects a body that is not JSON", async () => {
    const res = await patch("{nope");
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toEqual(["Request body must be valid JSON."]);
  });

  it("never takes the user id from the body", async () => {
    const victim = `victim-${crypto.randomUUID()}`;
    const res = await patch({ userId: victim, user_id: victim, profile: { goal: "Learn Rust", userId: victim } });
    expect(res.status).toBe(200);
    expect((await onboardingRepo.get(victim)).profile).toEqual({});
    expect((await onboardingRepo.get(session.userId)).profile.goal).toBe("Learn Rust");
  });

  it("keeps step at questionnaire until the workshop is requested", async () => {
    await patch({ profile: completeProfile });
    expect((await (await GET()).json()).step).toBe("questionnaire");
    const res = await patch({ step: "workshop" });
    expect(res.status).toBe(200);
    expect((await res.json()).step).toBe("workshop");
    expect((await (await GET()).json()).step).toBe("workshop");
  });

  it("accepts the final profile and step in one request", async () => {
    const res = await patch({ profile: completeProfile, step: "workshop" });
    expect(res.status).toBe(200);
    expect((await res.json()).step).toBe("workshop");
  });

  it("refuses to leave the questionnaire with missing answers", async () => {
    const res = await patch({ profile: { goal: "Learn Rust" }, step: "workshop" });
    expect(res.status).toBe(400);
    expect((await res.json()).errors[0]).toMatch(/step 2/);
    expect((await (await GET()).json()).step).toBe("questionnaire");
  });

  it("lets a profile without the settings-only fields reach the workshop", async () => {
    const res = await patch({ profile: completeProfile, step: "workshop" });
    expect(res.status).toBe(200);
    expect((await res.json()).step).toBe("workshop");
  });

  it("returns 500 with a generic message when persistence throws", async () => {
    const spy = vi.spyOn(onboardingRepo, "update").mockRejectedValueOnce(new Error("secret db detail"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const res = await patch({ profile: { goal: "Learn Rust" } });
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("secret");
    spy.mockRestore();
  });
});
