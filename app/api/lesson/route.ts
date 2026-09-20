import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, readJson } from "@/lib/api";
import { writeLesson } from "@/lib/lesson";
import { PROVIDERS } from "@/lib/providers";
import { legacyRoadmapRepo } from "@/lib/repo";
import { findRef, nodeAt } from "@/lib/roadmap";
import { ndjson } from "@/lib/stream";
import { getAuth } from "@/lib/auth";

export const maxDuration = 120;

const BodySchema = z.object({
  roadmapId: z.string().uuid(),
  /** The block's lesson key: its lowercased name. */
  key: z.string().trim().min(1).max(200),
  model: z.string().optional(),
});

/**
 * Writes one block's lesson, streaming the progress events from `writeLesson`
 * as newline-delimited JSON, then
 *   {type:"done", lesson, provider, model, ms}
 *   {type:"error", error}
 * The finished lesson is saved against the roadmap.
 */
export const POST = apiHandler(async (request) => {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Your session has expired. Please try again." }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await readJson(request, BodySchema);
  const roadmap = await legacyRoadmapRepo.get(body.roadmapId, userId);
  if (!roadmap) return NextResponse.json({ error: "That roadmap does not exist." }, { status: 404 });
  const ref = findRef(roadmap.map, body.key);
  const at = ref ? nodeAt(roadmap.map, ref) : null;
  if (!at) return NextResponse.json({ error: "That block is not in the roadmap." }, { status: 404 });

  const provider = PROVIDERS[roadmap.provider];
  const ctx = { topic: roadmap.topic, node: at.node, phase: at.phase, map: roadmap.map };
  const started = Date.now();

  return ndjson(async (emit) => {
    const { lesson, model } = await writeLesson(provider, ctx, body.model, emit, { userId });
    await legacyRoadmapRepo.saveLesson(roadmap.id, userId, body.key, lesson);
    emit({ type: "done", lesson, provider: provider.id, model, ms: Date.now() - started });
  });
});
