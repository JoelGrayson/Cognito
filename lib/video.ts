import { pickVideoWithJev, type VideoJudgement } from "@/lib/ai/decide/video";
import { VIDEO_PICK_SYSTEM_PROMPT, videoPickPrompt } from "@/lib/prompt";
import type { Provider, ProviderContext } from "@/lib/providers";
import { VideoPickSchema, type Video } from "@/lib/schema";
import { noVideo, searchVideos, type VideoCandidate } from "@/lib/youtube";

/** Shorts and multi-hour streams are never the right thing to embed beside a lesson. */
const MIN_SECONDS = 90;
const MAX_SECONDS = 2 * 60 * 60;

export interface VideoContext {
  /** The roadmap's topic, e.g. "Roman history". */
  topic: string;
  /** The lesson's title. */
  lesson: string;
  /** One sentence on what the lesson covers. */
  summary: string;
}

/** What the learner is shown while a video is chosen: the results, then the scores. */
export interface VideoJudging {
  candidates: Pick<VideoCandidate, "id" | "title" | "channel" | "seconds" | "views">[];
  /** Null until Jev has answered; stays null when the generative picker chose instead. */
  judgement: VideoJudgement | null;
}

/**
 * Search YouTube and let the model choose the one result that would genuinely
 * help with this lesson, or none. No video is better than an off-topic one, so
 * any failure along the way also means no video.
 */
export async function findHelpfulVideo(
  provider: Provider,
  about: VideoContext,
  query: string,
  model?: string,
  providerContext?: ProviderContext,
  onJudging?: (judging: VideoJudging) => void,
): Promise<Video> {
  const none = noVideo(query);
  if (!query.trim()) return none;
  const candidates = (await searchVideos(query)).filter(
    (c) => c.seconds === null || (c.seconds >= MIN_SECONDS && c.seconds <= MAX_SECONDS),
  );
  const shown = candidates.map(({ id, title, channel, seconds, views }) => ({ id, title, channel, seconds, views }));
  if (shown.length > 0) onJudging?.({ candidates: shown, judgement: null });
  const { chosen, judgement } = await chooseVideo(provider, about, candidates, model, providerContext);
  if (judgement) onJudging?.({ candidates: shown, judgement });
  return chosen ? { id: chosen.id, title: chosen.title, searchUrl: none.searchUrl } : none;
}

/**
 * The pick among search results, or null. Jev rates the candidates when it is
 * configured; the generative picker answers when it is not, or when the call
 * fails. Failures count as no pick.
 */
export async function chooseVideo(
  provider: Provider,
  about: VideoContext,
  candidates: VideoCandidate[],
  model?: string,
  providerContext?: ProviderContext,
): Promise<{ chosen: VideoCandidate | null; reason: string; judgement?: VideoJudgement }> {
  if (candidates.length === 0) return { chosen: null, reason: "No usable search results." };

  // A decision Jev did make stands, including "none of these fit": that is an
  // answer, not a failure, so it is not worth a second opinion from the LLM.
  const decided = await pickVideoWithJev(about, candidates);
  if (decided) {
    return {
      chosen: decided.index === null ? null : candidates[decided.index],
      reason: decided.reason,
      judgement: decided.judgement,
    };
  }

  try {
    const { output } = await provider.structured(
      {
        name: "video_pick",
        schema: VideoPickSchema,
        system: VIDEO_PICK_SYSTEM_PROMPT,
        user: videoPickPrompt(about, candidates),
        effort: "minimal",
      },
      model,
      providerContext,
    );
    // Results arrive in search-relevance order, so the first strong one wins.
    const strong = output.ratings.find((r) => r.fit === "strong" && candidates[r.index]);
    const summary = output.ratings.map((r) => `${r.index}:${r.fit} (${r.why})`).join("; ");
    return { chosen: strong ? candidates[strong.index] : null, reason: summary };
  } catch (error) {
    return { chosen: null, reason: `Picker failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}
