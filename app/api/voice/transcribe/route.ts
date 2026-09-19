/**
 * Speech -> text. Deepgram, prerecorded endpoint.
 *
 * Prerecorded rather than streaming because the mic is PUSH-TO-TALK: the learner
 * holds a key, speaks, releases, and we get one complete clip. That deletes the
 * entire endpointing problem for audio -- no VAD, no turn detection, no barge-in
 * race -- which matters in a loud room and matters more given how much trouble
 * endpointing already caused on the ink side.
 */
import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(request: Request) {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Set DEEPGRAM_API_KEY in .env.local." }, { status: 400 });
  }

  const contentType = request.headers.get("content-type") ?? "audio/webm";
  const audio = await request.arrayBuffer();
  if (audio.byteLength === 0) {
    return NextResponse.json({ error: "No audio received." }, { status: 400 });
  }
  if (audio.byteLength > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Clip too long." }, { status: 413 });
  }

  const started = Date.now();
  const params = new URLSearchParams({
    model: "nova-3",
    smart_format: "true",
    punctuate: "true",
    // The learner is explaining maths out loud; these are the words they'll use.
    keyterm: "inequality",
  });

  let res: Response;
  try {
    res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": contentType },
      body: audio,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not reach Deepgram: ${error instanceof Error ? error.message : "unknown"}` },
      { status: 502 },
    );
  }

  const ms = Date.now() - started;
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    return NextResponse.json({ error: `Deepgram ${res.status}`, ms }, { status: 502 });
  }

  const alt = data?.results?.channels?.[0]?.alternatives?.[0];
  const transcript: string = alt?.transcript ?? "";
  const confidence: number | null = alt?.confidence ?? null;

  console.log(`[voice] transcribe ${ms}ms bytes=${audio.byteLength} conf=${confidence?.toFixed?.(2) ?? "?"} "${transcript.slice(0, 60)}"`);

  return NextResponse.json({ transcript, confidence, ms });
}
