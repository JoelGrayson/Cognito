import type { OnboardingProfile, OnboardingState, StudyPlan } from "@/types/learning";
import type { OnboardingPatch, OnboardingRepo, PlanRepo, RoadmapRecord, RoadmapRepo } from "./types";

// Held on globalThis so dev hot reloads don't wipe the data.
const g = globalThis as typeof globalThis & {
  __memoryRepo?: { onboarding: Map<string, OnboardingState>; plans: Map<string, StudyPlan>; roadmaps: Map<string, RoadmapRecord> };
};
const store = (g.__memoryRepo ??= { onboarding: new Map(), plans: new Map(), roadmaps: new Map() });
// A store created by an older module version may lack newer maps.
store.roadmaps ??= new Map();

const emptyState = (): OnboardingState => ({
  step: "questionnaire",
  profile: {},
  draftGraph: null,
  activeRoadmapId: null,
  messages: [],
});

export function mergeProfile(base: OnboardingProfile, patch: OnboardingProfile): OnboardingProfile {
  return {
    ...base,
    ...patch,
    preferences: { ...base.preferences, ...patch.preferences },
    availability: { ...base.availability, ...patch.availability },
  };
}

export const memoryOnboardingRepo: OnboardingRepo = {
  async get(userId) {
    return structuredClone(store.onboarding.get(userId) ?? emptyState());
  },
  async update(userId, patch: OnboardingPatch) {
    const current = store.onboarding.get(userId) ?? emptyState();
    const { profile, ...rest } = patch;
    const next: OnboardingState = {
      ...current,
      ...rest,
      profile: profile ? mergeProfile(current.profile, profile) : current.profile,
    };
    store.onboarding.set(userId, structuredClone(next));
    return structuredClone(next);
  },
};

export const memoryPlanRepo: PlanRepo = {
  async create(userId, plan) {
    const now = new Date().toISOString();
    const created: StudyPlan = {
      ...structuredClone(plan),
      id: crypto.randomUUID(),
      userId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    store.plans.set(created.id, created);
    return structuredClone(created);
  },
  async get(planId, userId) {
    const plan = store.plans.get(planId);
    return plan && plan.userId === userId ? structuredClone(plan) : null;
  },
  async getActive(userId) {
    let latest: StudyPlan | null = null;
    for (const plan of store.plans.values()) {
      if (plan.userId === userId && (!latest || plan.createdAt >= latest.createdAt)) latest = plan;
    }
    return latest ? structuredClone(latest) : null;
  },
  async update(planId, userId, patch) {
    const plan = store.plans.get(planId);
    if (!plan || plan.userId !== userId) throw new Error(`Plan ${planId} not found`);
    const next: StudyPlan = {
      ...plan,
      ...structuredClone(patch),
      version: plan.version + 1,
      updatedAt: new Date().toISOString(),
    };
    store.plans.set(planId, next);
    return structuredClone(next);
  },
};

export const memoryRoadmapRepo: RoadmapRepo = {
  async list(userId) {
    return [...store.roadmaps.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map(({ id, title, goal, createdAt, updatedAt }) => ({ id, title, goal, createdAt, updatedAt }));
  },
  async get(id, userId) {
    const record = store.roadmaps.get(id);
    return record && record.userId === userId ? structuredClone(record) : null;
  },
  async create(userId, roadmap) {
    const now = new Date().toISOString();
    const created: RoadmapRecord = {
      ...structuredClone(roadmap),
      id: crypto.randomUUID(),
      userId,
      createdAt: now,
      updatedAt: now,
    };
    store.roadmaps.set(created.id, created);
    return structuredClone(created);
  },
  async update(id, userId, patch) {
    const record = store.roadmaps.get(id);
    if (!record || record.userId !== userId) return null;
    const next: RoadmapRecord = { ...record, ...structuredClone(patch), updatedAt: new Date().toISOString() };
    store.roadmaps.set(id, next);
    return structuredClone(next);
  },
};
