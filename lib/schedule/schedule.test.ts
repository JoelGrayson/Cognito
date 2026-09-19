import { describe, expect, it } from "vitest";
import type { DraftGraph, DraftNode, Edge } from "@/types/learning";
import { demoPlan } from "@/fixtures/demoPlan";
import { samplePlanGraph } from "@/fixtures/samplePlanGraph";
import { sampleProfile } from "@/fixtures/sampleProfile";
import { computeOrderAndSchedule } from "./schedule";

const NOW = new Date("2026-09-19T00:00:00.000Z");
const node = (id: string, estMinutes: number, extra: Partial<DraftNode> = {}): DraftNode => ({
  id, title: id, summary: "", kind: "core", estMinutes, scope: "included", ...extra,
});
const pre = (source: string, target: string): Edge => ({ id: `${source}__${target}`, source, target, kind: "prerequisite" });
const graph = (nodes: DraftNode[], edges: Edge[] = []): DraftGraph => ({ title: "t", nodes, edges });
// 4 h/week with the default 20% review share is 192 study minutes per week.
const profile = { hoursPerWeek: 4 };

describe("computeOrderAndSchedule: capacity and weeks", () => {
  it("fills weeks using capacity = hoursPerWeek * 60 * (1 - reviewShare)", () => {
    const g = graph([node("a", 100), node("b", 100), node("c", 100), node("d", 100)]);
    const { schedule } = computeOrderAndSchedule(g, profile, { now: NOW });
    expect(schedule).toEqual([
      { week: 1, nodeIds: ["a", "b"], minutes: 200 },
      { week: 2, nodeIds: ["c", "d"], minutes: 200 },
    ]);
  });

  it("a leaf starts a new week only when the minutes before it reach capacity", () => {
    const g = graph([node("a", 96), node("b", 96), node("c", 96)]);
    const { schedule } = computeOrderAndSchedule(g, profile, { now: NOW });
    expect(schedule.map((w) => [w.week, w.nodeIds])).toEqual([[1, ["a", "b"]], [2, ["c"]]]);
    // 191 before "b" is still week 1.
    const g2 = graph([node("a", 191), node("b", 5), node("c", 5)]);
    expect(computeOrderAndSchedule(g2, profile, { now: NOW }).schedule.map((w) => w.nodeIds)).toEqual([["a", "b"], ["c"]]);
  });

  it("honours reviewShare and hoursPerWeek", () => {
    const g = graph([node("a", 100), node("b", 100), node("c", 100)]);
    // 4 h, no review: capacity 240, and every leaf starts before minute 240 so all start in week 1.
    expect(computeOrderAndSchedule(g, profile, { reviewShare: 0, now: NOW }).schedule).toHaveLength(1);
    expect(computeOrderAndSchedule(g, profile, { reviewShare: 0, now: NOW }).schedule[0].nodeIds).toEqual(["a", "b", "c"]);
    // 1 h, 50% review: capacity 30.
    const tight = computeOrderAndSchedule(g, { hoursPerWeek: 1 }, { reviewShare: 0.5, now: NOW }).schedule;
    expect(tight.map((w) => w.week)).toEqual([1, 4, 7]);
  });

  it("puts a leaf longer than a week in its start week and skips the weeks it covers", () => {
    const g = graph([node("long", 600), node("next", 30)]);
    const { schedule } = computeOrderAndSchedule(g, profile, { now: NOW });
    expect(schedule).toEqual([
      { week: 1, nodeIds: ["long"], minutes: 600 },
      { week: 4, nodeIds: ["next"], minutes: 30 },
    ]);
  });

  it("returns empty results for a graph with nothing to schedule", () => {
    expect(computeOrderAndSchedule(graph([]), profile, { now: NOW })).toEqual({ order: [], schedule: [] });
    const allKnown = graph([node("a", 30, { scope: "known" })]);
    expect(computeOrderAndSchedule(allKnown, { ...profile, deadline: "2026-09-20" }, { now: NOW })).toEqual({ order: [], schedule: [] });
  });

  it("keeps zero-minute leaves in the schedule without adding minutes", () => {
    const { schedule } = computeOrderAndSchedule(graph([node("a", 0), node("b", 30)]), profile, { now: NOW });
    expect(schedule).toEqual([{ week: 1, nodeIds: ["a", "b"], minutes: 30 }]);
  });
});

describe("computeOrderAndSchedule: order", () => {
  it("sorts core leaves by prerequisites, ties by array order", () => {
    const g = graph(
      [node("c", 10), node("b", 10), node("a", 10), node("d", 10)],
      [pre("a", "b"), pre("a", "c")],
    );
    expect(computeOrderAndSchedule(g, profile, { now: NOW }).order).toEqual(["a", "c", "b", "d"]);
  });

  it("expands containers into their children in array order", () => {
    const g = graph([
      node("first", 0), node("f2", 10, { parentId: "first" }), node("f1", 10, { parentId: "first" }),
      node("second", 0), node("s1", 10, { parentId: "second" }),
    ], [pre("first", "second")]);
    const { order, schedule } = computeOrderAndSchedule(g, profile, { now: NOW });
    expect(order).toEqual(["f2", "f1", "s1"]);
    expect(schedule.flatMap((w) => w.nodeIds)).toEqual(order);
  });

  it("orders containers by prerequisite edges even when listed in reverse", () => {
    const g = graph([
      node("later", 0), node("l1", 10, { parentId: "later" }),
      node("earlier", 0), node("e1", 10, { parentId: "earlier" }),
    ], [pre("earlier", "later")]);
    expect(computeOrderAndSchedule(g, profile, { now: NOW }).order).toEqual(["e1", "l1"]);
  });

  it("lifts leaf-to-leaf edges to their containers and honours sibling edges", () => {
    const g = graph([
      node("A", 0), node("a1", 10, { parentId: "A" }), node("a2", 10, { parentId: "A" }),
      node("B", 0), node("b1", 10, { parentId: "B" }),
    ], [pre("b1", "a1"), pre("a2", "a1")]);
    expect(computeOrderAndSchedule(g, profile, { now: NOW }).order).toEqual(["b1", "a2", "a1"]);
  });

  it("does not throw when lifted edges form a cycle between containers", () => {
    const g = graph([
      node("A", 0), node("a1", 10, { parentId: "A" }), node("a2", 10, { parentId: "A" }),
      node("B", 0), node("b1", 10, { parentId: "B" }), node("b2", 10, { parentId: "B" }),
    ], [pre("a1", "b1"), pre("b2", "a2")]);
    expect(computeOrderAndSchedule(g, profile, { now: NOW }).order).toEqual(["a1", "a2", "b1", "b2"]);
  });

  it("puts optional leaves after all core leaves", () => {
    const g = graph([
      node("opt1", 10, { kind: "optional" }), node("core1", 10), node("opt2", 10, { kind: "optional" }), node("core2", 10),
    ], [pre("core1", "opt2")]);
    expect(computeOrderAndSchedule(g, profile, { now: NOW }).order).toEqual(["core1", "core2", "opt1", "opt2"]);
  });

  it("treats leaves under an optional container as optional, and optional leaves under core as optional", () => {
    const g = graph([
      node("optbox", 0, { kind: "optional" }), node("ob1", 10, { parentId: "optbox" }),
      node("corebox", 0), node("cb1", 10, { parentId: "corebox" }), node("cb2", 10, { parentId: "corebox", kind: "optional" }),
    ]);
    expect(computeOrderAndSchedule(g, profile, { now: NOW }).order).toEqual(["cb1", "ob1", "cb2"]);
  });

  it("skips known and excluded leaves, and everything under a non-included container", () => {
    const g = graph([
      node("known", 10, { scope: "known" }),
      node("excluded", 10, { scope: "excluded" }),
      node("box", 0, { scope: "excluded" }), node("inside", 10, { parentId: "box" }),
      node("knownbox", 0, { scope: "known" }), node("inside2", 10, { parentId: "knownbox" }),
      node("keep", 10),
    ]);
    const { order, schedule } = computeOrderAndSchedule(g, profile, { now: NOW });
    expect(order).toEqual(["keep"]);
    expect(schedule).toEqual([{ week: 1, nodeIds: ["keep"], minutes: 10 }]);
  });

  it("still respects prerequisites that run through a skipped node", () => {
    // a -> skipped -> b, with b listed first.
    const g = graph([node("b", 10), node("skipped", 10, { scope: "known" }), node("a", 10)], [pre("a", "skipped"), pre("skipped", "b")]);
    expect(computeOrderAndSchedule(g, profile, { now: NOW }).order).toEqual(["a", "b"]);
  });

  it("ignores related edges", () => {
    const g = graph([node("a", 10), node("b", 10)], [{ id: "r", source: "b", target: "a", kind: "related" }]);
    expect(computeOrderAndSchedule(g, profile, { now: NOW }).order).toEqual(["a", "b"]);
  });

  it("is deterministic and does not mutate the graph", () => {
    const g = graph([node("x", 50), node("y", 50), node("z", 50)], [pre("x", "z")]);
    const copy = structuredClone(g);
    const first = computeOrderAndSchedule(g, profile, { now: NOW });
    expect(computeOrderAndSchedule(g, profile, { now: NOW })).toEqual(first);
    expect(g).toEqual(copy);
  });
});

describe("computeOrderAndSchedule: overshoot", () => {
  // 12 leaves of 96 minutes = 1152 minutes = exactly 6 weeks at 192 per week.
  const big = graph(Array.from({ length: 12 }, (_, i) => node(`n${i}`, 96)));

  it("reports overshoot when the last week is after the deadline week", () => {
    // 2026-09-19 to 2026-10-24 is 35 days = 5 weeks.
    const result = computeOrderAndSchedule(big, { ...profile, deadline: "2026-10-24" }, { now: NOW });
    expect(result.overshoot).toEqual({ lastWeek: 6, deadlineWeek: 5 });
    expect(result.schedule.at(-1)?.week).toBe(6);
  });

  it("does not report overshoot when the plan finishes in the deadline week", () => {
    expect(computeOrderAndSchedule(big, { ...profile, deadline: "2026-10-31" }, { now: NOW }).overshoot).toBeUndefined();
    expect(computeOrderAndSchedule(big, { ...profile, deadline: "2027-06-01" }, { now: NOW }).overshoot).toBeUndefined();
  });

  it("rounds partial deadline weeks up, and treats a passed deadline as week 1", () => {
    // 36 days = 5.14 weeks -> 6.
    expect(computeOrderAndSchedule(big, { ...profile, deadline: "2026-10-25" }, { now: NOW }).overshoot).toBeUndefined();
    expect(computeOrderAndSchedule(big, { ...profile, deadline: "2020-01-01" }, { now: NOW }).overshoot).toEqual({ lastWeek: 6, deadlineWeek: 1 });
  });

  it("counts the weeks a long final leaf spans", () => {
    const g = graph([node("a", 100), node("long", 600)]);
    // Starts in week 1 (100 < 192) but 700 minutes end in week 4.
    const result = computeOrderAndSchedule(g, { ...profile, deadline: "2026-10-03" }, { now: NOW });
    expect(result.schedule.map((w) => w.week)).toEqual([1]);
    expect(result.overshoot).toEqual({ lastWeek: 4, deadlineWeek: 2 });
  });

  it("omits overshoot without a deadline or with an unparseable one", () => {
    expect(computeOrderAndSchedule(big, profile, { now: NOW }).overshoot).toBeUndefined();
    expect(computeOrderAndSchedule(big, { ...profile, deadline: "soon" }, { now: NOW }).overshoot).toBeUndefined();
  });
});

describe("computeOrderAndSchedule: fixtures", () => {
  const result = computeOrderAndSchedule(samplePlanGraph, sampleProfile, { now: NOW });

  it("orders the sample plan: core leaves in prerequisite order, then optional", () => {
    expect(result.order).toEqual([
      "vector_basics", "dot_product", "norms",
      "matrix_basics", "matrix_multiplication", "transpose_inverse",
      "matrix_as_map", "span_basis", "rank_null",
      "eigen", "svd", "pca",
      "partial_derivatives", "gradient_descent", "chain_rule",
      "forward_pass", "backprop",
      "tensors", "probability_refresher",
    ]);
    expect(result.schedule.flatMap((w) => w.nodeIds)).toEqual(result.order);
    expect(result.schedule.reduce((sum, w) => sum + w.minutes, 0)).toBe(1200);
  });

  it("fits the sample deadline (ends in week 7 of 7) and overshoots a tighter one", () => {
    expect(result.overshoot).toBeUndefined();
    expect(result.schedule.at(-1)?.week).toBe(6); // the last leaf starts in week 6 and ends in week 7
    const tight = computeOrderAndSchedule(samplePlanGraph, { ...sampleProfile, deadline: "2026-10-15" }, { now: NOW });
    expect(tight.overshoot).toEqual({ lastWeek: 7, deadlineWeek: 4 });
  });

  it("matches the order and schedule in demoPlan", () => {
    const plan = demoPlan("x");
    expect(plan.order).toEqual(result.order);
    expect(plan.schedule).toEqual(result.schedule);
  });
});
