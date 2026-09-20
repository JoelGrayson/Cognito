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

/**
 * FIT_FLOOR replaces the "strong" label, so this must carry the whole of what
 * strong meant in VIDEO_PICK_SYSTEM_PROMPT — credibility and view count included,
 * not just topic and depth.
 */
const QUESTION =
  "Would `video` genuinely help someone studying this lesson — would you put it in a textbook's " +
  "\"watch this\" box? Yes only if it teaches this lesson's actual subject, in this field and era, " +
  "at a sensible depth, and comes from a credible educational source: educators, universities, " +
  "established explainer channels. No if it is off-topic (a different subject sharing words with " +
  "the lesson), clickbait, opinion, news, a reaction, a vlog, a trailer, a course advert, a " +
  "playlist teaser, a product, a screen recording reading pages aloud, generic, shallow, low " +
  "production, or from an unclear source. `views` is a quality signal: a few thousand views from " +
  "a channel you do not recognise is a no, however good the title sounds.";

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
        {
          true: "A credible source teaching this lesson's material well.",
          false: "Off-topic, promotional, shallow, or from an unclear source.",
        },
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
