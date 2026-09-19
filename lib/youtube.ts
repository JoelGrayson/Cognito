import type { Video } from "@/lib/schema";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

/** One search result, with what a reviewer needs to judge whether it fits a lesson. */
export interface VideoCandidate {
  id: string;
  title: string;
  channel: string | null;
  /** Length in seconds, when known. */
  seconds: number | null;
  /** View count, when known. */
  views: number | null;
  description: string | null;
}

export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
}

/** The lesson has no video. */
export function noVideo(query: string): Video {
  return { id: null, title: null, searchUrl: youtubeSearchUrl(query) };
}

/**
 * Up to `limit` embeddable videos for a query. Uses the YouTube Data API when
 * YOUTUBE_API_KEY is set, otherwise reads the public results page.
 */
export async function searchVideos(query: string, limit = 6): Promise<VideoCandidate[]> {
  const q = query.trim();
  if (!q) return [];
  return (await viaApi(q, limit)) ?? (await viaResultsPage(q, limit));
}

async function viaApi(q: string, limit: number): Promise<VideoCandidate[] | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("videoEmbeddable", "true");
    url.searchParams.set("maxResults", String(limit));
    url.searchParams.set("q", q);
    url.searchParams.set("key", key);
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      items?: Array<{
        id?: { videoId?: string };
        snippet?: { title?: string; channelTitle?: string; description?: string };
      }>;
    };
    const found: VideoCandidate[] = [];
    for (const item of body.items ?? []) {
      const id = item.id?.videoId;
      const title = item.snippet?.title;
      if (typeof id !== "string" || typeof title !== "string") continue;
      found.push({
        id,
        title: decodeEntities(title),
        channel: item.snippet?.channelTitle ? decodeEntities(item.snippet.channelTitle) : null,
        seconds: null,
        views: null,
        description: item.snippet?.description ? decodeEntities(item.snippet.description) : null,
      });
    }
    await addDetails(found, key);
    return found;
  } catch {
    return null;
  }
}

/** Lengths and view counts come from a second, cheap endpoint (1 quota unit versus 100 for a search). */
async function addDetails(found: VideoCandidate[], key: string): Promise<void> {
  if (found.length === 0) return;
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "contentDetails,statistics");
    url.searchParams.set("id", found.map((v) => v.id).join(","));
    url.searchParams.set("key", key);
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as {
      items?: Array<{ id?: string; contentDetails?: { duration?: string }; statistics?: { viewCount?: string } }>;
    };
    const byId = new Map(body.items?.map((i) => [i.id, i]) ?? []);
    for (const v of found) {
      const item = byId.get(v.id);
      v.seconds = parseIsoDuration(item?.contentDetails?.duration);
      const views = Number(item?.statistics?.viewCount);
      v.views = Number.isFinite(views) ? views : null;
    }
  } catch {
    // lengths are optional
  }
}

/** "PT1H2M3S" -> 3723 */
function parseIsoDuration(value: string | undefined): number | null {
  const m = value ? /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value) : null;
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** "1,234,567 views" -> 1234567 */
function parseViews(value: string | undefined): number | null {
  const digits = value?.replace(/[^0-9]/g, "");
  return digits ? Number(digits) : null;
}

/** "1:02:03" -> 3723 */
function parseClock(value: string | undefined): number | null {
  if (!value || !/^\d+(?::\d+){1,2}$/.test(value)) return null;
  return value.split(":").reduce((total, part) => total * 60 + Number(part), 0);
}

/** The Data API returns titles with HTML entities (e.g. &#39; for an apostrophe). */
function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return named[code.toLowerCase()] ?? match;
  });
}

function jsonString(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return null;
  }
}

async function viaResultsPage(q: string, limit: number): Promise<VideoCandidate[]> {
  try {
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=en`,
      {
        headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      },
    );
    if (!res.ok) return [];
    const html = await res.text();
    // Each organic result is a videoRenderer; channels, playlists and shorts shelves use other renderers.
    const found: VideoCandidate[] = [];
    const seen = new Set<string>();
    const re = /"videoRenderer":\{"videoId":"([A-Za-z0-9_-]{11})"/g;
    for (let m = re.exec(html); m && found.length < limit; m = re.exec(html)) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      const blob = html.slice(m.index, m.index + 8000);
      const title = jsonString(/"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/.exec(blob)?.[1]);
      if (!title) continue;
      const lengthAt = blob.indexOf('"lengthText"');
      const length =
        lengthAt === -1 ? undefined : /"simpleText":"(\d+(?::\d+){1,2})"/.exec(blob.slice(lengthAt, lengthAt + 400))?.[1];
      found.push({
        id: m[1],
        title,
        channel: jsonString(/"ownerText":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/.exec(blob)?.[1]),
        seconds: parseClock(length),
        views: parseViews(/"viewCountText":\{"simpleText":"([^"]+)"/.exec(blob)?.[1]),
        description: jsonString(/"snippetText":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/.exec(blob)?.[1]),
      });
    }
    return found;
  } catch {
    return [];
  }
}
