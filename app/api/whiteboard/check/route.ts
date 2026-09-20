import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, BadRequest, providerFrom, readJson } from "@/lib/api";
import type { ResolvedAction } from "@/lib/board";
import { CHECK_WORK_SYSTEM_PROMPT, checkWorkPrompt } from "@/lib/prompt";
import { WorkCheckSchema } from "@/lib/schema";

export const maxDuration = 120;

/** A picture of the page, as a data URL. 8 MB of base64 is roughly a 6 MB image. */
const BodySchema = z.object({
  image: z.string().max(8_000_000),
  width: z.number().positive().max(4000),
  height: z.number().positive().max(4000),
  note: z.string().max(500).optional(),
  provider: z.string(),
  model: z.string().optional(),
});

/** Look at a page of work and say what to draw on it. */
export const POST = apiHandler(async (request) => {
  const body = await readJson(request, BodySchema);
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(body.image)) {
    throw new BadRequest("The page must be a PNG, JPEG or WebP picture.");
  }
  const provider = providerFrom(body.provider);
  if (provider.id === "local" || provider.id === "xai") {
    throw new BadRequest(`${provider.label} cannot read pictures here. Switch the model to OpenAI or Claude.`);
  }

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
