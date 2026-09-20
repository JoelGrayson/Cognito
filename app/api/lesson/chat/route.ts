import { z } from "zod";
import { apiHandler, BadRequest, providerFrom, readJson } from "@/lib/api";
import { keepReachable } from "@/lib/links";
import { parsePartialJson } from "@/lib/partial-json";
import { TUTOR_ANSWER_SYSTEM_PROMPT, TUTOR_SYSTEM_PROMPT, tutorPrompt } from "@/lib/prompt";
import { answerOnly, routeTutorTurn } from "@/lib/ai/decide/chat";
import {
  ChatMessageSchema,
  LessonSchema,
  TutorAnswerSchema,
  TutorReplySchema,
  type Lesson,
  type LessonContent,
} from "@/lib/schema";
import { ndjson, throttle } from "@/lib/stream";
import { findHelpfulVideo } from "@/lib/video";
import { getAuth } from "@/lib/auth";

export const maxDuration = 120;

const BodySchema = z.object({
  topic: z.string().trim().min(1).max(500),
  lesson: LessonSchema,
  messages: z
    .array(ChatMessageSchema.extend({ content: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(40),
  provider: z.string(),
  model: z.string().optional(),
});

/**
 * Streams newline-delimited JSON:
 *   {type:"reply", reply}                              the answer, as it is written
 *   {type:"done", reply, lesson|null, provider, model, ms}
 *   {type:"error", error}
 */
export const POST = apiHandler(async (request) => {
  const session = await getAuth().api.getSession({ headers: request.headers });
  const body = await readJson(request, BodySchema);
  const provider = providerFrom(body.provider);
  const last = body.messages[body.messages.length - 1];
  if (last.role !== "user") throw new BadRequest("The last message must be from the learner.");

  // The model sees the lesson content, not the server-resolved video.
  const { video, ...content } = body.lesson;
  const started = Date.now();

  // Most turns are questions, and a question does not need a response format that
  // can hold a whole rewritten lesson. Jev says which kind of turn this is; only a
  // confident "answer" narrows the schema, and no Jev at all keeps the wide one.
  const asked = answerOnly(await routeTutorTurn(content, body.messages));

  return ndjson(async (emit) => {
    const partial = throttle(emit);
    const result = await provider.structured(
      {
        name: asked ? "tutor_answer" : "tutor_reply",
        schema: asked ? TutorAnswerSchema : TutorReplySchema,
        system: asked ? TUTOR_ANSWER_SYSTEM_PROMPT : TUTOR_SYSTEM_PROMPT,
        user: tutorPrompt(body.topic, content, body.messages),
        effort: "minimal",
        onText: (text) => {
          const draft = parsePartialJson(text) as { reply?: unknown } | undefined;
          if (draft && typeof draft.reply === "string") partial({ type: "reply", reply: draft.reply });
        },
      },
      body.model,
      session ? { userId: session.user.id } : undefined,
    );

    let lesson: Lesson | null = null;
    // Absent by construction on the answer-only schema, null when nothing changed.
    const output: { reply: string; updatedLesson?: LessonContent | null } = result.output;
    const updated = output.updatedLesson ?? null;
    if (updated) {
      const sameVideo = updated.videoQuery.trim() === content.videoQuery.trim();
      const [resources, newVideo] = await Promise.all([
        keepReachable(updated.resources),
        sameVideo
          ? Promise.resolve(video)
          : findHelpfulVideo(
              provider,
              { topic: body.topic, lesson: updated.title, summary: updated.summary },
              updated.videoQuery,
              body.model,
              session ? { userId: session.user.id } : undefined,
            ),
      ]);
      lesson = { ...updated, resources, video: newVideo };
    }

    emit({
      type: "done",
      reply: output.reply,
      lesson,
      provider: provider.id,
      model: result.model,
      ms: Date.now() - started,
    });
  });
});
