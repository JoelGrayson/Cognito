/**
 * An uploaded worksheet, as the checker sees it. Pure: no editor, no DOM, no network.
 *
 * A blank canvas holds ONE problem, so "the previous step" is simply the line written
 * before this one. A worksheet holds many, and that assumption turns dangerous: the
 * first line of problem 2 judged against the last line of problem 1 is a confident
 * accusation about two unrelated equations.
 *
 * So the printed problems become ANCHORS. Every handwritten line belongs to the anchor
 * it sits beside or beneath, steps are only ever compared within one anchor, and the
 * first step of a problem is judged against the printed problem itself.
 */
import { checkStep } from "./checker/numeric.ts";
import { latexToMathjs } from "./ink.ts";
import type { Bounds } from "./strokes.ts";

export interface ProblemAnchor {
  /** Negative, so an anchor can share the bounds lookup with handwritten lines (whose
   *  ids count up from 0) and a mark can point back at the printed problem. */
  id: number;
  /** Page space. */
  bounds: Bounds;
  raw: string;
  /** mathjs source, or null when the print could not be read as ONE checkable
   *  statement. A null anchor still separates problems; it just offers no premise. */
  parsed: string | null;
}

/** One printed line as the OCR reports it, already in page space. */
export interface PrintedLine {
  text: string;
  bounds: Bounds;
}

const RELATION = /<=|>=|<|>|=|\\leq|\\geq/;
const INLINE_MATH = /\\\((.+?)\\\)|\\\[(.+?)\\\]|\$\$?(.+?)\$\$?/g;
/** "1.", "12)", "(a)", "b." */
const NUMBERING = /^\s*\(?[0-9a-zA-Z]{1,2}[.)]\s*/;

/** What a printed line poses. "ambiguous" is two problems read as one row: it still
 *  separates the working around it, but picking either statement would judge
 *  someone's work against a problem they were not solving. */
type Printed = { kind: "statement"; parsed: string } | { kind: "ambiguous" } | null;

function readPrinted(text: string): Printed {
  const delimited = [...text.matchAll(INLINE_MATH)].map((m) => m[1] ?? m[2] ?? m[3]);
  const relations = delimited.filter((s) => RELATION.test(s));
  if (relations.length > 1) return { kind: "ambiguous" };

  // Prose parses too: "Name" and the "x" in "solve for x" are valid one-variable
  // expressions. Without a relation, demand an operator or a digit before believing
  // a line is a problem, and never believe undelimited text without a relation.
  const bare = text.replace(NUMBERING, "");
  const candidate =
    relations[0] ??
    delimited.find((s) => /[0-9+\-*/^]/.test(s)) ??
    (delimited.length === 0 && RELATION.test(bare) ? bare : undefined);
  if (!candidate) return null;

  const parsed = latexToMathjs(candidate);
  return checkStep(parsed, parsed).kind === "equivalent" ? { kind: "statement", parsed } : null;
}

/** The statement a printed line poses, as mathjs source, or null rather than a guess. */
export function mathFromPrintedLine(text: string): string | null {
  const printed = readPrinted(text);
  return printed?.kind === "statement" ? printed.parsed : null;
}

/** Printed lines that pose a problem become anchors, numbered -1, -2, ... top to bottom. */
export function anchorsFrom(lines: PrintedLine[]): ProblemAnchor[] {
  return lines
    .map((l) => ({ line: l, printed: readPrinted(l.text) }))
    .filter((x) => x.printed !== null)
    .sort((a, b) => a.line.bounds.minY - b.line.bounds.minY)
    .map(({ line, printed }, i) => ({
      id: -(i + 1),
      bounds: line.bounds,
      raw: line.text,
      parsed: printed?.kind === "statement" ? printed.parsed : null,
    }));
}

/**
 * Numbered questions, for subjects whose questions are prose ("4. Cyclohexanol is
 * oxidised with PCC. Draw the product."). There is no statement to check a step
 * against; the anchor only says WHICH question a drawing sits under, and its id is the
 * printed question number so it can be looked up in an answer key.
 */
export function questionsFrom(lines: PrintedLine[]): ProblemAnchor[] {
  return lines.flatMap((l) => {
    const n = l.text.match(/^\s*\(?(\d{1,2})[.)]\s/)?.[1];
    return n ? [{ id: Number(n), bounds: l.bounds, raw: l.text, parsed: null }] : [];
  });
}

/**
 * Which printed problem a handwritten line is working on: the nearest anchor that
 * starts above the line's middle. Distance is the gap between the two boxes, so
 * working written beside a problem and working written beneath it both count as
 * close, while a problem in the other column does not.
 */
export function problemFor(line: Bounds, anchors: ProblemAnchor[]): ProblemAnchor | null {
  const midY = (line.minY + line.maxY) / 2;
  let best: ProblemAnchor | null = null;
  let bestGap = Infinity;
  for (const a of anchors) {
    if (a.bounds.minY > midY) continue;
    const dx = Math.max(0, line.minX - a.bounds.maxX, a.bounds.minX - line.maxX);
    const dy = Math.max(0, line.minY - a.bounds.maxY);
    const gap = Math.hypot(dx, dy);
    if (gap < bestGap) {
      best = a;
      bestGap = gap;
    }
  }
  return best;
}

export interface PriorStep {
  lineId: number;
  problemId: number | null;
  parsed: string;
  confidence: number | null;
}

export interface Premise {
  text: string;
  /** Where the premise sits on the canvas: a handwritten line, or a negative anchor id. */
  lineId: number;
}

/**
 * What a new line must follow from: the newest trusted earlier line of the SAME
 * problem, else the printed problem, else nothing.
 *
 * Both ends of a transition have to be trustworthy. Judging a clean line against a
 * misread premise produces an accusation caused entirely by our own OCR error, so a
 * reading under the confidence floor is never a premise.
 */
export function premiseFor(
  steps: PriorStep[],
  lineId: number,
  anchor: ProblemAnchor | null,
  confidenceFloor: number,
): Premise | null {
  const problemId = anchor?.id ?? null;
  const prior = steps
    .filter(
      (s) =>
        s.lineId < lineId &&
        s.problemId === problemId &&
        (s.confidence === null || s.confidence >= confidenceFloor),
    )
    .sort((a, b) => b.lineId - a.lineId)[0];
  if (prior) return { text: prior.parsed, lineId: prior.lineId };
  if (anchor?.parsed) return { text: anchor.parsed, lineId: anchor.id };
  return null;
}
