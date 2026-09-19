/**
 * Spike endpoint: forward tldraw strokes to Mathpix, time it, hand back the reading.
 * Mirrors the repo's existing route idiom (narrow validation, early returns,
 * NextResponse.json, maxDuration).
 *
 * Keys live server-side only -- MATHPIX_APP_ID / MATHPIX_APP_KEY in .env.local.
 */
import { NextResponse } from "next/server";
import { appendFixture } from "@/lib/whiteboard/fixtures";

export const maxDuration = 30;

const MATHPIX_URL = "https://api.mathpix.com/v3/strokes";

export async function POST(request: Request) {
  const appId = process.env.MATHPIX_APP_ID;
  const appKey = process.env.MATHPIX_APP_KEY;
  if (!appId || !appKey) {
    return NextResponse.json(
      { error: "Set MATHPIX_APP_ID and MATHPIX_APP_KEY in .env.local." },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const strokes = (body as { strokes?: { x?: unknown; y?: unknown } })?.strokes;
  if (!strokes || !Array.isArray(strokes.x) || !Array.isArray(strokes.y)) {
    return NextResponse.json({ error: "Expected { strokes: { x: number[][], y: number[][] } }." }, { status: 400 });
  }
  if (strokes.x.length !== strokes.y.length) {
    return NextResponse.json({ error: "strokes.x and strokes.y must be the same length." }, { status: 400 });
  }
  if (strokes.x.length === 0) {
    return NextResponse.json({ error: "Nothing written on the canvas yet." }, { status: 400 });
  }

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(MATHPIX_URL, {
      method: "POST",
      headers: { app_id: appId, app_key: appKey, "Content-Type": "application/json" },
      body: JSON.stringify({ strokes: { strokes }, formats: ["text", "latex_styled"] }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not reach Mathpix: ${error instanceof Error ? error.message : "unknown"}` },
      { status: 502 },
    );
  }

  const ms = Date.now() - started;
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    return NextResponse.json(
      { error: `Mathpix ${res.status}: ${data?.error ?? "no detail"}`, ms },
      { status: 502 },
    );
  }

  // Every real reading is saved to fixtures/ so the pipeline downstream of the pen
  // can be re-tested forever without a human writing on a tablet again. Handwriting
  // is the one input we cannot synthesize -- so capture it once, replay it always.
  void appendFixture({
    strokes: strokes as { x: number[][]; y: number[][] },
    text: data?.text ?? "",
    latex: data?.latex_styled ?? "",
    confidence: data?.confidence ?? null,
    ms,
  });

  // Logged so accuracy can be reviewed from the terminal, not just the browser.
  console.log(
    `[spike] ${ms}ms  strokes=${strokes.x.length}  conf=${data?.confidence?.toFixed?.(2) ?? "?"}  read="${data?.latex_styled ?? data?.text ?? ""}"`,
  );

  return NextResponse.json({
    text: data?.text ?? "",
    latex: data?.latex_styled ?? "",
    // Mathpix reports its own confidence; the interrupt policy's R4 gate depends on it.
    confidence: data?.confidence ?? null,
    ms,
    strokeCount: strokes.x.length,
  });
}
