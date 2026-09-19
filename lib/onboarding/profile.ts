import type { LearnerProfile, OnboardingProfile } from "@/types/learning";
import { CONSTRAINTS_MAX, GOAL_MAX, GOAL_MIN, HOURS_MAX, HOURS_MIN, type ProfilePatch } from "./schemas";

export type UiStep = 1 | 2 | 3 | 4 | 5;
export const STEP_COUNT = 5;
export type Level = 0 | 1 | 2;
type PriorKnowledge = LearnerProfile["priorKnowledge"];

export const DEFAULTS = { hoursPerWeek: 5, pace: "steady", daysPerWeek: 3 } as const;

/** Later keys win, including explicit `undefined`, so an answer can be cleared locally. */
export function mergeProfile(base: OnboardingProfile, patch: OnboardingProfile): OnboardingProfile {
  return {
    ...base,
    ...patch,
    preferences: { ...base.preferences, ...patch.preferences },
    availability: { ...base.availability, ...patch.availability },
  };
}

/** Local calendar date as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const isFutureDate = (date: string, today = localToday()) => date > today;

const goalOk = (goal?: string) => {
  const length = goal?.trim().length ?? 0;
  return length >= GOAL_MIN && length <= GOAL_MAX;
};
const hoursOk = (hours?: number) => hours !== undefined && hours >= HOURS_MIN && hours <= HOURS_MAX;
const daysOk = (days?: number) => days !== undefined && Number.isInteger(days) && days >= 1 && days <= 7;

/** The message blocking `step`, or null when the profile satisfies it. */
export function stepError(step: UiStep, profile: OnboardingProfile, today = localToday()): string | null {
  switch (step) {
    case 1:
      return goalOk(profile.goal) ? null : `Describe what you want to learn in ${GOAL_MIN} to ${GOAL_MAX} characters.`;
    case 2:
      if (!profile.goalType) return "Pick the option that fits best.";
      if (profile.deadline && !isFutureDate(profile.deadline, today)) return "Pick a date in the future, or clear it.";
      return null;
    case 3:
      if (!hoursOk(profile.hoursPerWeek)) return `Choose between ${HOURS_MIN} and ${HOURS_MAX} hours a week.`;
      if (!profile.preferences?.pace) return "Pick a pace.";
      if (!daysOk(profile.availability?.daysPerWeek)) return "Choose how many days a week.";
      return null;
    case 4:
      return profile.priorKnowledge?.length ? null : "Tell us where you are starting from.";
    case 5:
      return profile.preferences?.formats?.length ? null : "Pick at least one way you like to learn.";
  }
}

/** Resume point: the first step whose answers are missing or invalid, or null when all are complete. */
export function firstIncompleteStep(profile: OnboardingProfile, today = localToday()): UiStep | null {
  for (const step of [1, 2, 3, 4, 5] as const) if (stepError(step, profile, today)) return step;
  return null;
}

/** Only fields that pass validation go over the wire. A missing or past deadline becomes `null`, which clears it. */
export function persistableProfile(profile: OnboardingProfile, today = localToday()): ProfilePatch {
  const patch: ProfilePatch = {};
  if (goalOk(profile.goal)) patch.goal = profile.goal!.trim();
  if (profile.goalType) patch.goalType = profile.goalType;
  patch.deadline = profile.deadline && isFutureDate(profile.deadline, today) ? profile.deadline : null;
  if (hoursOk(profile.hoursPerWeek)) patch.hoursPerWeek = profile.hoursPerWeek;
  const preferences: NonNullable<ProfilePatch["preferences"]> = {};
  if (profile.preferences?.pace) preferences.pace = profile.preferences.pace;
  if (profile.preferences?.formats) preferences.formats = profile.preferences.formats;
  patch.preferences = preferences;
  const availability: NonNullable<ProfilePatch["availability"]> = {};
  if (daysOk(profile.availability?.daysPerWeek)) availability.daysPerWeek = profile.availability!.daysPerWeek;
  if (profile.availability?.timezone) availability.timezone = profile.availability.timezone;
  patch.availability = availability;
  if (profile.priorKnowledge) patch.priorKnowledge = profile.priorKnowledge;
  if (profile.tutorStyle) patch.tutorStyle = profile.tutorStyle;
  if (profile.constraints !== undefined) patch.constraints = profile.constraints.trim().slice(0, CONSTRAINTS_MAX);
  return patch;
}

export const LEVELS = [
  { level: 0, label: "Never heard of it", short: "Never heard" },
  { level: 1, label: "Heard of it", short: "Heard of" },
  { level: 2, label: "Can explain it", short: "Can explain" },
] as const;

/** Level-selector fallback: beginner, intermediate, advanced map to 0, 1, 2 on the goal itself. */
export const SELF_LEVELS = [
  { level: 0, label: "Beginner", description: "New to this, start from the basics." },
  { level: 1, label: "Intermediate", description: "I know some of it and want to fill gaps." },
  { level: 2, label: "Advanced", description: "Comfortable already, I want depth." },
] as const;

export const levelToPriorKnowledge = (goal: string, level: Level): PriorKnowledge => [{ concept: goal, level }];

/** Unrated concepts default to 0. */
export function ratingsToPriorKnowledge(concepts: string[], ratings: Record<string, Level>): PriorKnowledge {
  return concepts.map((concept) => ({ concept, level: ratings[concept] ?? 0 }));
}

export function priorKnowledgeToRatings(priorKnowledge: PriorKnowledge | undefined, concepts: string[]): Record<string, Level> {
  const known = new Set(concepts);
  const ratings: Record<string, Level> = {};
  for (const { concept, level } of priorKnowledge ?? []) if (known.has(concept)) ratings[concept] = level;
  return ratings;
}

export function priorKnowledgeToLevel(priorKnowledge: PriorKnowledge | undefined, goal: string): Level | undefined {
  return priorKnowledge?.find((entry) => entry.concept === goal)?.level;
}
