/** Wikimedia asks API clients to identify themselves. */
const UA = "StructuredLearning.ai/0.1 (educational whiteboard)";
const USABLE = new Set(["image/png", "image/jpeg", "image/svg+xml", "image/webp"]);

/**
 * A freely licensed picture or diagram from Wikimedia Commons for a search
 * query, as an 800px-wide URL, or null. Keyless and safe for education.
 */
export async function findImage(query: string): Promise<string | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrsearch", q);
    url.searchParams.set("gsrnamespace", "6");
    url.searchParams.set("gsrlimit", "6");
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url|mime");
    url.searchParams.set("iiurlwidth", "800");
    url.searchParams.set("format", "json");
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      query?: { pages?: Record<string, { index?: number; imageinfo?: { mime?: string; thumburl?: string }[] }> };
    };
    const pages = Object.values(body.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      if (info?.thumburl && info.mime && USABLE.has(info.mime)) return info.thumburl;
    }
    return null;
  } catch {
    return null;
  }
}
