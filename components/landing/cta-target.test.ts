import { describe, expect, it } from "vitest";
import { ctaTarget } from "./cta-target";

describe("ctaTarget", () => {
  it("sends new learners to the questionnaire", () => {
    expect(ctaTarget({ step: "questionnaire", activePlanId: null })).toEqual({
      href: "/onboarding",
      label: "Start learning",
    });
  });

  it("falls back to the questionnaire when the state lookup failed", () => {
    expect(ctaTarget(null).href).toBe("/onboarding");
  });

  it("resumes the workshop and generation steps", () => {
    expect(ctaTarget({ step: "workshop", activePlanId: null }).href).toBe("/onboarding/workshop");
    expect(ctaTarget({ step: "generating", activePlanId: null }).href).toBe("/onboarding/generating");
  });

  it("prefers an existing plan over the onboarding step", () => {
    for (const step of ["questionnaire", "workshop", "generating", "done"] as const) {
      expect(ctaTarget({ step, activePlanId: "p1" })).toEqual({
        href: "/plan/p1",
        label: "Continue your plan",
      });
    }
  });

  it("restarts onboarding when done but no plan exists", () => {
    expect(ctaTarget({ step: "done", activePlanId: null }).href).toBe("/onboarding");
  });

  it("encodes plan ids", () => {
    expect(ctaTarget({ step: "done", activePlanId: "a/b" }).href).toBe("/plan/a%2Fb");
  });
});
