import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, BadRequest, readJson } from "@/lib/api";
import { partialMindMap } from "@/lib/drafts";
import { parsePartialJson } from "@/lib/partial-json";
import { SYSTEM_PROMPT, userPrompt } from "@/lib/prompt";
import { PROVIDERS } from "@/lib/providers";
import { legacyRoadmapRepo } from "@/lib/repo";
import { MindMapSchema, type GenerateRequest } from "@/lib/schema";
import { ndjson, throttle } from "@/lib/stream";
import { getAuth } from "@/lib/auth";
import { tidyMap } from "@/lib/roadmap";

// Roadmap generation can take a while on reasoning models.
export const maxDuration = 120;

const BodySchema = z.object({
  /** A roadmap created through trpc.legacy.create, whose map is still empty. */
  roadmapId: z.string().uuid(),
  model: z.string().optional(),
});

/**
 * Writes the map of a roadmap row, streaming newline-delimited JSON as it goes:
 *   {type:"partial", mindMap}   as stages arrive
 *   {type:"done", mindMap, provider, model, ms}
 *   {type:"error", error}
 * The finished map (or the error) is saved on the row.
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
  if (roadmap.complete) throw new BadRequest("That roadmap is already written.");
  const provider = PROVIDERS[roadmap.provider];

  const req: GenerateRequest = { topic: roadmap.topic, details: roadmap.details ?? undefined };
  const started = Date.now();
  return ndjson(async (emit) => {
    const partial = throttle(emit);
    try {
      const result = await provider.structured(
        {
          name: "mind_map",
          schema: MindMapSchema,
          system: SYSTEM_PROMPT,
          user: userPrompt(req),
          effort: "minimal",
          onText: (text) => {
            const draft = partialMindMap(parsePartialJson(text));
            if (draft && draft.stages.length > 0) partial({ type: "partial", mindMap: draft });
          },
        },
        body.model,
        { userId },
      );
      const ms = Date.now() - started;
      const mindMap = tidyMap(result.output);
      await legacyRoadmapRepo.update(roadmap.id, userId, {
        map: mindMap,
        complete: true,
        error: null,
        model: result.model,
        generationMs: ms,
      });
      emit({ type: "done", mindMap, provider: provider.id, model: result.model, ms });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      await legacyRoadmapRepo.update(roadmap.id, userId, { error: message });
      throw error;
    }
  });
});
