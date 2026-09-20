/**
 * What the tutor is told. These are containment tests: every one of them is about
 * something that must NOT be in the payload, because the prompt cannot be trusted
 * to hold a secret it has been given.
 *
 *   node --experimental-strip-types lib/whiteboard/context.test.ts
 */
import { workContext, type Work } from "./context.ts";
import type { Equivalence } from "./checker/numeric.ts";
import type { HintLevel } from "./policy.ts";

const DIRECTION: Equivalence = { kind: "direction", expected: "<", got: ">", scale: -2 };

let pass = 0,
  total = 0;
function check(label: string, ok: boolean) {
  total++;
  if (ok) pass++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
}

const work = (rung: HintLevel | null, extra: Partial<Work> = {}): string =>
  workContext({
    subject: "Algebra 1",
    steps: [
      { position: 1, text: "-2x > 6", status: "follows" },
      { position: 2, text: "x > -3", status: "marked" },
    ],
    open:
      rung === null
        ? null
        : { position: 2, premise: "-2x > 6", step: "x > -3", verdict: DIRECTION, rung },
    justFound: false,
    ...extra,
  });

// --- rungs 1-2 must not carry the error, in any form ------------------------
for (const rung of [1, 2] as HintLevel[]) {
  const text = work(rung);
  check(`rung ${rung} does not name the rule`, !/flip|negative|inequality/i.test(text));
  check(`rung ${rung} does not ship the working`, !text.includes("x > -3"));
}
check("rung 1 does not say which step", !work(1).includes("step 2") && !work(1).includes('"position":2'));
check("rung 2 says which step", work(2).includes("the step they just wrote"));

// --- rung 3 locates it, and still withholds the rule ------------------------
const three = work(3);
check("rung 3 shows the marked step", three.includes("x > -3"));
check("rung 3 forbids naming the rule", three.includes("NOT name the rule"));

// --- rung 5 explains -------------------------------------------------------
const five = work(5);
check("rung 5 explains the verdict", /flipped/i.test(five));
check("rung 5 still withholds the corrected line", five.includes("do not write the corrected line"));

// --- nothing marked: the agent must not go looking ---------------------------
const idle = work(null);
check("no finding -> no marked step", idle.includes('"marked_step":null'));
check("no finding -> told not to hunt", idle.includes("Do NOT hunt for mistakes"));
check("no finding -> still sees the working, to answer questions about it", idle.includes("-2x > 6"));

// --- they found it themselves ------------------------------------------------
const found = workContext({
  subject: "Algebra 1",
  steps: [],
  open: null,
  justFound: true,
});
check("found -> acknowledged", found.includes("they_just_named_the_error"));
check("found -> stops helping", found.includes("stop helping"));

console.log(`\n${pass}/${total} correct`);
if (pass !== total) process.exit(1);
