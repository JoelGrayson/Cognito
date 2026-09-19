import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, BadRequest, providerFrom, readJson } from "@/lib/api";
import { keepReachable } from "@/lib/links";
import { TUTOR_SYSTEM_PROMPT, tutorPrompt } from "@/lib/prompt";
import { ChatMessageSchema, LessonSchema, TutorReplySchema, type Lesson } from "@/lib/schema";
import { findVideo } from "@/lib/youtube";

export const maxDuration = 120;

const BodySchema = z.object({
  topic: z.string().trim().min(1).max(500),
  lesson: LessonSchema,
  messages: z
    .array(
      ChatMessageSchema.extend({
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
  provider: z.string(),
  model: z.string().optional(),
});

export const POST = apiHandler(async (request) => {
  const body = await readJson(request, BodySchema);
  const provider = providerFrom(body.provider);
  const last = body.messages[body.messages.length - 1];
  if (last.role !== "user") throw new BadRequest("The last message must be from the learner.");

  // The model sees the lesson content, not the server-resolved video.
  const { video, ...content } = body.lesson;

  const started = Date.now();
  const result = await provider.structured(
    {
      name: "tutor_reply",
      effort: "low",
      schema: TutorReplySchema,
      system: TUTOR_SYSTEM_PROMPT,
      user: tutorPrompt(body.topic, content, body.messages),
    },
    body.model,
  );

  let lesson: Lesson | null = null;
  const updated = result.output.updatedLesson;
  if (updated) {
    const sameVideo = updated.videoQuery.trim() === content.videoQuery.trim();
    const [resources, newVideo] = await Promise.all([
      keepReachable(updated.resources),
      sameVideo ? Promise.resolve(video) : findVideo(updated.videoQuery),
    ]);
    lesson = { ...updated, resources, video: newVideo };
  }

  return NextResponse.json({
    reply: result.output.reply,
    lesson,
    provider: provider.id,
    model: result.model,
    ms: Date.now() - started,
  });
});
