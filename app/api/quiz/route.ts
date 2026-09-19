import { z } from "zod";
import { apiHandler, providerFrom, readJson } from "@/lib/api";
import { partialQuiz } from "@/lib/drafts";
import { parsePartialJson } from "@/lib/partial-json";
import { QUIZ_SYSTEM_PROMPT, quizPrompt } from "@/lib/prompt";
import { LessonSchema, QuizSchema, type Quiz } from "@/lib/schema";
import { ndjson, throttle } from "@/lib/stream";
import { getAuth } from "@/lib/auth";

export const maxDuration = 120;

const BodySchema = z.object({
  lesson: LessonSchema,
  provider: z.string(),
  model: z.string().optional(),
});

/**
 * Streams newline-delimited JSON:
 *   {type:"partial", questions}                 questions as they are written
 *   {type:"done", quiz, provider, model, ms}
 *   {type:"error", error}
 */
export const POST = apiHandler(async (request) => {
  const session = await getAuth().api.getSession({ headers: request.headers });
  const body = await readJson(request, BodySchema);
  const provider = providerFrom(body.provider);
  const { video: _video, ...content } = body.lesson;
  void _video;
  const started = Date.now();

  return ndjson(async (emit) => {
    const partial = throttle(emit);
    const result = await provider.structured(
      {
        name: "quiz",
        schema: QuizSchema,
        system: QUIZ_SYSTEM_PROMPT,
        user: quizPrompt(content),
        effort: "minimal",
        onText: (text) => {
          const questions = partialQuiz(parsePartialJson(text));
          if (questions && questions.length > 0) partial({ type: "partial", questions });
        },
      },
      body.model,
      session ? { userId: session.user.id } : undefined,
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
    emit({ type: "done", quiz, provider: provider.id, model: result.model, ms: Date.now() - started });
  });
});
