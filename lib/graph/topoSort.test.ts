import { describe, expect, it } from "vitest";
import type { DraftGraph, DraftNode, Edge } from "@/types/learning";
import { samplePlanGraph } from "@/fixtures/samplePlanGraph";
import { topoSort } from "./topoSort";

const node = (id: string): DraftNode => ({ id, title: id, summary: "", kind: "core", estMinutes: 30, scope: "included" });
const edge = (source: string, target: string, kind: Edge["kind"] = "prerequisite"): Edge => ({
  id: `${source}__${target}`, source, target, kind,
});
const graph = (ids: string[], edges: Edge[] = []): DraftGraph => ({ title: "t", nodes: ids.map(node), edges });

describe("topoSort", () => {
  it("puts prerequisites before their dependents", () => {
    expect(topoSort(graph(["c", "b", "a"], [edge("a", "b"), edge("b", "c")]))).toEqual(["a", "b", "c"]);
  });

  it("breaks ties by array order", () => {
    expect(topoSort(graph(["x", "y", "z"]))).toEqual(["x", "y", "z"]);
    expect(topoSort(graph(["z", "y", "x"]))).toEqual(["z", "y", "x"]);
    // b and c are both ready after a; b is earlier in the array.
    expect(topoSort(graph(["a", "c", "b", "d"], [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")]))).toEqual([
      "a", "c", "b", "d",
    ]);
  });

  it("picks the earliest ready node, not the earliest discovered", () => {
    // early has no prerequisites but sits after late in the array; late is unblocked by root.
    expect(topoSort(graph(["root", "late", "early"], [edge("root", "late")]))).toEqual(["root", "late", "early"]);
  });

  it("ignores related edges", () => {
    expect(topoSort(graph(["a", "b"], [edge("b", "a", "related")]))).toEqual(["a", "b"]);
    expect(topoSort(graph(["a", "b"], [edge("a", "b", "related"), edge("b", "a", "related")]))).toEqual(["a", "b"]);
  });

  it("ignores edges to unknown nodes", () => {
    expect(topoSort(graph(["a", "b"], [edge("a", "ghost")]))).toEqual(["a", "b"]);
  });

  it("throws on a cycle and names it", () => {
    expect(() => topoSort(graph(["a", "b", "c"], [edge("a", "b"), edge("b", "c"), edge("c", "a")]))).toThrow(/cycle.*a/);
  });

  it("throws on a self loop", () => {
    expect(() => topoSort(graph(["a"], [edge("a", "a")]))).toThrow(/cycle/);
  });

  it("is deterministic and complete on the sample plan", () => {
    const order = topoSort(samplePlanGraph);
    expect(order).toEqual(topoSort(samplePlanGraph));
    expect([...order].sort()).toEqual(samplePlanGraph.nodes.map((n) => n.id).sort());
    expect(order.indexOf("vectors")).toBeLessThan(order.indexOf("matrices"));
    expect(order.indexOf("decompositions")).toBeLessThan(order.indexOf("nn_math"));
  });

  it("does not mutate the graph", () => {
    const g = graph(["b", "a"], [edge("a", "b")]);
    const copy = structuredClone(g);
    topoSort(g);
    expect(g).toEqual(copy);
  });
});
