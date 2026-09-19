import { describe, expect, it } from "vitest";
import type { DraftGraph, DraftNode, Edge, GraphOp } from "@/types/learning";
import { applyOps } from "./applyOps";
import { diffGraphs, touchedIds } from "./diff";

const node = (id: string, extra: Partial<DraftNode> = {}): DraftNode => ({
  id, title: id, summary: "", kind: "core", estMinutes: 30, scope: "included", ...extra,
});
const edge = (source: string, target: string): Edge => ({ id: `${source}__${target}`, source, target, kind: "prerequisite" });

describe("touchedIds", () => {
  it("collects node and edge ids in first-seen order without duplicates", () => {
    const ops: GraphOp[] = [
      { op: "add_node", node: node("a") },
      { op: "update_node", id: "b", patch: { title: "B" } },
      { op: "remove_node", id: "c" },
      { op: "add_edge", edge: edge("a", "b") },
      { op: "remove_edge", id: "old_edge" },
      { op: "update_node", id: "a", patch: { summary: "x" } },
    ];
    expect(touchedIds(ops)).toEqual(["a", "b", "c", "a__b", "old_edge"]);
  });

  it("returns an empty list for no ops", () => {
    expect(touchedIds([])).toEqual([]);
  });
});

describe("diffGraphs", () => {
  const prev: DraftGraph = {
    title: "t",
    nodes: [node("a"), node("b"), node("c", { objectives: ["x", "y"] })],
    edges: [edge("a", "b"), edge("b", "c")],
  };

  it("reports nothing for identical graphs", () => {
    expect(diffGraphs(prev, structuredClone(prev))).toEqual({ added: [], changed: [], removed: [] });
  });

  it("reports added, changed and removed ids for nodes and edges", () => {
    const next: DraftGraph = {
      title: "t",
      nodes: [node("a", { title: "Renamed" }), node("c", { objectives: ["x", "y"] }), node("d")],
      edges: [edge("a", "d")],
    };
    expect(diffGraphs(prev, next)).toEqual({
      added: ["d", "a__d"],
      changed: ["a"],
      removed: ["b", "a__b", "b__c"],
    });
  });

  it("detects nested changes and ignores key order and undefined values", () => {
    const next = structuredClone(prev);
    next.nodes[2] = node("c", { objectives: ["x", "z"] });
    expect(diffGraphs(prev, next).changed).toEqual(["c"]);

    const reordered: DraftGraph = { ...prev, nodes: prev.nodes.map((n) => ({ ...Object.fromEntries(Object.entries(n).reverse()), parentId: undefined }) as DraftNode) };
    expect(diffGraphs(prev, reordered)).toEqual({ added: [], changed: [], removed: [] });
  });

  it("agrees with applyOps", () => {
    const next = applyOps(prev, [
      { op: "update_node", id: "b", patch: { scope: "known" } },
      { op: "remove_node", id: "c" },
      { op: "add_node", node: node("d") },
    ]);
    expect(diffGraphs(prev, next)).toEqual({ added: ["d"], changed: ["b"], removed: ["c", "b__c"] });
  });
});
