"use client";

import { useEffect } from "react";
import { ensureAnonymousSession } from "@/lib/auth-client";
import { useOnboarding } from "@/lib/stores/onboarding";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Mascot } from "@/components/Mascot";
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-14 pb-20 sm:pt-20 sm:pb-12">
      <div className="relative flex flex-1 flex-col rounded-3xl border bg-card p-5 shadow-[0_2px_10px_rgb(59_42_31/0.06)] sm:flex-none sm:p-10">
        <div className="absolute -top-8 right-0 sm:-right-5">
          <Mascot size={60} />
        </div>
      {status === "error" ? (
        <div role="alert" className="my-auto text-center">
          <p className="text-lg font-semibold">We could not load your answers.</p>
          <Button type="button" size="xl" className="mt-4" onClick={() => void hydrate({ edit, fresh })}>
            Try again
          </Button>
        </div>
      ) : status === "loading" ? (
        <div aria-busy="true" aria-label="Loading" className="space-y-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          <ProgressBar step={step} />
          <Step key={step} />
        </>
      )}
      </div>
    </main>
  );
}
