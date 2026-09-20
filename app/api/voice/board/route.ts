import { NextResponse } from "next/server";
import { apiHandler, readJson } from "@/lib/api";
import { VoiceBoardSchema } from "@/lib/ai/voice-agent";
import type { ResolvedAction } from "@/lib/board";
import { findImage } from "@/lib/images";
import { getUserId } from "@/lib/session";

/** Resolve image tools server-side; the browser applies only validated actions. */
export const POST = apiHandler(async (request) => {
  if (!await getUserId()) return NextResponse.json({ error: "Your session expired. Rejoin the call to try again." }, { status: 401 });
  const { actions } = await readJson(request, VoiceBoardSchema);
  const resolved = await Promise.all(actions.map(async (action): Promise<ResolvedAction | null> => {
    if (action.type !== "image") return action;
    const url = await findImage(action.query);
    return url ? { ...action, url } : null;
  }));
  return NextResponse.json({ actions: resolved.filter((action) => action !== null) });
});
