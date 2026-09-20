"use client";

import { useEffect } from "react";
import { ensureAnonymousSession } from "@/lib/auth-client";
import { useOnboarding } from "@/lib/stores/onboarding";
import { ProgressBar } from "./ProgressBar";
import { Step1Goal } from "./Step1Goal";
import { Step2Start } from "./Step2Start";

const STEPS = { 1: Step1Goal, 2: Step2Start } as const;

/**
 * `edit` reopens the questionnaire on the last screen (Back from the workshop).
 * `fresh` ("New learning plan" in the nav) always starts at the first screen.
 */
export function OnboardingFlow({ edit = false, fresh = false }: { edit?: boolean; fresh?: boolean }) {
  const status = useOnboarding((s) => s.status);
  const step = useOnboarding((s) => s.step);
  const hydrate = useOnboarding((s) => s.hydrate);

  useEffect(() => {
    let cancelled = false;
    // The API needs a session; create the anonymous one before loading saved state.
    // If sign-in fails, hydrate still runs and shows its error state.
    ensureAnonymousSession()
      .catch(() => {})
      .then(() => { if (!cancelled) void hydrate({ edit, fresh }); });
    return () => { cancelled = true; };
  }, [hydrate, edit, fresh]);

  const Step = STEPS[step];

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-6 pb-20 sm:py-12">
      {status === "error" ? (
        <div role="alert" className="my-auto text-center">
          <p className="text-lg font-semibold">We could not load your answers.</p>
          <button
            type="button"
            onClick={() => void hydrate({ edit, fresh })}
            className="mt-4 min-h-12 rounded-full bg-[var(--accent)] px-7 text-[15px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
          >
            Try again
          </button>
        </div>
      ) : status === "loading" ? (
        <div aria-busy="true" aria-label="Loading" className="space-y-4">
          <div className="skeleton !min-h-3" />
          <div className="skeleton !min-h-12 w-3/4" />
          <div className="skeleton !min-h-24" />
        </div>
      ) : (
        <>
          <ProgressBar step={step} />
          <Step key={step} />
        </>
      )}
    </main>
  );
}
