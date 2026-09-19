import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, readJson } from "@/lib/api";
import { deepgramConfigured, deepgramSpeak } from "@/lib/deepgram";

export const maxDuration = 30;

const BodySchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export const POST = apiHandler(async (request) => {
  if (!deepgramConfigured()) {
    return NextResponse.json({ error: "Voice is not configured." }, { status: 503 });
  }
  const { text } = await readJson(request, BodySchema);
  const upstream = await deepgramSpeak(text);
  if (!upstream.ok) {
    return NextResponse.json({ error: "Speech synthesis failed." }, { status: 502 });
  }
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
});
