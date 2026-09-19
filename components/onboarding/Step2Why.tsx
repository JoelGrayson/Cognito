"use client";

import { localToday, stepError } from "@/lib/onboarding/profile";
import { useOnboarding } from "@/lib/stores/onboarding";
import type { LearnerProfile } from "@/types/learning";
import { Choice, ChoiceGroup, FieldLabel, inputClass, StepShell } from "./ui";

const REASONS: { value: LearnerProfile["goalType"]; label: string; description: string }[] = [
  { value: "career", label: "Career", description: "A new role or a promotion" },
  { value: "exam", label: "Exam", description: "A test or certification" },
  { value: "project", label: "Project", description: "Something I want to build" },
  { value: "curiosity", label: "Curiosity", description: "Because it is interesting" },
];

function tomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return localToday(date);
}

export function Step2Why() {
  const profile = useOnboarding((s) => s.profile);
  const setProfile = useOnboarding((s) => s.setProfile);
  const advance = useOnboarding((s) => s.advance);
  const back = useOnboarding((s) => s.back);

  return (
    <StepShell
      title="Why, and by when?"
      hint="This shapes how deep the roadmap goes and how it is paced."
      validate={() => stepError(2, profile)}
      onSubmit={() => advance()}
      onBack={back}
    >
      <ChoiceGroup label="Why are you learning this?" className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        {REASONS.map((reason) => (
          <Choice
            key={reason.value}
            type="radio"
            name="goalType"
            variant="card"
            value={reason.value}
            checked={profile.goalType === reason.value}
            onChange={() => setProfile({ goalType: reason.value })}
            description={reason.description}
          >
            {reason.label}
          </Choice>
        ))}
      </ChoiceGroup>

      <div className="mt-7">
        <FieldLabel htmlFor="deadline">Target date (optional)</FieldLabel>
        <div className="flex items-center gap-2">
          <input
            id="deadline"
            name="deadline"
            type="date"
            min={tomorrow()}
            value={profile.deadline ?? ""}
            onChange={(e) => setProfile({ deadline: e.target.value || undefined })}
            className={`${inputClass} max-w-64`}
          />
          {profile.deadline && (
            <button
              type="button"
              onClick={() => setProfile({ deadline: undefined })}
              className="min-h-10 rounded-full px-3 text-sm text-[#555] hover:bg-[#f0f0ee] focus-visible:outline-2 focus-visible:outline-[color:var(--accent)]"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </StepShell>
  );
}
