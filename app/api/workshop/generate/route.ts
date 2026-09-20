import { z } from "zod";
import { generateGraph, generateGraphWithProvider, pickProvider } from "@/lib/ai";
import { buildFallbackGraph } from "@/lib/graph/fallback";
import { applyKnownScope } from "@/lib/graph/known";
import { jsonError, parseBody, serverError } from "@/lib/http";
import { toLearnerProfile } from "@/lib/onboarding/profile";
import { onboardingRepo, roadmapRepo } from "@/lib/repo";
import { requireUserId } from "@/lib/session";
import type { DraftGraph, OnboardingProfile, OnboardingState } from "@/types/learning";

// Real graph generation can take a while.
export const maxDuration = 60;

const Body = z.object({ regenerate: z.boolean().optional() });

/** One in-flight generation per user, so a prefetch and a later request share the work. */
const g = globalThis as typeof globalThis & { __graphInflight?: Map<string, Promise<void>> };
const inflightGraphs = (g.__graphInflight ??= new Map());

/**
 * Unrated concepts enter the profile as level 0 so generation can run before the
 * learner rates anything, and so the model sees the concept names it should skip
 * once some are rated. The fills are generation input only — never persisted.
 */
function withConceptsAsKnowledge(profile: OnboardingProfile): OnboardingProfile {
  if (!profile.concepts?.length) return profile;
  const rated = new Set((profile.priorKnowledge ?? []).map((k) => k.concept));
  const fill = profile.concepts.filter((c) => !rated.has(c)).map((concept) => ({ concept, level: 0 as const }));
  return fill.length ? { ...profile, priorKnowledge: [...(profile.priorKnowledge ?? []), ...fill] } : profile;
}

/**
 * Returns the stored draft re-marked with the profile's current ratings — marking is
 * deterministic, so a graph generated during the questionnaire picks up later ratings
 * for free. Persists only when marking changed something; the linked roadmap record
 * (when the draft was resumed from one) gets the same update.
 */
async function respondWithStored(userId: string, state: OnboardingState) {
  const graph = applyKnownScope(state.draftGraph!, state.profile.priorKnowledge ?? []);
  if (graph !== state.draftGraph) {
    await onboardingRepo.update(userId, { draftGraph: graph });
    if (state.activeRoadmapId) {
      await roadmapRepo
        .update(state.activeRoadmapId, userId, { graph })
        .catch((error) => console.error("roadmap record sync failed", error));
    }
  }
  return Response.json({ graph, roadmapId: state.activeRoadmapId, usedFallback: false });
}

/**
 * Returns the stored draft graph, or generates one from the learner profile.
 * `regenerate: true` discards the stored draft and generates again.
 * Falls back to buildFallbackGraph when the AI call fails (spec section 5).
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    // An empty body is a normal first call; JSON means options like { regenerate: true }.
    const body = request.headers.get("content-type")?.includes("json") ? await parseBody(request, Body) : { ok: true as const, data: {} };
    if (!body.ok) return body.response;
    const regenerate = Boolean(body.data.regenerate);

    const state = await onboardingRepo.get(userId);
    if (state.draftGraph && !regenerate) return respondWithStored(userId, state);

    // A prefetch may already be generating; wait for it rather than starting a second call.
    if (!regenerate && inflightGraphs.has(userId)) {
      await inflightGraphs.get(userId)!.catch(() => {});
      const fresh = await onboardingRepo.get(userId);
      if (fresh.draftGraph) return respondWithStored(userId, fresh);
    }

    const learner = toLearnerProfile(withConceptsAsKnowledge(state.profile));
    if (!learner) return jsonError(["Finish the questionnaire first."], 400);

    const work = (async () => {
      let graph: DraftGraph;
      let usedFallback = false;
      try {
        // A provider picked on screen 1 goes through the provider layer; the default stays on lib/ai.
        const providerId = pickProvider(state.profile.provider);
        graph = providerId
          ? await generateGraphWithProvider(providerId, learner, { userId })
          : await generateGraph(learner);
      } catch (error) {
        console.error("workshop generate failed, using fallback graph", error);
        graph = buildFallbackGraph(state.profile);
        usedFallback = true;
      }
      graph = applyKnownScope(graph, learner.priorKnowledge);
      // Every generated draft becomes a record — the past-roadmaps list on screen 1 —
      // and the session links to it so later draft saves write through.
      const record = await roadmapRepo
        .create(userId, { title: graph.title, goal: learner.goal, graph })
        .catch((error) => {
          console.error("roadmap record failed", error);
          return null;
        });
      await onboardingRepo.update(userId, { draftGraph: graph, activeRoadmapId: record?.id ?? null });
      return Response.json({ graph, roadmapId: record?.id ?? null, usedFallback });
    })();
    inflightGraphs.set(userId, work.then(() => {}));
    try {
      return await work;
    } finally {
      inflightGraphs.delete(userId);
    }
  } catch (err) {
    return serverError(err);
  }
}
