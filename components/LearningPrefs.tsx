"use client";

import { useEffect, useRef, useState } from "react";
import { ensureAnonymousSession } from "@/lib/auth-client";
import { DEFAULTS } from "@/lib/onboarding/profile";
import { HOURS_MAX, HOURS_MIN } from "@/lib/onboarding/schemas";
import { OnboardingState } from "@/types/learning";
import type { LearnerProfile } from "@/types/learning";
import { Choice, ChoiceGroup } from "@/components/onboarding/ui";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";

type Pace = LearnerProfile["preferences"]["pace"];
type Tutor = NonNullable<LearnerProfile["tutorStyle"]>;

const PACES: { value: Pace; label: string }[] = [
  { value: "relaxed", label: "Relaxed" },
  { value: "steady", label: "Steady" },
  { value: "intense", label: "Intense" },
];

const TUTORS: { value: Tutor; label: string; description: string }[] = [
  { value: "encouraging", label: "Encouraging", description: "Warm, celebrates progress" },
  { value: "socratic", label: "Socratic", description: "Asks questions, guides you" },
  { value: "rigorous", label: "Rigorous", description: "Precise, pushes you hard" },
];

interface Prefs {
  hoursPerWeek: number;
  pace: Pace;
  daysPerWeek: number;
  tutorStyle: Tutor | undefined;
}

const fallback: Prefs = {
  hoursPerWeek: DEFAULTS.hoursPerWeek,
  pace: DEFAULTS.pace,
  daysPerWeek: DEFAULTS.daysPerWeek,
  tutorStyle: undefined,
};

/** Pacing and tutor preferences, stored in the learner profile so the scheduler and AI see them. */
export function LearningPrefs() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [prefs, setPrefs] = useState<Prefs>(fallback);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureAnonymousSession()
      .catch(() => {})
      .then(() => fetch("/api/onboarding"))
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        const { profile } = OnboardingState.pick({ profile: true }).parse(await res.json());
        if (cancelled) return;
        setPrefs({
          hoursPerWeek: profile.hoursPerWeek ?? fallback.hoursPerWeek,
          pace: profile.preferences?.pace ?? fallback.pace,
          daysPerWeek: profile.availability?.daysPerWeek ?? fallback.daysPerWeek,
          tutorStyle: profile.tutorStyle,
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function update(patch: Partial<Prefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: {
            hoursPerWeek: next.hoursPerWeek,
            preferences: { pace: next.pace },
            availability: { daysPerWeek: next.daysPerWeek },
            ...(next.tutorStyle && { tutorStyle: next.tutorStyle }),
          },
        }),
      }).then((res) => setSaved(res.ok));
    }, 400);
  }

  if (status === "loading") {
    return (
      <div aria-busy="true" aria-label="Loading learning preferences" className="mt-8 space-y-3">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (status === "error") {
    return <p className="mt-8 text-sm text-muted-foreground">Could not load learning preferences.</p>;
  }

  return (
    <section aria-labelledby="learning-prefs" className="mt-10 border-t border-border pt-8">
      <div className="flex items-center justify-between">
        <h2 id="learning-prefs" className="text-lg font-semibold">
          Learning preferences
        </h2>
        <span aria-live="polite">{saved && <Badge variant="secondary">Saved</Badge>}</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Used by your roadmap schedule and tutor. Saved to your profile.</p>

      <div className="mt-6">
        <div className="mb-3 flex items-baseline justify-between">
          <Label htmlFor="pref-hours" className="text-foreground/80">
            Hours per week
          </Label>
          <output htmlFor="pref-hours" className="text-base font-semibold tabular-nums">
            {prefs.hoursPerWeek} {prefs.hoursPerWeek === 1 ? "hr" : "hrs"}
          </output>
        </div>
        <Slider
          id="pref-hours"
          aria-label="Hours per week"
          min={HOURS_MIN}
          max={HOURS_MAX}
          step={1}
          value={[prefs.hoursPerWeek]}
          onValueChange={([value]) => update({ hoursPerWeek: value })}
          className="py-2"
        />
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>{HOURS_MIN} hr</span>
          <span>{HOURS_MAX} hrs</span>
        </div>
      </div>

      <p className="mt-6 mb-2 text-sm font-medium text-foreground/80">Pace</p>
      <ChoiceGroup label="Pace" className="flex flex-wrap gap-2">
        {PACES.map((option) => (
          <Choice
            key={option.value}
            type="radio"
            name="pref-pace"
            value={option.value}
            checked={prefs.pace === option.value}
            onChange={() => update({ pace: option.value })}
          >
            {option.label}
          </Choice>
        ))}
      </ChoiceGroup>

      <p className="mt-6 mb-2 text-sm font-medium text-foreground/80">Days per week</p>
      <ChoiceGroup label="Days per week" className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <Choice
            key={n}
            type="radio"
            name="pref-days"
            value={String(n)}
            checked={prefs.daysPerWeek === n}
            onChange={() => update({ daysPerWeek: n })}
            className="[&>span]:px-0"
          >
            {n}
          </Choice>
        ))}
      </ChoiceGroup>

      <p className="mt-6 mb-2 text-sm font-medium text-foreground/80">Tutor style</p>
      <ChoiceGroup label="Tutor style" className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-3">
        {TUTORS.map((tutor) => (
          <Choice
            key={tutor.value}
            type="radio"
            name="pref-tutor"
            variant="card"
            value={tutor.value}
            checked={prefs.tutorStyle === tutor.value}
            onChange={() => update({ tutorStyle: tutor.value })}
            description={tutor.description}
          >
            {tutor.label}
          </Choice>
        ))}
      </ChoiceGroup>
    </section>
  );
}
