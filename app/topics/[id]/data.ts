import { TRPCError } from "@trpc/server";
import { serverTrpc } from "@/server/caller";

const MISSING = new Set(["NOT_FOUND", "UNAUTHORIZED", "BAD_REQUEST"]);

/** Runs a topics query, turning "not yours / not there / malformed id" into null. */
async function orNull<T>(query: () => Promise<T>): Promise<T | null> {
  try {
    return await query();
  } catch (error) {
    if (error instanceof TRPCError && MISSING.has(error.code)) return null;
    throw error;
  }
}

/** A roadmap of the signed-in learner, with the ids of the nodes whose lessons exist. */
export async function topic(id: string) {
  const trpc = await serverTrpc();
  return orNull(() => trpc.topics.get({ id }));
}

/** One node's lesson (null when unwritten), with its roadmap. */
export async function module(id: string, nodeId: string) {
  const trpc = await serverTrpc();
  return orNull(() => trpc.topics.lesson({ id, nodeId }));
}
