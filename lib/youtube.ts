import type { Video } from "@/lib/schema";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

/**
 * Turn a search query into an embeddable video. Uses the YouTube Data API
 * when YOUTUBE_API_KEY is set, otherwise reads the first result off the
 * public results page. Either way the search link comes back as a fallback.
 */
export async function findVideo(query: string): Promise<Video> {
  const q = query.trim();
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
  if (!q) return { id: null, title: null, searchUrl };
  const found = (await viaApi(q)) ?? (await viaResultsPage(q));
  return { id: found?.id ?? null, title: found?.title ?? null, searchUrl };
}

interface Found {
  id: string;
  title: string | null;
}

async function viaApi(q: string): Promise<Found | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("videoEmbeddable", "true");
    url.searchParams.set("maxResults", "1");
    url.searchParams.set("q", q);
    url.searchParams.set("key", key);
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string } }>;
    };
    const item = body.items?.[0];
    const id = item?.id?.videoId;
    if (typeof id !== "string") return null;
    const title = item?.snippet?.title;
    return { id, title: typeof title === "string" ? decodeEntities(title) : null };
  } catch {
    return null;
  }
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

async function viaResultsPage(q: string): Promise<Found | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=en`,
      {
        headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const html = await res.text();
    // The first videoRenderer is the top organic result; channels and
    // playlists use different renderer names, so they are skipped.
    const match = /"videoRenderer":\{"videoId":"([A-Za-z0-9_-]{11})"/.exec(html);
    if (!match) return null;
    const blob = html.slice(match.index, match.index + 4000);
    const title = /"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/.exec(blob);
    let decoded: string | null = null;
    if (title) {
      try {
        decoded = JSON.parse(`"${title[1]}"`) as string;
      } catch {
        decoded = null;
      }
    }
    return { id: match[1], title: decoded };
  } catch {
    return null;
  }
}
