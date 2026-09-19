import { z } from "zod";
import { apiHandler, providerFrom, readJson } from "@/lib/api";
import { partialOutline } from "@/lib/drafts";
import { keepReachable } from "@/lib/links";
import { parsePartialJson } from "@/lib/partial-json";
import {
  EXTRAS_SYSTEM_PROMPT,
  PLAN_SYSTEM_PROMPT,
  SECTION_SYSTEM_PROMPT,
  extrasPrompt,
  planPrompt,
  sectionPrompt,
} from "@/lib/prompt";
import { ProviderError } from "@/lib/providers";
import {
  LessonExtrasSchema,
  LessonPlanSchema,
  MindMapSchema,
  NodeSchema,
  PhaseSchema,
  SectionBodySchema,
  type Lesson,
} from "@/lib/schema";
import { ndjson, throttle } from "@/lib/stream";
import { findVideo } from "@/lib/youtube";

export const maxDuration = 120;

const BodySchema = z.object({
  topic: z.string().trim().min(1).max(500),
  node: NodeSchema,
  phase: PhaseSchema,
  map: MindMapSchema,
  provider: z.string(),
  model: z.string().optional(),
});

/**
 * Writes a lesson in two phases and streams newline-delimited JSON:
 *   {type:"outline", outline}                    the plan, as it is written
 *   {type:"section", index, body, done}          each section, streamed in parallel
 *   {type:"resources", resources}                links that survived checking
 *   {type:"video", video}
 *   {type:"done", lesson, provider, model, ms}
 *   {type:"error", error}
 */
export const POST = apiHandler(async (request) => {
  const body = await readJson(request, BodySchema);
  const provider = providerFrom(body.provider);
  const ctx = { topic: body.topic, node: body.node, phase: body.phase, map: body.map };
  const started = Date.now();

  return ndjson(async (emit) => {
    // Further reading and the video do not depend on the plan, so they start now.
    const extrasWork = provider
      .structured(
        {
          name: "lesson_extras",
          schema: LessonExtrasSchema,
          system: EXTRAS_SYSTEM_PROMPT,
          user: extrasPrompt(ctx),
          effort: "minimal",
        },
        body.model,
      )
      .then(async ({ output }) => {
        const [resources, video] = await Promise.all([
          keepReachable(output.resources).then((resources) => {
            emit({ type: "resources", resources });
            return resources;
          }),
          findVideo(output.videoQuery).then((video) => {
            emit({ type: "video", video });
            return video;
          }),
        ]);
        return { resources, video, videoQuery: output.videoQuery };
      });

    // Phase 1: the plan, streamed so headings show up as they are written.
    const partial = throttle(emit);
    const planned = await provider.structured(
      {
        name: "lesson_plan",
        schema: LessonPlanSchema,
        system: PLAN_SYSTEM_PROMPT,
        user: planPrompt(ctx),
        effort: "minimal",
        onText: (text) => {
          const draft = partialOutline(parsePartialJson(text));
          if (draft) partial({ type: "outline", outline: draft });
        },
      },
      body.model,
    );
    const outline = planned.output;
    if (outline.sections.length === 0) throw new ProviderError("The lesson plan came back empty.", 502);
    emit({ type: "outline", outline });

    // Phase 2: every section at once.
    const bodies: string[] = outline.sections.map(() => "");
    const sectionWork = outline.sections.map(async (_, index) => {
      const push = throttle(emit);
      const result = await provider.structured(
        {
          name: "lesson_section",
          schema: SectionBodySchema,
          system: SECTION_SYSTEM_PROMPT,
          user: sectionPrompt({ ...ctx, outline, index }),
          effort: "minimal",
          onText: (text) => {
            const draft = parsePartialJson(text) as { body?: unknown } | undefined;
            if (draft && typeof draft.body === "string") {
              push({ type: "section", index, body: draft.body, done: false });
            }
          },
        },
        body.model,
      );
      bodies[index] = result.output.body;
      emit({ type: "section", index, body: result.output.body, done: true });
    });

    const settled = await Promise.allSettled(sectionWork);
    const failed = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
    if (failed) throw failed.reason;
    const { resources, video, videoQuery } = await extrasWork;

    const lesson: Lesson = {
      title: outline.title,
      summary: outline.summary,
      sections: outline.sections.map((s, i) => ({ heading: s.heading, body: bodies[i] })),
      keyTakeaways: outline.keyTakeaways,
      resources,
      videoQuery,
      video,
    };
    emit({ type: "done", lesson, provider: provider.id, model: planned.model, ms: Date.now() - started });
  });
});
