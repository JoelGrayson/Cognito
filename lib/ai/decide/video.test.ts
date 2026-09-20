import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoCandidate } from "@/lib/youtube";
import { FIT_FLOOR, pickVideoWithJev } from "./video";

const about = { topic: "Roman history", lesson: "The Punic Wars", summary: "Rome against Carthage." };
const candidates: VideoCandidate[] = [0, 1, 2].map((i) => ({
  id: `id${i}`,
  title: `Video ${i}`,
  channel: "Chan",
  seconds: 605,
  views: 1000,
  description: "  spaced   out  ",
}));

function answers(...nouls: number[]) {
  return new Response(
    JSON.stringify({
      model: "jev-1.13.0",
      answers: Object.fromEntries(nouls.map((n, i) => [`v${i}`, { type: "noul", noul: n }])),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("pickVideoWithJev", () => {
  beforeEach(() => {
    vi.stubEnv("MOCK_AI", "");
    vi.stubEnv("TYPESAFE_API_KEY", "key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("asks about every candidate in one request and takes the most fitting one", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(answers(0.8, 0.97, 0.1));
    const pick = await pickVideoWithJev(about, candidates);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.state).toEqual(about);
    expect(Object.keys(body.questions)).toEqual(["v0", "v1", "v2"]);
    expect(body.questions.v0.instructions.video).toMatchObject({ title: "Video 0", length: "10:05" });
    // Whitespace collapsed, so the model is not judging the scraper's formatting.
    expect(body.questions.v0.instructions.video.description).toBe("spaced out");
    expect(pick).toEqual({ index: 1, reason: expect.stringContaining("1:0.97") });
  });

  it("picks nothing when no candidate clears the floor: a search link beats an off-topic video", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(answers(FIT_FLOOR - 0.01, 0.2, 0.3));
    expect(await pickVideoWithJev(about, candidates)).toMatchObject({ index: null });
  });

  it("keeps search order on a tie", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(answers(0.9, 0.9, 0.9));
    expect(await pickVideoWithJev(about, candidates)).toMatchObject({ index: 0 });
  });

  it("returns null — hand back to the generative picker — when Jev is unavailable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect(await pickVideoWithJev(about, candidates)).toBeNull();

    vi.stubEnv("TYPESAFE_API_KEY", "");
    expect(await pickVideoWithJev(about, candidates)).toBeNull();
  });
});
