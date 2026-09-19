import { z } from "zod";
import { apiHandler, providerFrom, readJson } from "@/lib/api";
import type { ResolvedAction } from "@/lib/board";
import { findImage } from "@/lib/images";
import { partialPlan } from "@/lib/drafts";
import { parsePartialJson } from "@/lib/partial-json";
import {
  EXPLAINER_PLAN_SYSTEM_PROMPT,
  SCENE_BOARD_SYSTEM_PROMPT,
  explainerPlanPrompt,
  sceneBoardPrompt,
} from "@/lib/prompt";
import { ExplainerPlanSchema, LessonSchema, SceneBoardSchema } from "@/lib/schema";
import { ndjson, throttle } from "@/lib/stream";

export const maxDuration = 120;

const BodySchema = z.object({
  topic: z.string().trim().min(1).max(500),
  lesson: LessonSchema,
  provider: z.string(),
  model: z.string().optional(),
});

/**
 * A narrated explainer: first the script, then each scene's whiteboard drawing.
 * Scenes are drawn in parallel and streamed as they finish, so playback can start
 * on scene one while the rest are still being drawn.
 *   {type:"plan", plan}              the script, as it is written
 *   {type:"scene", index, actions}   one scene's drawing
 *   {type:"done", scenes, model, ms}
 */
export const POST = apiHandler(async (request) => {
  const body = await readJson(request, BodySchema);
  const provider = providerFrom(body.provider);
  const { video, ...lesson } = body.lesson;
  void video;
  const started = Date.now();

  return ndjson(async (emit) => {
    const partial = throttle(emit);
    const planned = await provider.structured(
      {
        name: "explainer_plan",
        schema: ExplainerPlanSchema,
        system: EXPLAINER_PLAN_SYSTEM_PROMPT,
        user: explainerPlanPrompt({ topic: body.topic, lesson }),
        effort: "minimal",
        onText: (text) => {
          const draft = partialPlan(parsePartialJson(text));
          if (draft && draft.scenes.length > 0) partial({ type: "plan", plan: draft });
        },
      },
      body.model,
    );
    const plan = planned.output;
    emit({ type: "plan", plan });

    const drawn = await Promise.all(
      plan.scenes.map(async (scene, index) => {
        const board = await provider.structured(
          {
            name: "scene_board",
            schema: SceneBoardSchema,
            system: SCENE_BOARD_SYSTEM_PROMPT,
            user: sceneBoardPrompt({
              topic: body.topic,
              title: plan.title,
              index,
              total: plan.scenes.length,
              scene,
            }),
            effort: "minimal",
          },
          body.model,
        );
        const actions = (
          await Promise.all(
            board.output.actions.map(async (a): Promise<ResolvedAction | null> => {
              if (a.type !== "image") return a;
              const url = await findImage(a.query);
              return url ? { ...a, url } : null;
            }),
          )
        ).filter((a): a is ResolvedAction => a !== null);
        emit({ type: "scene", index, actions });
        return actions;
      }),
    );

    emit({ type: "done", scenes: drawn, model: planned.model, ms: Date.now() - started });
  });
});
