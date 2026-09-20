/**
 * Step checking for work that carries UNITS — chemistry and physics.
 *
 * The algebra checker samples random values, which is meaningless here: "2 mol"
 * is not a free variable. Quantities with units are concrete, so they are simply
 * evaluated and compared, and mathjs already knows the whole unit system —
 * including that kg·m/s² IS a newton and that 250 mL IS 0.25 L.
 *
 * WHY THIS MATTERS PEDAGOGICALLY: in chemistry and physics the units are where the
 * mistakes live. Forgetting to convert mL to L, dividing by molar mass instead of
 * multiplying, adding a distance to a time — all of these are invisible in the
 * arithmetic and glaring in the dimensions. Dimensional analysis is the check a
 * teacher actually performs, and it is the one students skip.
 *
 * The verdict kinds are deliberately distinct from the algebra ones, because the
 * misconception is different: a dimension mismatch is not "you did the sum wrong",
 * it is "this quantity is not that kind of thing".
 */
import { create, all } from "mathjs";

const math = create(all);

export type UnitVerdict =
  | { kind: "equivalent"; value: string }
  /** Right kind of quantity, wrong amount. Ordinary arithmetic slip. */
  | { kind: "value-mismatch"; expected: string; got: string }
  /** The two sides are not even the same kind of thing — g vs mol, m vs s.
   *  Almost always a missing or inverted conversion factor. */
  | { kind: "dimension-mismatch"; previous: string; current: string }
  /** A single step that is internally impossible, e.g. adding a length to a time. */
  | { kind: "incoherent"; why: string }
  | { kind: "undetermined"; why: string };

/** Unit tokens common in school chemistry and physics. Deliberately not exhaustive —
 *  anything mathjs knows will still evaluate; this only decides which checker to use. */
const UNIT_HINT =
  /\b(mol|mmol|g|kg|mg|L|mL|dL|m|cm|mm|km|s|ms|min|h|N|J|kJ|W|Pa|atm|K|degC|V|A|C|Hz|M)\b/;

/** Does this step carry units, i.e. should the unit checker handle it? */
export function hasUnits(expr: string): boolean {
  if (!UNIT_HINT.test(expr)) return false;
  // A bare "m" or "s" is more likely a variable than a metre unless a number
  // precedes it somewhere — "2 m/s" yes, "m*x + c" no.
  return /\d\s*\*?\s*[a-zA-Z]/.test(expr);
}

/** Right-hand side of "x = ...", or the whole thing when there is no relation. */
function quantity(step: string): string {
  const i = step.indexOf("=");
  return (i >= 0 ? step.slice(i + 1) : step).trim();
}

function evaluate(expr: string): { ok: true; value: math.Unit | number } | { ok: false; why: string } {
  try {
    return { ok: true, value: math.evaluate(expr) };
  } catch (e) {
    return { ok: false, why: e instanceof Error ? e.message : "could not evaluate" };
  }
}

const show = (v: unknown) => math.format(v, { precision: 6 });

/**
 * Is `current` the same physical quantity as `previous`?
 *
 * `previous === null` still checks the step for internal coherence, which catches
 * the classic "add a length to a time" in a single line.
 */
export function checkUnitStep(previous: string | null, current: string): UnitVerdict {
  const cur = evaluate(quantity(current));
  if (!cur.ok) {
    // mathjs says this outright when dimensions clash inside one expression.
    if (/Units do not match/i.test(cur.why)) {
      return { kind: "incoherent", why: "these quantities are different kinds of thing" };
    }
    return { kind: "undetermined", why: cur.why };
  }
  if (previous === null) return { kind: "equivalent", value: show(cur.value) };

  const prev = evaluate(quantity(previous));
  if (!prev.ok) return { kind: "undetermined", why: prev.why };

  try {
    if (math.equal(prev.value as never, cur.value as never)) {
      return { kind: "equivalent", value: show(cur.value) };
    }
    return { kind: "value-mismatch", expected: show(prev.value), got: show(cur.value) };
  } catch (e) {
    // mathjs refuses to compare across bases -- which IS the finding, not a failure.
    if (/different base|Units do not match/i.test(e instanceof Error ? e.message : "")) {
      return { kind: "dimension-mismatch", previous: show(prev.value), current: show(cur.value) };
    }
    return { kind: "undetermined", why: e instanceof Error ? e.message : "could not compare" };
  }
}

/** Short, spoken-friendly description. The verdict kind IS the misconception. */
export function describeUnitVerdict(v: UnitVerdict): string {
  switch (v.kind) {
    case "dimension-mismatch":
      return `${v.previous} and ${v.current} aren't the same kind of quantity — check your conversion`;
    case "value-mismatch":
      return `the units are right but the amount changed: ${v.expected} became ${v.got}`;
    case "incoherent":
      return v.why;
    default:
      return "";
  }
}
