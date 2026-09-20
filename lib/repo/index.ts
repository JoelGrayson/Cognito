import { drizzleOnboardingRepo } from "./onboarding.drizzle";
import { drizzlePlanRepo } from "./plans.drizzle";
import { drizzleRoadmapRepo } from "./roadmaps.drizzle";
import { memoryOnboardingRepo, memoryPlanRepo, memoryRoadmapRepo } from "./memory";
import type { OnboardingRepo, PlanRepo, RoadmapRepo } from "./types";

export type { NewPlan, OnboardingPatch, OnboardingRepo, PlanRepo } from "./types";
export type { NewRoadmap, RoadmapRecord, RoadmapRepo, RoadmapSummary } from "./types";

// REPO_IMPL=drizzle persists through db/; memory keeps everything in process.
// Unset, it follows DATABASE_URL: a process-local store on serverless hosts scatters
// each learner's answers across instances, so the workshop never sees them.
const impl = process.env.REPO_IMPL ?? (process.env.DATABASE_URL ? "drizzle" : "memory");
if (impl !== "memory" && impl !== "drizzle") throw new Error(`Unknown REPO_IMPL=${impl}`);
if (impl === "memory" && process.env.NODE_ENV === "production") {
  console.warn("repo: REPO_IMPL=memory in production keeps data per process; set REPO_IMPL=drizzle and DATABASE_URL.");
}

export const onboardingRepo: OnboardingRepo = impl === "drizzle" ? drizzleOnboardingRepo : memoryOnboardingRepo;
export const planRepo: PlanRepo = impl === "drizzle" ? drizzlePlanRepo : memoryPlanRepo;
export const roadmapRepo: RoadmapRepo = impl === "drizzle" ? drizzleRoadmapRepo : memoryRoadmapRepo;
