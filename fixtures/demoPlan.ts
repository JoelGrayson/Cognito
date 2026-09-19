import type { StudyPlan } from "@/types/learning";
import { computeOrderAndSchedule } from "@/lib/schedule/schedule";
import { sampleProfile } from "./sampleProfile";
import { samplePlanGraph } from "./samplePlanGraph";

export const DEMO_PLAN_ID = "demo";

const CREATED_AT = "2026-09-19T00:00:00.000Z";
// Scheduling is relative to a fixed date so the demo plan is identical on every run.
const { order, schedule } = computeOrderAndSchedule(samplePlanGraph, sampleProfile, { now: new Date(CREATED_AT) });

export function demoPlan(userId: string): StudyPlan {
  return {
    id: DEMO_PLAN_ID,
    userId,
    version: 1,
    title: samplePlanGraph.title,
    profile: sampleProfile,
    graph: structuredClone(samplePlanGraph),
    order: [...order],
    schedule: structuredClone(schedule),
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}
