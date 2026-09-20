import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "@/lib/providers";
import { chooseVideo } from "./video";
import type { VideoCandidate } from "./youtube";

const about = { topic: "Roman history", lesson: "The Punic Wars", summary: "Rome against Carthage." };
const candidates: VideoCandidate[] = [0, 1].map((i) => ({
  id: `id${i}`,
  title: `Video ${i}`,
  channel: null,
  seconds: 600,
  views: null,
  description: null,
}));

function fakeProvider(ratings: { index: number; fit: string; why: string }[]) {
  const structured = vi.fn().mockResolvedValue({ output: { ratings } });
  return { structured } as unknown as Provider & { structured: ReturnType<typeof vi.fn> };
}

function jevAnswers(...nouls: number[]) {
  return new Response(
    JSON.stringify({
      model: "jev-1.13.0",
      answers: Object.fromEntries(nouls.map((n, i) => [`v${i}`, { type: "noul", noul: n }])),
    }),
    { status: 200 },
  );
}

describe("chooseVideo", () => {
  beforeEach(() => {
    vi.stubEnv("MOCK_AI", "");
    vi.stubEnv("TYPESAFE_API_KEY", "key");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses Jev's pick without spending a generative call", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jevAnswers(0.2, 0.95));
    const provider = fakeProvider([]);
    expect(await chooseVideo(provider, about, candidates)).toMatchObject({ chosen: candidates[1] });
    expect(provider.structured).not.toHaveBeenCalled();
  });

  it("keeps Jev's 'none of these' instead of asking the model for a second opinion", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jevAnswers(0.1, 0.2));
    const provider = fakeProvider([{ index: 0, fit: "strong", why: "great" }]);
    expect((await chooseVideo(provider, about, candidates)).chosen).toBeNull();
    expect(provider.structured).not.toHaveBeenCalled();
  });

  it("falls back to the generative picker when Jev has no key", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    const provider = fakeProvider([{ index: 0, fit: "strong", why: "on topic" }]);
    expect(await chooseVideo(provider, about, candidates)).toMatchObject({ chosen: candidates[0] });
    expect(provider.structured).toHaveBeenCalledTimes(1);
  });

  it("falls back when the Jev call fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const provider = fakeProvider([{ index: 1, fit: "strong", why: "on topic" }]);
    expect(await chooseVideo(provider, about, candidates)).toMatchObject({ chosen: candidates[1] });
    expect(provider.structured).toHaveBeenCalledTimes(1);
  });

  it("never calls either model when the search returned nothing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const provider = fakeProvider([]);
    expect(await chooseVideo(provider, about, [])).toEqual({ chosen: null, reason: "No usable search results." });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(provider.structured).not.toHaveBeenCalled();
  });
});
