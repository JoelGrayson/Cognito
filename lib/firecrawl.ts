/** One web search hit: what the page is, where it lives, and the engine's snippet. */
export interface WebResult {
  url: string;
  title: string;
  description: string | null;
}

export interface WebSearchOptions {
  limit?: number;
  /** Hostnames only, e.g. ["youtube.com"]. */
  includeDomains?: string[];
}

/** Web research goes through Firecrawl when a key is set; callers fall back otherwise. */
export function firecrawlConfigured(): boolean {
  return Boolean(process.env.FIRECRAWL_API_KEY);
}

/**
 * Real pages for a query from Firecrawl's search endpoint (titles, URLs and
 * snippets only; nothing is scraped). Empty when Firecrawl is not configured
 * or anything fails: research is optional, so failures never break a lesson.
 */
export async function searchWeb(query: string, { limit = 8, includeDomains }: WebSearchOptions = {}): Promise<WebResult[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  const q = query.trim();
  if (!key || !q) return [];
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, limit, ...(includeDomains?.length ? { includeDomains } : {}) }),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      success?: boolean;
      data?: { web?: Array<{ url?: string; title?: string; description?: string }> };
    };
    if (!body.success) return [];
    const found: WebResult[] = [];
    const seen = new Set<string>();
    for (const item of body.data?.web ?? []) {
      if (typeof item.url !== "string" || typeof item.title !== "string" || !item.title.trim()) continue;
      const dedupe = item.url.replace(/\/+$/, "").toLowerCase();
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      found.push({ url: item.url, title: item.title.trim(), description: item.description?.trim() || null });
    }
    return found;
  } catch {
    return [];
  }
}
