import { STEP_COUNT } from "@/lib/onboarding/profile";
import { Progress } from "@/components/ui/progress";

export function ProgressBar({ step }: { step: number }) {
  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between text-[13px] font-medium text-muted-foreground">
        <span>
          Step {step} of {STEP_COUNT}
        </span>
      </div>
      <Progress
        value={(step / STEP_COUNT) * 100}
        aria-label="Questionnaire progress"
        aria-valuetext={`Step ${step} of ${STEP_COUNT}`}
        className="h-1.5"
      />
    </div>
  );
}
