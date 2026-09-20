import { NextResponse } from "next/server";
import { z } from "zod";
import { gradePage } from "@/lib/ai";
import { apiHandler, PAGE_IMAGE_MAX_CHARS, pageReaderFrom, readJson } from "@/lib/api";
import type { ResolvedAction } from "@/lib/board";
import { getUserId } from "@/lib/session";

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
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Your session has expired. Please try again." }, { status: 401 });
  }
  const body = await readJson(request, BodySchema);
  const provider = pageReaderFrom(body.provider, body.image);

  const started = Date.now();
  const { page, model } = await gradePage(
    { image: body.image, width: body.width, height: body.height, answerKey: body.answerKey },
    provider,
    body.model,
    { userId },
  );

  const marks = page.marks.filter((m): m is ResolvedAction => m.type !== "image").slice(0, 12);
  return NextResponse.json({ ...page, marks, model, ms: Date.now() - started });
});
