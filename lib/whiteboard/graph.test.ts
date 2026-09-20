/**
 * What the tutor may draw. Same shape as context.test.ts: most of these are
 * about what the graph must NOT show, because a curve reveals as much as a
 * sentence and the model is not the one deciding.
 *
 *   node --experimental-strip-types lib/whiteboard/graph.test.ts
 */
import { MAX_PLOTS, parsePlotArgs, planPlot, toDesmosLatex } from "./graph.ts";
import type { HintLevel } from "./policy.ts";

let pass = 0,
  total = 0;
function check(label: string, ok: boolean) {
  total++;
  if (ok) pass++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
}

// --- the rung gate ----------------------------------------------------------
for (const rung of [0, 1] as HintLevel[]) {
  const plan = planPlot(["y=2x+3"], rung);
  check(`rung ${rung} refuses to plot`, !plan.ok);
  check(`rung ${rung} says why in words the agent can use`, !plan.ok && /in words/i.test(plan.message));
}
for (const rung of [2, 3, 4, 5] as HintLevel[]) {
  check(`rung ${rung} plots`, planPlot(["y=2x+3"], rung).ok);
}
check("nothing marked -> plots", planPlot(["y=x^2"], null).ok);

// --- what comes back --------------------------------------------------------
const two = planPlot(["y=2x+3", "y=x^2"], null);
check("ids are stable and distinct", two.ok && two.plots[0].id !== two.plots[1].id);
check("plots in the order asked for", two.ok && two.plots[1].latex === "y=x^2");
check("told not to read the curve out", two.ok && /don't read the curve out/i.test(two.message));

const many = planPlot(Array.from({ length: MAX_PLOTS + 2 }, (_, i) => `y=${i}x`), null);
check("caps the number of curves", many.ok && many.plots.length === MAX_PLOTS);
check("says what was left off", many.ok && /left off/.test(many.message));

check("empty request is refused", !planPlot([], null).ok);
check("blank expressions are refused", !planPlot(["", "   "], null).ok);
check("an essay is not an expression", !planPlot(["y=".padEnd(400, "x")], null).ok);

// --- mathjs source is not LaTeX ---------------------------------------------
check("* becomes \\cdot", toDesmosLatex("y = 2 * x") === "y = 2 \\cdot x");
check("nothing else is rewritten", toDesmosLatex("y=\\frac{x}{2}") === "y=\\frac{x}{2}");

// --- arguments arrive as a model-written JSON string ------------------------
check("list of expressions", parsePlotArgs('{"expressions":["y=x","y=2x"]}').length === 2);
check("a single expression", parsePlotArgs('{"expressions":"y=x"}')[0] === "y=x");
check("non-strings are dropped", parsePlotArgs('{"expressions":["y=x",7,null]}').length === 1);
check("junk is not a plot", parsePlotArgs("not json").length === 0);
check("missing key is not a plot", parsePlotArgs("{}").length === 0);

console.log(`\n${pass}/${total} correct`);
if (pass !== total) process.exit(1);
