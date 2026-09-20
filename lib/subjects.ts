/**
 * What a whiteboard subject is made of. The home screen, the whiteboard header, the
 * side rail and the step checker all read this table, so adding a subject or giving
 * one a new panel is an edit here rather than a branch in each of them.
 */
import type { SubjectIconName } from "@/components/SubjectIcon";

export type SubjectId = "math" | "chemistry";
export type SubjectPanel = "worksheets" | "mastery" | "graphs";
/** How written work is judged. `null` means nothing can check this subject yet. */
export type SubjectChecker = "algebra-steps";

export interface Subject {
  id: SubjectId;
  name: string;
  icon: SubjectIconName;
  /** One line under the name on the home screen. */
  blurb: string;
  /** What work in this subject looks like, shown on its card: a step, then the next. */
  sample: [from: string, to: string];
  checker: SubjectChecker | null;
  panels: readonly SubjectPanel[];
}

export const SUBJECTS: readonly Subject[] = [
  {
    id: "math",
    name: "Math",
    icon: "math",
    blurb: "Work a problem by hand and get each step checked as you write it.",
    sample: ["2x + 3 = 11", "x = 4"],
    checker: "algebra-steps",
    panels: ["worksheets", "mastery", "graphs"],
  },
  {
    id: "chemistry",
    name: "Chemistry",
    icon: "chemistry",
    blurb: "Upload a worksheet and draw structures and mechanisms on it.",
    sample: ["CH₃CH₂OH", "CH₂=CH₂ + H₂O"],
    checker: null,
    panels: ["worksheets"],
  },
];

export const DEFAULT_SUBJECT = SUBJECTS[0];

/** Parses the `?subject=` value; anything unrecognised is the default subject. */
export function subjectFrom(value: string | null | undefined): Subject {
  return SUBJECTS.find((s) => s.id === value) ?? DEFAULT_SUBJECT;
}

/**
 * Words that mean a roadmap can hand its learner a worked-on-paper practice
 * session: the only checker is algebra-steps and the built-in sheet is algebra.
 */
const MATH_TERMS =
  /\b(algebra|math(ematics)?|equations?|inequalities|linear|quadratic|polynomial|calculus|precalculus|geometry|trigonometry|arithmetic|factori[sz]e|graphing)\b/i;

/**
 * A whiteboard practice link for a roadmap, or null when practice-by-hand doesn't
 * apply. `sheet=sample` lands the learner straight on the built-in algebra sheet.
 */
export function practiceHref(goal: string, title: string): string | null {
  return MATH_TERMS.test(`${goal} ${title}`) ? "/dev/whiteboard?subject=math&sheet=sample" : null;
}
