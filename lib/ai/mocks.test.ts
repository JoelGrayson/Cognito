import { afterEach, describe, expect, it, vi } from "vitest";
import { samplePlanGraph } from "@/fixtures/samplePlanGraph";
import { sampleProfile } from "@/fixtures/sampleProfile";
import { applyOps } from "@/lib/graph/applyOps";
import { validateGraph } from "@/lib/graph/validate";
import { DraftGraph, type GraphOp, type LearnerProfile } from "@/types/learning";
import { editGraph, enrichModule, generateGraph, AiValidationError } from "./index";
import { checkEnrichment } from "./functions/enrichModule";
import { leafNodes } from "./serialize";
import { mockEditGraph } from "./mock/edit";
import { mockEnrichModule } from "./mock/enrich";
import { mockGenerateGraph } from "./mock/graph";
import type { AttemptReport } from "./withRetry";

afterEach(() => vi.unstubAllEnvs());

const edit = (message: string, graph: DraftGraph) =>
  mockEditGraph({ profile: sampleProfile, graph, userEditLog: [], messages: [], message });

describe("mockGenerateGraph", () => {
  it("returns a valid DraftGraph built from the fixture, without objectives", async () => {
    const graph = await mockGenerateGraph(sampleProfile);
    expect(DraftGraph.safeParse(graph).success).toBe(true);
    expect(validateGraph(graph)).toEqual({ ok: true });
    expect(graph.nodes).toHaveLength(samplePlanGraph.nodes.length);
    expect(graph.nodes.some((n) => n.objectives)).toBe(false);
    expect(graph.title).toBe(samplePlanGraph.title);
  });

  it("is deterministic and does not mutate the fixture", async () => {
    const before = structuredClone(samplePlanGraph);
    expect(await mockGenerateGraph(sampleProfile)).toEqual(await mockGenerateGraph(sampleProfile));
    expect(samplePlanGraph).toEqual(before);
  });

  it("marks concepts rated 2 as known and leaves the rest included", async () => {
    const graph = await mockGenerateGraph(sampleProfile); // Derivatives = 2
    const scopes = new Map(graph.nodes.map((n) => [n.id, n.scope]));
    expect(scopes.get("partial_derivatives")).toBe("known");
    expect(scopes.get("dot_product")).toBe("included");
  });

  it("marks a whole container known when the concept names it", async () => {
    const profile: LearnerProfile = { ...sampleProfile, priorKnowledge: [{ concept: "Vectors", level: 2 }] };
    const graph = await mockGenerateGraph(profile);
    for (const id of ["vectors", "vector_basics", "dot_product", "norms"]) {
      expect(graph.nodes.find((n) => n.id === id)?.scope, id).toBe("known");
    }
  });

  it("adapts the title to a different goal", async () => {
    const graph = await mockGenerateGraph({ ...sampleProfile, goal: "learn Rust for systems work" });
    expect(graph.title).toBe("Roadmap: learn Rust for systems work");
  });

  it("honors MOCK_AI_DELAY_MS and MOCK_AI_FAIL_GRAPH", async () => {
    vi.stubEnv("MOCK_AI_DELAY_MS", "60");
    const start = Date.now();
    await mockGenerateGraph(sampleProfile);
    expect(Date.now() - start).toBeGreaterThanOrEqual(50);
    vi.stubEnv("MOCK_AI_FAIL_GRAPH", "true");
    await expect(mockGenerateGraph(sampleProfile)).rejects.toBeInstanceOf(AiValidationError);
  });
});

describe("mockEnrichModule", () => {
  const core = samplePlanGraph.nodes.find((n) => n.id === "decompositions")!;
  const leaves = samplePlanGraph.nodes.filter((n) => n.parentId === "decompositions");

  it("returns valid objectives for exactly the requested leaves", async () => {
    const result = await mockEnrichModule({ profile: sampleProfile, coreNode: core, nodes: leaves });
    expect(checkEnrichment(leaves, result)).toEqual([]);
    expect(result.nodes.map((n) => n.id)).toEqual(leaves.map((n) => n.id));
    expect(result).toEqual(await mockEnrichModule({ profile: sampleProfile, coreNode: core, nodes: leaves }));
  });

  it("is valid for every leaf in the fixture, including single-objective optional nodes", async () => {
    const all = leafNodes(samplePlanGraph);
    const result = await mockEnrichModule({ profile: sampleProfile, coreNode: all[0], nodes: all });
    expect(checkEnrichment(all, result)).toEqual([]);
    for (const n of result.nodes) expect(n.objectives.length).toBeGreaterThanOrEqual(2);
  });

  it("makes up objectives for leaves the fixture does not know", async () => {
    const custom = { ...leaves[0], id: "made_up_topic", title: "Made up topic" };
    const result = await mockEnrichModule({ profile: sampleProfile, coreNode: core, nodes: [custom] });
    expect(checkEnrichment([custom], result)).toEqual([]);
  });

  it("MOCK_AI_FAIL_ENRICH fails all modules or just the named one", async () => {
    vi.stubEnv("MOCK_AI_FAIL_ENRICH", "true");
    await expect(mockEnrichModule({ profile: sampleProfile, coreNode: core, nodes: leaves })).rejects.toBeInstanceOf(AiValidationError);
    vi.stubEnv("MOCK_AI_FAIL_ENRICH", "decompositions");
    await expect(mockEnrichModule({ profile: sampleProfile, coreNode: core, nodes: leaves })).rejects.toBeInstanceOf(AiValidationError);
    const other = samplePlanGraph.nodes.find((n) => n.id === "vectors")!;
    await expect(mockEnrichModule({ profile: sampleProfile, coreNode: other, nodes: [] })).resolves.toEqual({ nodes: [] });
  });
});

describe("mockEditGraph", () => {
  it("answers 'skip the calculus, I only have 3 hours a week' with valid ops that exclude the calculus module", async () => {
    const graph = await mockGenerateGraph(sampleProfile);
    const reply = await edit("skip the calculus, I only have 3 hours a week", graph);
    expect(reply.ops.length).toBeGreaterThan(0);
    const next = applyOps(graph, reply.ops);
    expect(validateGraph(next)).toEqual({ ok: true });
    const scope = (id: string) => next.nodes.find((n) => n.id === id)?.scope;
    for (const id of ["gradients", "partial_derivatives", "gradient_descent", "chain_rule"]) expect(scope(id), id).toBe("excluded");
    expect(scope("vectors")).toBe("included");
    expect(next.nodes).toHaveLength(graph.nodes.length); // demoted, never deleted
    expect(reply.message).toMatch(/3 hours/);
    expect(reply.message.split(/[.!?]\s/).length).toBeLessThanOrEqual(3);
    expect(reply).toEqual(await edit("skip the calculus, I only have 3 hours a week", graph));
  });

  it("says so when there is no calculus left to skip", async () => {
    const graph = await mockGenerateGraph(sampleProfile);
    const first = await edit("skip the calculus", graph);
    const again = await edit("skip the calculus", applyOps(graph, first.ops));
    expect(again.ops).toEqual([]);
  });

  it("returns a no-op helpful reply for other messages", async () => {
    const graph = await mockGenerateGraph(sampleProfile);
    const reply = await edit("hello there", graph);
    expect(reply.ops).toEqual([]);
    expect(reply.message.length).toBeGreaterThan(20);
  });

  it("returns cycle-creating ops for a message containing 'cycle', and does NOT validate them itself", async () => {
    const graph = await mockGenerateGraph(sampleProfile);
    const reply = await edit("please make a cycle", graph);
    expect(reply.ops.length).toBeGreaterThan(0);
    const next = applyOps(graph, reply.ops); // applies fine
    const result = validateGraph(next); // but the validation layer catches it
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/cycle/i);
  });

  it("creates a cycle even when the graph has no prerequisite edges yet", async () => {
    const graph: DraftGraph = { ...samplePlanGraph, edges: [] };
    const ops: GraphOp[] = (await edit("cycle", graph)).ops;
    expect(validateGraph(applyOps(graph, ops)).ok).toBe(false);
  });

  it("fails on 'failtest' or MOCK_AI_FAIL_EDIT", async () => {
    const graph = await mockGenerateGraph(sampleProfile);
    await expect(edit("failtest", graph)).rejects.toBeInstanceOf(AiValidationError);
    vi.stubEnv("MOCK_AI_FAIL_EDIT", "true");
    await expect(edit("hello", graph)).rejects.toBeInstanceOf(AiValidationError);
  });

  it("honors MOCK_AI_DELAY_MS", async () => {
    vi.stubEnv("MOCK_AI_DELAY_MS", "60");
    const graph = await mockGenerateGraph(sampleProfile);
    const start = Date.now();
    await edit("hello", graph);
    expect(Date.now() - start).toBeGreaterThanOrEqual(50);
  });
});

describe("lib/ai entry points under MOCK_AI=true", () => {
  it("every function returns valid data and reports one ok attempt", async () => {
    vi.stubEnv("MOCK_AI", "true");
    const reports: AttemptReport[] = [];
    const onAttempt = (r: AttemptReport) => reports.push(r);

    const graph = await generateGraph(sampleProfile, { onAttempt });
    expect(validateGraph(graph)).toEqual({ ok: true });

    const reply = await editGraph({ profile: sampleProfile, graph, userEditLog: [], messages: [], message: "skip the calculus" }, { onAttempt });
    expect(validateGraph(applyOps(graph, reply.ops))).toEqual({ ok: true });

    const leaves = leafNodes(graph).filter((n) => n.parentId === "vectors");
    const core = graph.nodes.find((n) => n.id === "vectors")!;
    const enriched = await enrichModule({ profile: sampleProfile, coreNode: core, nodes: leaves }, { onAttempt });
    expect(checkEnrichment(leaves, enriched)).toEqual([]);

    expect(reports.map((r) => [r.attempt, r.ok])).toEqual([[1, true], [1, true], [1, true]]);
  });

  it("reports a failed attempt and rethrows when the mock fails", async () => {
    vi.stubEnv("MOCK_AI", "true");
    vi.stubEnv("MOCK_AI_FAIL_GRAPH", "true");
    const reports: AttemptReport[] = [];
    await expect(generateGraph(sampleProfile, { onAttempt: (r) => reports.push(r) })).rejects.toBeInstanceOf(AiValidationError);
    expect(reports).toHaveLength(1);
    expect(reports[0].ok).toBe(false);
  });
});
