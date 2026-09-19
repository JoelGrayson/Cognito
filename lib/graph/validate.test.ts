import { describe, expect, it } from "vitest";
import type { DraftGraph, DraftNode, Edge } from "@/types/learning";
import { samplePlanGraph } from "@/fixtures/samplePlanGraph";
import { validateGraph } from "./validate";

const node = (id: string, extra: Partial<DraftNode> = {}): DraftNode => ({
  id, title: id, summary: "", kind: "core", estMinutes: 30, scope: "included", ...extra,
});
const edge = (source: string, target: string, kind: Edge["kind"] = "prerequisite", id = `${source}__${target}`): Edge => ({
  id, source, target, kind,
});
const graph = (nodes: DraftNode[], edges: Edge[] = []): DraftGraph => ({ title: "t", nodes, edges });

function errorsOf(g: DraftGraph): string[] {
  const result = validateGraph(g);
  if (result.ok) throw new Error("expected validation to fail");
  return result.errors;
}

describe("validateGraph", () => {
  it("accepts a valid graph, including the sample plan fixture", () => {
    expect(validateGraph(graph([node("a"), node("b")], [edge("a", "b")]))).toEqual({ ok: true });
    expect(validateGraph(samplePlanGraph)).toEqual({ ok: true });
  });

  it("accepts an empty graph", () => {
    expect(validateGraph(graph([]))).toEqual({ ok: true });
  });

  it("detects a prerequisite cycle and names the nodes", () => {
    const errors = errorsOf(graph([node("a"), node("b"), node("c")], [edge("a", "b"), edge("b", "c"), edge("c", "a")]));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/cycle/i);
    for (const id of ["a", "b", "c"]) expect(errors[0]).toContain(id);
  });

  it("ignores cycles made only of related edges", () => {
    const g = graph([node("a"), node("b")], [edge("a", "b", "related"), edge("b", "a", "related")]);
    expect(validateGraph(g)).toEqual({ ok: true });
  });

  it("detects dangling edges on either end", () => {
    const errors = errorsOf(graph([node("a")], [edge("a", "ghost"), edge("phantom", "a")]));
    expect(errors).toHaveLength(2);
    expect(errors.join("\n")).toContain("ghost");
    expect(errors.join("\n")).toContain("phantom");
  });

  it("detects a self loop", () => {
    const errors = errorsOf(graph([node("a")], [edge("a", "a")]));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/self loop/i);
  });

  it("detects duplicate node ids once per id", () => {
    const errors = errorsOf(graph([node("a"), node("a"), node("a")]));
    expect(errors).toEqual(['Duplicate node id "a".']);
  });

  it("detects duplicate edge ids", () => {
    const errors = errorsOf(graph([node("a"), node("b"), node("c")], [edge("a", "b", "prerequisite", "e"), edge("b", "c", "prerequisite", "e")]));
    expect(errors).toEqual(['Duplicate edge id "e".']);
  });

  it("detects ids that break the pattern", () => {
    const errors = errorsOf(graph([node("Has Space"), node("UPPER"), node("x".repeat(61)), node("")]));
    expect(errors).toHaveLength(4);
    expect(errors[0]).toContain("Has Space");
  });

  it("detects a parent that is itself a child (depth over 2)", () => {
    const errors = errorsOf(graph([node("top", { estMinutes: 0 }), node("mid", { parentId: "top", estMinutes: 0 }), node("leaf", { parentId: "mid" })]));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("leaf");
    expect(errors[0]).toMatch(/depth/i);
  });

  it("detects a missing parent and a self parent", () => {
    const errors = errorsOf(graph([node("a", { parentId: "nope" }), node("b", { parentId: "b" })]));
    expect(errors).toHaveLength(2);
  });

  it("detects a container with nonzero estMinutes", () => {
    const errors = errorsOf(graph([node("parent", { estMinutes: 45 }), node("child", { parentId: "parent" })]));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("parent");
    expect(errors[0]).toContain("45");
  });

  it("allows a leaf with zero minutes and a container with zero", () => {
    expect(validateGraph(graph([node("p", { estMinutes: 0 }), node("c", { parentId: "p", estMinutes: 0 })]))).toEqual({ ok: true });
  });

  it("rejects more than 30 nodes but accepts exactly 30", () => {
    const make = (n: number) => graph(Array.from({ length: n }, (_, i) => node(`n${i}`)));
    expect(validateGraph(make(30))).toEqual({ ok: true });
    const errors = errorsOf(make(31));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("31");
  });

  it("returns every error together", () => {
    const errors = errorsOf(
      graph(
        [node("a"), node("a"), node("Bad Id"), node("p", { estMinutes: 10 }), node("c", { parentId: "p" })],
        [edge("a", "ghost"), edge("a", "a", "prerequisite", "loop"), edge("a", "Bad Id", "prerequisite", "e1"), edge("Bad Id", "a", "prerequisite", "e2")],
      ),
    );
    expect(errors.length).toBeGreaterThanOrEqual(6);
    const text = errors.join("\n");
    for (const needle of ["Duplicate node id", "Bad Id", "Container", "ghost", "self loop", "cycle"]) {
      expect(text).toContain(needle);
    }
  });
});
