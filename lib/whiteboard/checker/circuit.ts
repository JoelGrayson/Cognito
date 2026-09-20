/**
 * Circuits: solving a netlist, and judging a handwritten KVL / KCL line against it.
 *
 * The step checker asks "does this line follow from the one above?". A circuit line
 * has a better premise than the line above it: the circuit. Every correct KVL loop
 * sum, KCL node sum, Ohm's-law line and final answer is an equation the true
 * currents and voltages satisfy, so a line is judged by substituting the solved
 * circuit into it. No symbolic algebra, no model: one evaluation per line.
 *
 * The netlist is solved here with modified nodal analysis, so an answer key only has
 * to describe the circuit, never its answers - and a key cannot be wrong about what
 * its own circuit does.
 *
 * Verdict `kind` is the misconception, as in numeric.ts, and the two kinds the rest
 * of the page keys on (`equivalent`, `undetermined`) are shared with it:
 *   equivalent   the circuit satisfies the line (silent path)
 *   sign         flipping ONE term makes it hold: the polarity error, a drop written
 *                as a rise or a current counted into a node instead of out of it
 *   wrong-value  "I1 = 3" when I1 is 2: the equations were right, the arithmetic not
 *   not-holding  none of the above; the line contradicts the circuit
 *   undetermined nothing to judge (not an equation, a symbol the circuit has no name for)
 */
import { create, all, type MathNode, type OperatorNode, type ParenthesisNode, type SymbolNode } from "mathjs";
import type { Equivalence } from "./numeric.ts";

const math = create(all);

export type ElementKind = "R" | "V" | "I";

export interface Element {
  kind: ElementKind;
  /** As printed on the diagram: "R1", "V1", "Is". Also the name of its value. */
  name: string;
  /** For a source, `from` is the + terminal (V) or where the current comes out (I).
   *  Element current is always measured from `from` to `to` through the element. */
  from: string;
  to: string;
  /** Ohms, volts or amps. */
  value: number;
}

/** A quantity the learner may write about, by the name printed on the diagram. */
export type Label =
  | { name: string; through: string; reverse?: boolean }
  | { name: string; across: string }
  | { name: string; node: string };

export interface Circuit {
  /** Ground is the node named "0". */
  elements: Element[];
  labels: Label[];
}

/** Every named quantity of a solved circuit, element values included. */
export type Quantities = Record<string, number>;

function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) throw new Error("The circuit has no unique solution (a floating node or a source loop).");
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** Node voltages and element currents, by modified nodal analysis. */
export function solveCircuit(circuit: Circuit): Quantities {
  const nodes = [...new Set(circuit.elements.flatMap((e) => [e.from, e.to]))].filter((n) => n !== "0");
  const sources = circuit.elements.filter((e) => e.kind === "V");
  const index = new Map(nodes.map((n, i) => [n, i]));
  const n = nodes.length + sources.length;
  const a: number[][] = Array.from({ length: n }, () => Array<number>(n).fill(0));
  const b = Array<number>(n).fill(0);
  const at = (node: string) => (node === "0" ? null : index.get(node)!);

  for (const e of circuit.elements) {
    const f = at(e.from);
    const t = at(e.to);
    if (e.kind === "R") {
      const g = 1 / e.value;
      if (f !== null) a[f][f] += g;
      if (t !== null) a[t][t] += g;
      if (f !== null && t !== null) {
        a[f][t] -= g;
        a[t][f] -= g;
      }
    } else if (e.kind === "I") {
      if (f !== null) b[f] -= e.value;
      if (t !== null) b[t] += e.value;
    }
  }
  sources.forEach((s, k) => {
    const row = nodes.length + k;
    const f = at(s.from);
    const t = at(s.to);
    if (f !== null) {
      a[f][row] += 1;
      a[row][f] += 1;
    }
    if (t !== null) {
      a[t][row] -= 1;
      a[row][t] -= 1;
    }
    b[row] = s.value;
  });

  const x = solveLinear(a, b);
  const voltage = (node: string) => (node === "0" ? 0 : x[index.get(node)!]);
  const current = (e: Element) => {
    if (e.kind === "R") return (voltage(e.from) - voltage(e.to)) / e.value;
    if (e.kind === "I") return e.value;
    return x[nodes.length + sources.indexOf(e)];
  };

  const out: Quantities = {};
  for (const e of circuit.elements) out[e.name] = e.value;
  for (const label of circuit.labels) {
    if ("node" in label) {
      out[label.name] = voltage(label.node);
      continue;
    }
    const name = "through" in label ? label.through : label.across;
    const e = circuit.elements.find((el) => el.name === name);
    if (!e) throw new Error(`Label ${label.name} refers to an element ${name} the circuit doesn't have.`);
    out[label.name] = "through" in label ? current(e) * (label.reverse ? -1 : 1) : voltage(e.from) - voltage(e.to);
  }
  return out;
}

export type CircuitVerdict =
  | { kind: "equivalent"; scale: number }
  | { kind: "sign"; term: string }
  | { kind: "wrong-value"; variable: string; got: number; expected: number }
  | { kind: "not-holding"; lhs: number; rhs: number }
  | { kind: "undetermined"; why: string };

/** Anything a checker can say about a line. marks, voice and the tutor's context
 *  take this, so a subject only has to add a checker, never a second page. */
export type Verdict = Equivalence | CircuitVerdict;

/** Learners round: 12/7 becomes 1.71. Two percent keeps that right and a flipped sign wrong. */
const TOLERANCE = 0.02;

function close(l: number, r: number): boolean {
  return Math.abs(l - r) <= TOLERANCE * Math.max(1, Math.abs(l), Math.abs(r));
}

/** "I_1", "i1" and "I1" are one name in handwriting. */
function normalise(name: string): string {
  return name.replace(/_/g, "").toLowerCase();
}

/** Units the pen writes and the circuit does not: 12 V, 4 Ω, 2 A. Applied to the
 *  mathjs source (after latexToMathjs, which has already turned "2A" into "2*A"). */
export function stripUnits(source: string): string {
  return source
    .replace(/~/g, " ")
    .replace(/(\d)\s*\*?\s*(kΩ|Ω|\\[Oo]mega|kV|mV|V|mA|A)(?![a-zA-Z_0-9])/g, "$1")
    .trim();
}

/** Top-level additive terms of a side, each with its sign. */
function terms(node: MathNode, sign = 1): { node: MathNode; sign: number }[] {
  if (node.type === "ParenthesisNode") return terms((node as ParenthesisNode).content, sign);
  if (node.type === "OperatorNode") {
    const op = node as OperatorNode;
    if (op.fn === "add") return [...terms(op.args[0], sign), ...terms(op.args[1], sign)];
    if (op.fn === "subtract") return [...terms(op.args[0], sign), ...terms(op.args[1], -sign)];
    if (op.fn === "unaryMinus") return terms(op.args[0], -sign);
  }
  return [{ node, sign }];
}

/**
 * Judge one handwritten line (mathjs source, see ink.ts) against the solved circuit.
 */
export function checkCircuitLine(line: string, known: Quantities): CircuitVerdict {
  const sides = line.split("=");
  if (sides.length !== 2 || sides.some((s) => s.trim() === "")) {
    return { kind: "undetermined", why: /[<>]/.test(line) ? "an inequality says nothing about a circuit" : "not an equation" };
  }

  const byNorm = new Map(Object.keys(known).map((k) => [normalise(k), k]));
  const unknown: string[] = [];
  const rename = (node: MathNode): MathNode =>
    node.transform((n) => {
      if (n.type !== "SymbolNode") return n;
      const name = (n as SymbolNode).name;
      const canonical = byNorm.get(normalise(name));
      if (!canonical) {
        if (!/^(pi|e)$/.test(name)) unknown.push(name);
        return n;
      }
      return new math.SymbolNode(canonical);
    });

  let lhs: MathNode, rhs: MathNode;
  try {
    lhs = rename(math.parse(sides[0]));
    rhs = rename(math.parse(sides[1]));
  } catch {
    return { kind: "undetermined", why: "could not parse the line" };
  }
  if (unknown.length > 0) {
    return { kind: "undetermined", why: `the circuit has nothing called ${[...new Set(unknown)].join(", ")}` };
  }

  const evaluate = (n: MathNode): number | null => {
    try {
      const v = n.compile().evaluate(known);
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  };
  const l = evaluate(lhs);
  const r = evaluate(rhs);
  if (l === null || r === null) return { kind: "undetermined", why: "could not evaluate the line" };
  if (close(l, r)) return { kind: "equivalent", scale: 1 };

  // One flipped sign: the whole equation moves by twice that term.
  const all = [...terms(lhs).map((t) => ({ ...t, side: 1 })), ...terms(rhs).map((t) => ({ ...t, side: -1 }))];
  if (all.length > 1) {
    for (const t of all) {
      const v = evaluate(t.node);
      if (v === null || Math.abs(v) < 1e-9) continue;
      const newL = t.side === 1 ? l - 2 * t.sign * v : l;
      const newR = t.side === -1 ? r - 2 * t.sign * v : r;
      if (close(newL, newR)) return { kind: "sign", term: `${t.sign < 0 ? "-" : ""}${t.node.toString()}` };
    }
  }

  const claim =
    lhs.type === "SymbolNode" && rhs.type === "ConstantNode"
      ? { variable: (lhs as SymbolNode).name, got: r, expected: l }
      : rhs.type === "SymbolNode" && lhs.type === "ConstantNode"
        ? { variable: (rhs as SymbolNode).name, got: l, expected: r }
        : null;
  if (claim) return { kind: "wrong-value", ...claim };

  return { kind: "not-holding", lhs: l, rhs: r };
}
