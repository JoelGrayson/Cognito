import { describe, expect, it } from "vitest";
import { samplePlanGraph } from "@/fixtures/samplePlanGraph";
import { sampleProfile } from "@/fixtures/sampleProfile";
import type { DraftGraph, GraphOp, WorkshopMessage } from "@/types/learning";
import {
  availableStudyTime,
  leafNodes,
  serializeBudget,
  serializeEdge,
  serializeGraph,
  serializeMessages,
  serializeNode,
  serializeOps,
  serializeProfile,
  timeBudget,
} from "./serialize";

const graph: DraftGraph = samplePlanGraph;

describe("serializeGraph", () => {
  const lines = serializeGraph(graph).split("\n");

  it("writes one pipe-separated line per node: id | title | kind | scope | parentId", () => {
    expect(lines).toContain("vectors | Vectors | core | included | - | 0");
    expect(lines).toContain("dot_product | Dot product | core | included | vectors | 60");
    expect(lines).toContain("tensors | Tensors in practice | optional | included | - | 45");
  });

  it("writes edges as source>target (kind)", () => {
    expect(lines).toContain("vectors>matrices (prerequisite)");
    expect(lines).toContain("matrices>tensors (related)");
    expect(serializeEdge({ id: "x", source: "a", target: "b", kind: "related" })).toBe("a>b (related)");
  });

  it("has exactly one line per node and per edge, plus headers", () => {
    expect(lines).toHaveLength(graph.nodes.length + graph.edges.length + 3);
    expect(lines[0]).toBe(`title: ${graph.title}`);
  });

  it("is far shorter than the JSON form", () => {
    expect(serializeGraph(graph).length).toBeLessThan(JSON.stringify(graph).length / 2);
  });

  it("keeps a title containing a pipe on one line", () => {
    const line = serializeNode({ ...graph.nodes[0], title: "A | B" });
    expect(line.split(" | ")).toHaveLength(6);
    expect(line).toContain("A / B");
  });

  it("marks an empty edge list", () => {
    expect(serializeGraph({ title: "t", nodes: [], edges: [] })).toContain("(none)");
  });

  it("reads back cleanly: every node and edge is recoverable from its line", () => {
    for (const node of graph.nodes) {
      const [id, title, kind, scope, parent, minutes] = serializeNode(node).split(" | ");
      expect([id, title, kind, scope, parent === "-" ? undefined : parent, Number(minutes)]).toEqual([
        node.id, node.title, node.kind, node.scope, node.parentId, node.estMinutes,
      ]);
    }
  });
});

describe("other serializers", () => {
  it("serializeMessages keeps only the last 6", () => {
    const messages: WorkshopMessage[] = Array.from({ length: 9 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: `m${i}`,
    }));
    const text = serializeMessages(messages);
    expect(text.split("\n")).toHaveLength(6);
    expect(text).not.toContain("m2");
    expect(text).toContain("user: m8");
    expect(serializeMessages([])).toBe("(none)");
  });

  it("serializeOps writes one JSON op per line", () => {
    const ops: GraphOp[] = [
      { op: "remove_node", id: "a" },
      { op: "update_node", id: "b", patch: { scope: "excluded" } },
    ];
    expect(serializeOps(ops).split("\n").map((l) => JSON.parse(l))).toEqual(ops);
    expect(serializeOps([])).toBe("(none)");
  });

  it("serializeProfile includes the fields the prompts rely on", () => {
    const text = serializeProfile(sampleProfile);
    expect(text).toContain("goal: learn enough linear algebra");
    expect(text).toContain("hoursPerWeek: 4");
    expect(text).toContain("deadline: 2026-11-01");
    expect(text).toContain("Derivatives=2");
  });
});

describe("time budget", () => {
  const now = new Date("2026-09-20T00:00:00Z"); // 6 weeks before 2026-11-01

  it("finds leaves as nodes nobody names as a parent", () => {
    const leaves = leafNodes(graph);
    expect(leaves.some((n) => n.id === "vectors")).toBe(false);
    expect(leaves.some((n) => n.id === "tensors")).toBe(true);
    expect(leaves).toHaveLength(19);
  });

  it("computes available minutes with 20 percent kept for review", () => {
    const available = availableStudyTime(sampleProfile, now);
    expect(available?.weeks).toBe(6);
    expect(available?.minutes).toBe(Math.round(4 * 60 * 0.8 * 6));
    expect(availableStudyTime({ ...sampleProfile, deadline: undefined }, now)).toBeUndefined();
  });

  it("sums included leaves and reports over budget", () => {
    const budget = timeBudget(sampleProfile, graph, now);
    const included = leafNodes(graph).reduce((s, n) => s + n.estMinutes, 0);
    expect(budget.includedMinutes).toBe(included);
    expect(budget.overByMinutes).toBe(included - 1152);
    expect(serializeBudget(budget)).toContain("OVER BUDGET");
  });

  it("ignores known and excluded leaves and handles no deadline", () => {
    const trimmed: DraftGraph = { ...graph, nodes: graph.nodes.map((n) => ({ ...n, scope: "excluded" as const })) };
    expect(timeBudget({ ...sampleProfile, deadline: undefined }, trimmed, now)).toEqual({ includedMinutes: 0 });
    expect(serializeBudget({ includedMinutes: 0 })).toContain("no deadline");
  });
});
