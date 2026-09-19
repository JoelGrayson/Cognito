import { describe, expect, it } from "vitest";
import type { LearnerProfile, OnboardingProfile } from "@/types/learning";
import { sampleProfile } from "@/fixtures/sampleProfile";
import { buildFallbackGraph } from "./fallback";
import { validateGraph } from "./validate";

const withConcepts = (concepts: [string, 0 | 1 | 2][]): OnboardingProfile => ({
  goal: "learn things",
  priorKnowledge: concepts.map(([concept, level]) => ({ concept, level })),
});

function expectValid(profile: OnboardingProfile | LearnerProfile) {
  const graph = buildFallbackGraph(profile);
  expect(validateGraph(graph)).toEqual({ ok: true });
  return graph;
}

describe("buildFallbackGraph", () => {
  it("builds a valid chain from the sample profile in ascending rating order", () => {
    const graph = expectValid(sampleProfile);
    // Matrices 0, Vectors 1, Derivatives 2
    expect(graph.nodes.map((n) => n.id)).toEqual(["matrices", "vectors", "derivatives"]);
    expect(graph.edges.map((e) => [e.source, e.target, e.kind])).toEqual([
      ["matrices", "vectors", "prerequisite"],
      ["vectors", "derivatives", "prerequisite"],
    ]);
    expect(graph.title).toBe(sampleProfile.goal);
  });

  it("makes core 60 minute leaves and marks rating 2 as known", () => {
    const graph = expectValid(sampleProfile);
    for (const n of graph.nodes) {
      expect(n.kind).toBe("core");
      expect(n.estMinutes).toBe(60);
      expect(n.parentId).toBeUndefined();
    }
    expect(graph.nodes.map((n) => n.scope)).toEqual(["included", "included", "known"]);
  });

  it("is stable for equal ratings", () => {
    const graph = expectValid(withConcepts([["Zeta", 1], ["Alpha", 0], ["Mid", 1], ["Beta", 0]]));
    expect(graph.nodes.map((n) => n.title)).toEqual(["Alpha", "Beta", "Zeta", "Mid"]);
  });

  it("does not mutate the profile", () => {
    const profile = withConcepts([["B", 2], ["A", 0]]);
    const copy = structuredClone(profile);
    buildFallbackGraph(profile);
    expect(profile).toEqual(copy);
  });

  it("dedupes ids when concept names collide after slugifying", () => {
    const graph = expectValid(withConcepts([["C++", 0], ["C#", 0], ["c", 0], ["C", 1], ["Vectors", 0], ["vectors!", 0]]));
    const ids = graph.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("c_2");
  });

  it("handles punctuation, accents and non-latin names", () => {
    const graph = expectValid(withConcepts([["  Ünïcode -- Café!! ", 0], ["日本語", 1], ["😀", 1], ["***", 0]]));
    expect(graph.nodes.map((n) => n.id)).toContain("unicode_cafe");
    expect(graph.nodes).toHaveLength(4);
    expect(graph.nodes.find((n) => n.title === "日本語")?.id).toMatch(/^concept/);
  });

  it("truncates long concept names to valid ids and titles", () => {
    const long = "very long concept name ".repeat(20);
    const graph = expectValid(withConcepts([[long, 0], [long, 0]]));
    for (const n of graph.nodes) {
      expect(n.id.length).toBeLessThanOrEqual(60);
      expect(n.title.length).toBeLessThanOrEqual(80);
    }
  });

  it("skips blank concepts", () => {
    const graph = expectValid(withConcepts([["", 0], ["   ", 1], ["Real", 0]]));
    expect(graph.nodes.map((n) => n.id)).toEqual(["real"]);
    expect(graph.edges).toEqual([]);
  });

  it("caps at 30 concepts, keeping the lowest ratings", () => {
    const concepts = Array.from({ length: 45 }, (_, i): [string, 0 | 1 | 2] => [`Concept ${i}`, i < 40 ? 1 : 0]);
    const graph = expectValid(withConcepts(concepts));
    expect(graph.nodes).toHaveLength(30);
    expect(graph.edges).toHaveLength(29);
    expect(graph.nodes[0].title).toBe("Concept 40");
  });

  it("builds a single leaf from the goal when there are no concepts", () => {
    for (const profile of [{ goal: "Learn Rust!" }, { goal: "Learn Rust!", priorKnowledge: [] }]) {
      const graph = expectValid(profile);
      expect(graph.nodes).toHaveLength(1);
      expect(graph.nodes[0]).toMatchObject({ id: "learn_rust", title: "Learn Rust!", kind: "core", estMinutes: 60, scope: "included" });
      expect(graph.edges).toEqual([]);
    }
  });

  it("copes with an empty profile and a goal with no usable characters", () => {
    expect(expectValid({}).nodes).toHaveLength(1);
    const graph = expectValid({ goal: "日本語を学ぶ" });
    expect(graph.nodes[0].id).toBe("getting_started");
    expect(graph.nodes[0].title).toBe("日本語を学ぶ");
  });

  it("truncates a very long goal for the title", () => {
    const graph = expectValid({ goal: "x".repeat(300) });
    expect(graph.nodes[0].title.length).toBeLessThanOrEqual(80);
    expect(graph.nodes[0].id.length).toBeLessThanOrEqual(60);
  });
});
