import { describe, expect, it } from "vitest";
import type { OnboardingProfile } from "@/types/learning";
import {
  firstIncompleteStep,
  levelToPriorKnowledge,
  mergeProfile,
  persistableProfile,
  priorKnowledgeToLevel,
  priorKnowledgeToRatings,
  ratingsToPriorKnowledge,
  stepError,
} from "./profile";
import { ConceptList, PatchBody } from "./schemas";

const TODAY = "2026-09-19";
const complete: OnboardingProfile = {
  goal: "Learn linear algebra",
  goalType: "curiosity",
  hoursPerWeek: 5,
  preferences: { pace: "steady", formats: ["reading"] },
  availability: { daysPerWeek: 3, timezone: "America/New_York" },
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

  it("requires goalType and a future deadline when one is set", () => {
    expect(stepError(2, {}, TODAY)).not.toBeNull();
    expect(stepError(2, { goalType: "exam" }, TODAY)).toBeNull();
    expect(stepError(2, { goalType: "exam", deadline: TODAY }, TODAY)).not.toBeNull();
    expect(stepError(2, { goalType: "exam", deadline: "2026-09-20" }, TODAY)).toBeNull();
  });

  it("requires hours in range, a pace, and days per week", () => {
    expect(stepError(3, complete, TODAY)).toBeNull();
    expect(stepError(3, { ...complete, hoursPerWeek: 0 }, TODAY)).not.toBeNull();
    expect(stepError(3, { ...complete, hoursPerWeek: 41 }, TODAY)).not.toBeNull();
    expect(stepError(3, { ...complete, preferences: {} }, TODAY)).not.toBeNull();
    expect(stepError(3, { ...complete, availability: { daysPerWeek: 8 } }, TODAY)).not.toBeNull();
  });

  it("requires at least one format on step 5", () => {
    expect(stepError(5, { preferences: { formats: [] } }, TODAY)).not.toBeNull();
    expect(stepError(5, { preferences: { formats: ["voice"] } }, TODAY)).toBeNull();
  });
});

describe("firstIncompleteStep", () => {
  it("returns the first missing step and null when everything is answered", () => {
    expect(firstIncompleteStep({}, TODAY)).toBe(1);
    expect(firstIncompleteStep({ goal: "Learn Rust" }, TODAY)).toBe(2);
    expect(firstIncompleteStep({ goal: "Learn Rust", goalType: "career" }, TODAY)).toBe(3);
    const throughStep3 = { ...complete, priorKnowledge: undefined, preferences: { pace: "steady" as const } };
    expect(firstIncompleteStep(throughStep3, TODAY)).toBe(4);
    expect(firstIncompleteStep({ ...throughStep3, priorKnowledge: [] }, TODAY)).toBe(4);
    expect(firstIncompleteStep(complete, TODAY)).toBeNull();
  });

  it("treats a past deadline as an incomplete step 2", () => {
    expect(firstIncompleteStep({ ...complete, deadline: "2020-01-01" }, TODAY)).toBe(2);
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
