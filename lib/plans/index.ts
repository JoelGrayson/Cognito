import { onboardingRepo, planRepo } from "@/lib/repo";
import type { OnboardingStep, PlanNode, Progress, StudyPlan } from "@/types/learning";

export const getPlan = (planId: string, userId: string): Promise<StudyPlan | null> =>
  planRepo.get(planId, userId);

export const getActivePlan = (userId: string): Promise<StudyPlan | null> =>
  planRepo.getActive(userId);

/** First leaf in `order` that is not done. Missing progress means todo. */
export function getNextNode(
  plan: StudyPlan,
  progress: Record<string, Progress>,
): PlanNode | null {
  const byId = new Map(plan.graph.nodes.map((node) => [node.id, node]));
  for (const id of plan.order) {
    const node = byId.get(id);
    if (node && progress[id] !== "done") return node;
  }
  return null;
}

/** Where the learner should land: drives the landing CTA and route guards. */
export async function getUserState(
  userId: string,
): Promise<{ step: OnboardingStep; activePlanId: string | null }> {
  const [state, plan] = await Promise.all([onboardingRepo.get(userId), planRepo.getActive(userId)]);
  return { step: state.step, activePlanId: plan?.id ?? null };
}
