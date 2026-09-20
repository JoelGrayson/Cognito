import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { legacyRoadmapRepo } from "@/lib/repo";
import { allRefs, findRef, lessonKey, nodeAt } from "@/lib/roadmap";
import { LessonSchema, MindMapInputSchema, type MindMap } from "@/lib/schema";
import { publicProcedure, router } from "./trpc";

const ProviderIdSchema = z.enum(["anthropic", "openai", "chatgpt", "xai", "local"]);
const RoadmapId = z.string().uuid();
const LessonKey = z.string().trim().min(1).max(200);

const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const session = await getAuth().api.getSession({ headers: ctx.headers });
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Your session has expired. Please try again." });
  }
  return next({ ctx: { session } });
});

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "That roadmap does not exist." });

/** A roadmap row before anything has streamed in: the map is the bare topic. */
export function emptyMap(topic: string): MindMap {
  return { topic, summary: "", startingPoint: [], outcome: [], order: "mixed", plan: "", stages: [], nextSteps: [] };
}

/**
 * Roadmaps and lessons of the legacy (stage/block) flow. Rows are created here;
 * the streaming routes under /api/mindmap and /api/lesson fill them in.
 */
export const legacyRouter = router({
  list: protectedProcedure.query(({ ctx }) => legacyRoadmapRepo.list(ctx.session.user.id)),

  get: protectedProcedure.input(z.object({ id: RoadmapId })).query(async ({ input, ctx }) => {
    const userId = ctx.session.user.id;
    const roadmap = await legacyRoadmapRepo.get(input.id, userId);
    if (!roadmap) throw notFound();
    const lessonKeys = await legacyRoadmapRepo.lessonKeys(input.id, userId);
    return { roadmap, lessonKeys };
  }),

  /** Start a new roadmap. The page for it then streams the map in through /api/mindmap. */
  create: protectedProcedure
    .input(
      z.object({
        topic: z.string().trim().min(1, "Tell me what you want to learn.").max(500, "Keep the topic under 500 characters."),
        details: z.string().trim().max(2000, "Keep the details under 2000 characters.").optional(),
        provider: ProviderIdSchema,
      }),
    )
    .mutation(({ input, ctx }) =>
      legacyRoadmapRepo.create(ctx.session.user.id, {
        topic: input.topic,
        details: input.details || null,
        provider: input.provider,
        instruction: null,
        map: emptyMap(input.topic),
      }),
    ),

  /** The assistant revised a roadmap: it becomes a new one, keeping the lessons of the blocks it kept. */
  revise: protectedProcedure
    .input(
      z.object({
        id: RoadmapId,
        map: MindMapInputSchema,
        instruction: z.string().trim().min(1).max(2000),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const previous = await legacyRoadmapRepo.get(input.id, userId);
      if (!previous) throw notFound();
      const created = await legacyRoadmapRepo.create(userId, {
        topic: previous.topic,
        details: previous.details,
        provider: previous.provider,
        instruction: input.instruction,
        map: input.map,
        complete: true,
      });
      const kept = new Set(allRefs(input.map).map((ref) => lessonKey(nodeAt(input.map, ref)!.node)));
      const keys = (await legacyRoadmapRepo.lessonKeys(previous.id, userId)).filter((key) => kept.has(key));
      await legacyRoadmapRepo.copyLessons(previous.id, created.id, userId, keys);
      return created;
    }),

  /** The learner edited the map by hand; it is saved in place. */
  update: protectedProcedure
    .input(z.object({ id: RoadmapId, map: MindMapInputSchema }))
    .mutation(async ({ input, ctx }) => {
      const updated = await legacyRoadmapRepo.update(input.id, ctx.session.user.id, { map: input.map });
      if (!updated) throw notFound();
      return updated;
    }),

  delete: protectedProcedure.input(z.object({ id: RoadmapId })).mutation(async ({ input, ctx }) => {
    await legacyRoadmapRepo.delete(input.id, ctx.session.user.id);
  }),

  lesson: protectedProcedure.input(z.object({ id: RoadmapId, key: LessonKey })).query(async ({ input, ctx }) => {
    const userId = ctx.session.user.id;
    const roadmap = await legacyRoadmapRepo.get(input.id, userId);
    if (!roadmap) throw notFound();
    const ref = findRef(roadmap.map, input.key);
    if (!ref) throw new TRPCError({ code: "NOT_FOUND", message: "That block is not in the roadmap." });
    const lesson = await legacyRoadmapRepo.getLesson(input.id, userId, input.key);
    return { roadmap, ref, lesson };
  }),

  /** The tutor rewrote a lesson. */
  saveLesson: protectedProcedure
    .input(z.object({ id: RoadmapId, key: LessonKey, lesson: LessonSchema }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const roadmap = await legacyRoadmapRepo.get(input.id, userId);
      if (!roadmap) throw notFound();
      await legacyRoadmapRepo.saveLesson(input.id, userId, input.key, input.lesson);
    }),
});
