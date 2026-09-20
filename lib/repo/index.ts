import { drizzleOnboardingRepo } from "./onboarding.drizzle";
import { drizzlePlanRepo } from "./plans.drizzle";
import { drizzleRoadmapRepo } from "./roadmaps.drizzle";
import { memoryOnboardingRepo, memoryPlanRepo, memoryRoadmapRepo } from "./memory";
import type { OnboardingRepo, PlanRepo, RoadmapRepo } from "./types";

export type { NewPlan, OnboardingPatch, OnboardingRepo, PlanRepo } from "./types";
export type { NewRoadmap, RoadmapRecord, RoadmapRepo, RoadmapSummary } from "./types";

// REPO_IMPL=drizzle persists through db/; memory keeps everything in process.
const impl = process.env.REPO_IMPL ?? "memory";
if (impl !== "memory" && impl !== "drizzle") throw new Error(`Unknown REPO_IMPL=${impl}`);

export const onboardingRepo: OnboardingRepo = impl === "drizzle" ? drizzleOnboardingRepo : memoryOnboardingRepo;
export const planRepo: PlanRepo = impl === "drizzle" ? drizzlePlanRepo : memoryPlanRepo;
export const roadmapRepo: RoadmapRepo = impl === "drizzle" ? drizzleRoadmapRepo : memoryRoadmapRepo;
