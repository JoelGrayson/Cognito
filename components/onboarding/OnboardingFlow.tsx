"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useOnboarding } from "@/lib/stores/onboarding";
import { ProgressBar } from "./ProgressBar";
import { Step1Goal } from "./Step1Goal";
import { Step2Why } from "./Step2Why";
import { Step3Time } from "./Step3Time";
import { Step4Concepts } from "./Step4Concepts";
import { Step5Style } from "./Step5Style";

const STEPS = { 1: Step1Goal, 2: Step2Why, 3: Step3Time, 4: Step4Concepts, 5: Step5Style } as const;

/** `edit` reopens the questionnaire after it was completed (Back from the workshop). */
export function OnboardingFlow({ edit = false }: { edit?: boolean }) {
  const router = useRouter();
  const status = useOnboarding((s) => s.status);
  const step = useOnboarding((s) => s.step);
  const serverStep = useOnboarding((s) => s.serverStep);
  const hydrate = useOnboarding((s) => s.hydrate);

  useEffect(() => {
    void hydrate({ edit });
  }, [hydrate, edit]);

  const leaving = status === "ready" && serverStep === "workshop" && !edit;
  useEffect(() => {
    if (leaving) router.replace("/onboarding/workshop");
  }, [leaving, router]);

  const Step = STEPS[step];

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-6 pb-20 sm:py-12">
      {status === "error" ? (
        <div role="alert" className="my-auto text-center">
          <p className="text-lg font-semibold">We could not load your answers.</p>
          <button
            type="button"
            onClick={() => void hydrate({ edit })}
            className="mt-4 min-h-12 rounded-full bg-[var(--accent)] px-7 text-[15px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
          >
            Try again
          </button>
        </div>
      ) : status === "loading" || leaving ? (
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
