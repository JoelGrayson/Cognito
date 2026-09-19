import type { OnboardingStep } from "@/types/learning";

export type LandingState = { step: OnboardingStep; activePlanId: string | null };
export type CtaTarget = { href: string; label: string };

const START: CtaTarget = { href: "/onboarding", label: "Start learning" };

/** Where the landing CTA points. `null` (state lookup failed) behaves like a new learner. */
export function ctaTarget(state: LandingState | null): CtaTarget {
  if (!state) return START;
  if (state.activePlanId) {
    return { href: `/plan/${encodeURIComponent(state.activePlanId)}`, label: "Continue your plan" };
  }
  if (state.step === "workshop") return { href: "/onboarding/workshop", label: "Continue" };
  if (state.step === "generating") return { href: "/onboarding/generating", label: "Continue" };
  return START;
}
