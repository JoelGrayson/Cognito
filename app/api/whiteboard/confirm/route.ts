/**
 * Is this step really wrong? Asked between the checker and the tutor's mouth.
 *
 * The board runs in the browser and the Jev key is server-side, so the gate the
 * policy needs (`StepState.errorConfidence`) is fetched here. It answers in
 * ~200ms, which is why it can sit in the path of every wrong-looking line, and
 * it returns `confidence: null` when Jev is not configured: the caller then
 * behaves exactly as it did before this route existed.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, readJson } from "@/lib/api";
import { confirmError } from "@/lib/ai/decide/whiteboard";
import type { Equivalence } from "@/lib/whiteboard/checker/numeric";

export const maxDuration = 15;

const WitnessSchema = z.object({
  variable: z.string(),
  at: z.number(),
  previousValue: z.number(),
  currentValue: z.number(),
});

const VerdictSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("equivalent"), scale: z.number() }),
  z.object({ kind: z.literal("direction"), expected: z.string(), got: z.string(), scale: z.number() }),
  z.object({ kind: z.literal("not-equivalent"), witness: WitnessSchema }),
  z.object({ kind: z.literal("rescaled"), by: z.number() }),
  z.object({ kind: z.literal("undetermined"), why: z.string() }),
]);

const BodySchema = z.object({
  premise: z.string().min(1).max(2000),
  current: z.string().min(1).max(2000),
  verdict: VerdictSchema,
});

export const POST = apiHandler(async (request) => {
  const body = await readJson(request, BodySchema);
  const confirmed = await confirmError({ ...body, verdict: body.verdict as Equivalence });
  return NextResponse.json(confirmed ?? { confidence: null });
});
