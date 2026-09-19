"use client";

import { useRouter } from "next/navigation";
import { stepError } from "@/lib/onboarding/profile";
import { CONSTRAINTS_MAX } from "@/lib/onboarding/schemas";
import { useOnboarding } from "@/lib/stores/onboarding";
import type { LearnerProfile } from "@/types/learning";
import { Choice, ChoiceGroup, FieldLabel, inputClass, StepShell } from "./ui";

type Format = LearnerProfile["preferences"]["formats"][number];
type Tutor = NonNullable<LearnerProfile["tutorStyle"]>;

const FORMATS: { value: Format; label: string }[] = [
  { value: "reading", label: "Reading" },
  { value: "video", label: "Video" },
  { value: "practice", label: "Practice problems" },
  { value: "discussion", label: "Discussion" },
  { value: "voice", label: "Talk it out" },
];

const TUTORS: { value: Tutor; label: string; description: string }[] = [
  { value: "encouraging", label: "Encouraging", description: "Warm, celebrates progress" },
  { value: "socratic", label: "Socratic", description: "Asks questions, guides you" },
  { value: "rigorous", label: "Rigorous", description: "Precise, pushes you hard" },
];

export function Step5Style() {
  const router = useRouter();
  const profile = useOnboarding((s) => s.profile);
  const save = useOnboarding((s) => s.save);
  const saveError = useOnboarding((s) => s.saveError);
  const setProfile = useOnboarding((s) => s.setProfile);
  const finish = useOnboarding((s) => s.finish);
  const back = useOnboarding((s) => s.back);
  const formats = profile.preferences?.formats ?? [];

  function toggle(format: Format) {
    const next = formats.includes(format) ? formats.filter((f) => f !== format) : [...formats, format];
    setProfile({ preferences: { formats: next } });
  }

  return (
    <StepShell
      title="How do you like to learn?"
      hint="Pick everything that works for you. You can change this later."
      validate={() => stepError(5, profile)}
      onSubmit={async () => {
        if (await finish()) router.push("/onboarding/workshop");
      }}
      onBack={back}
      submitLabel="Finish"
      busy={save === "saving"}
      notice={save === "error" ? `${saveError ?? "Could not save."} Press Finish to retry.` : null}
    >
      <p className="mb-2 text-sm font-medium text-[#444]">Formats (at least one)</p>
      <ChoiceGroup label="Formats" className="flex flex-wrap gap-2">
        {FORMATS.map((format) => (
          <Choice
            key={format.value}
            type="checkbox"
            name="formats"
            value={format.value}
            checked={formats.includes(format.value)}
            onChange={() => toggle(format.value)}
          >
            {format.label}
          </Choice>
        ))}
      </ChoiceGroup>

      <p className="mt-7 mb-2 text-sm font-medium text-[#444]">Tutor style</p>
      <ChoiceGroup label="Tutor style" className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-3">
        {TUTORS.map((tutor) => (
          <Choice
            key={tutor.value}
            type="radio"
            name="tutorStyle"
            variant="card"
            value={tutor.value}
            checked={profile.tutorStyle === tutor.value}
            onChange={() => setProfile({ tutorStyle: tutor.value })}
            description={tutor.description}
          >
            {tutor.label}
          </Choice>
        ))}
      </ChoiceGroup>

      <div className="mt-7">
        <FieldLabel htmlFor="constraints">Anything we should know? (optional)</FieldLabel>
        <input
          id="constraints"
          name="constraints"
          type="text"
          autoComplete="off"
          maxLength={CONSTRAINTS_MAX}
          value={profile.constraints ?? ""}
          onChange={(e) => setProfile({ constraints: e.target.value })}
          placeholder="e.g. I only study on weekends, no heavy math"
          className={inputClass}
        />
      </div>
    </StepShell>
  );
}
