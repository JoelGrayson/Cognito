/**
 * tldraw canvas -> Mathpix stroke payload.
 *
 * HEADS UP, the tldraw docs online are out of date on this. As of tldraw 5.x a
 * draw segment does NOT have `points: VecModel[]`. It has `path: string`, which is
 * delta-encoded base64 (first point Float32, subsequent points Float16 deltas).
 * You must decode it with `b64Vecs.decodePoints(path, dim)`. Verified lossless at
 * canvas coordinate magnitudes.
 *
 * Points inside a shape are in SHAPE-LOCAL space, so every point needs the shape's
 * own x/y added to put it in page space. Mathpix wants one flat list of strokes in a
 * single coordinate system; if you skip the offset, every stroke lands on top of the
 * others and the recognizer returns garbage.
 */
import { b64Vecs, type TLDrawShape } from "@tldraw/tlschema";
import type { Editor } from "tldraw";

/** Mathpix v3/strokes wire format: parallel x and y arrays, one sub-array per stroke. */
export interface StrokePayload {
  strokes: { x: number[][]; y: number[][] };
}

/** Round to whole pixels. Mathpix doesn't need subpixel precision and it roughly
 *  halves the request body, which matters on conference wifi. */
const px = (n: number) => Math.round(n);

/**
 * Collect every draw stroke currently on the page, in page space.
 * Returns null when there is nothing to read, so callers can skip the network call.
 */
export function strokesFromEditor(editor: Editor): StrokePayload | null {
  const xs: number[][] = [];
  const ys: number[][] = [];

  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== "draw") continue;
    const draw = shape as TLDrawShape;

    for (const segment of draw.props.segments) {
      const points = b64Vecs.decodePoints(segment.path, segment.dim ?? 3);
      if (points.length === 0) continue;

      xs.push(points.map((p) => px(p.x + draw.x)));
      ys.push(points.map((p) => px(p.y + draw.y)));
    }
  }

  return xs.length > 0 ? { strokes: { x: xs, y: ys } } : null;
}

/**
 * Mathpix returns LaTeX. Our checker (lib/whiteboard/checker/numeric.ts) wants something
 * mathjs can parse. This is the minimum viable bridge -- deliberately small, because
 * the spike's job is to find out whether recognition works at all, not to build a
 * complete LaTeX parser. Extend it when you see what Mathpix actually emits on your
 * handwriting; that's data you don't have yet.
 */
/** Mathpix wraps a multi-line reading in an aligned/array environment. That is never
 *  a single step, so callers should discard it rather than compare against it. */
export function isMultiLineReading(latex: string): boolean {
  return /\\begin\{(aligned|array|gathered|cases|matrix)/.test(latex) || latex.includes("\\\\");
}

export function latexToMathjs(latex: string): string {
  // sqrt and abs belong here too: the closing rule below repairs "fn*(" back to
  // "fn(", which the variable-before-bracket rule would otherwise mangle.
  const FUNCS =
    "sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|exp|sqrt|abs|max|min";

  return (
    latex
      // Mathpix's `text` format wraps math in \( ... \) or $$ ... $$; `latex_styled` doesn't.
      .replace(/^\s*\\\(|\\\)\s*$/g, "")
      .replace(/^\s*\$\$?|\$\$?\s*$/g, "")
      .replace(/\\left|\\right/g, "")
      // Mathpix wraps bare operators and stray symbols in \text{...}; unwrap, keep contents.
      .replace(/\\(?:text|mathrm|mathit|operatorname)\s*\{([^{}]*)\}/g, "$1")
      // Same nesting problem as \sqrt below: \frac{x^{2}}{2} has braces in the numerator.
      .replace(
        /\\frac\s*\{((?:[^{}]|\{[^{}]*\})*)\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g,
        "($1)/($2)",
      )
      .replace(/\\cdot|\\times/g, "*")
      .replace(/\\div/g, "/")
      .replace(/\\leq/g, "<=")
      .replace(/\\geq/g, ">=")
      // One level of nesting matters: \sqrt{x^{2}} has braces INSIDE the braces, and
      // a [^{}]+ body silently fails to match, stranding the backslash as "\sqrtx".
      .replace(/\\sqrt\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, "sqrt($1)")
      // LaTeX puts the exponent on the FUNCTION NAME: \sin^{2}(x) means (sin(x))^2.
      // Must run before the generic ^{...} rewrite, or it becomes sin^(2)(x) and dies.
      .replace(
        new RegExp(`\\\\(${FUNCS})\\s*\\^\\s*\\{?(\\d+)\\}?\\s*\\(([^()]*)\\)`, "g"),
        "($1($3))^$2",
      )
      // \sin(x) -> sin(x). mathjs knows these by bare name; the backslash breaks parsing.
      .replace(new RegExp(`\\\\(${FUNCS})\\b`, "g"), "$1")
      .replace(/\^\s*\{([^{}]+)\}/g, "^($1)")
      .replace(/\{|\}/g, "")
      .replace(/\\\\|\\,|\\;|\s+/g, " ")
      // implicit multiplication: "2x" -> "2*x", "3(x+2)" -> "3*(x+2)"
      .replace(/(\d)\s*([a-zA-Z(])/g, "$1*$2")
      // ...and a VARIABLE before a bracket: "P(1+r)" -> "P*(1+r)", "x(1.1)" -> "x*(1.1)".
      // Deliberately not applied between two letters: "pq" is ambiguous in handwriting
      // (two variables, or one named pq?) and splitting it would break PV, EV, NPV.
      .replace(/([a-zA-Z])\s*\(/g, "$1*(")
      // ")(" and ") x" are implicit products too: sin(x) cos(x) -> sin(x)*cos(x)
      .replace(/\)\s*\(/g, ")*(")
      .replace(/\)\s+([a-zA-Z])/g, ")*$1")
      // "sin (x)" with a space parses as the VARIABLE sin times (x). Close the gap
      // so it stays a function call. Must run after implicit-multiplication rules,
      // which would otherwise re-open it.
      .replace(new RegExp(`\\b(${FUNCS})\\s*\\*?\\s*\\(`, "g"), "$1(")
      .trim()
  );
}
