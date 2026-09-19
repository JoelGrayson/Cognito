/**
 * The help ladder. The load-bearing test is THE INVARIANT: no matter how long the
 * student flounders, the system never climbs past rung 1 on its own.
 *
 *   node --experimental-strip-types lib/whiteboard/policy.test.ts
 */
import {
  decide, requestHint, markSelfCorrected, scoreSession,
  type StepState, type Move,
} from "./policy.ts";
import type { Equivalence } from "./checker/numeric.ts";

const WRONG: Equivalence = { kind: "direction", expected: "<", got: ">", scale: -2 };
const RIGHT: Equivalence = { kind: "equivalent", scale: 1 };
const ABSTAIN: Equivalence = { kind: "undetermined", why: "could not parse" };

function step(over: Partial<StepState> = {}): StepState {
  return { lineId: 1, verdict: WRONG, recognitionConfidence: 1, offeredAt: null, hintsUsed: 0, resolvedBy: null, ...over };
}

let pass = 0, total = 0;
function check(label: string, got: unknown, want: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`}`);
}
const move = (s: StepState | null, idle = 5000, now = 10_000): Move =>
  decide({ now, step: s, msSinceStrokeIdle: idle });

check("correct step -> silence", move(step({ verdict: RIGHT })), { act: "stay-silent", because: "no-error" });
check("checker abstained -> silence", move(step({ verdict: ABSTAIN })), { act: "stay-silent", because: "checker-abstained" });
check("misread handwriting -> silence, not an accusation",
  move(step({ recognitionConfidence: 0.3 })), { act: "stay-silent", because: "low-recognition-confidence" });
check("still writing -> silence", move(step(), 100), { act: "stay-silent", because: "still-writing" });
check("real error, pen idle -> offer rung 1", move(step()), { act: "offer-check" });
check("already offered, student thinking -> silence",
  move(step({ offeredAt: 9_000 })), { act: "stay-silent", because: "student-is-working-on-it" });
check("self-corrected -> silence forever after",
  move(step({ resolvedBy: "self" })), { act: "stay-silent", because: "student-self-corrected" });

// ---- THE INVARIANT ---------------------------------------------------------
// Let the student flounder for an hour. The system must never reach rung 2 alone.
{
  total++;
  const s = step({ offeredAt: 0 });
  let climbed = false;
  for (let t = 0; t <= 3_600_000; t += 5_000) {
    const m = decide({ now: t, step: s, msSinceStrokeIdle: 9_999 });
    if (m.act === "give-hint") climbed = true;
  }
  if (!climbed) { pass++; console.log("ok   INVARIANT: never volunteers a hint, even after an hour of silence"); }
  else console.log("FAIL INVARIANT: system climbed the ladder on its own");
}

// Rungs 2-5 exist, but only by request.
{
  let s = step({ offeredAt: 0 });
  const levels: number[] = [];
  for (let i = 0; i < 6; i++) { const r = requestHint(s); s = r.step; if (r.move.act === "give-hint") levels.push(r.move.level); }
  check("requesting climbs 1..5 then stops", levels, [1, 2, 3, 4, 5, 5]);
}

// ---- the scoreboard --------------------------------------------------------
{
  const steps = [
    markSelfCorrected(step({ lineId: 1 })),                        // caught it alone
    markSelfCorrected(step({ lineId: 2 })),                        // caught it alone
    requestHint(step({ lineId: 3 })).step,                         // needed one rung
    step({ lineId: 4, verdict: RIGHT }),                           // no error at all
  ];
  const sc = scoreSession(steps);
  check("3 errors, 2 caught unaided -> rate 2/3", Number(sc.selfCorrectionRate.toFixed(3)), 0.667);
  check("errors counted, correct steps excluded", sc.errorsMade, 3);
  check("mean rungs given away", Number(sc.averageHintDepth.toFixed(3)), 0.333);
}

console.log(`\n${pass}/${total} correct`);
if (pass !== total) process.exit(1);
