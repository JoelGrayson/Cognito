import { describe, expect, it } from "vitest";
import { getNextNode, getUserState } from "./index";
import { onboardingRepo, planRepo } from "@/lib/repo";

const node = (id: string) => ({
  id, title: id, summary: "", kind: "core" as const, estMinutes: 30, scope: "included" as const, objectives: ["Explain " + id],
});
const base = {
  title: "t",
  profile: { goal: "g", goalType: "curiosity" as const, hoursPerWeek: 3, priorKnowledge: [], preferences: { formats: ["reading" as const], pace: "steady" as const } },
  graph: { title: "t", nodes: [node("a"), node("b")], edges: [] },
  order: ["a", "b"],
  schedule: [{ week: 1, nodeIds: ["a", "b"], minutes: 60 }],
};

describe("getNextNode", () => {
  it("returns the first leaf that is not done", async () => {
    const plan = await planRepo.create("u-next", base);
    expect(getNextNode(plan, {})?.id).toBe("a");
    expect(getNextNode(plan, { a: "done" })?.id).toBe("b");
    expect(getNextNode(plan, { a: "in_progress" })?.id).toBe("a");
    expect(getNextNode(plan, { a: "done", b: "done" })).toBeNull();
  });
});

describe("getUserState", () => {
  it("reports step and active plan", async () => {
    expect(await getUserState("u-state")).toEqual({ step: "questionnaire", activePlanId: null });
    await onboardingRepo.update("u-state", { step: "workshop" });
    const plan = await planRepo.create("u-state", base);
    expect(await getUserState("u-state")).toEqual({ step: "workshop", activePlanId: plan.id });
  });
});
