import { z } from "zod";
import { apiHandler, providerFrom, readJson } from "@/lib/api";
import { writeLesson } from "@/lib/lesson";
import { MindMapSchema, NodeSchema, PhaseSchema } from "@/lib/schema";
import { ndjson } from "@/lib/stream";
import { getAuth } from "@/lib/auth";

export const maxDuration = 120;

const BodySchema = z.object({
  topic: z.string().trim().min(1).max(500),
  node: NodeSchema,
  phase: PhaseSchema,
  map: MindMapSchema,
  provider: z.string(),
  model: z.string().optional(),
});

/**
 * Streams the lesson as newline-delimited JSON: the progress events from
 * `writeLesson` (outline, section, resources, video), then
 *   {type:"done", lesson, provider, model, ms}
 *   {type:"error", error}
 */
export const POST = apiHandler(async (request) => {
  const session = await getAuth().api.getSession({ headers: request.headers });
  const body = await readJson(request, BodySchema);
  const provider = providerFrom(body.provider);
  const ctx = { topic: body.topic, node: body.node, phase: body.phase, map: body.map };
  const started = Date.now();

  return ndjson(async (emit) => {
    const { lesson, model } = await writeLesson(provider, ctx, body.model, emit, session ? { userId: session.user.id } : undefined);
    emit({ type: "done", lesson, provider: provider.id, model, ms: Date.now() - started });
  });
});
