import { VIDEO_PICK_SYSTEM_PROMPT, videoPickPrompt } from "@/lib/prompt";
import type { Provider } from "@/lib/providers";
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
): Promise<Video> {
  const none = noVideo(query);
  if (!query.trim()) return none;
  const candidates = (await searchVideos(query)).filter(
    (c) => c.seconds === null || (c.seconds >= MIN_SECONDS && c.seconds <= MAX_SECONDS),
  );
  const { chosen } = await chooseVideo(provider, about, candidates, model);
  return chosen ? { id: chosen.id, title: chosen.title, searchUrl: none.searchUrl } : none;
}

/** The model's pick among search results, or null. Failures count as no pick. */
export async function chooseVideo(
  provider: Provider,
  about: VideoContext,
  candidates: VideoCandidate[],
  model?: string,
): Promise<{ chosen: VideoCandidate | null; reason: string }> {
  if (candidates.length === 0) return { chosen: null, reason: "No usable search results." };
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
    );
    // Results arrive in search-relevance order, so the first strong one wins.
    const strong = output.ratings.find((r) => r.fit === "strong" && candidates[r.index]);
    const summary = output.ratings.map((r) => `${r.index}:${r.fit} (${r.why})`).join("; ");
    return { chosen: strong ? candidates[strong.index] : null, reason: summary };
  } catch (error) {
    return { chosen: null, reason: `Picker failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}
