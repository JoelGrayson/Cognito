import { create } from "zustand";
import {
  firstIncompleteStep,
  mergeProfile,
  persistableProfile,
  STEP_COUNT,
  type UiStep,
} from "@/lib/onboarding/profile";
import { ConceptsResponse, GOAL_MAX, GOAL_MIN } from "@/lib/onboarding/schemas";
import { OnboardingState, type OnboardingProfile, type OnboardingStep } from "@/types/learning";

export const CONCEPTS_TIMEOUT_MS = 8000;

export interface ConceptsState {
  status: "idle" | "loading" | "ready" | "error";
  /** The goal these concepts were requested for. */
  goal: string | null;
  items: string[];
}

interface OnboardingStore {
  /** Loading the saved answers. */
  status: "loading" | "ready" | "error";
  profile: OnboardingProfile;
  /** The screen being shown (1 to 2). */
  step: UiStep;
  /** The persisted step: stays "questionnaire" until the final screen completes. */
  serverStep: OnboardingStep;
  save: "idle" | "saving" | "error";
  saveError: string | null;
  concepts: ConceptsState;

  hydrate: (options?: { edit?: boolean; fresh?: boolean }) => Promise<void>;
  /** Updates answers locally; persisted on the next step change. */
  setProfile: (patch: OnboardingProfile) => void;
  advance: (patch?: OnboardingProfile) => void;
  back: () => void;
  /** Final screen: saves and moves the flow to the workshop. Resolves false when saving failed. */
  finish: (patch?: OnboardingProfile) => Promise<boolean>;
  /** Saves, then asks the server to start generating the draft graph in the background. */
  prefetchGraph: () => void;
  retryConcepts: () => void;
}

const idleConcepts: ConceptsState = { status: "idle", goal: null, items: [] };

const timezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
};

const goalIsValid = (goal?: string): goal is string => {
  const length = goal?.trim().length ?? 0;
  return length >= GOAL_MIN && length <= GOAL_MAX;
};

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (Array.isArray(body?.errors) && body.errors.length) return body.errors.join(" ");
  } catch {}
  return "Something went wrong. Please try again.";
}

// Saves run one at a time so a slow earlier request cannot overwrite a later one.
let saveChain: Promise<unknown> = Promise.resolve();
let conceptsAbort: AbortController | null = null;

export const useOnboarding = create<OnboardingStore>()((set, get) => {
  function enqueueSave(step?: OnboardingStep): Promise<boolean> {
    const run = saveChain.then(async () => {
      set({ save: "saving", saveError: null });
      try {
        const res = await fetch("/api/onboarding", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          // The whole profile every time, so one failed save is repaired by the next.
          body: JSON.stringify({ profile: persistableProfile(get().profile), ...(step && { step }) }),
        });
        if (!res.ok) throw new Error(await errorMessage(res));
        set({ save: "idle" });
        return true;
      } catch (err) {
        set({ save: "error", saveError: err instanceof Error ? err.message : "Could not save your answers." });
        return false;
      }
    });
    saveChain = run;
    return run;
  }

  function startConcepts(goal: string) {
    const { concepts } = get();
    if (concepts.goal === goal && concepts.status !== "idle") return;
    conceptsAbort?.abort();
    const controller = new AbortController();
    conceptsAbort = controller;
    const timer = setTimeout(() => controller.abort(), CONCEPTS_TIMEOUT_MS);
    set({ concepts: { status: "loading", goal, items: [] } });

    const settle = (next: ConceptsState) => {
      // A newer request replaced this one.
      if (conceptsAbort === controller) set({ concepts: next });
    };
    fetch("/api/onboarding/concepts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal, provider: get().profile.provider }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("concepts request failed");
        const { concepts: items } = ConceptsResponse.parse(await res.json());
        settle({ status: "ready", goal, items });
        // Persist the list so the same concepts (and their ratings) return on revisit.
        if (conceptsAbort === controller) set({ profile: mergeProfile(get().profile, { concepts: items }) });
      })
      .catch(() => settle({ status: "error", goal, items: [] }))
      .finally(() => clearTimeout(timer));
  }

  return {
    status: "loading",
    profile: {},
    step: 1,
    serverStep: "questionnaire",
    save: "idle",
    saveError: null,
    concepts: idleConcepts,

    async hydrate({ edit = false, fresh = false } = {}) {
      set({ status: "loading" });
      try {
        const res = await fetch("/api/onboarding");
        if (!res.ok) throw new Error(await errorMessage(res));
        const saved = OnboardingState.pick({ step: true, profile: true }).parse(await res.json());
        const tz = timezone();
        const profile = tz ? mergeProfile(saved.profile, { availability: { timezone: tz } }) : saved.profile;
        const resume = firstIncompleteStep(profile);
        set({
          status: "ready",
          profile,
          serverStep: saved.step,
          // A finished questionnaire lands on screen 1 — that's where the past-roadmaps
          // history lives. `edit` jumps to the last screen; `fresh` always starts at 1.
          step: fresh ? 1 : edit ? STEP_COUNT : (resume ?? 1),
        });
        const goal = profile.goal?.trim();
        // The persisted concept list keeps earlier ratings matching by name.
        if (goalIsValid(goal) && profile.concepts?.length) {
          set({ concepts: { status: "ready", goal, items: profile.concepts } });
        } else if (goalIsValid(goal)) {
          startConcepts(goal);
        }
      } catch {
        set({ status: "error" });
      }
    },

    setProfile(patch) {
      set({ profile: mergeProfile(get().profile, patch) });
    },

    advance(patch = {}) {
      const state = get();
      let profile = mergeProfile(state.profile, patch);
      if (state.step === 1 && goalIsValid(profile.goal)) {
        const goal = profile.goal.trim();
        profile = { ...profile, goal };
        // Ratings and the concept list belong to the old goal's concepts once the goal changes.
        if (state.concepts.goal !== null && state.concepts.goal !== goal)
          profile = { ...profile, priorKnowledge: [], concepts: undefined };
        startConcepts(goal);
      }
      set({ profile, step: Math.min(state.step + 1, STEP_COUNT) as UiStep });
      void enqueueSave();
    },

    back() {
      set({ step: Math.max(get().step - 1, 1) as UiStep });
      void enqueueSave();
    },

    async finish(patch = {}) {
      set({ profile: mergeProfile(get().profile, patch) });
      const ok = await enqueueSave("workshop");
      if (ok) set({ serverStep: "workshop" });
      return ok;
    },

    prefetchGraph() {
      const { profile } = get();
      if (!goalIsValid(profile.goal) || !profile.preferences?.formats?.length) return;
      void enqueueSave().then((ok) => {
        // The workshop route shares in-flight work, so a later fetch just waits on this.
        if (ok) fetch("/api/workshop/generate", { method: "POST" }).catch(() => {});
      });
    },

    retryConcepts() {
      const goal = get().profile.goal?.trim();
      if (!goalIsValid(goal)) return;
      set({ concepts: idleConcepts });
      startConcepts(goal);
    },
  };
});

export const resetOnboardingStore = () => {
  conceptsAbort?.abort();
  conceptsAbort = null;
  saveChain = Promise.resolve();
  useOnboarding.setState(useOnboarding.getInitialState(), true);
};
