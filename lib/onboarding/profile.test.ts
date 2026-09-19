import { describe, expect, it } from "vitest";
import type { OnboardingProfile } from "@/types/learning";
import {
  DEFAULTS,
  firstIncompleteStep,
  levelToPriorKnowledge,
  mergeProfile,
  persistableProfile,
  priorKnowledgeToLevel,
  priorKnowledgeToRatings,
  ratingsToPriorKnowledge,
  stepError,
  toLearnerProfile,
} from "./profile";
import { ConceptList, PatchBody } from "./schemas";

const TODAY = "2026-09-19";
const complete: OnboardingProfile = {
  goal: "Learn linear algebra",
  preferences: { formats: ["reading"] },
  availability: { timezone: "America/New_York" },
  priorKnowledge: [{ concept: "Vectors", level: 1 }],
};

describe("stepError", () => {
  it("requires a goal of 3 to 200 characters", () => {
    expect(stepError(1, {}, TODAY)).not.toBeNull();
    expect(stepError(1, { goal: "ab" }, TODAY)).not.toBeNull();
    expect(stepError(1, { goal: "  a  " }, TODAY)).not.toBeNull();
    expect(stepError(1, { goal: "abc" }, TODAY)).toBeNull();
    expect(stepError(1, { goal: "x".repeat(200) }, TODAY)).toBeNull();
    expect(stepError(1, { goal: "x".repeat(201) }, TODAY)).not.toBeNull();
  });

  it("lets step 1 pass without goalType but blocks a past deadline", () => {
    expect(stepError(1, { goal: "Learn Rust" }, TODAY)).toBeNull();
    expect(stepError(1, { goal: "Learn Rust", goalType: "exam" }, TODAY)).toBeNull();
    expect(stepError(1, { goal: "Learn Rust", deadline: TODAY }, TODAY)).not.toBeNull();
    expect(stepError(1, { goal: "Learn Rust", deadline: "2026-09-20" }, TODAY)).toBeNull();
  });

  it("requires at least one format and a starting point on step 2", () => {
    expect(stepError(2, {}, TODAY)).not.toBeNull();
    expect(stepError(2, { preferences: { formats: ["voice"] } }, TODAY)).not.toBeNull();
    expect(stepError(2, { priorKnowledge: [{ concept: "Rust", level: 0 }] }, TODAY)).not.toBeNull();
    expect(
      stepError(2, { preferences: { formats: ["voice"] }, priorKnowledge: [{ concept: "Rust", level: 0 }] }, TODAY),
    ).toBeNull();
  });
});

describe("firstIncompleteStep", () => {
  it("returns the first missing step and null when everything is answered", () => {
    expect(firstIncompleteStep({}, TODAY)).toBe(1);
    expect(firstIncompleteStep({ goal: "Learn Rust" }, TODAY)).toBe(2);
    expect(firstIncompleteStep({ ...complete, priorKnowledge: undefined }, TODAY)).toBe(2);
    expect(firstIncompleteStep({ ...complete, priorKnowledge: [] }, TODAY)).toBe(2);
    expect(firstIncompleteStep(complete, TODAY)).toBeNull();
  });

  it("treats a past deadline as an incomplete step 1", () => {
    expect(firstIncompleteStep({ ...complete, deadline: "2020-01-01" }, TODAY)).toBe(1);
  });

  it("is complete without the settings-only fields", () => {
    expect(firstIncompleteStep(complete, TODAY)).toBeNull();
    expect(complete.hoursPerWeek).toBeUndefined();
    expect(complete.goalType).toBeUndefined();
    expect(complete.preferences?.pace).toBeUndefined();
  });
});

describe("toLearnerProfile", () => {
  it("returns null until the questionnaire is complete", () => {
    expect(toLearnerProfile({})).toBeNull();
    expect(toLearnerProfile({ goal: "Learn Rust" })).toBeNull();
    expect(toLearnerProfile({ ...complete, preferences: {} })).toBeNull();
  });

  it("fills defaults for fields the questionnaire no longer asks", () => {
    const learner = toLearnerProfile(complete);
    expect(learner).not.toBeNull();
    expect(learner!.goal).toBe("Learn linear algebra");
    expect(learner!.goalType).toBeUndefined();
    expect(learner!.hoursPerWeek).toBe(DEFAULTS.hoursPerWeek);
    expect(learner!.preferences).toEqual({ formats: ["reading"], pace: DEFAULTS.pace });
    expect(learner!.availability?.daysPerWeek).toBe(DEFAULTS.daysPerWeek);
    expect(learner!.availability?.timezone).toBe("America/New_York");
  });

  it("keeps answers and settings values over defaults", () => {
    const learner = toLearnerProfile({
      ...complete,
      goalType: "exam",
      deadline: "2027-01-01",
      hoursPerWeek: 8,
      preferences: { formats: ["video"], pace: "intense" },
      availability: { daysPerWeek: 6 },
      tutorStyle: "socratic",
    });
    expect(learner!.goalType).toBe("exam");
    expect(learner!.deadline).toBe("2027-01-01");
    expect(learner!.hoursPerWeek).toBe(8);
    expect(learner!.preferences).toEqual({ formats: ["video"], pace: "intense" });
    expect(learner!.availability?.daysPerWeek).toBe(6);
    expect(learner!.tutorStyle).toBe("socratic");
  });
});

describe("mergeProfile", () => {
  it("merges nested preferences and availability key by key", () => {
    const merged = mergeProfile(complete, { preferences: { pace: "intense" }, availability: { daysPerWeek: 5 } });
    expect(merged.preferences).toEqual({ pace: "intense", formats: ["reading"] });
    expect(merged.availability).toEqual({ daysPerWeek: 5, timezone: "America/New_York" });
  });

  it("clears a top-level answer with an explicit undefined", () => {
    expect(mergeProfile({ ...complete, deadline: "2027-01-01" }, { deadline: undefined }).deadline).toBeUndefined();
  });
});

describe("persistableProfile", () => {
  it("drops invalid fields instead of sending them", () => {
    const patch = persistableProfile({ goal: "ab", hoursPerWeek: 99, availability: { daysPerWeek: 9 } }, TODAY);
    expect(patch.goal).toBeUndefined();
    expect(patch.hoursPerWeek).toBeUndefined();
    expect(patch.availability).toEqual({});
  });

  it("trims the goal and keeps timezone", () => {
    const patch = persistableProfile({ ...complete, goal: "  Learn Rust  " }, TODAY);
    expect(patch.goal).toBe("Learn Rust");
    expect(patch.availability?.timezone).toBe("America/New_York");
  });

  it("sends null for a missing or past deadline so the stored date is cleared", () => {
    expect(persistableProfile(complete, TODAY).deadline).toBeNull();
    expect(persistableProfile({ ...complete, deadline: "2020-01-01" }, TODAY).deadline).toBeNull();
    expect(persistableProfile({ ...complete, deadline: "2026-12-01" }, TODAY).deadline).toBe("2026-12-01");
  });

  it("produces a body the route schema accepts", () => {
    expect(PatchBody.safeParse({ profile: persistableProfile(complete, TODAY) }).success).toBe(true);
  });
});

describe("prior knowledge mapping", () => {
  it("maps the level selector to a single rating on the goal itself", () => {
    expect(levelToPriorKnowledge("Rust", 0)).toEqual([{ concept: "Rust", level: 0 }]);
    expect(levelToPriorKnowledge("Rust", 1)).toEqual([{ concept: "Rust", level: 1 }]);
    expect(levelToPriorKnowledge("Rust", 2)).toEqual([{ concept: "Rust", level: 2 }]);
  });

  it("defaults unrated concepts to 0", () => {
    expect(ratingsToPriorKnowledge(["A", "B"], { B: 2 })).toEqual([
      { concept: "A", level: 0 },
      { concept: "B", level: 2 },
    ]);
  });

  it("restores ratings only for concepts still on screen", () => {
    const stored = [{ concept: "A", level: 1 as const }, { concept: "Old", level: 2 as const }];
    expect(priorKnowledgeToRatings(stored, ["A", "B"])).toEqual({ A: 1 });
    expect(priorKnowledgeToLevel([{ concept: "Rust", level: 2 }], "Rust")).toBe(2);
    expect(priorKnowledgeToLevel([{ concept: "A", level: 2 }], "Rust")).toBeUndefined();
  });
});

describe("ConceptList", () => {
  const six = ["One", "Two", "Three", "Four", "Five", "Six"];
  it("accepts 6 to 8 short, distinct concepts", () => {
    expect(ConceptList.safeParse(six).success).toBe(true);
    expect(ConceptList.safeParse([...six, "Seven", "Eight"]).success).toBe(true);
  });
  it("rejects wrong counts, long phrases, and duplicates", () => {
    expect(ConceptList.safeParse(six.slice(0, 5)).success).toBe(false);
    expect(ConceptList.safeParse([...six, "7", "8", "9"]).success).toBe(false);
    expect(ConceptList.safeParse([...six.slice(0, 5), "one two three four five"]).success).toBe(false);
    expect(ConceptList.safeParse([...six.slice(0, 5), "one"]).success).toBe(false);
  });
});
