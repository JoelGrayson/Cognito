import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import { deepgramConfigured, grantDeepgramToken } from "@/lib/deepgram";

export const GET = apiHandler(async (request) => {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Your session has expired. Please try again." }, { status: 401 });
  }
  if (!deepgramConfigured()) {
    return NextResponse.json({ error: "Voice is not configured." }, { status: 503 });
  }
  const token = await grantDeepgramToken();
  return NextResponse.json(token, { headers: { "Cache-Control": "no-store" } });
});
