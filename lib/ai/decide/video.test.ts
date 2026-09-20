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

const FACET = 0.6;

/**
 * Jev, answering whatever it is asked: the deciding question `v<i>` with `nouls[i]`,
 * and every facet question with FACET. A fresh Response per call, because the pick
 * sends two requests and a Response body can only be read once.
 */
function answers(...nouls: number[]) {
  return async (_url: unknown, init?: RequestInit) => {
    const asked = Object.keys(JSON.parse(init?.body as string).questions);
    return new Response(
      JSON.stringify({
        model: "jev-1.13.0",
        answers: Object.fromEntries(
          asked.map((id) => [id, { type: "noul", noul: /^v\d+$/.test(id) ? nouls[Number(id.slice(1))] : FACET }]),
        ),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
}

const bodies = (fetchMock: { mock: { calls: unknown[][] } }) =>
  fetchMock.mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string));

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
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(answers(0.8, 0.97, 0.1));
    const pick = await pickVideoWithJev(about, candidates);

    // One request decides; a second asks the same criteria one at a time, for display.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = bodies(fetchMock).find((b) => "v0" in b.questions);
    expect(body.state).toEqual(about);
    expect(Object.keys(body.questions)).toEqual(["v0", "v1", "v2"]);
    expect(body.questions.v0.instructions.video).toMatchObject({ title: "Video 0", length: "10:05" });
    // Whitespace collapsed, so the model is not judging the scraper's formatting.
    expect(body.questions.v0.instructions.video.description).toBe("spaced out");
    expect(pick).toMatchObject({ index: 1, reason: expect.stringContaining("1:0.97") });
  });

  it("reports the numbers behind the pick, with each criterion's probability", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(answers(0.8, 0.97, 0.1));
    const pick = await pickVideoWithJev(about, candidates);

    expect(pick?.judgement).toMatchObject({ model: "jev-1.13.0", floor: FIT_FLOOR, picked: 1 });
    expect(pick?.judgement.scores.map((s) => s.fit)).toEqual([0.8, 0.97, 0.1]);
    expect(pick?.judgement.scores[1].facets).toEqual({ onTopic: FACET, depth: FACET, credible: FACET, teaching: FACET });
  });

  it("still picks when the criteria request fails: they explain the pick, they do not make it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const decide = answers(0.8, 0.97, 0.1);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const asked = Object.keys(JSON.parse(init?.body as string).questions);
      if (!asked.includes("v0")) throw new Error("offline");
      return decide(url, init);
    });
    const pick = await pickVideoWithJev(about, candidates);

    expect(pick).toMatchObject({ index: 1 });
    expect(pick?.judgement.scores[1].facets).toEqual({});
  });

  it("picks nothing when no candidate clears the floor: a search link beats an off-topic video", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(answers(FIT_FLOOR - 0.01, 0.2, 0.3));
    expect(await pickVideoWithJev(about, candidates)).toMatchObject({ index: null });
  });

  it("keeps search order on a tie", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(answers(0.9, 0.9, 0.9));
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
