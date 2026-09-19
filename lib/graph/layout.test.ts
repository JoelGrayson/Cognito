import { describe, expect, it } from "vitest";
import { samplePlanGraph } from "@/fixtures/samplePlanGraph";
import type { DraftGraph } from "@/types/learning";
import { CONTAINER_HEADER_HEIGHT, layoutGraph, type Point, type Size } from "./layout";

type Box = Point & Size;

const boxOf = (layout: ReturnType<typeof layoutGraph>, id: string): Box => ({
  ...layout.positions[id],
  ...layout.sizes[id],
});

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe.each([{ leafColumns: 3 }, { leafColumns: 1 }, {}])("layoutGraph %j", (options) => {
  const layout = layoutGraph(samplePlanGraph, options);
  const parentOf = (id: string) => samplePlanGraph.nodes.find((n) => n.id === id)?.parentId;

  it("positions and sizes every node id", () => {
    for (const node of samplePlanGraph.nodes) {
      expect(layout.positions[node.id], node.id).toBeDefined();
      expect(layout.sizes[node.id], node.id).toBeDefined();
      expect(Number.isFinite(layout.positions[node.id].x)).toBe(true);
      expect(Number.isFinite(layout.positions[node.id].y)).toBe(true);
    }
  });

  it("never overlaps two boxes that are not nested", () => {
    const ids = samplePlanGraph.nodes.map((n) => n.id);
    for (const a of ids) {
      for (const b of ids) {
        if (a >= b) continue;
        const nested = parentOf(a) === b || parentOf(b) === a;
        if (nested) continue;
        expect(overlaps(boxOf(layout, a), boxOf(layout, b)), `${a} vs ${b}`).toBe(false);
      }
    }
  });

  it("keeps children inside their group box, below its header", () => {
    for (const node of samplePlanGraph.nodes.filter((n) => n.parentId)) {
      const parent = boxOf(layout, node.parentId!);
      const child = boxOf(layout, node.id);
      expect(child.x).toBeGreaterThanOrEqual(parent.x);
      expect(child.x + child.width).toBeLessThanOrEqual(parent.x + parent.width);
      expect(child.y).toBeGreaterThanOrEqual(parent.y + CONTAINER_HEADER_HEIGHT);
      expect(child.y + child.height).toBeLessThanOrEqual(parent.y + parent.height);
    }
  });

  it("is deterministic", () => {
    expect(layoutGraph(samplePlanGraph, options)).toEqual(layout);
  });

  it("returns one containment edge per child", () => {
    const children = samplePlanGraph.nodes.filter((n) => n.parentId);
    expect(layout.containmentEdges).toHaveLength(children.length);
    for (const child of children) {
      expect(layout.containmentEdges).toContainEqual(
        expect.objectContaining({ source: child.parentId, target: child.id }),
      );
    }
  });
});

describe("layoutGraph structure", () => {
  const layout = layoutGraph(samplePlanGraph);

  it("puts prerequisites above their dependants", () => {
    for (const edge of samplePlanGraph.edges.filter((e) => e.kind === "prerequisite")) {
      expect(layout.positions[edge.source].y).toBeLessThan(layout.positions[edge.target].y);
    }
  });

  it("copes with an empty graph and with a dangling parent", () => {
    expect(layoutGraph({ title: "t", nodes: [], edges: [] }).positions).toEqual({});
    const odd: DraftGraph = {
      title: "t",
      nodes: [{ id: "a", title: "A", summary: "", kind: "core", estMinutes: 10, scope: "included", parentId: "ghost" }],
      edges: [{ id: "e", source: "a", target: "ghost", kind: "prerequisite" }],
    };
    expect(layoutGraph(odd).positions.a).toBeDefined();
  });
});
