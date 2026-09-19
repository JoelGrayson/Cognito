import type { OnboardingState, StudyPlan } from "@/types/learning";

export type OnboardingPatch = Partial<Omit<OnboardingState, "profile">> & {
  /** Merged into the stored profile; `preferences` and `availability` merge key by key. */
  profile?: OnboardingState["profile"];
};

export interface OnboardingRepo {
  /** A fresh `questionnaire` state when nothing is stored yet. */
  get(userId: string): Promise<OnboardingState>;
  update(userId: string, patch: OnboardingPatch): Promise<OnboardingState>;
}

export type NewPlan = Pick<StudyPlan, "title" | "profile" | "graph" | "order" | "schedule">;

export interface PlanRepo {
  create(userId: string, plan: NewPlan): Promise<StudyPlan>;
  /** Null when the plan does not exist or belongs to someone else. */
  get(planId: string, userId: string): Promise<StudyPlan | null>;
  /** Most recently created plan. */
  getActive(userId: string): Promise<StudyPlan | null>;
  /** Replaces the given fields and bumps `version`. */
  update(planId: string, userId: string, patch: Partial<NewPlan>): Promise<StudyPlan>;
}
