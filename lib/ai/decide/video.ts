/**
 * Which search result, if any, belongs beside a lesson — as a Jev decision.
 *
 * "Is this video worth embedding?" is a judgement about a short, self-contained
 * piece of text, which is what Jev is for: every candidate is scored in one
 * request, and the cutoff becomes a probability instead of the model's own word
 * ("strong"). Nothing here generates text, so the generative picker stays as
 * the fallback for when Jev is unavailable.
 */
import { jevConfigured, noul, tryAsk } from "@/lib/ai/jev";
import type { VideoCandidate } from "@/lib/youtube";

/**
 * How sure Jev must be that a video helps before we embed it. High on purpose:
 * no video beats an off-topic one, and the learner still gets a search link.
 */
export const FIT_FLOOR = 0.75;

export interface VideoAbout {
  topic: string;
  lesson: string;
  summary: string;
}

export interface JevVideoPick {
  /** Index into `candidates`, or null when nothing clears FIT_FLOOR. */
  index: number | null;
  reason: string;
}

const QUESTION =
  "Would `video` genuinely help someone studying this lesson? Yes only if it teaches this lesson's " +
  "material at this level; no if it is off-topic, a trailer, a course advert, a playlist teaser, or " +
  "too shallow to add anything.";

/** Null when Jev cannot answer, so the caller keeps its own path. */
export async function pickVideoWithJev(
  about: VideoAbout,
  candidates: VideoCandidate[],
): Promise<JevVideoPick | null> {
  if (!jevConfigured() || candidates.length === 0) return null;

  const questions = Object.fromEntries(
    candidates.map((c, i) => [
      key(i),
      noul(
        { question: QUESTION, video: describe(c) },
        { true: "The video teaches this lesson's material.", false: "Off-topic, promotional, or too shallow." },
      ),
    ]),
  );
  const result = await tryAsk({ topic: about.topic, lesson: about.lesson, summary: about.summary }, questions);
  if (!result) return null;

  // Results arrive in search-relevance order, so ties go to the earlier result.
  const fits = candidates.map((_, i) => result.answers[key(i)]?.noul ?? 0);
  const best = fits.reduce((top, fit, i) => (fit > fits[top] ? i : top), 0);
  const reason = `jev ${result.model}: ${fits.map((f, i) => `${i}:${f.toFixed(2)}`).join(", ")}`;
  return fits[best] >= FIT_FLOOR ? { index: best, reason } : { index: null, reason: `${reason} (all below ${FIT_FLOOR})` };
}

const key = (i: number) => `v${i}`;

/** The same facts the generative picker sees, as fields rather than a prompt. */
function describe(c: VideoCandidate) {
  return {
    title: c.title,
    channel: c.channel,
    length: c.seconds === null ? null : `${Math.floor(c.seconds / 60)}:${String(c.seconds % 60).padStart(2, "0")}`,
    views: c.views,
    description: c.description?.replace(/\s+/g, " ").trim().slice(0, 300) ?? null,
  };
}
