/**
 * Text -> speech, streamed. ElevenLabs Flash v2.5 (~75ms inference).
 *
 * Deliberately NOT an agent platform. Agent products are built around
 * "user speaks -> agent responds", but this tutor speaks in response to INK, not
 * speech, and adopting one would hand it the turn-taking loop the whiteboard
 * already owns. We want a mouth, not a conversation partner.
 */
import { NextResponse } from "next/server";

export const maxDuration = 30;

const MODEL = "eleven_flash_v2_5";
/** A calm, unhurried default. The voice has to be able to say nothing comfortably.
 *
 *  "Sarah", one of the built-in default voices. NOT a library voice: free accounts
 *  get 402 paid_plan_required on those, which reads like a broken key but isn't.
 *  Verified working on the free tier alongside George, Jessica and Matilda. */
const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL";

/** Other free-tier-safe defaults, for swapping the tutor's voice. */
export const VOICES = {
  sarah: "EXAVITQu4vr4xnSDxMaL",
  george: "JBFqnCBsd6RMkjVDRZzb",
  jessica: "cgSgspJ2msm6clMCkdW9",
  matilda: "XrExE9yKIg1WjnnlVkGX",
} as const;

export async function POST(request: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Set ELEVENLABS_API_KEY in .env.local." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const { text, voiceId } = (body ?? {}) as { text?: unknown; voiceId?: unknown };
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Nothing to say." }, { status: 400 });
  }
  // The tutor speaks in one or two sentences. A long payload means a bug upstream.
  if (text.length > 600) {
    return NextResponse.json({ error: "Utterance too long; keep it under 600 chars." }, { status: 400 });
  }

  const voice = typeof voiceId === "string" && voiceId ? voiceId : DEFAULT_VOICE;
  const started = Date.now();

  let res: Response;
  try {
    res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream?output_format=mp3_22050_32`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: MODEL,
          // Slightly raised stability: a tutor that sounds erratic undercuts the
          // impression of deliberate restraint.
          voice_settings: { stability: 0.55, similarity_boost: 0.75, speed: 1.0 },
        }),
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: `Could not reach ElevenLabs: ${error instanceof Error ? error.message : "unknown"}` },
      { status: 502 },
    );
  }

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json({ error: `ElevenLabs ${res.status}: ${detail.slice(0, 200)}` }, { status: 502 });
  }

  console.log(`[voice] speak ttfb=${Date.now() - started}ms chars=${text.length} "${text.slice(0, 60)}"`);

  // Stream straight through so audio starts before generation finishes.
  return new Response(res.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
