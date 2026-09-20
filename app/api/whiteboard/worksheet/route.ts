/**
 * Reads the PRINT on an uploaded worksheet page: forwards the rendered page to
 * Mathpix v3/text and hands back each printed line with where it sits, in the
 * image's own pixel space. The page decides which lines are problems
 * (lib/whiteboard/worksheet.ts); this route only reads.
 *
 * Same keys as the strokes route -- MATHPIX_APP_ID / MATHPIX_APP_KEY in .env.local.
 */
import { NextResponse } from "next/server";

export const maxDuration = 60;

const MATHPIX_URL = "https://api.mathpix.com/v3/text";
/** A rendered page is a few hundred KB as JPEG. Anything far past that is not a page. */
const MAX_IMAGE_CHARS = 8_000_000;

interface MathpixLine {
  text?: string;
  cnt?: [number, number][];
}

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

  const image = (body as { image?: unknown })?.image;
  if (typeof image !== "string" || !/^data:image\/(png|jpeg);base64,/.test(image)) {
    return NextResponse.json({ error: "Expected { image: <png or jpeg data URL> }." }, { status: 400 });
  }
  if (image.length > MAX_IMAGE_CHARS) {
    return NextResponse.json({ error: "That page image is too large." }, { status: 413 });
  }

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(MATHPIX_URL, {
      method: "POST",
      headers: { app_id: appId, app_key: appKey, "Content-Type": "application/json" },
      body: JSON.stringify({ src: image, formats: ["text"], include_line_data: true }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not reach Mathpix: ${error instanceof Error ? error.message : "unknown"}` },
      { status: 502 },
    );
  }

  const ms = Date.now() - started;
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    return NextResponse.json(
      { error: `Mathpix ${res.status}: ${data?.error ?? "no detail"}`, ms },
      { status: 502 },
    );
  }

  const lines = ((data?.line_data ?? []) as MathpixLine[]).flatMap((l) => {
    if (!l.text || !Array.isArray(l.cnt) || l.cnt.length === 0) return [];
    const xs = l.cnt.map((p) => p[0]);
    const ys = l.cnt.map((p) => p[1]);
    return [
      {
        text: l.text,
        bounds: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) },
      },
    ];
  });

  console.log(`[wb] worksheet page ${ms}ms lines=${lines.length}`);
  return NextResponse.json({ lines, ms });
}
