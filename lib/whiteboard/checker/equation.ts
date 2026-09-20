/**
 * Balancing chemical equations.
 *
 * The most common piece of written chemistry homework there is, and it is pure
 * counting — atoms are conserved, so an equation is balanced exactly when every
 * element appears the same number of times on both sides. No model, no sampling,
 * no ambiguity: the verdict is arithmetic.
 *
 * And the verdict NAMES the mistake for free. Not "wrong", but "3 oxygen on the
 * left, 2 on the right" — which is the sentence a chemistry teacher actually says,
 * and it points at the coefficient to change without giving it away.
 *
 * Handles subscripts, nested groups and hydrates:
 *   Fe2O3        {Fe:2, O:3}
 *   Ca(OH)2      {Ca:1, O:2, H:2}
 *   Fe2(SO4)3    {Fe:2, S:3, O:12}
 *   CuSO4·5H2O   {Cu:1, S:1, O:9, H:10}
 */

export type Counts = Record<string, number>;

export type BalanceVerdict =
  | { kind: "balanced" }
  /** Named elements do not conserve. `off` lists each with its two totals. */
  | { kind: "unbalanced"; off: { element: string; left: number; right: number }[] }
  /** An element appears on one side only — usually a missing or invented species. */
  | { kind: "missing-species"; element: string; side: "left" | "right" }
  | { kind: "undetermined"; why: string };

/** Split "2Fe2O3" into its coefficient and its formula. A bare formula means 1. */
function splitCoefficient(term: string): { coefficient: number; formula: string } {
  const m = term.trim().match(/^(\d+)\s*(.+)$/);
  if (!m) return { coefficient: 1, formula: term.trim() };
  return { coefficient: Number(m[1]), formula: m[2].trim() };
}

/**
 * Atom counts for one formula. Recursive so nested groups work; hydrate dots are
 * treated as a product, since CuSO4·5H2O is exactly that.
 */
export function parseFormula(formula: string): Counts | null {
  const counts: Counts = {};
  // A hydrate dot separates independent units, each with its own multiplier.
  for (const part of formula.split(/[·.]/)) {
    const { coefficient, formula: body } = splitCoefficient(part);
    const inner = parseUnit(body);
    if (!inner) return null;
    for (const [el, n] of Object.entries(inner)) counts[el] = (counts[el] ?? 0) + n * coefficient;
  }
  return Object.keys(counts).length > 0 ? counts : null;
}

function parseUnit(s: string): Counts | null {
  const counts: Counts = {};
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === " " || ch === "+") {
      i++;
      continue;
    }
    if (ch === "(" || ch === "[") {
      const close = matchBracket(s, i);
      if (close < 0) return null;
      const inner = parseUnit(s.slice(i + 1, close));
      if (!inner) return null;
      i = close + 1;
      const { n, next } = readNumber(s, i);
      i = next;
      for (const [el, k] of Object.entries(inner)) counts[el] = (counts[el] ?? 0) + k * n;
      continue;
    }
    // An element is a capital letter, optionally followed by lower-case letters.
    const el = s.slice(i).match(/^[A-Z][a-z]*/);
    if (!el) return null;
    i += el[0].length;
    const { n, next } = readNumber(s, i);
    i = next;
    counts[el[0]] = (counts[el[0]] ?? 0) + n;
  }
  return counts;
}

function matchBracket(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(" || s[i] === "[") depth++;
    else if (s[i] === ")" || s[i] === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** A subscript, defaulting to 1. Unicode subscripts count, since handwriting OCR emits them. */
function readNumber(s: string, i: number): { n: number; next: number } {
  const SUB = "₀₁₂₃₄₅₆₇₈₉";
  let digits = "";
  while (i < s.length) {
    const c = s[i];
    if (c >= "0" && c <= "9") digits += c;
    else if (SUB.includes(c)) digits += String(SUB.indexOf(c));
    else break;
    i++;
  }
  return { n: digits ? Number(digits) : 1, next: i };
}

/** Total atom counts for one side of an equation, e.g. "2Fe2O3 + 3C". */
export function countSide(side: string): Counts | null {
  const total: Counts = {};
  for (const term of side.split("+")) {
    if (!term.trim()) continue;
    const { coefficient, formula } = splitCoefficient(term);
    const counts = parseFormula(formula);
    if (!counts) return null;
    for (const [el, n] of Object.entries(counts)) total[el] = (total[el] ?? 0) + n * coefficient;
  }
  return Object.keys(total).length > 0 ? total : null;
}

/** Does this look like a chemical equation rather than algebra? */
export function isChemicalEquation(s: string): boolean {
  if (!/(->|→|=>|⟶|⇌|<=>)/.test(s)) return false;
  // At least one capital-then-lowercase element or a subscripted formula.
  return /[A-Z][a-z]?[0-9₀-₉]/.test(s) || /[A-Z][a-z]/.test(s);
}

export function checkBalance(equation: string): BalanceVerdict {
  const sides = equation.split(/->|→|=>|⟶|⇌|<=>/);
  if (sides.length !== 2) return { kind: "undetermined", why: "need exactly one arrow" };

  const left = countSide(sides[0]);
  const right = countSide(sides[1]);
  if (!left || !right) return { kind: "undetermined", why: "could not read a formula" };

  for (const el of Object.keys(left)) {
    if (!(el in right)) return { kind: "missing-species", element: el, side: "right" };
  }
  for (const el of Object.keys(right)) {
    if (!(el in left)) return { kind: "missing-species", element: el, side: "left" };
  }

  const off = Object.keys(left)
    .filter((el) => left[el] !== right[el])
    .map((el) => ({ element: el, left: left[el], right: right[el] }));

  return off.length === 0 ? { kind: "balanced" } : { kind: "unbalanced", off };
}

/** What a teacher would say. Names the element, never the coefficient. */
export function describeBalance(v: BalanceVerdict): string {
  switch (v.kind) {
    case "balanced":
      return "balanced";
    case "unbalanced": {
      const [first] = v.off;
      const more = v.off.length > 1 ? `, and ${v.off.length - 1} more` : "";
      return `${first.element}: ${first.left} on the left, ${first.right} on the right${more}`;
    }
    case "missing-species":
      return `${v.element} doesn't appear on the ${v.side}`;
    default:
      return v.why;
  }
}
