import { z } from "zod";
import { LearnerProfile, OnboardingProfile, OnboardingStep } from "@/types/learning";

export const GOAL_MIN = 3;
export const GOAL_MAX = 200;
export const HOURS_MIN = 1;
export const HOURS_MAX = 40;
export const CONSTRAINTS_MAX = 500;

export const GoalText = z
  .string()
  .trim()
  .min(GOAL_MIN, `Goal must be at least ${GOAL_MIN} characters`)
  .max(GOAL_MAX, `Goal must be at most ${GOAL_MAX} characters`);

const wordCount = (text: string) => text.trim().split(/\s+/).length;

// Step 4 chips: 6 to 8 short, distinct concepts. Shared by the tool schema and the client.
export const ConceptList = z
  .array(z.string().trim().min(1).max(40))
  .min(6)
  .max(8)
  .refine((list) => list.every((c) => wordCount(c) <= 4), "Each concept must be 1 to 4 words")
  .refine((list) => new Set(list.map((c) => c.toLowerCase())).size === list.length, "Concepts must be unique");

export const ConceptsRequest = z.object({ goal: GoalText });
export const ConceptsResponse = z.object({ concepts: ConceptList });

// The client checks the date strictly; the server allows a day of slack for timezone skew.
function isNotPast(date: string): boolean {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return date >= yesterday;
}

/** Stricter than the stored shape: the questionnaire's limits, and `deadline: null` clears the date. */
export const ProfilePatch = OnboardingProfile.extend({
  goal: GoalText.optional(),
  deadline: z.iso.date().refine(isNotPast, "Deadline must be in the future").nullable().optional(),
  hoursPerWeek: z.number().min(HOURS_MIN).max(HOURS_MAX).optional(),
  priorKnowledge: LearnerProfile.shape.priorKnowledge.max(30).optional(),
  constraints: z.string().max(CONSTRAINTS_MAX).optional(),
});
export type ProfilePatch = z.infer<typeof ProfilePatch>;

export const PatchBody = z.object({
  profile: ProfilePatch.optional(),
  step: OnboardingStep.optional(),
});
export type PatchBody = z.infer<typeof PatchBody>;
