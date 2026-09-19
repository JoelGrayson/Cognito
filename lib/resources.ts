import { firecrawlConfigured, searchWeb, type WebResult } from "@/lib/firecrawl";
import { keepReachable } from "@/lib/links";
import { RESOURCE_PICK_SYSTEM_PROMPT, resourcePickPrompt } from "@/lib/prompt";
import type { Provider, ProviderContext } from "@/lib/providers";
import { ResourcePickSchema, type LessonExtras, type Resource } from "@/lib/schema";
import type { VideoContext } from "@/lib/video";

const MAX_RESOURCES = 5;

/**
 * Further reading for a lesson. With Firecrawl configured, the web is searched
 * and the model chooses among real pages; otherwise (or when the search finds
 * nothing) the model's own suggestions are kept, minus the URLs that do not
 * answer.
 */
export async function findResources(
  provider: Provider,
  about: VideoContext,
  extras: Pick<LessonExtras, "searchQuery" | "resources">,
  model?: string,
  providerContext?: ProviderContext,
): Promise<Resource[]> {
  if (firecrawlConfigured()) {
    const results = await searchWeb(extras.searchQuery, { limit: 10 });
    if (results.length > 0) {
      const picked = await chooseResources(provider, about, results, model, providerContext);
      if (picked.length > 0) return picked;
    }
  }
  return keepReachable(extras.resources, MAX_RESOURCES);
}

/** The model's picks among search results, best first. Failures fall back to the top results as given. */
export async function chooseResources(
  provider: Provider,
  about: VideoContext,
  results: WebResult[],
  model?: string,
  providerContext?: ProviderContext,
): Promise<Resource[]> {
  const asResource = (r: WebResult, why: string): Resource => ({ title: r.title, url: r.url, why });
  try {
    const { output } = await provider.structured(
      {
        name: "resource_pick",
        schema: ResourcePickSchema,
        system: RESOURCE_PICK_SYSTEM_PROMPT,
        user: resourcePickPrompt(about, results),
        effort: "minimal",
      },
      model,
      providerContext,
    );
    const seen = new Set<number>();
    const picked: Resource[] = [];
    for (const pick of output.picks) {
      const result = results[pick.index];
      if (!result || seen.has(pick.index)) continue;
      seen.add(pick.index);
      picked.push(asResource(result, pick.why));
    }
    return picked.slice(0, MAX_RESOURCES);
  } catch {
    return results.slice(0, MAX_RESOURCES).map((r) => asResource(r, r.description ?? ""));
  }
}
