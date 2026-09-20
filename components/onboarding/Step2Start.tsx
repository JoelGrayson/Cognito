"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  LEVELS,
  levelToPriorKnowledge,
  priorKnowledgeToLevel,
  priorKnowledgeToRatings,
  ratingsToPriorKnowledge,
  SELF_LEVELS,
  type Level,
} from "@/lib/onboarding/profile";
import { useOnboarding } from "@/lib/stores/onboarding";
import type { LearnerProfile } from "@/types/learning";
import { Choice, ChoiceGroup, StepShell } from "./ui";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--wb-primary)]";

type Format = LearnerProfile["preferences"]["formats"][number];

const FORMATS: { value: Format; label: string }[] = [
  { value: "reading", label: "Reading" },
  { value: "video", label: "Video" },
  { value: "practice", label: "Practice problems" },
  { value: "discussion", label: "Discussion" },
  { value: "voice", label: "Talk it out" },
];

function ConceptSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading concepts" className="space-y-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="skeleton !min-h-[74px]" />
      ))}
    </div>
  );
}

export function Step2Start() {
  const router = useRouter();
  const profile = useOnboarding((s) => s.profile);
  const concepts = useOnboarding((s) => s.concepts);
  const save = useOnboarding((s) => s.save);
  const saveError = useOnboarding((s) => s.saveError);
  const setProfile = useOnboarding((s) => s.setProfile);
  const finish = useOnboarding((s) => s.finish);
  const back = useOnboarding((s) => s.back);
  const retry = useOnboarding((s) => s.retryConcepts);

  const formats = profile.preferences?.formats ?? [];
  const goal = profile.goal?.trim() ?? "";
  const status = concepts.goal === goal ? concepts.status : "loading";
  const ready = status === "ready";
  const loading = status === "loading" || status === "idle";
  const ratings = priorKnowledgeToRatings(profile.priorKnowledge, ready ? concepts.items : []);
  const selfLevel = priorKnowledgeToLevel(profile.priorKnowledge, goal) ?? 0;

  // Roadmap generation starts as soon as the profile has enough for a graph, so the
  // ~30s model call overlaps the learner's rating time. Ratings finish on the server
  // anyway: the generate route re-marks known scope from the latest priorKnowledge.
  const prefetchGraph = useOnboarding((s) => s.prefetchGraph);
  const prefetched = useRef(false);
  useEffect(() => {
    if (prefetched.current || !ready || formats.length === 0) return;
    prefetched.current = true;
    prefetchGraph();
  }, [ready, formats.length, prefetchGraph]);

  function toggle(format: Format) {
    const next = formats.includes(format) ? formats.filter((f) => f !== format) : [...formats, format];
    setProfile({ preferences: { formats: next } });
  }

  // Unrated concepts default to 0, so Finish never waits on the chips.
  const submit = async () => {
    const priorKnowledge = ready
      ? ratingsToPriorKnowledge(concepts.items, ratings)
      : levelToPriorKnowledge(goal, loading ? 0 : selfLevel);
    if (await finish({ priorKnowledge })) router.push("/onboarding/workshop");
  };

  return (
    <StepShell
      title="How do you like to learn, and where are you starting from?"
      hint={
        ready
          ? "Rate each one honestly. This decides what we skip and what we teach from scratch."
          : loading
            ? "Tailoring this list to your goal..."
            : "Pick the level that fits you best."
      }
      validate={() => (formats.length ? null : "Pick at least one way you like to learn.")}
      onSubmit={submit}
      onBack={back}
      submitLabel="Finish"
      busy={save === "saving"}
      notice={save === "error" ? `${saveError ?? "Could not save."} Press Finish to retry.` : null}
    >
      <p className="mb-2 text-sm font-medium text-(--wb-muted)">Formats (at least one)</p>
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

      <div className="mt-7">
        <p className="mb-2 text-sm font-medium text-(--wb-muted)">What do you already know?</p>
        {loading && <ConceptSkeleton />}

        {ready && (
          <ul className="space-y-3">
            {concepts.items.map((concept) => (
              <li key={concept} className="rounded-2xl bg-(--wb-hover) p-3">
                <p className="mb-2 px-1 text-[15px] font-medium">{concept}</p>
                <ChoiceGroup label={`How well do you know ${concept}?`} className="grid grid-cols-3 gap-1.5">
                  {LEVELS.map(({ level, short }) => (
                    <Choice
                      key={level}
                      type="radio"
                      name={`concept-${concept}`}
                      value={String(level)}
                      checked={(ratings[concept] ?? 0) === level}
                      onChange={() =>
                        setProfile({
                          priorKnowledge: ratingsToPriorKnowledge(concepts.items, { ...ratings, [concept]: level as Level }),
                        })
                      }
                      className="[&>span]:min-h-11 [&>span]:px-1 [&>span]:text-[13px] sm:[&>span]:text-[15px]"
                    >
                      {short}
                    </Choice>
                  ))}
                </ChoiceGroup>
              </li>
            ))}
          </ul>
        )}

        {!ready && !loading && (
          <div>
            <p className="mb-4 text-sm text-(--wb-muted)">
              We could not tailor a list for this goal.{" "}
              <button type="button" onClick={retry} className={`font-medium text-[var(--wb-primary)] underline ${focus}`}>
                Try again
              </button>
            </p>
            <ChoiceGroup label="Your level" className="grid gap-2">
              {SELF_LEVELS.map((option) => (
                <Choice
                  key={option.level}
                  type="radio"
                  name="selfLevel"
                  variant="card"
                  value={String(option.level)}
                  checked={selfLevel === option.level}
                  onChange={() => setProfile({ priorKnowledge: levelToPriorKnowledge(goal, option.level) })}
                  description={option.description}
                >
                  {option.label}
                </Choice>
              ))}
            </ChoiceGroup>
          </div>
        )}
      </div>
    </StepShell>
  );
}
