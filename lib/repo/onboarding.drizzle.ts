import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { onboardingSessions } from "@/db/schema";
import type { OnboardingState } from "@/types/learning";
import { mergeProfile } from "./memory";
import type { OnboardingRepo } from "./types";

const emptyState = (): OnboardingState => ({
  step: "questionnaire",
  profile: {},
  draftGraph: null,
  messages: [],
});

type Row = typeof onboardingSessions.$inferSelect;
const toState = (row: Row): OnboardingState => ({
  step: row.step,
  profile: row.profile,
  draftGraph: row.draftGraph ?? null,
  messages: row.messages,
});

export const drizzleOnboardingRepo: OnboardingRepo = {
  async get(userId) {
    const [row] = await getDb()
      .select()
      .from(onboardingSessions)
      .where(eq(onboardingSessions.userId, userId));
    return row ? toState(row) : emptyState();
  },

  async update(userId, patch) {
    return getDb().transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(onboardingSessions)
        .where(eq(onboardingSessions.userId, userId))
        .for("update");
      const current = row ? toState(row) : emptyState();
      const { profile, ...rest } = patch;
      const next: OnboardingState = {
        ...current,
        ...rest,
        profile: profile ? mergeProfile(current.profile, profile) : current.profile,
      };
      const values = { userId, step: next.step, profile: next.profile, draftGraph: next.draftGraph, messages: next.messages };
      await tx
        .insert(onboardingSessions)
        .values(values)
        .onConflictDoUpdate({ target: onboardingSessions.userId, set: values });
      return next;
    });
  },
};
