import { describe, expect, it } from "vitest";
import type { NewPlan, OnboardingRepo, PlanRepo } from "./types";
import { memoryOnboardingRepo, memoryPlanRepo } from "./memory";

const plan: NewPlan = {
  title: "Linear algebra",
  profile: {
    goal: "learn linear algebra",
    goalType: "curiosity",
    hoursPerWeek: 4,
    priorKnowledge: [],
    preferences: { formats: ["reading"], pace: "steady" },
  },
  graph: {
    title: "Linear algebra",
    nodes: [
      { id: "vectors", title: "Vectors", summary: "", kind: "core", estMinutes: 60, scope: "included", objectives: ["Explain a vector"] },
      { id: "matrices", title: "Matrices", summary: "", kind: "core", estMinutes: 60, scope: "included", objectives: ["Multiply matrices"] },
    ],
    edges: [],
  },
  order: ["vectors", "matrices"],
  schedule: [{ week: 1, nodeIds: ["vectors", "matrices"], minutes: 120 }],
};

// Written against the interfaces so the Drizzle implementations can run the same suite.
function contract(name: string, onboarding: OnboardingRepo, plans: PlanRepo) {
  describe(`${name} repo contract`, () => {
    it("returns a fresh questionnaire state for a new user", async () => {
      const state = await onboarding.get("u-new");
      expect(state).toEqual({ step: "questionnaire", profile: {}, draftGraph: null, messages: [] });
    });

    it("merges profile patches, including nested preferences", async () => {
      await onboarding.update("u-merge", { profile: { goal: "rust", preferences: { pace: "steady" } } });
      const state = await onboarding.update("u-merge", {
        step: "workshop",
        profile: { preferences: { formats: ["video"] }, availability: { daysPerWeek: 3 } },
      });
      expect(state.step).toBe("workshop");
      expect(state.profile).toMatchObject({
        goal: "rust",
        preferences: { pace: "steady", formats: ["video"] },
        availability: { daysPerWeek: 3 },
      });
    });

    it("isolates users and returns copies", async () => {
      await onboarding.update("u-a", { profile: { goal: "a" } });
      const b = await onboarding.get("u-b");
      expect(b.profile.goal).toBeUndefined();
      const a = await onboarding.get("u-a");
      a.profile.goal = "mutated";
      expect((await onboarding.get("u-a")).profile.goal).toBe("a");
    });

    it("creates, reads and updates plans with version bumps", async () => {
      const created = await plans.create("u-plans", plan);
      expect(created.version).toBe(1);
      expect(await plans.get(created.id, "u-plans")).toEqual(created);
      expect(await plans.get(created.id, "someone-else")).toBeNull();

      const updated = await plans.update(created.id, "u-plans", { title: "Renamed" });
      expect(updated.version).toBe(2);
      expect(updated.title).toBe("Renamed");
      expect(updated.graph).toEqual(plan.graph);
    });

    it("returns the most recently created plan as active", async () => {
      expect(await plans.getActive("u-none")).toBeNull();
      await plans.create("u-active", { ...plan, title: "first" });
      const second = await plans.create("u-active", { ...plan, title: "second" });
      expect((await plans.getActive("u-active"))?.id).toBe(second.id);
    });

    it("rejects updates to unknown plans", async () => {
      await expect(plans.update("missing", "u-x", { title: "x" })).rejects.toThrow();
    });
  });
}

contract("memory", memoryOnboardingRepo, memoryPlanRepo);
