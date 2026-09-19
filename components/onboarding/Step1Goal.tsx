"use client";

import { GOAL_MAX } from "@/lib/onboarding/schemas";
import { stepError } from "@/lib/onboarding/profile";
import { useOnboarding } from "@/lib/stores/onboarding";
import { FieldLabel, inputClass, StepShell } from "./ui";

const EXAMPLES = ["Linear algebra for machine learning", "Conversational Spanish", "Personal finance basics", "Rust for backend work"];

export function Step1Goal() {
  const profile = useOnboarding((s) => s.profile);
  const setProfile = useOnboarding((s) => s.setProfile);
  const advance = useOnboarding((s) => s.advance);
  const goal = profile.goal ?? "";

  return (
    <StepShell
      title="What do you want to learn?"
      hint="A topic, a skill, or an outcome. You can be as specific as you like."
      focusHeading={false}
      validate={() => stepError(1, profile)}
      onSubmit={() => advance()}
    >
      <FieldLabel htmlFor="goal">Your goal</FieldLabel>
      <input
        id="goal"
        name="goal"
        type="text"
        autoFocus
        autoComplete="off"
        maxLength={GOAL_MAX}
        value={goal}
        onChange={(e) => setProfile({ goal: e.target.value })}
        placeholder="e.g. Linear algebra for machine learning"
        aria-describedby="goal-count"
        className={inputClass}
      />
      <p id="goal-count" className="mt-2 text-right text-xs text-[#8a8a8a]">
        {goal.trim().length}/{GOAL_MAX}
      </p>
      <p className="mt-4 mb-2 text-sm font-medium text-[#444]">Need ideas?</p>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => setProfile({ goal: example })}
            className="min-h-10 rounded-full border border-[#d5d5d1] bg-white px-4 text-sm text-[#333] hover:border-[#b9b9b4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
          >
            {example}
          </button>
        ))}
      </div>
    </StepShell>
  );
}
