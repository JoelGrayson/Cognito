/**
 * What a whiteboard subject is made of. The home screen, the whiteboard header, the
 * side rail and the step checker all read this table, so adding a subject or giving
 * one a new panel is an edit here rather than a branch in each of them.
 */
import type { SubjectIconName } from "@/components/SubjectIcon";

export type SubjectId = "math" | "chemistry" | "ee";
export type SubjectPanel = "worksheets" | "mastery" | "graphs";
/** How written work is judged. `null` means nothing can check this subject yet. */
export type SubjectChecker =
  /** Each line is judged against the one before it, as it is written. */
  | "algebra-steps"
  /** Each drawn structure is judged against the sheet's answer key, when asked. */
  | "structure-key"
  /** Each line is judged against the solved circuit it is written under, as it is
   *  written: a KVL loop, a KCL node sum, Ohm's law or a final value. */
  | "circuit-laws";

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
  /** The practice sheet offered in the library, under public/. */
  sampleSheet: { path: string; file: string; title: string; caption: string };
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
    sampleSheet: { path: "/worksheets/algebra-practice.pdf", file: "algebra-practice.pdf", title: "Algebra practice", caption: "Sample · 6 problems" },
  },
  {
    id: "chemistry",
    name: "Chemistry",
    icon: "chemistry",
    blurb: "Draw structures on a worksheet and get each one checked against the answer.",
    sample: ["CH₃CH₂OH", "CH₂=CH₂ + H₂O"],
    checker: "structure-key",
    panels: ["worksheets"],
    sampleSheet: { path: "/worksheets/ochem-practice.pdf", file: "ochem-practice.pdf", title: "Organic chemistry practice", caption: "Sample · 6 structures" },
  },
  {
    id: "ee",
    name: "EE",
    icon: "physics",
    blurb: "Write KVL and KCL for a circuit and get each equation checked against it as you go.",
    sample: ["12 − 4I − 2I = 0", "I = 2 A"],
    checker: "circuit-laws",
    panels: ["worksheets", "mastery"],
    sampleSheet: { path: "/worksheets/circuits-practice.pdf", file: "circuits-practice.pdf", title: "Circuits practice", caption: "Sample · 4 circuits" },
  },
];

export const DEFAULT_SUBJECT = SUBJECTS[0];

/** Parses the `?subject=` value; anything unrecognised is the default subject. */
export function subjectFrom(value: string | null | undefined): Subject {
  return SUBJECTS.find((s) => s.id === value) ?? DEFAULT_SUBJECT;
}

/** Words that mean a roadmap can hand its learner a worked-on-paper practice session. */
const MATH_TERMS =
  /\b(algebra|math(ematics)?|equations?|inequalities|linear|quadratic|polynomial|calculus|precalculus|geometry|trigonometry|arithmetic|factori[sz]e|graphing)\b/i;
const CHEM_TERMS = /\b(chem(istry|ical)?|organic|molecule|reaction|stoichiometry|ochem|mechanism)\b/i;
const EE_TERMS = /\b(circuits?|kvl|kcl|kirchhoff'?s?|ohm'?s|resistors?|electrical engineering|nodal|mesh analysis|voltage)\b/i;

/**
 * A whiteboard practice link for a roadmap, or null when practice-by-hand doesn't
 * apply. `sheet=sample` lands the learner straight on the subject's built-in sheet.
 */
export function practiceHref(goal: string, title: string): string | null {
  const text = `${goal} ${title}`;
  if (EE_TERMS.test(text)) return "/dev/whiteboard?subject=ee&sheet=sample";
  if (MATH_TERMS.test(text)) return "/dev/whiteboard?subject=math&sheet=sample";
  if (CHEM_TERMS.test(text)) return "/dev/whiteboard?subject=chemistry&sheet=sample";
  return null;
}
