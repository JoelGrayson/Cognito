const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

/**
 * Models invent URLs. Keep only the ones that actually answer, in the order
 * given, without duplicates. A bot wall (403) still proves the page exists;
 * only 404/410 and dead hosts are dropped.
 */
export async function keepReachable<T extends { url: string }>(items: T[], limit = 5): Promise<T[]> {
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    const key = item.url.trim().replace(/\/+$/, "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const checks = await Promise.all(unique.map(async (item) => ({ item, ok: await reachable(item.url) })));
  return checks
    .filter((c) => c.ok)
    .map((c) => c.item)
    .slice(0, limit);
}

async function reachable(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  try {
    const res = await fetch(parsed, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,*/*;q=0.8" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    // Headers are enough; don't download the page.
    void res.body?.cancel().catch(() => {});
    return res.status !== 404 && res.status !== 410;
  } catch {
    return false;
  }
}
