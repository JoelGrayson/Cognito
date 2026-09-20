import { TRPCError } from "@trpc/server";
import { serverTrpc } from "@/server/caller";

/** A roadmap of the signed-in learner, or null when it is missing or theirs to see. */
export async function legacyRoadmap(id: string) {
  const trpc = await serverTrpc();
  try {
    return await trpc.legacy.get({ id });
  } catch (error) {
    if (error instanceof TRPCError && (error.code === "NOT_FOUND" || error.code === "UNAUTHORIZED" || error.code === "BAD_REQUEST")) {
      return null;
    }
    throw error;
  }
}

/** One block's lesson, or null when the roadmap or block is missing. */
export async function legacyLesson(id: string, key: string) {
  const trpc = await serverTrpc();
  try {
    return await trpc.legacy.lesson({ id, key });
  } catch (error) {
    if (error instanceof TRPCError && (error.code === "NOT_FOUND" || error.code === "UNAUTHORIZED" || error.code === "BAD_REQUEST")) {
      return null;
    }
    throw error;
  }
}
