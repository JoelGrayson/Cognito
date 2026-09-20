import { afterAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import type { NewPlan, NewRoadmap, OnboardingRepo, PlanRepo, RoadmapRepo } from "./types";
import { memoryOnboardingRepo, memoryPlanRepo, memoryRoadmapRepo } from "./memory";

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

const roadmap: NewRoadmap = {
  title: "Rust roadmap",
  goal: "learn rust",
  graph: { title: "Rust roadmap", nodes: [], edges: [] },
};

// Written against the interfaces so the Drizzle implementations can run the same suite.
function contract(name: string, onboarding: OnboardingRepo, plans: PlanRepo, roadmaps: RoadmapRepo) {
  describe(`${name} repo contract`, () => {
    it("returns a fresh questionnaire state for a new user", async () => {
      const state = await onboarding.get("u-new");
      expect(state).toEqual({ step: "questionnaire", profile: {}, draftGraph: null, activeRoadmapId: null, messages: [] });
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

    it("keeps roadmap records per user, newest first", async () => {
      const first = await roadmaps.create("u-maps", roadmap);
      const second = await roadmaps.create("u-maps", { ...roadmap, title: "Newer" });
      const list = await roadmaps.list("u-maps");
      expect(list.map((r) => r.id)).toEqual([second.id, first.id]);
      // Summaries omit the graph payload.
      expect(list[0]).not.toHaveProperty("graph");
      expect(await roadmaps.list("u-other")).toEqual([]);
      expect(await roadmaps.get(first.id, "u-maps")).toMatchObject({ title: "Rust roadmap" });
      expect(await roadmaps.get(first.id, "u-other")).toBeNull();
    });

    it("updates a roadmap only for its owner", async () => {
      const record = await roadmaps.create("u-own", roadmap);
      const next = { ...roadmap.graph, title: "Edited" };
      const updated = await roadmaps.update(record.id, "u-own", { graph: next });
      expect(updated?.graph.title).toBe("Edited");
      expect(await roadmaps.update(record.id, "u-other", { graph: next })).toBeNull();
      expect(await roadmaps.get(record.id, "u-own")).toMatchObject({ graph: { title: "Edited" } });
    });
  });
}

contract("memory", memoryOnboardingRepo, memoryPlanRepo, memoryRoadmapRepo);

// The Drizzle implementations run only when DATABASE_URL points at a local
// database — tests must never write to a shared remote one.
const localDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");

if (localDb) {
  const { getDb } = await import("@/db");
  const { user } = await import("@/db/schema");
  const { drizzleOnboardingRepo } = await import("./onboarding.drizzle");
  const { drizzlePlanRepo } = await import("./plans.drizzle");
  const { drizzleRoadmapRepo } = await import("./roadmaps.drizzle");

  // userIds get a `user` row first: onboarding_sessions and study_plans FK to it.
  const seededIds = new Set<string>();
  const seedUser = async (userId: string) => {
    if (seededIds.has(userId)) return;
    await getDb()
      .insert(user)
      .values({ id: userId, name: userId, email: `${userId}@contract.test` })
      .onConflictDoNothing();
    seededIds.add(userId);
  };

  const onboarding: OnboardingRepo = {
    get: (u) => seedUser(u).then(() => drizzleOnboardingRepo.get(u)),
    update: (u, p) => seedUser(u).then(() => drizzleOnboardingRepo.update(u, p)),
  };
  const plans: PlanRepo = {
    create: (u, p) => seedUser(u).then(() => drizzlePlanRepo.create(u, p)),
    get: (id, u) => seedUser(u).then(() => drizzlePlanRepo.get(id, u)),
    getActive: (u) => seedUser(u).then(() => drizzlePlanRepo.getActive(u)),
    update: (id, u, p) => seedUser(u).then(() => drizzlePlanRepo.update(id, u, p)),
  };

  const roadmaps: RoadmapRepo = {
    list: (u) => seedUser(u).then(() => drizzleRoadmapRepo.list(u)),
    get: (id, u) => seedUser(u).then(() => drizzleRoadmapRepo.get(id, u)),
    create: (u, r) => seedUser(u).then(() => drizzleRoadmapRepo.create(u, r)),
    update: (id, u, p) => seedUser(u).then(() => drizzleRoadmapRepo.update(id, u, p)),
  };

  // Rows cascade to onboarding_sessions, study_plans and roadmaps when users are removed.
  afterAll(async () => {
    if (seededIds.size) await getDb().delete(user).where(inArray(user.id, [...seededIds]));
  });

  contract("drizzle", onboarding, plans, roadmaps);
}
