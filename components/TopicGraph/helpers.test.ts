import { describe, expect, it } from "vitest";
import { samplePlanGraph } from "@/fixtures/samplePlanGraph";
import { GraphOp, NodeId } from "@/types/learning";
import {
  buildAddChildOps,
  buildEditOps,
  buildRemoveOps,
  buildScopeOps,
  canAddChild,
  containerMinutes,
  formatMinutes,
  looksLikePlanGraph,
  makeNodeId,
  resolveProgress,
} from "./helpers";

const node = (id: string) => samplePlanGraph.nodes.find((n) => n.id === id)!;

describe("makeNodeId", () => {
  it("slugs a title into a valid id", () => {
    expect(makeNodeId("Café: Ünïcode & Symbols!", [])).toBe("cafe_unicode_symbols");
    expect(NodeId.safeParse(makeNodeId("  --  ", [])).success).toBe(true);
    expect(makeNodeId("???", [])).toBe("topic");
  });
  it("is unique against the graph", () => {
    expect(makeNodeId("Vectors", ["vectors"])).toBe("vectors_2");
    expect(makeNodeId("Vectors", ["vectors", "vectors_2"])).toBe("vectors_3");
  });
  it("respects the 60 character cap", () => {
    const id = makeNodeId("x".repeat(200), ["x".repeat(50)]);
    expect(id.length).toBeLessThanOrEqual(60);
    expect(NodeId.safeParse(id).success).toBe(true);
  });
});

describe("op builders", () => {
  it("adds a child under a container as one valid add_node", () => {
    const ops = buildAddChildOps(samplePlanGraph, node("vectors"), "Cross product");
    expect(ops).toHaveLength(1);
    expect(ops.every((op) => GraphOp.safeParse(op).success)).toBe(true);
    expect(ops[0]).toMatchObject({
      op: "add_node",
      node: { id: "cross_product", parentId: "vectors", estMinutes: 30, kind: "core", scope: "included" },
    });
  });

  it("zeroes a leaf that becomes a container", () => {
    const ops = buildAddChildOps(samplePlanGraph, node("tensors"), "Broadcasting");
    expect(ops[0]).toEqual({ op: "update_node", id: "tensors", patch: { estMinutes: 0 } });
    expect(ops[1]).toMatchObject({ op: "add_node", node: { parentId: "tensors" } });
  });

  it("refuses to add under a child, or with an empty title", () => {
    expect(canAddChild(node("dot_product"))).toBe(false);
    expect(buildAddChildOps(samplePlanGraph, node("dot_product"), "Nope")).toEqual([]);
    expect(buildAddChildOps(samplePlanGraph, node("vectors"), "   ")).toEqual([]);
  });

  it("only patches what changed", () => {
    expect(buildEditOps(node("norms"), { title: "Norms and distance", summary: node("norms").summary })).toEqual([]);
    expect(buildEditOps(node("norms"), { title: " New title ", summary: node("norms").summary })).toEqual([
      { op: "update_node", id: "norms", patch: { title: "New title" } },
    ]);
  });

  it("cascades scope to a container's children", () => {
    const ops = buildScopeOps(samplePlanGraph, node("vectors"), "known");
    expect(ops.map((op) => (op.op === "update_node" ? op.id : ""))).toEqual([
      "vectors",
      "vector_basics",
      "dot_product",
      "norms",
    ]);
    expect(ops.every((op) => GraphOp.safeParse(op).success)).toBe(true);
    expect(buildScopeOps(samplePlanGraph, node("norms"), "included")).toEqual([]);
  });

  it("removes with a single remove_node", () => {
    expect(buildRemoveOps(node("vectors"))).toEqual([{ op: "remove_node", id: "vectors" }]);
  });
});

describe("display helpers", () => {
  it("sums included children for a container", () => {
    expect(containerMinutes(samplePlanGraph, "vectors")).toBe(150);
    expect(containerMinutes(samplePlanGraph, "tensors")).toBe(0);
  });

  it("formats minutes", () => {
    expect([0, 45, 60, 75].map(formatMinutes)).toEqual(["0 min", "45 min", "1 h", "1 h 15 min"]);
  });

  it("derives container progress from leaves", () => {
    expect(resolveProgress(samplePlanGraph, {}).vectors).toBe("todo");
    expect(resolveProgress(samplePlanGraph, { vector_basics: "done" }).vectors).toBe("in_progress");
    expect(
      resolveProgress(samplePlanGraph, { vector_basics: "done", dot_product: "done", norms: "done" }).vectors,
    ).toBe("done");
    expect(resolveProgress(samplePlanGraph, { vectors: "in_progress" }).vectors).toBe("in_progress");
  });

  it("recognises a plan graph by its objectives", () => {
    expect(looksLikePlanGraph(samplePlanGraph)).toBe(true);
    expect(looksLikePlanGraph({ title: "d", nodes: [], edges: [] })).toBe(false);
  });
});
