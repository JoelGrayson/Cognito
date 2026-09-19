import type { OnboardingProfile, OnboardingState, StudyPlan } from "@/types/learning";
import type { OnboardingPatch, OnboardingRepo, PlanRepo } from "./types";

// Held on globalThis so dev hot reloads don't wipe the data.
const g = globalThis as typeof globalThis & {
  __memoryRepo?: { onboarding: Map<string, OnboardingState>; plans: Map<string, StudyPlan> };
};
const store = (g.__memoryRepo ??= { onboarding: new Map(), plans: new Map() });

const emptyState = (): OnboardingState => ({
  step: "questionnaire",
  profile: {},
  draftGraph: null,
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
