import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { isProviderId, type ProviderId } from "@/lib/providers";
import { onboardingRepo, roadmapRepo } from "@/lib/repo";
import { LessonSchema } from "@/lib/schema";
import { findNode } from "@/lib/modules";
import { NodeId } from "@/types/learning";
import { protectedProcedure, router } from "./trpc";

/** The provider chosen on onboarding screen 1 writes and tutors every lesson. */
async function providerFor(userId: string): Promise<ProviderId> {
  const { profile } = await onboardingRepo.get(userId);
  return isProviderId(profile.provider) ? profile.provider : "anthropic";
}

const roadmapInput = z.object({ id: z.string().uuid() });
const moduleInput = roadmapInput.extend({ nodeId: NodeId });

/** The learner's roadmaps and the lessons written for their nodes. Every read is scoped to the owner. */
export const topicsRouter = router({
  list: protectedProcedure.query(({ ctx }) => roadmapRepo.list(ctx.session.user.id)),

  get: protectedProcedure.input(roadmapInput).query(async ({ input, ctx }) => {
    const userId = ctx.session.user.id;
    const roadmap = await roadmapRepo.get(input.id, userId);
    if (!roadmap) throw new TRPCError({ code: "NOT_FOUND", message: "Roadmap not found." });
    const [written, provider] = await Promise.all([roadmapRepo.lessonNodeIds(input.id, userId), providerFor(userId)]);
    return { roadmap, written, provider };
  }),

  delete: protectedProcedure.input(roadmapInput).mutation(async ({ input, ctx }) => {
    const userId = ctx.session.user.id;
    await roadmapRepo.delete(input.id, userId);
    // The workshop shows the active roadmap's draft; don't leave it pointing at a deleted one.
    const state = await onboardingRepo.get(userId);
    if (state.activeRoadmapId === input.id) {
      await onboardingRepo.update(userId, { activeRoadmapId: null, draftGraph: null });
    }
  }),

  lesson: protectedProcedure.input(moduleInput).query(async ({ input, ctx }) => {
    const userId = ctx.session.user.id;
    const roadmap = await roadmapRepo.get(input.id, userId);
    const node = roadmap && findNode(roadmap.graph, input.nodeId);
    if (!roadmap || !node) throw new TRPCError({ code: "NOT_FOUND", message: "Module not found." });
    const [lesson, written, provider] = await Promise.all([
      roadmapRepo.getLesson(input.id, userId, input.nodeId),
      roadmapRepo.lessonNodeIds(input.id, userId),
      providerFor(userId),
    ]);
    return { roadmap, node, lesson, written, provider };
  }),

  saveLesson: protectedProcedure
    .input(moduleInput.extend({ lesson: LessonSchema }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const roadmap = await roadmapRepo.get(input.id, userId);
      if (!roadmap || !findNode(roadmap.graph, input.nodeId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Module not found." });
      }
      await roadmapRepo.saveLesson(input.id, userId, input.nodeId, input.lesson);
    }),
});
