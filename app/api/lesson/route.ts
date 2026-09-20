import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, readJson } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import { writeLesson } from "@/lib/lesson";
import { findNode, lessonRequest } from "@/lib/modules";
import { PROVIDERS, isProviderId } from "@/lib/providers";
import { onboardingRepo, roadmapRepo } from "@/lib/repo";
import { ndjson } from "@/lib/stream";
import { NodeId } from "@/types/learning";

export const maxDuration = 120;

const BodySchema = z.object({
  roadmapId: z.string().uuid(),
  nodeId: NodeId,
  model: z.string().optional(),
});

/**
 * Writes the lesson for one roadmap node, streaming the progress events from `writeLesson`
 * as newline-delimited JSON, then
 *   {type:"done", lesson, provider, model, ms}
 *   {type:"error", error}
 * The finished lesson is saved against the roadmap and node. The learner's onboarding
 * provider choice decides which model writes it.
 */
export const POST = apiHandler(async (request) => {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Your session has expired. Please try again." }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await readJson(request, BodySchema);
  const [roadmap, { profile }] = await Promise.all([roadmapRepo.get(body.roadmapId, userId), onboardingRepo.get(userId)]);
  if (!roadmap) return NextResponse.json({ error: "That roadmap does not exist." }, { status: 404 });
  const node = findNode(roadmap.graph, body.nodeId);
  if (!node) return NextResponse.json({ error: "That module is not in the roadmap." }, { status: 404 });

  const provider = PROVIDERS[isProviderId(profile.provider) ? profile.provider : "anthropic"];
  const ctx = lessonRequest(roadmap.goal, roadmap.graph, node);
  const started = Date.now();

  return ndjson(async (emit) => {
    const { lesson, model } = await writeLesson(provider, ctx, body.model, emit, { userId });
    await roadmapRepo.saveLesson(roadmap.id, userId, node.id, lesson);
    emit({ type: "done", lesson, provider: provider.id, model, ms: Date.now() - started });
  });
});
