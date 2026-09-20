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

/** Every paper here is the same two-page worksheet, so the class summary lines up. */
function parabolas(slug: string, student: string, grades: PageGrade[]): GradedExample {
  return {
    id: `parabolas-${slug}`,
    title: "Graphing parabolas · HW 1",
    topic: "Algebra · Lesson 8",
    student,
    pages: [1, 2].map((n) => ({ src: `/teacher/library/parabolas-${slug}-${n}.jpg`, ...PAGE })),
    grades,
  };
}

export const GRADED_EXAMPLES: GradedExample[] = [
  parabolas("priya", "Priya N.", [
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
  ]),
  parabolas("marcus", "Marcus T.", [
    {
      studentName: "Marcus T.",
      problems: [correct("2a"), correct("2b"), correct("2c"), correct("2d"), correct("2"), correct("3")],
      feedback: "",
      marks: [tick(345, 138), tick(345, 212), tick(345, 274), tick(345, 348), tick(335, 590), tick(745, 590)],
    },
    {
      studentName: "",
      problems: [
        correct("4"),
        correct("5"),
        correct("6"),
        { label: "7", status: "partial", note: "Vertex, y-intercept and graph right. Factoring signs swapped: (2x + 1)(x − 4) gives 4 and −1/2" },
      ],
      feedback:
        "All four ranges are right and every graph is accurate. One slip on 7: check a factoring by multiplying it back out. (2x − 1)(x + 4) gives +7x, not −7x.",
      marks: [tick(320, 150), tick(745, 150), tick(330, 668), loop(618, 679, 58, 20), fix(688, 664, "(2x+1)(x−4):\n4 and −1/2")],
    },
  ]),
  parabolas("elena", "Elena R.", [
    {
      studentName: "Elena R.",
      problems: [
        correct("2a"),
        { label: "2b", status: "partial", note: "Domain right. Range uses the vertex's y-value −4, not x = −3: (−∞, −4]" },
        { label: "2c", status: "partial", note: "Domain right. Range uses the maximum value −6, not x = 10: (−∞, −6]" },
        correct("2d"),
        correct("2"),
        correct("3"),
      ],
      feedback: "",
      marks: [
        tick(405, 138),
        loop(346, 236, 58, 22),
        fix(415, 218, "use the y-value:\n(−∞, −4]"),
        loop(348, 294, 60, 22),
        fix(418, 278, "max value is −6:\n(−∞, −6]"),
        tick(405, 348),
        tick(335, 590),
        tick(745, 590),
      ],
    },
    {
      studentName: "",
      problems: [
        { label: "4", status: "wrong", note: "Root signs flipped: x − 2 = 0 gives x = 2. Roots 2 and −4, vertex (−1, −9); the graph is mirrored" },
        { label: "5", status: "partial", note: "x² = 1/2 needs a square root: x = ±√(1/2) ≈ ±0.7" },
        { label: "6", status: "partial", note: "Vertex, y-intercept and graph right. x-intercepts left blank: −2.2 and 0.2" },
        correct("7"),
      ],
      feedback:
        "Your graphs of 2, 3 and 7 are spot on. Two things to fix first: a range is built from y-values, never x-values, and a factor (x − 2) means the root is +2.",
      marks: [
        loop(202, 169, 42, 20),
        fix(255, 190, "x − 2 = 0 → x = 2\nroots 2 and −4, vertex (−1, −9)"),
        loop(601, 169, 40, 20),
        fix(652, 158, "±√(1/2) ≈ ±0.7"),
        fix(180, 664, "missing: −2.2 and 0.2"),
        tick(745, 660),
      ],
    },
  ]),
];

/** An example as the graded submission the paper view draws. */
export function submissionOf(example: GradedExample): Submission {
  const queued: Submission = { id: example.id, student: example.student, pages: example.pages, state: { kind: "queued" } };
  return reduce([queued], { type: "graded", id: example.id, pages: example.grades })[0];
}
