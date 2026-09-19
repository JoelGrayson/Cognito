"use client";

import { DEFAULTS, stepError } from "@/lib/onboarding/profile";
import { HOURS_MAX, HOURS_MIN } from "@/lib/onboarding/schemas";
import { useOnboarding } from "@/lib/stores/onboarding";
import type { LearnerProfile } from "@/types/learning";
import { Choice, ChoiceGroup, StepShell } from "./ui";

const PACES: { value: LearnerProfile["preferences"]["pace"]; label: string; description: string }[] = [
  { value: "relaxed", label: "Relaxed", description: "Room to breathe" },
  { value: "steady", label: "Steady", description: "A regular rhythm" },
  { value: "intense", label: "Intense", description: "Move fast" },
];

export function Step3Time() {
  const profile = useOnboarding((s) => s.profile);
  const setProfile = useOnboarding((s) => s.setProfile);
  const advance = useOnboarding((s) => s.advance);
  const back = useOnboarding((s) => s.back);

  // Defaults show until touched, and are committed on Continue.
  const hours = profile.hoursPerWeek ?? DEFAULTS.hoursPerWeek;
  const pace = profile.preferences?.pace ?? DEFAULTS.pace;
  const days = profile.availability?.daysPerWeek ?? DEFAULTS.daysPerWeek;
  const committed = {
    hoursPerWeek: hours,
    preferences: { pace },
    availability: { daysPerWeek: days },
  };

  return (
    <StepShell
      title="How much time can you give?"
      hint="Be realistic. A plan you can keep beats an ambitious one you drop."
      validate={() => stepError(3, { ...profile, ...committed })}
      onSubmit={() => advance(committed)}
      onBack={back}
    >
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <label htmlFor="hours" className="text-sm font-medium text-[#444]">
            Hours per week
          </label>
          <output htmlFor="hours" className="text-lg font-semibold tabular-nums">
            {hours} {hours === 1 ? "hr" : "hrs"}
          </output>
        </div>
        <input
          id="hours"
          name="hoursPerWeek"
          type="range"
          min={HOURS_MIN}
          max={HOURS_MAX}
          step={1}
          value={hours}
          onChange={(e) => setProfile({ hoursPerWeek: Number(e.target.value) })}
          className="h-12 w-full cursor-pointer accent-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
        />
        <div className="flex justify-between text-xs text-[#8a8a8a]">
          <span>{HOURS_MIN} hr</span>
          <span>{HOURS_MAX} hrs</span>
        </div>
      </div>

      <p className="mt-7 mb-2 text-sm font-medium text-[#444]">Pace</p>
      <ChoiceGroup label="Pace" className="grid grid-cols-3 gap-2">
        {PACES.map((option) => (
          <Choice
            key={option.value}
            type="radio"
            name="pace"
            variant="card"
            value={option.value}
            checked={pace === option.value}
            onChange={() => setProfile({ preferences: { pace: option.value } })}
            description={option.description}
          >
            {option.label}
          </Choice>
        ))}
      </ChoiceGroup>

      <p className="mt-7 mb-2 text-sm font-medium text-[#444]">Days per week</p>
      <ChoiceGroup label="Days per week" className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <Choice
            key={n}
            type="radio"
            name="daysPerWeek"
            value={String(n)}
            checked={days === n}
            onChange={() => setProfile({ availability: { daysPerWeek: n } })}
            className="[&>span]:px-0"
          >
            {n}
          </Choice>
        ))}
      </ChoiceGroup>
    </StepShell>
  );
}
