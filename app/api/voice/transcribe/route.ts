/**
 * Speech -> text. ElevenLabs Scribe, the same key that does the speaking.
 *
 * One vendor, one key, one less signup, one less thing to break at hour 23.
 * Deepgram was the original plan and its turn detection is genuinely better, but
 * that advantage only matters for an OPEN mic -- and this mic is push-to-talk, so
 * there is no turn to detect. Release is the end of turn. With that removed, the
 * remaining difference did not justify a second vendor.
 *
 * Prerecorded rather than streaming for the same reason: the learner holds a key,
 * speaks, releases, and we get one complete clip.
 */
import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(request: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Set ELEVENLABS_API_KEY in .env.local." }, { status: 400 });
  }

  const audio = await request.arrayBuffer();
  if (audio.byteLength === 0) {
    return NextResponse.json({ error: "No audio received." }, { status: 400 });
  }
  if (audio.byteLength > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Clip too long." }, { status: 413 });
  }

  // The caller controls this header and the bytes behind it; forwarding an
  // arbitrary type would send non-audio to the vendor on our credential.
  const AUDIO_TYPES = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav"];
  const declared = (request.headers.get("content-type") ?? "").split(";")[0].trim();
  const contentType = AUDIO_TYPES.includes(declared) ? declared : "audio/webm";
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("file", new Blob([audio], { type: contentType }), `clip.${contentType.split("/")[1]}`);

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": key },
      body: form,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not reach ElevenLabs: ${error instanceof Error ? error.message : "unknown"}` },
      { status: 502 },
    );
  }

  const ms = Date.now() - started;
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    return NextResponse.json(
      { error: `ElevenLabs ${res.status}: ${data?.detail?.message ?? "transcription failed"}`, ms },
      { status: 502 },
    );
  }

  const transcript: string = (data?.text ?? "").trim();
  console.log(`[voice] transcribe ${ms}ms bytes=${audio.byteLength} "${transcript.slice(0, 60)}"`);

  return NextResponse.json({
    transcript,
    // Scribe reports language confidence rather than a transcription confidence.
    confidence: data?.language_probability ?? null,
    ms,
  });
}
