import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, providerFrom, readJson } from "@/lib/api";
import { EXERCISE_SYSTEM_PROMPT, exercisePrompt } from "@/lib/prompt";
import { ExerciseSchema, LessonSchema } from "@/lib/schema";

export const maxDuration = 60;

const BodySchema = z.object({
  topic: z.string().trim().min(1).max(500),
  lesson: LessonSchema,
  provider: z.string(),
  model: z.string().optional(),
});

/** One coding exercise for a lesson: task, starter code, solution and test expressions. */
export const POST = apiHandler(async (request) => {
  const body = await readJson(request, BodySchema);
  const provider = providerFrom(body.provider);
  const { video, ...lesson } = body.lesson;
  void video;
  const started = Date.now();
  const { output, model } = await provider.structured(
    {
      name: "exercise",
      schema: ExerciseSchema,
      system: EXERCISE_SYSTEM_PROMPT,
      user: exercisePrompt({ topic: body.topic, lesson }),
      effort: "low",
    },
    body.model,
  );
  return NextResponse.json({ exercise: output, model, ms: Date.now() - started });
});
