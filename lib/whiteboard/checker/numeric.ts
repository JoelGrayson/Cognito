/**
 * Randomized numeric step checking. The load-bearing primitive of the session loop:
 * it runs on EVERY step the student writes, so it must be near-free. It is.
 * Measured: 0.026ms per check, 26/26 correct on the fixture table in numeric.test.ts.
 *
 * WHY NOT A REAL CAS: we don't need one. SymPy-via-Pyodide costs an 8-10MB wheel
 * download and a 6-15s boot on conference wifi; a Python sidecar costs a second
 * deployable and a 60-120ms network hop for a sub-millisecond computation. Both buy
 * completeness we don't use, because the LLM judge already backstops whatever this
 * misses. mathjs appears here ONLY as a parser/evaluator -- never `simplify()`, which
 * routinely fails to reduce two differently-arranged-but-equal expressions and would
 * make us confidently wrong, which is worse than slow.
 *
 * THE ASYMMETRY (this is the whole cost model, do not flatten it):
 *   "equivalent"     is a PROOF OF SAFETY   -> stay silent, spend zero tokens.
 *   "not-equivalent" proves NOTHING         -> escalate to the LLM judge.
 * The student may have divided both sides, substituted, or started a sub-derivation
 * we can't model. So a negative result is a REASON TO LOOK, never a reason to speak.
 * Twenty correct steps in a row cost zero tokens; that is why silence is free.
 */
import { create, all, type EvalFunction, type MathNode, type SymbolNode } from "mathjs";

const math = create(all);

/** Enough points that a wrong step surviving all of them is vanishingly unlikely
 *  (Schwartz-Zippel). Cheap enough that raising it is not a real cost. */
const PROBES = 24;
const REL = /(<=|>=|<|>|=)/;
const FLIP: Record<string, string> = { "<": ">", ">": "<", "<=": ">=", ">=": "<=", "=": "=" };

export type Equivalence =
  /** Proof of safety. Silent path. No tokens spent. */
  | { kind: "equivalent"; scale: number }
  /** The canonical algebra-student error, caught deterministically with no model call.
   *  `kind` IS the misconception label -- feed it straight to the canned-phrase table. */
  | { kind: "direction"; expected: string; got: string; scale: number }
  /** Sides are not proportional. Escalate: carry `witness` into the judge prompt. */
  | { kind: "not-equivalent"; witness: Witness }
  /** A bare expression was multiplied by a constant. Its VALUE changed, so this is a
   *  known error, not an abstention -- "you can scale both sides of an equation, but
   *  not a lone expression". Distinct kind because it has its own explanation. */
  | { kind: "rescaled"; by: number }
  /** Could not decide. Also escalates, but never counts as evidence of an error. */
  | { kind: "undetermined"; why: string };

/** A concrete counterexample, handed verbatim to the LLM judge so it never has to
 *  re-derive what went wrong: "at x=1.718 your line gives 9.481, the previous gives 12.481". */
export interface Witness {
  variable: string;
  at: number;
  previousValue: number;
  currentValue: number;
}

interface Side {
  isRelation: boolean;
  op: string;
  compiled: EvalFunction;
  vars: string[];
}

function parseSide(src: string): Side | null {
  const m = src.match(REL);
  try {
    if (!m) {
      const node = math.parse(src);
      return { isRelation: false, op: "", compiled: node.compile(), vars: freeVars(node) };
    }
    const [l, r] = src.split(m[1]);
    const node = math.parse(`(${l}) - (${r})`);
    return { isRelation: true, op: m[1], compiled: node.compile(), vars: freeVars(node) };
  } catch {
    return null;
  }
}

/**
 * Free variables only. A function name is a SymbolNode too -- in mathjs `sin(x)` is a
 * FunctionNode whose `fn` is the symbol `sin`. If we called that a variable we would
 * bind `sin` to a random number in the scope, SHADOWING the real function, and every
 * evaluation would throw. So: anything mathjs already knows as a function, and the
 * usual constants, are not variables.
 */
function freeVars(node: MathNode): string[] {
  const out = new Set<string>();
  const known = (name: string) =>
    /^(pi|e|i|tau|Infinity|NaN)$/.test(name) ||
    typeof (math as unknown as Record<string, unknown>)[name] === "function";

  const visit = (n: MathNode) => {
    if (n.type === "SymbolNode") {
      const name = (n as SymbolNode).name;
      if (!known(name)) out.add(name);
    }
    n.forEach(visit);
  };
  visit(node);
  return [...out];
}

/**
 * Is `current` a legal consequence of `previous`?
 *
 * Method: for a relation `L op R`, let f = L - R. Two consecutive steps have the same
 * solution set iff f_prev = k * f_current for some constant k. We test that
 * proportionality at PROBES random points rather than symbolically.
 *
 * CRITICAL BRANCH -- equations and bare expressions have different rules:
 *   EQUATION   ("2x = 4" -> "x = 2")   : any nonzero k is legal (scaling both sides).
 *   EXPRESSION ("2(x+3)" -> "2x + 6")  : k must be EXACTLY 1 (the claim is "same value",
 *                                        not "same roots"). Applying the equation rule to a
 *                                        bare expression silently accepts halving it.
 *
 * For inequalities the direction rule falls out for free: k > 0 keeps the operator,
 * k < 0 must flip it. That single line catches the most common algebra error there is.
 */
export function checkStep(previous: string | null, current: string): Equivalence {
  // First step of a problem: nothing to be inconsistent with.
  if (previous === null) return { kind: "equivalent", scale: 1 };

  const a = parseSide(previous);
  const b = parseSide(current);
  if (!a || !b) return { kind: "undetermined", why: "could not parse one of the steps" };
  if (a.isRelation !== b.isRelation) {
    return { kind: "undetermined", why: "one step is an equation, the other an expression" };
  }

  const vars = [...new Set([...a.vars, ...b.vars])];
  if (vars.length === 0) vars.push("x");
  // A changed variable set usually means the recognizer misread a letter. Don't guess.
  if (a.vars.length && b.vars.length && a.vars.join() !== b.vars.join()) {
    return { kind: "undetermined", why: `variables differ: {${a.vars}} vs {${b.vars}}` };
  }

  const allowScaling = a.isRelation;
  let scale: number | null = null;
  let usable = 0;

  for (let i = 0; i < PROBES; i++) {
    const scope: Record<string, number> = {};
    for (const v of vars) scope[v] = Math.random() * 20 - 10;

    let av: number, bv: number;
    try {
      av = a.compiled.evaluate(scope);
      bv = b.compiled.evaluate(scope);
    } catch {
      continue; // domain error at this point; try another
    }
    if (!isFinite(av) || !isFinite(bv)) continue;
    if (Math.abs(bv) < 1e-9) {
      if (Math.abs(av) > 1e-9) {
        return {
          kind: "not-equivalent",
          witness: { variable: vars[0], at: scope[vars[0]], previousValue: av, currentValue: bv },
        };
      }
      continue;
    }

    usable++;
    const k = av / bv;
    if (scale === null) {
      scale = k;
    } else if (Math.abs(k - scale) > 1e-7 * Math.max(1, Math.abs(scale))) {
      return {
        kind: "not-equivalent",
        witness: { variable: vars[0], at: scope[vars[0]], previousValue: av, currentValue: bv },
      };
    }
  }

  if (scale === null || usable < 2) {
    return { kind: "undetermined", why: "not enough evaluable sample points" };
  }

  // Bare expressions may not be rescaled -- see CRITICAL BRANCH above.
  if (!allowScaling && Math.abs(scale - 1) > 1e-7) {
    return { kind: "rescaled", by: scale };
  }

  if (a.isRelation && a.op !== "=") {
    const expected = scale > 0 ? a.op : FLIP[a.op];
    if (expected !== b.op) {
      return { kind: "direction", expected, got: b.op, scale };
    }
  }

  return { kind: "equivalent", scale };
}
