import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { keepReachable } from "@/lib/links";
import { writeLesson } from "@/lib/lesson";
import {
  QUIZ_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  TUTOR_SYSTEM_PROMPT,
  quizPrompt,
  tutorPrompt,
  userPrompt,
} from "@/lib/prompt";
import { PROVIDERS, listProviders } from "@/lib/providers";
import {
  ChatMessageSchema,
  LessonSchema,
  MindMapInputSchema,
  MindMapSchema,
  NodeSchema,
  PhaseSchema,
  QuizSchema,
  TutorReplySchema,
  type GenerateRequest,
  type Lesson,
  type Quiz,
} from "@/lib/schema";
import { findHelpfulVideo } from "@/lib/video";
import { publicProcedure, router } from "./trpc";

const ProviderIdSchema = z.enum(["anthropic", "openai", "chatgpt", "xai", "local"]);
const providerInput = {
  provider: ProviderIdSchema,
  model: z.string().optional(),
};

const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const session = await getAuth().api.getSession({ headers: ctx.headers });
  if (!session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Your session has expired. Please try again.",
    });
  }
  return next({ ctx: { session } });
});

export const appRouter = router({
  providers: publicProcedure.query(async ({ ctx }) => {
    const session = await getAuth().api.getSession({ headers: ctx.headers });
    return listProviders(session ? { userId: session.user.id } : undefined);
  }),

  mindMap: protectedProcedure
    .input(
      z.object({
        topic: z.string().trim().min(1, "Tell me what you want to learn.").max(500, "Keep the topic under 500 characters."),
        ...providerInput,
        current: MindMapInputSchema.optional(),
        instruction: z.string().trim().max(2000, "Keep the modification under 2000 characters.").optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const provider = PROVIDERS[input.provider];
      const request: GenerateRequest = { topic: input.topic };

      if (input.current !== undefined || input.instruction !== undefined) {
        if (!input.current) throw new TRPCError({ code: "BAD_REQUEST", message: "The current roadmap is required." });
        if (!input.instruction) throw new TRPCError({ code: "BAD_REQUEST", message: "Tell me what to change." });
        request.current = input.current;
        request.instruction = input.instruction;
      }

      const started = Date.now();
      const result = await provider.structured(
        { name: "mind_map", schema: MindMapSchema, system: SYSTEM_PROMPT, user: userPrompt(request) },
        input.model,
        { userId: ctx.session.user.id },
      );

      return {
        mindMap: result.output,
        provider: provider.id,
        model: result.model,
        ms: Date.now() - started,
      };
    }),

  lesson: publicProcedure
    .input(
      z.object({
        topic: z.string().trim().min(1).max(500),
        node: NodeSchema,
        phase: PhaseSchema,
        map: MindMapInputSchema,
        ...providerInput,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const session = await getAuth().api.getSession({ headers: ctx.headers });
      const provider = PROVIDERS[input.provider];
      const started = Date.now();
      // Same two-phase pipeline as the streaming route, without the progress events.
      const { lesson, model } = await writeLesson(
        provider,
        { topic: input.topic, node: input.node, phase: input.phase, map: input.map },
        input.model,
        () => {},
        session ? { userId: session.user.id } : undefined,
      );

      return { lesson, provider: provider.id, model, ms: Date.now() - started };
    }),

  tutor: publicProcedure
    .input(
      z.object({
        topic: z.string().trim().min(1).max(500),
        lesson: LessonSchema,
        messages: z
          .array(ChatMessageSchema.extend({ content: z.string().trim().min(1).max(4000) }))
          .min(1)
          .max(40),
        ...providerInput,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const session = await getAuth().api.getSession({ headers: ctx.headers });
      const last = input.messages.at(-1);
      if (last?.role !== "user") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The last message must be from the learner." });
      }

      const provider = PROVIDERS[input.provider];
      const { video, ...content } = input.lesson;
      const started = Date.now();
      const result = await provider.structured(
        {
          name: "tutor_reply",
          effort: "low",
          schema: TutorReplySchema,
          system: TUTOR_SYSTEM_PROMPT,
          user: tutorPrompt(input.topic, content, input.messages),
        },
        input.model,
        session ? { userId: session.user.id } : undefined,
      );

      let lesson: Lesson | null = null;
      const updated = result.output.updatedLesson;
      if (updated) {
        const sameVideo = updated.videoQuery.trim() === content.videoQuery.trim();
        const [resources, newVideo] = await Promise.all([
          keepReachable(updated.resources),
          sameVideo
            ? Promise.resolve(video)
            : findHelpfulVideo(
                provider,
                { topic: input.topic, lesson: updated.title, summary: updated.summary },
                updated.videoQuery,
                input.model,
                session ? { userId: session.user.id } : undefined,
              ),
        ]);
        lesson = { ...updated, resources, video: newVideo };
      }

      return {
        reply: result.output.reply,
        lesson,
        provider: provider.id,
        model: result.model,
        ms: Date.now() - started,
      };
    }),

  quiz: publicProcedure
    .input(z.object({ lesson: LessonSchema, ...providerInput }))
    .mutation(async ({ input, ctx }) => {
      const session = await getAuth().api.getSession({ headers: ctx.headers });
      const provider = PROVIDERS[input.provider];
      const { video: _video, ...content } = input.lesson;
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
        input.model,
        session ? { userId: session.user.id } : undefined,
      );
      const quiz: Quiz = {
        questions: result.output.questions
          .filter((question) => question.choices.length >= 2)
          .map((question) => ({
            ...question,
            answer: Math.min(Math.max(Math.round(question.answer), 0), question.choices.length - 1),
          })),
      };

      return { quiz, provider: provider.id, model: result.model, ms: Date.now() - started };
    }),
});

export type AppRouter = typeof appRouter;
