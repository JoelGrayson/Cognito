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
  activeRoadmapId: null,
  messages: [],
});

type Row = typeof onboardingSessions.$inferSelect;
const toState = (row: Row): OnboardingState => ({
  step: row.step,
  profile: row.profile,
  draftGraph: row.draftGraph ?? null,
  activeRoadmapId: row.activeRoadmapId ?? null,
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
    const { profile, ...rest } = patch;
    // Without a profile merge, the upsert needs no prior read: one round trip.
    if (!profile) {
      const set = {
        ...(rest.step !== undefined && { step: rest.step }),
        ...(rest.draftGraph !== undefined && { draftGraph: rest.draftGraph }),
        ...(rest.activeRoadmapId !== undefined && { activeRoadmapId: rest.activeRoadmapId }),
        ...(rest.messages !== undefined && { messages: rest.messages }),
      };
      const [row] = await getDb()
        .insert(onboardingSessions)
        .values({ userId, ...set })
        .onConflictDoUpdate({ target: onboardingSessions.userId, set: { ...set, updatedAt: new Date() } })
        .returning();
      return toState(row);
    }
    return getDb().transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(onboardingSessions)
        .where(eq(onboardingSessions.userId, userId))
        .for("update");
      const current = row ? toState(row) : emptyState();
      const next: OnboardingState = {
        ...current,
        ...rest,
        profile: mergeProfile(current.profile, profile),
      };
      const values = {
        userId,
        step: next.step,
        profile: next.profile,
        draftGraph: next.draftGraph,
        activeRoadmapId: next.activeRoadmapId,
        messages: next.messages,
      };
      await tx
        .insert(onboardingSessions)
        .values(values)
        .onConflictDoUpdate({ target: onboardingSessions.userId, set: values });
      return next;
    });
  },
};
