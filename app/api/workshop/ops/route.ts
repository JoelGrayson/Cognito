import { z } from "zod";
import { applyOps } from "@/lib/graph";
import { validateGraph } from "@/lib/graph/validate";
import { jsonError, parseBody, serverError } from "@/lib/http";
import { onboardingRepo, roadmapRepo } from "@/lib/repo";
import { requireUserId } from "@/lib/session";
import { GraphOp, type DraftGraph } from "@/types/learning";

const Body = z.object({ ops: z.array(GraphOp).min(1).max(64) });

/**
 * Applies user edits to the stored draft graph — mark known, ignore, delete. These are
 * cheap deterministic ops, not a regeneration: the result is validated, saved as the
 * draft, and written through to the linked roadmap record when one exists.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await parseBody(request, Body);
    if (!body.ok) return body.response;

    const state = await onboardingRepo.get(userId);
    if (!state.draftGraph) return jsonError(["No draft roadmap to edit."], 400);

    let graph: DraftGraph;
    try {
      graph = applyOps(state.draftGraph, body.data.ops);
    } catch (error) {
      return jsonError([error instanceof Error ? error.message : "Invalid edit."], 400);
    }
    const check = validateGraph(graph);
    if (!check.ok) return jsonError(check.errors, 400);

    await onboardingRepo.update(userId, { draftGraph: graph });
    if (state.activeRoadmapId) {
      await roadmapRepo
        .update(state.activeRoadmapId, userId, { graph })
        .catch((error) => console.error("roadmap record sync failed", error));
    }
    return Response.json({ graph });
  } catch (err) {
    return serverError(err);
  }
}
