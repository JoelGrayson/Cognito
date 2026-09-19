import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, providerFrom, readJson } from "@/lib/api";
import { keepReachable } from "@/lib/links";
import { LESSON_SYSTEM_PROMPT, lessonPrompt } from "@/lib/prompt";
import { LessonContentSchema, MindMapSchema, NodeSchema, PhaseSchema, type Lesson } from "@/lib/schema";
import { findVideo } from "@/lib/youtube";

export const maxDuration = 120;

const BodySchema = z.object({
  topic: z.string().trim().min(1).max(500),
  node: NodeSchema,
  phase: PhaseSchema,
  map: MindMapSchema,
  provider: z.string(),
  model: z.string().optional(),
});

export const POST = apiHandler(async (request) => {
  const body = await readJson(request, BodySchema);
  const provider = providerFrom(body.provider);

  const started = Date.now();
  const result = await provider.structured(
    {
      name: "lesson",
      effort: "low",
      schema: LessonContentSchema,
      system: LESSON_SYSTEM_PROMPT,
      user: lessonPrompt({
        topic: body.topic,
        node: body.node,
        phase: body.phase,
        map: body.map,
      }),
    },
    body.model,
  );

  // Check the links the model gave us and find a real video, in parallel.
  const [resources, video] = await Promise.all([
    keepReachable(result.output.resources),
    findVideo(result.output.videoQuery),
  ]);
  const lesson: Lesson = { ...result.output, resources, video };

  return NextResponse.json({
    lesson,
    provider: provider.id,
    model: result.model,
    ms: Date.now() - started,
  });
});
