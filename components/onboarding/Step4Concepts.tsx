"use client";

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
import { Choice, ChoiceGroup, StepShell } from "./ui";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]";

function ConceptSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading concepts" className="space-y-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="skeleton !min-h-[74px]" />
      ))}
    </div>
  );
}

export function Step4Concepts() {
  const profile = useOnboarding((s) => s.profile);
  const concepts = useOnboarding((s) => s.concepts);
  const setProfile = useOnboarding((s) => s.setProfile);
  const advance = useOnboarding((s) => s.advance);
  const back = useOnboarding((s) => s.back);
  const retry = useOnboarding((s) => s.retryConcepts);

  const goal = profile.goal?.trim() ?? "";
  const status = concepts.goal === goal ? concepts.status : "loading";
  const ready = status === "ready";
  const loading = status === "loading" || status === "idle";
  const ratings = priorKnowledgeToRatings(profile.priorKnowledge, ready ? concepts.items : []);
  const selfLevel = priorKnowledgeToLevel(profile.priorKnowledge, goal) ?? 0;

  // Rating everything at 0 is the same answer as skipping, and Skip never waits on the chips.
  const skip = () => advance({ priorKnowledge: ready ? ratingsToPriorKnowledge(concepts.items, {}) : levelToPriorKnowledge(goal, 0) });
  const submit = () =>
    advance({
      priorKnowledge: ready
        ? ratingsToPriorKnowledge(concepts.items, ratings)
        : levelToPriorKnowledge(goal, loading ? 0 : selfLevel),
    });

  return (
    <StepShell
      title="Where are you starting from?"
      hint={
        ready
          ? "Rate each one honestly. This decides what we skip and what we teach from scratch."
          : loading
            ? "Tailoring this list to your goal..."
            : "Pick the level that fits you best."
      }
      onSubmit={submit}
      onBack={back}
      extra={
        <button
          type="button"
          onClick={skip}
          className={`min-h-12 rounded-full px-4 text-[15px] font-medium text-[#555] hover:bg-[#f0f0ee] ${focus}`}
        >
          Skip
        </button>
      }
    >
      {loading && <ConceptSkeleton />}

      {ready && (
        <ul className="space-y-3">
          {concepts.items.map((concept) => (
            <li key={concept} className="rounded-2xl bg-[var(--panel)] p-3">
              <p className="mb-2 px-1 text-[15px] font-semibold">{concept}</p>
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
          <p className="mb-4 text-sm text-[#6b6b6b]">
            We could not tailor a list for this goal.{" "}
            <button type="button" onClick={retry} className={`font-medium text-[var(--accent)] underline ${focus}`}>
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
    </StepShell>
  );
}
