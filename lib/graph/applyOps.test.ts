import { describe, expect, it } from "vitest";
import type { DraftGraph, DraftNode, Edge, PlanGraph, PlanNode } from "@/types/learning";
import { samplePlanGraph } from "@/fixtures/samplePlanGraph";
import { GraphOpError, applyOps, applyPlanOps } from "./applyOps";
import { validateGraph } from "./validate";

const node = (id: string, extra: Partial<DraftNode> = {}): DraftNode => ({
  id, title: id, summary: "", kind: "core", estMinutes: 30, scope: "included", ...extra,
});
const pnode = (id: string, extra: Partial<PlanNode> = {}): PlanNode => ({ ...node(id), objectives: ["Explain it"], ...extra });
const edge = (source: string, target: string, kind: Edge["kind"] = "prerequisite"): Edge => ({
  id: `${source}__${target}`, source, target, kind,
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const draft = (): DraftGraph => ({
  title: "t",
  nodes: [node("p", { estMinutes: 0 }), node("c1", { parentId: "p" }), node("c2", { parentId: "p" }), node("solo")],
  edges: [edge("p", "solo"), edge("c1", "c2", "related"), edge("solo", "c2")],
});

describe("applyOps", () => {
  it("add_node appends a node", () => {
    const next = applyOps(draft(), [{ op: "add_node", node: node("new") }]);
    expect(next.nodes.map((n) => n.id)).toEqual(["p", "c1", "c2", "solo", "new"]);
  });

  it("update_node merges the patch and leaves other fields alone", () => {
    const next = applyOps(draft(), [{ op: "update_node", id: "solo", patch: { title: "Solo!", scope: "known", estMinutes: 10 } }]);
    expect(next.nodes.find((n) => n.id === "solo")).toEqual(node("solo", { title: "Solo!", scope: "known", estMinutes: 10 }));
  });

  it("update_node skips undefined patch values", () => {
    const next = applyOps(draft(), [{ op: "update_node", id: "solo", patch: { title: undefined, summary: "s" } }]);
    expect(next.nodes.find((n) => n.id === "solo")).toMatchObject({ title: "solo", summary: "s" });
  });

  it("update_node refuses to change the id", () => {
    const op = { op: "update_node", id: "solo", patch: { id: "other" } } as unknown as Parameters<typeof applyOps>[1][number];
    expect(() => applyOps(draft(), [op])).toThrow(GraphOpError);
  });

  it("update_node does not silently fix estMinutes for a new container; validateGraph catches it", () => {
    const next = applyOps(draft(), [{ op: "update_node", id: "c2", patch: { parentId: "solo" } }]);
    expect(validateGraph(next).ok).toBe(false);
  });

  it("remove_node cascades to children and every incident edge", () => {
    const next = applyOps(draft(), [{ op: "remove_node", id: "p" }]);
    expect(next.nodes.map((n) => n.id)).toEqual(["solo"]);
    expect(next.edges).toEqual([]);
  });

  it("remove_node on a leaf removes only its own edges", () => {
    const next = applyOps(draft(), [{ op: "remove_node", id: "c2" }]);
    expect(next.nodes.map((n) => n.id)).toEqual(["p", "c1", "solo"]);
    expect(next.edges.map((e) => e.id)).toEqual(["p__solo"]);
  });

  it("add_edge and remove_edge", () => {
    const added = applyOps(draft(), [{ op: "add_edge", edge: edge("c1", "solo") }]);
    expect(added.edges.map((e) => e.id)).toContain("c1__solo");
    const removed = applyOps(added, [{ op: "remove_edge", id: "p__solo" }]);
    expect(removed.edges.map((e) => e.id)).not.toContain("p__solo");
  });

  it("throws GraphOpError for a missing target on update, remove and remove_edge", () => {
    expect(() => applyOps(draft(), [{ op: "update_node", id: "nope", patch: {} }])).toThrow(GraphOpError);
    expect(() => applyOps(draft(), [{ op: "remove_node", id: "nope" }])).toThrow(GraphOpError);
    expect(() => applyOps(draft(), [{ op: "remove_edge", id: "nope" }])).toThrow(GraphOpError);
    expect(() => applyOps(draft(), [{ op: "remove_node", id: "nope" }])).toThrow(/nope/);
  });

  it("targets nodes added earlier in the same batch and a removal makes later targets missing", () => {
    const next = applyOps(draft(), [
      { op: "add_node", node: node("new") },
      { op: "update_node", id: "new", patch: { title: "New" } },
    ]);
    expect(next.nodes.at(-1)?.title).toBe("New");
    expect(() =>
      applyOps(draft(), [{ op: "remove_node", id: "p" }, { op: "update_node", id: "c1", patch: {} }]),
    ).toThrow(GraphOpError);
  });

  it("dedupes colliding node ids with _2, _3 suffixes", () => {
    const next = applyOps(draft(), [
      { op: "add_node", node: node("solo") },
      { op: "add_node", node: node("solo") },
    ]);
    expect(next.nodes.map((n) => n.id).slice(-2)).toEqual(["solo_2", "solo_3"]);
  });

  it("keeps deduped ids within 60 characters", () => {
    const long = "a".repeat(60);
    const g: DraftGraph = { title: "t", nodes: [node(long)], edges: [] };
    const next = applyOps(g, [{ op: "add_node", node: node(long) }]);
    expect(next.nodes[1].id).toBe("a".repeat(58) + "_2");
    expect(validateGraph(next).ok).toBe(true);
  });

  it("rewrites parentId and edge endpoints of the same batch to the deduped id", () => {
    const next = applyOps(draft(), [
      { op: "add_node", node: node("p", { estMinutes: 0 }) },
      { op: "add_node", node: node("kid", { parentId: "p" }) },
      { op: "add_edge", edge: { id: "e1", source: "p", target: "kid", kind: "related" } },
    ]);
    expect(next.nodes.find((n) => n.id === "kid")?.parentId).toBe("p_2");
    expect(next.edges.at(-1)).toMatchObject({ id: "e1", source: "p_2", target: "kid" });
  });

  it("does not rewrite references when nothing collided", () => {
    const next = applyOps(draft(), [
      { op: "add_node", node: node("kid", { parentId: "p" }) },
      { op: "add_edge", edge: edge("kid", "solo") },
    ]);
    expect(next.nodes.at(-1)?.parentId).toBe("p");
    expect(next.edges.at(-1)).toMatchObject({ source: "kid", target: "solo" });
  });

  it("dedupes duplicate edge ids", () => {
    const next = applyOps(draft(), [
      { op: "add_edge", edge: edge("p", "solo") },
      { op: "add_edge", edge: edge("p", "solo") },
    ]);
    expect(next.edges.map((e) => e.id).slice(-2)).toEqual(["p__solo_2", "p__solo_3"]);
  });

  it("does not mutate the input, even when frozen", () => {
    const input = deepFreeze(draft());
    const snapshot = structuredClone(input);
    const next = applyOps(input, [
      { op: "add_node", node: node("new") },
      { op: "update_node", id: "solo", patch: { title: "X" } },
      { op: "remove_node", id: "p" },
      { op: "add_edge", edge: edge("new", "solo") },
    ]);
    expect(input).toEqual(snapshot);
    expect(next).not.toBe(input);
  });

  it("does not share node objects with the input or with the op", () => {
    const input = draft();
    const op = { op: "add_node" as const, node: node("new", { objectives: ["a"] }) };
    const next = applyOps(input, [op]);
    next.nodes[0].title = "changed";
    next.nodes.at(-1)!.objectives!.push("b");
    expect(input.nodes[0].title).toBe("p");
    expect(op.node.objectives).toEqual(["a"]);
  });

  it("returns an equal copy for no ops", () => {
    const input = draft();
    const next = applyOps(input, []);
    expect(next).toEqual(input);
    expect(next).not.toBe(input);
  });
});

describe("applyPlanOps", () => {
  it("remove_node excludes the node and its children, keeps ids and edges", () => {
    const next = applyPlanOps(samplePlanGraph, [{ op: "remove_node", id: "decompositions" }]);
    const scope = (id: string) => next.nodes.find((n) => n.id === id)?.scope;
    expect(scope("decompositions")).toBe("excluded");
    for (const child of ["eigen", "svd", "pca"]) expect(scope(child)).toBe("excluded");
    expect(scope("vectors")).toBe("included");
    expect(next.nodes.map((n) => n.id)).toEqual(samplePlanGraph.nodes.map((n) => n.id));
    expect(next.edges).toEqual(samplePlanGraph.edges);
    expect(validateGraph(next).ok).toBe(true);
  });

  it("remove_node on a leaf excludes only that leaf", () => {
    const next = applyPlanOps(samplePlanGraph, [{ op: "remove_node", id: "svd" }]);
    expect(next.nodes.filter((n) => n.scope === "excluded").map((n) => n.id)).toEqual(["svd"]);
  });

  it("does not mutate the saved plan", () => {
    const input = deepFreeze(structuredClone(samplePlanGraph));
    applyPlanOps(input, [{ op: "remove_node", id: "vectors" }]);
    expect(input).toEqual(samplePlanGraph);
  });

  it("throws GraphOpError for a missing target", () => {
    expect(() => applyPlanOps(samplePlanGraph, [{ op: "remove_node", id: "nope" }])).toThrow(GraphOpError);
    expect(() => applyPlanOps(samplePlanGraph, [{ op: "update_node", id: "nope", patch: {} }])).toThrow(GraphOpError);
  });

  it("add_node requires objectives", () => {
    const g: PlanGraph = { title: "t", nodes: [pnode("a")], edges: [] };
    expect(() => applyPlanOps(g, [{ op: "add_node", node: node("b") }])).toThrow(GraphOpError);
    expect(() => applyPlanOps(g, [{ op: "add_node", node: node("b", { objectives: [] }) }])).toThrow(GraphOpError);
    const next = applyPlanOps(g, [{ op: "add_node", node: node("b", { objectives: ["Explain b"] }) }]);
    expect(next.nodes.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("update_node cannot empty the objectives", () => {
    const g: PlanGraph = { title: "t", nodes: [pnode("a")], edges: [] };
    expect(() => applyPlanOps(g, [{ op: "update_node", id: "a", patch: { objectives: [] } }])).toThrow(GraphOpError);
    const next = applyPlanOps(g, [{ op: "update_node", id: "a", patch: { objectives: ["Derive a"], scope: "known" } }]);
    expect(next.nodes[0]).toMatchObject({ objectives: ["Derive a"], scope: "known" });
  });

  it("add_edge and remove_edge are allowed", () => {
    const g: PlanGraph = { title: "t", nodes: [pnode("a"), pnode("b")], edges: [edge("a", "b")] };
    const next = applyPlanOps(g, [
      { op: "remove_edge", id: "a__b" },
      { op: "add_edge", edge: edge("b", "a") },
    ]);
    expect(next.edges.map((e) => e.id)).toEqual(["b__a"]);
    expect(() => applyPlanOps(g, [{ op: "remove_edge", id: "nope" }])).toThrow(GraphOpError);
  });

  it("dedupes an added node id against existing (including excluded) nodes", () => {
    const g: PlanGraph = { title: "t", nodes: [pnode("a", { scope: "excluded" })], edges: [] };
    const next = applyPlanOps(g, [{ op: "add_node", node: node("a", { objectives: ["x"] }) }]);
    expect(next.nodes.map((n) => n.id)).toEqual(["a", "a_2"]);
  });
});
