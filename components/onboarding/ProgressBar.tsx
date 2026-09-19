import { STEP_COUNT } from "@/lib/onboarding/profile";

export function ProgressBar({ step }: { step: number }) {
  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between text-[13px] font-medium text-[#6b6b6b]">
        <span>
          Step {step} of {STEP_COUNT}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Questionnaire progress"
        aria-valuemin={1}
        aria-valuemax={STEP_COUNT}
        aria-valuenow={step}
        aria-valuetext={`Step ${step} of ${STEP_COUNT}`}
        className="h-1.5 overflow-hidden rounded-full bg-[#e6e6e2]"
      >
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
          style={{ width: `${(step / STEP_COUNT) * 100}%` }}
        />
      </div>
    </div>
  );
}
