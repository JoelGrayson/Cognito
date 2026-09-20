"use client";

import { useEffect, useState } from "react";
import { CONSTRAINTS_MAX, GOAL_MAX } from "@/lib/onboarding/schemas";
import { localToday, stepError } from "@/lib/onboarding/profile";
import { useOnboarding } from "@/lib/stores/onboarding";
import { trpc } from "@/lib/trpc";
import type { ProviderId, ProviderInfo } from "@/lib/providers/types";
import type { LearnerProfile } from "@/types/learning";
import { ProviderSelect } from "@/components/ProviderSelect";
import { SubjectIcon, type SubjectIconName } from "@/components/SubjectIcon";
import { Choice, ChoiceGroup, FieldLabel, inputClass, StepShell } from "./ui";
import { PastRoadmaps } from "./PastRoadmaps";

/** Each tile fills the goal with a specific, editable example rather than a bare subject name. */
const IDEAS: { label: string; goal: string; icon: SubjectIconName }[] = [
  { label: "Math", goal: "Linear algebra for machine learning", icon: "math" },
  { label: "Chemistry", goal: "Organic chemistry reaction mechanisms", icon: "chemistry" },
  { label: "Physics", goal: "Classical mechanics from the ground up", icon: "physics" },
  { label: "Coding", goal: "Rust for backend work", icon: "code" },
  { label: "AI", goal: "How large language models work", icon: "ai" },
  { label: "Languages", goal: "Conversational Spanish", icon: "language" },
  { label: "Money", goal: "Personal finance basics", icon: "money" },
  { label: "History", goal: "World history since 1900", icon: "history" },
  { label: "Writing", goal: "Writing clear technical essays", icon: "writing" },
];

const REASONS: { value: NonNullable<LearnerProfile["goalType"]>; label: string }[] = [
  { value: "career", label: "Career" },
  { value: "exam", label: "Exam" },
  { value: "project", label: "Project" },
  { value: "curiosity", label: "Curiosity" },
];

function tomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return localToday(date);
}

export function Step1Goal() {
  const profile = useOnboarding((s) => s.profile);
  const setProfile = useOnboarding((s) => s.setProfile);
  const advance = useOnboarding((s) => s.advance);
  const goal = profile.goal ?? "";
  const typing = goal.trim().length > 0;

  // Which AI provider builds the roadmap — same picker as the prototype branch.
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  useEffect(() => {
    trpc.providers
      .query()
      .then(setProviders)
      .catch(() => {});
  }, []);
  const provider = profile.provider ?? providers.find((p) => p.configured)?.id ?? "anthropic";

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
      <div className="mt-2 flex items-center justify-between gap-3">
        <ProviderSelect
          providers={providers}
          value={provider as ProviderId}
          onChange={(id) => setProfile({ provider: id })}
        />
        <p id="goal-count" className="shrink-0 text-xs text-(--wb-muted)">
          {goal.trim().length}/{GOAL_MAX}
        </p>
      </div>

      {typing && (
        <>
          <div className="mt-4">
            <FieldLabel htmlFor="constraints">Anything else we should know? (optional)</FieldLabel>
            <input
              id="constraints"
              name="constraints"
              type="text"
              autoComplete="off"
              maxLength={CONSTRAINTS_MAX}
              value={profile.constraints ?? ""}
              onChange={(e) => setProfile({ constraints: e.target.value })}
              placeholder="e.g. for a career switch, I only study on weekends"
              className={inputClass}
            />
          </div>

          <p className="mt-6 mb-2 text-sm font-medium text-(--wb-muted)">Why this goal? (optional)</p>
          <ChoiceGroup label="Why are you learning this?" className="flex flex-wrap gap-2">
            {REASONS.map((reason) => (
              <Choice
                key={reason.value}
                type="radio"
                name="goalType"
                value={reason.value}
                checked={profile.goalType === reason.value}
                onChange={() => setProfile({ goalType: reason.value })}
              >
                {reason.label}
              </Choice>
            ))}
          </ChoiceGroup>

          <div className="mt-6">
            <FieldLabel htmlFor="deadline">Goal completion date (optional)</FieldLabel>
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
                  className="min-h-10 rounded-full px-3 text-sm text-(--wb-muted) hover:bg-(--wb-hover) focus-visible:outline-2 focus-visible:outline-[color:var(--wb-primary)]"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <PastRoadmaps />

      {!typing && (
        <>
          <p className="mt-6 mb-2 text-sm font-medium text-(--wb-muted)">Or pick something to start from</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {IDEAS.map((idea) => (
              <button
                key={idea.label}
                type="button"
                onClick={() => setProfile({ goal: idea.goal })}
                className="flex min-h-16 items-center gap-3 rounded-2xl border border-(--wb-line) bg-(--wb-card) p-2.5 text-left text-[15px] leading-tight text-(--wb-ink) transition-colors hover:bg-(--wb-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--wb-primary)]"
              >
                <SubjectIcon name={idea.icon} size={40} />
                {idea.label}
              </button>
            ))}
          </div>
        </>
      )}
    </StepShell>
  );
}
