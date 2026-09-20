import { NextResponse } from "next/server";
import { z } from "zod";
import { settledVerdict, triageExercise } from "@/lib/ai/decide/exercise";
import { apiHandler, providerFrom, readJson } from "@/lib/api";
import { CODE_REVIEW_FEEDBACK_SYSTEM_PROMPT, CODE_REVIEW_SYSTEM_PROMPT, codeReviewPrompt } from "@/lib/prompt";
import { CodeReviewProseSchema, CodeReviewSchema, type CodeReview } from "@/lib/schema";

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

  // Whether the code works is a judgement about the code, not about how to word
  // the feedback, and the run already holds most of the evidence. Jev answers it
  // on its own; when it is sure, the provider is told the verdict and writes only
  // the prose. Unsure, or Jev unavailable, and the provider decides as before.
  const verdict = settledVerdict(await triageExercise(body));

  if (verdict) {
    const { output, model } = await provider.structured(
      {
        name: "code_review",
        schema: CodeReviewProseSchema,
        system: CODE_REVIEW_FEEDBACK_SYSTEM_PROMPT,
        user: codeReviewPrompt(body, verdict),
        effort: "minimal",
      },
      body.model,
    );
    const review: CodeReview = { verdict, ...output };
    return NextResponse.json({ review, model });
  }

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
