/**
 * Papers that were graded ahead of time, so the teacher page has something to show
 * before anyone uploads. Same shape the grading route returns, so they go through the
 * same reducer and the same view as a live grade.
 */
import type { ResolvedAction } from "@/lib/board";
import { reduce, type PageGrade, type SheetPage, type Submission } from "./grading";

export interface GradedExample {
  id: string;
  title: string;
  topic: string;
  student: string;
  pages: SheetPage[];
  grades: PageGrade[];
}

let marked = 0;
const id = () => `m${++marked}`;

const tick = (x: number, y: number): ResolvedAction => ({ type: "text", id: id(), x, y, text: "✓", size: "large", color: "green" });

const fix = (x: number, y: number, text: string): ResolvedAction => ({ type: "text", id: id(), x, y, text, size: "small", color: "red" });

/** A teacher's loop around a wide answer; the board only draws round circles. */
function loop(cx: number, cy: number, rx: number, ry: number): ResolvedAction {
  const points = Array.from({ length: 36 }, (_, i) => {
    const t = (i / 36) * 2 * Math.PI;
    return [Math.round(cx + rx * Math.cos(t)), Math.round(cy + ry * Math.sin(t))];
  }).flat();
  return { type: "path", id: id(), points, closed: true, color: "red" };
}

const correct = (label: string) => ({ label, status: "correct" as const, note: "" });

/** Marks are placed on an 850 x 1102 page. */
const PAGE = { w: 850, h: 1102 };

export const GRADED_EXAMPLES: GradedExample[] = [
  {
    id: "parabolas-hw",
    title: "Graphing parabolas · Notes & HW 1",
    topic: "Algebra · Lesson 8",
    student: "Sample student",
    pages: [
      { src: "/teacher/library/parabolas-hw-1.jpg", ...PAGE },
      { src: "/teacher/library/parabolas-hw-2.jpg", ...PAGE },
    ],
    grades: [
      {
        studentName: "",
        problems: [
          correct("2a"),
          { label: "2b", status: "partial", note: "Domain right. Opens down, so −4 is the maximum: range (−∞, −4]" },
          correct("2c"),
          { label: "2d", status: "partial", note: "Domain right. Range uses the minimum value 18, not x = −6: [18, ∞)" },
          correct("2"),
          correct("3"),
        ],
        feedback: "",
        marks: [
          tick(432, 140),
          loop(375, 234, 68, 30),
          fix(455, 214, "opens down:\n(−∞, −4]"),
          tick(452, 286),
          loop(338, 380, 66, 30),
          fix(415, 360, "min value is 18:\n[18, ∞)"),
          tick(335, 590),
          tick(745, 590),
        ],
      },
      {
        studentName: "",
        problems: [correct("4"), correct("5"), correct("6"), correct("7")],
        feedback:
          "Every vertex, intercept and graph is right, including the exact roots on 6. Fix one idea: the range comes from the vertex's y-value and which way the parabola opens. Opening down means everything below the maximum.",
        marks: [tick(320, 150), tick(745, 150), tick(330, 668), tick(745, 660)],
      },
    ],
  },
];

/** An example as the graded submission the paper view draws. */
export function submissionOf(example: GradedExample): Submission {
  const queued: Submission = { id: example.id, student: example.student, pages: example.pages, state: { kind: "queued" } };
  return reduce([queued], { type: "graded", id: example.id, pages: example.grades })[0];
}
