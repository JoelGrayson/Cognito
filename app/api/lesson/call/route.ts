import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, providerFrom, readJson } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import type { ResolvedAction } from "@/lib/board";
import { findImage } from "@/lib/images";
import { CALL_SYSTEM_PROMPT, callPrompt } from "@/lib/prompt";
import { LessonSchema, TutorTurnSchema } from "@/lib/schema";

export const maxDuration = 60;

const BodySchema = z.object({
  topic: z.string().trim().min(1).max(500),
  lesson: LessonSchema,
  /** The board as text, from describeBoard(). */
  board: z.string().max(12000),
  transcript: z
    .array(z.object({ role: z.enum(["tutor", "learner"]), text: z.string().max(2000) }))
    .max(60),
  provider: z.string(),
  model: z.string().optional(),
});

/** One tutor turn in a video lesson: what to say, what to draw, and what to wait for. */
export const POST = apiHandler(async (request) => {
  const body = await readJson(request, BodySchema);
  const provider = providerFrom(body.provider);
  const session = await getAuth().api.getSession({ headers: request.headers });
  // The model sees the lesson content, not the server-resolved video.
  const { video, ...lesson } = body.lesson;
  void video;

  const started = Date.now();
  const { output, model } = await provider.structured(
    {
      name: "tutor_turn",
      schema: TutorTurnSchema,
      system: CALL_SYSTEM_PROMPT,
      user: callPrompt({ topic: body.topic, lesson, board: body.board, transcript: body.transcript }),
      effort: "minimal",
    },
    body.model,
    session ? { userId: session.user.id } : undefined,
  );

  // Turn image searches into real pictures; drop any that find nothing.
  const actions = (
    await Promise.all(
      output.actions.map(async (a): Promise<ResolvedAction | null> => {
        if (a.type !== "image") return a;
        const url = await findImage(a.query);
        return url ? { ...a, url } : null;
      }),
    )
  ).filter((a): a is ResolvedAction => a !== null);

  return NextResponse.json({ say: output.say, actions, next: output.next, model, ms: Date.now() - started });
});
