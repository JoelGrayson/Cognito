import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, PAGE_IMAGE_MAX_CHARS, pageReaderFrom, readJson } from "@/lib/api";
import type { ResolvedAction } from "@/lib/board";
import { GRADE_PAGE_SYSTEM_PROMPT, gradePagePrompt } from "@/lib/prompt";
import { GradedPageSchema } from "@/lib/schema";

export const maxDuration = 120;

const BodySchema = z.object({
  image: z.string().max(PAGE_IMAGE_MAX_CHARS),
  width: z.number().positive().max(4000),
  height: z.number().positive().max(4000),
  answerKey: z.string().max(4000).optional(),
  provider: z.string(),
  model: z.string().optional(),
});

/** Grade one page of one student's worksheet. The class is graded a page at a time. */
export const POST = apiHandler(async (request) => {
  const body = await readJson(request, BodySchema);
  const provider = pageReaderFrom(body.provider, body.image);

  const started = Date.now();
  const { output, model } = await provider.structured(
    {
      name: "graded_page",
      schema: GradedPageSchema,
      system: GRADE_PAGE_SYSTEM_PROMPT,
      user: gradePagePrompt({ width: body.width, height: body.height, answerKey: body.answerKey }),
      image: body.image,
      effort: "low",
    },
    body.model,
  );

  const marks = output.marks.filter((m): m is ResolvedAction => m.type !== "image").slice(0, 12);
  return NextResponse.json({ ...output, marks, model, ms: Date.now() - started });
});
