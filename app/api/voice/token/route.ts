import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { deepgramConfigured, grantDeepgramToken } from "@/lib/deepgram";

export const GET = apiHandler(async () => {
  if (!deepgramConfigured()) {
    return NextResponse.json({ error: "Voice is not configured." }, { status: 503 });
  }
  const token = await grantDeepgramToken();
  return NextResponse.json(token, { headers: { "Cache-Control": "no-store" } });
});
