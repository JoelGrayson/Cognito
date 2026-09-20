import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { keepReachable } from "@/lib/links";
import { QUIZ_SYSTEM_PROMPT, TUTOR_SYSTEM_PROMPT, quizPrompt, tutorPrompt } from "@/lib/prompt";
import { PROVIDERS, listProviders } from "@/lib/providers";
import { ChatMessageSchema, LessonSchema, QuizSchema, TutorReplySchema, type Lesson, type Quiz } from "@/lib/schema";
import { findHelpfulVideo } from "@/lib/video";
import { topicsRouter } from "./topics";
import { publicProcedure, router } from "./trpc";

const ProviderIdSchema = z.enum(["cerebras", "anthropic", "openai", "chatgpt", "xai", "local"]);
const providerInput = {
  provider: ProviderIdSchema,
  model: z.string().optional(),
};

export const appRouter = router({
  topics: topicsRouter,

  providers: publicProcedure.query(async ({ ctx }) => {
    const session = await getAuth().api.getSession({ headers: ctx.headers });
    return listProviders(session ? { userId: session.user.id } : undefined);
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
