/**
 * Reads ONE hand-drawn chemical structure: forwards a picture of it to Mathpix v3/text
 * with chemistry on, and hands back the SMILES.
 *
 * One structure per picture, always. Given two molecules in one image Mathpix returns
 * the first and drops the second without saying so; the caller cuts the page up first
 * (lib/whiteboard/cluster.ts).
 *
 * Same keys as the other Mathpix routes -- MATHPIX_APP_ID / MATHPIX_APP_KEY.
 */
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

export const maxDuration = 30;

const MATHPIX_URL = "https://api.mathpix.com/v3/text";
/** Below this Mathpix is not sure, and a second reader is asked. Same number the page
 *  uses to decide whether to trust a reading (structure-key.ts). */
const SECOND_OPINION_BELOW = 0.9;
const GEMINI_MODEL = process.env.GEMINI_STRUCTURE_MODEL || "gemini-3.8-flash";

/**
 * The second reader. Mathpix is fast (~0.4s) but was trained on tidy diagrams: on a
 * real stylus it read a 2-butanol as the letter "Y" and a toluene as "(Ei)". Gemini
 * Flash read all five real drawings in the fixtures correctly, at 2-7s each, so it is
 * asked only when Mathpix finds nothing or is unsure. (gpt-4.1 got 3 of 3 wrong and
 * gpt-5 returned nothing in 30s; that is why it is this model.)
 *
 * It READS, it does not judge: it is never told the question or the answer.
 */
async function secondReading(image: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "You read hand-drawn skeletal (line-angle) chemical structures. Reply with ONLY the SMILES of the molecule drawn, exactly as drawn, even if it looks chemically wrong. If it is not a chemical structure, reply NONE." }],
        },
        contents: [{ parts: [{ inlineData: { mimeType: "image/png", data: image.split(",")[1] } }, { text: "SMILES?" }] }],
        // "low", measured: default thinking read the same drawings no better and once
        // took 60s. Low keeps all of them right at 3-7s. ("minimal" is refused.)
        generationConfig: { temperature: 0, thinkingConfig: { thinkingLevel: "low" } },
      }),
    });
    const data = await res.json().catch(() => null);
    const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("").trim() ?? "";
    // One token of SMILES, or nothing. Prose means it did not follow the instruction.
    return /^[A-Za-z0-9@+\-\[\]()=#$\\/%.:]{1,200}$/.test(text) && text !== "NONE" ? text : null;
  } catch {
    return null;
  }
}
const MAX_IMAGE_CHARS = 4_000_000;
const FIXTURE_DIR = join(process.cwd(), "fixtures", "structures");

/**
 * Hand-drawn molecules are the one input that cannot be synthesised, so every real
 * drawing is kept: the picture, what Mathpix made of it, and what the person says they
 * meant. That last field is what turns a pile of readings into an accuracy number.
 */
async function capture(image: string, reading: object) {
  // Dev-only: the filesystem is read-only on serverless hosts.
  if (process.env.NODE_ENV === "production") return;
  try {
    await mkdir(FIXTURE_DIR, { recursive: true });
    // The page sends every drawing at once, and two in the same millisecond would share
    // a file name: the second picture replaces the first while both rows point at it.
    const ts = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
    await writeFile(join(FIXTURE_DIR, `${ts}.png`), Buffer.from(image.split(",")[1], "base64"));
    await appendFile(join(FIXTURE_DIR, "readings.jsonl"), JSON.stringify({ ts, ...reading }) + "\n", "utf8");
  } catch (err) {
    console.warn("[fixtures] structure capture failed (ignored):", err);
  }
}

export async function POST(request: Request) {
  const appId = process.env.MATHPIX_APP_ID;
  const appKey = process.env.MATHPIX_APP_KEY;
  if (!appId || !appKey) {
    return NextResponse.json({ error: "Set MATHPIX_APP_ID and MATHPIX_APP_KEY in .env.local." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const { image, intended } = (body ?? {}) as { image?: unknown; intended?: unknown };
  if (typeof image !== "string" || !/^data:image\/png;base64,/.test(image)) {
    return NextResponse.json({ error: "Expected { image: <png data URL> }." }, { status: 400 });
  }
  if (image.length > MAX_IMAGE_CHARS) {
    return NextResponse.json({ error: "That picture is too large." }, { status: 413 });
  }

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(MATHPIX_URL, {
      method: "POST",
      headers: { app_id: appId, app_key: appKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ src: image, formats: ["text"], include_smiles: true, include_line_data: true }),
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
    return NextResponse.json({ error: `Mathpix ${res.status}: ${data?.error ?? "no detail"}`, ms }, { status: 502 });
  }

  const text: string = data?.text ?? "";
  const found = [...text.matchAll(/<smiles[^>]*>(.*?)<\/smiles>/g)].map((m) => m[1]);
  const diagram = (data?.line_data ?? []).find((l: { subtype?: string }) => l.subtype === "chemistry");
  const mathpixSmiles = found[0] ?? null;
  const mathpixConfidence = (diagram?.confidence ?? data?.confidence ?? null) as number | null;
  // No score is no evidence of being above the bar, so it counts as unsure.
  const unsure = !mathpixSmiles || mathpixConfidence === null || mathpixConfidence < SECOND_OPINION_BELOW;
  const second = unsure ? await secondReading(image) : null;

  const reading = {
    smiles: second ?? mathpixSmiles,
    reader: (second ? "gemini" : mathpixSmiles ? "mathpix" : null) as "gemini" | "mathpix" | null,
    /** Kept beside a second reading so the page can see whether the two agree. */
    mathpixSmiles,
    /** More than one means the cut was wrong and two drawings shared a picture. */
    structuresSeen: found.length,
    confidence: mathpixConfidence,
    text,
    ms: Date.now() - started,
  };

  void capture(image, { ...reading, intended: typeof intended === "string" ? intended.slice(0, 200) : "" });
  console.log(`[wb] structure ${reading.ms}ms reader=${reading.reader ?? "none"} mathpix=${mathpixSmiles ?? "(none)"} conf=${reading.confidence?.toFixed(2) ?? "?"} smiles=${reading.smiles ?? "(none)"} text="${text.slice(0, 80)}"`);
  return NextResponse.json(reading);
}
