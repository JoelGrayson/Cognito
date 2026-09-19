import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, providerFrom, readJson } from "@/lib/api";
import { CODE_REVIEW_SYSTEM_PROMPT, codeReviewPrompt } from "@/lib/prompt";
import { CodeReviewSchema } from "@/lib/schema";

export const maxDuration = 60;

const BodySchema = z.object({
  exercise: z.object({
    title: z.string().max(200),
    language: z.string().max(40),
    task: z.string().max(4000),
    tests: z.array(z.object({ name: z.string().max(300), expression: z.string().max(1000) })).max(12),
  }),
  code: z.string().max(20000),
  /** Present when the code ran in the browser. */
  run: z
    .object({
      output: z.array(z.string().max(2000)).max(200),
      error: z.string().max(4000).nullable(),
      results: z
        .array(z.object({ name: z.string().max(300), pass: z.boolean(), error: z.string().max(1000).optional() }))
        .max(12),
    })
    .nullable(),
  provider: z.string(),
  model: z.string().optional(),
});

/** Tutor feedback on the learner's code. */
export const POST = apiHandler(async (request) => {
  const body = await readJson(request, BodySchema);
  const provider = providerFrom(body.provider);
  const { output, model } = await provider.structured(
    {
      name: "code_review",
      schema: CodeReviewSchema,
      system: CODE_REVIEW_SYSTEM_PROMPT,
      user: codeReviewPrompt(body),
      effort: "minimal",
    },
    body.model,
  );
  return NextResponse.json({ review: output, model });
});
