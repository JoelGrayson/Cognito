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

/** turbo_v2_5, not flash_v2_5. Measured on this account: turbo is both better
 *  sounding AND marginally faster (371ms vs 469ms). Flash trades quality for an
 *  inference-time win that the network hop eats anyway. */
const MODEL = "eleven_turbo_v2_5";

/** 44.1kHz/128kbps, the best the free tier allows (192 needs Creator). The original
 *  22kHz/32kbps was the single biggest cause of the voice sounding robotic --
 *  four times the bitrate for no extra latency. */
const OUTPUT_FORMAT = "mp3_44100_128";
/** A calm, unhurried default. The voice has to be able to say nothing comfortably.
 *
 *  "Matilda", chosen by ear over the other eleven. One of the built-in default voices. NOT a library voice: free accounts
 *  get 402 paid_plan_required on those, which reads like a broken key but isn't.
 *  Verified working on the free tier alongside George, Jessica and Matilda. */
const DEFAULT_VOICE = "XrExE9yKIg1WjnnlVkGX";

/** Other free-tier-safe defaults, for swapping the tutor's voice. */
export const VOICES = {
  sarah: "EXAVITQu4vr4xnSDxMaL",
  laura: "FGY2WhTYpPnrIDTdsKH5",
  jessica: "cgSgspJ2msm6clMCkdW9",
  matilda: "XrExE9yKIg1WjnnlVkGX",
  alice: "Xb7hH8MSUJpSbSDYk0k2",
  lily: "pFZP5JQG7iQjIQuC4Bku",
  george: "JBFqnCBsd6RMkjVDRZzb",
  charlie: "IKne3meq5aSn9XLyUdCD",
  callum: "N2lVS1w4EtoT3dr4eOWO",
  will: "bIHbv24MWmeRgasZH58o",
  chris: "iP95p4xoKVk53GoZ742B",
  daniel: "onwK4e9ZLuTAKqWW03F9",
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

  // Allowlist, not passthrough: any id reaching ElevenLabs bills the server
  // account, so an unknown one must not be forwarded to probe paid voices.
  const allowed = new Set<string>(Object.values(VOICES));
  const voice =
    typeof voiceId === "string" && allowed.has(voiceId) ? voiceId : DEFAULT_VOICE;
  const started = Date.now();

  let res: Response;
  try {
    res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream?output_format=${OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: MODEL,
          // Slightly raised stability: a tutor that sounds erratic undercuts the
          // impression of deliberate restraint.
          voice_settings: {
            // Lower stability = more expressive delivery. A tutor reading a warning
            // in a flat monotone is exactly the robotic effect we're avoiding.
            stability: 0.4,
            similarity_boost: 0.8,
            style: 0.15,
            use_speaker_boost: true,
            // A tutor interjecting mid-thought should sound brisk, not ponderous.
            // 0.98 read as slow out loud; ElevenLabs allows up to 1.2.
            speed: 1.12,
          },
        }),
      },
    );
  } catch (error) {
    // Log as well as return. The body reaches a browser that may drop it, so a 502
    // that is not logged here leaves no record of why the tutor went quiet.
    const message = error instanceof Error ? error.message : "unknown";
    console.error(`[voice] speak unreachable after ${Date.now() - started}ms: ${message}`);
    return NextResponse.json({ error: `Could not reach ElevenLabs: ${message}` }, { status: 502 });
  }

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    console.error(`[voice] speak ElevenLabs ${res.status} after ${Date.now() - started}ms: ${detail.slice(0, 200)}`);
    return NextResponse.json({ error: `ElevenLabs ${res.status}: ${detail.slice(0, 200)}` }, { status: 502 });
  }

  console.log(`[voice] speak ttfb=${Date.now() - started}ms chars=${text.length} "${text.slice(0, 60)}"`);

  // Stream straight through so audio starts before generation finishes.
  return new Response(res.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
