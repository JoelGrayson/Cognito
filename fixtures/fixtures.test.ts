import { describe, expect, it } from "vitest";
import { LearnerProfile, PlanGraph, StudyPlan } from "@/types/learning";
import { getPlan } from "@/lib/plans";
import { demoPlan } from "./demoPlan";
import { samplePlanGraph } from "./samplePlanGraph";
import { sampleProfile } from "./sampleProfile";

describe("fixtures", () => {
  it("parse against the contract", () => {
    expect(LearnerProfile.safeParse(sampleProfile).success).toBe(true);
    expect(PlanGraph.safeParse(samplePlanGraph).success).toBe(true);
    expect(StudyPlan.safeParse(demoPlan("u")).success).toBe(true);
  });

  it("has containers at 0 minutes and leaves with objectives", () => {
    const parents = new Set(samplePlanGraph.nodes.map((n) => n.parentId).filter(Boolean));
    for (const n of samplePlanGraph.nodes) {
      if (parents.has(n.id)) expect(n.estMinutes, n.id).toBe(0);
      else expect(n.estMinutes, n.id).toBeGreaterThan(0);
      expect(n.objectives.length, n.id).toBeGreaterThan(0);
    }
    expect(samplePlanGraph.nodes).toHaveLength(25);
  });

  it("has unique ids and edges that reference existing nodes", () => {
    const ids = samplePlanGraph.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of samplePlanGraph.edges) {
      expect(ids).toContain(e.source);
      expect(ids).toContain(e.target);
    }
  });

  it("demo order is exactly the leaves, and the schedule covers them in order", () => {
    const plan = demoPlan("u");
    const parents = new Set(plan.graph.nodes.map((n) => n.parentId).filter(Boolean));
    const leaves = plan.graph.nodes.filter((n) => !parents.has(n.id)).map((n) => n.id);
    expect([...plan.order].sort()).toEqual([...leaves].sort());
    expect(plan.schedule.flatMap((w) => w.nodeIds)).toEqual(plan.order);
  });

  it("getPlan('demo') returns the fixture for any user without storing it", async () => {
    const plan = await getPlan("demo", "anyone");
    expect(plan?.id).toBe("demo");
    expect(plan?.userId).toBe("anyone");
  });
});
