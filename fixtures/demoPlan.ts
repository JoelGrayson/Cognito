import type { ScheduleWeek, StudyPlan } from "@/types/learning";
import { sampleProfile } from "./sampleProfile";
import { samplePlanGraph } from "./samplePlanGraph";

export const DEMO_PLAN_ID = "demo";

// Study order: core containers by prerequisite chain, then optional leaves.
// Stand-in until computeOrderAndSchedule (lib/schedule) exists; M1 replaces this.
const order = [
  "vector_basics", "dot_product", "norms",
  "matrix_basics", "matrix_multiplication", "transpose_inverse",
  "matrix_as_map", "span_basis", "rank_null",
  "eigen", "svd", "pca",
  "partial_derivatives", "gradient_descent", "chain_rule",
  "forward_pass", "backprop",
  "tensors", "probability_refresher",
];

function schedule(hoursPerWeek: number, reviewShare = 0.2): ScheduleWeek[] {
  const capacity = hoursPerWeek * 60 * (1 - reviewShare);
  const minutesOf = new Map(samplePlanGraph.nodes.map((n) => [n.id, n.estMinutes]));
  const weeks: ScheduleWeek[] = [];
  let cumulative = 0;
  for (const id of order) {
    const minutes = minutesOf.get(id) ?? 0;
    const week = Math.floor(cumulative / capacity) + 1;
    let entry = weeks.find((w) => w.week === week);
    if (!entry) weeks.push((entry = { week, nodeIds: [], minutes: 0 }));
    entry.nodeIds.push(id);
    entry.minutes += minutes;
    cumulative += minutes;
  }
  return weeks;
}

export function demoPlan(userId: string): StudyPlan {
  return {
    id: DEMO_PLAN_ID,
    userId,
    version: 1,
    title: samplePlanGraph.title,
    profile: sampleProfile,
    graph: structuredClone(samplePlanGraph),
    order: [...order],
    schedule: schedule(sampleProfile.hoursPerWeek),
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-19T00:00:00.000Z",
  };
}
