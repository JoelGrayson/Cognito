import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, PAGE_IMAGE_MAX_CHARS, pageReaderFrom, readJson } from "@/lib/api";
import type { ResolvedAction } from "@/lib/board";
import { CHECK_WORK_SYSTEM_PROMPT, checkWorkPrompt } from "@/lib/prompt";
import { WorkCheckSchema } from "@/lib/schema";

export const maxDuration = 120;

const BodySchema = z.object({
  image: z.string().max(PAGE_IMAGE_MAX_CHARS),
  width: z.number().positive().max(4000),
  height: z.number().positive().max(4000),
  note: z.string().max(500).optional(),
  provider: z.string(),
  model: z.string().optional(),
});

/** Look at a page of work and say what to draw on it. */
export const POST = apiHandler(async (request) => {
  const body = await readJson(request, BodySchema);
  const provider = pageReaderFrom(body.provider, body.image);

  const started = Date.now();
  const { output, model } = await provider.structured(
    {
      name: "work_check",
      schema: WorkCheckSchema,
      system: CHECK_WORK_SYSTEM_PROMPT,
      user: checkWorkPrompt({ width: body.width, height: body.height, note: body.note }),
      image: body.image,
      effort: "low",
    },
    body.model,
  );

  // Marks are drawn straight onto the page; image lookups make no sense here.
  const marks = output.marks.filter((m): m is ResolvedAction => m.type !== "image").slice(0, 8);
  return NextResponse.json({ verdict: output.verdict, summary: output.summary, marks, model, ms: Date.now() - started });
});
