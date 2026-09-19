import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, providerFrom, readJson } from "@/lib/api";
import { QUIZ_SYSTEM_PROMPT, quizPrompt } from "@/lib/prompt";
import { LessonSchema, QuizSchema, type Quiz } from "@/lib/schema";

export const maxDuration = 120;

const BodySchema = z.object({
  lesson: LessonSchema,
  provider: z.string(),
  model: z.string().optional(),
});

export const POST = apiHandler(async (request) => {
  const body = await readJson(request, BodySchema);
  const provider = providerFrom(body.provider);
  const { video: _video, ...content } = body.lesson;
  void _video;

  const started = Date.now();
  const result = await provider.structured(
    {
      name: "quiz",
      effort: "low",
      schema: QuizSchema,
      system: QUIZ_SYSTEM_PROMPT,
      user: quizPrompt(content),
    },
    body.model,
  );

  // Models occasionally miscount; keep the quiz self-consistent.
  const quiz: Quiz = {
    questions: result.output.questions
      .filter((q) => q.choices.length >= 2)
      .map((q) => ({
        ...q,
        answer: Math.min(Math.max(Math.round(q.answer), 0), q.choices.length - 1),
      })),
  };

  return NextResponse.json({
    quiz,
    provider: provider.id,
    model: result.model,
    ms: Date.now() - started,
  });
});
