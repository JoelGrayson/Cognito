import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { onboardingSessions, roadmaps, studyPlans } from "@/db/schema";

/** Called by Better Auth before it deletes the linked anonymous identity. */
export async function migrateUserData(fromUserId: string, toUserId: string): Promise<void> {
  if (fromUserId === toUserId) return;
  await getDb().transaction(async (tx) => {
    await tx.update(studyPlans).set({ userId: toUserId })
      .where(eq(studyPlans.userId, fromUserId));

    // Roadmap history follows the user; the session's activeRoadmapId keeps pointing at it.
    await tx.update(roadmaps).set({ userId: toUserId })
      .where(eq(roadmaps.userId, fromUserId));

    const [source] = await tx.select().from(onboardingSessions)
      .where(eq(onboardingSessions.userId, fromUserId)).for("update");
    if (source) {
      // Keep the destination's existing workshop when both users have one.
      await tx.insert(onboardingSessions).values({ ...source, userId: toUserId })
        .onConflictDoNothing({ target: onboardingSessions.userId });
      await tx.delete(onboardingSessions).where(eq(onboardingSessions.userId, fromUserId));
    }
  });
}
