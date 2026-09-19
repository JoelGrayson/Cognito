import { memoryOnboardingRepo, memoryPlanRepo } from "./memory";
import type { OnboardingRepo, PlanRepo } from "./types";

export type { NewPlan, OnboardingPatch, OnboardingRepo, PlanRepo } from "./types";

// REPO_IMPL=drizzle is wired in during Phase 1.
const impl = process.env.REPO_IMPL ?? "memory";
if (impl !== "memory") throw new Error(`REPO_IMPL=${impl} is not available yet`);

export const onboardingRepo: OnboardingRepo = memoryOnboardingRepo;
export const planRepo: PlanRepo = memoryPlanRepo;
