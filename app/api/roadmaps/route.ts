import { serverError } from "@/lib/http";
import { roadmapRepo } from "@/lib/repo";
import { requireUserId } from "@/lib/session";

/** The learner's past generated roadmaps, newest first — the onboarding history list. */
export async function GET() {
  try {
    const userId = await requireUserId();
    return Response.json({ roadmaps: await roadmapRepo.list(userId) });
  } catch (err) {
    return serverError(err);
  }
}
