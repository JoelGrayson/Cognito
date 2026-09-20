/**
 * Judging a drawing against the answer key, with nothing typed by the learner.
 *
 *   node --experimental-strip-types lib/whiteboard/structure-key.test.ts
 */
import { judgeStructure, type KeyEntry } from "./structure-key.ts";

let pass = 0, total = 0;
function check(label: string, got: unknown, want: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `   (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
}

const KEY: KeyEntry[] = [
  { problem: 1, name: "2-butanol", smiles: "CCC(C)O", commonWrong: [] },
  { problem: 5, name: "butanal", smiles: "CCCC=O", commonWrong: [{ name: "butanoic acid (over-oxidised)", smiles: "CCCC(=O)O" }] },
  // A sheet where one question's usual mistake is another question's answer.
  { problem: 7, name: "butanoic acid", smiles: "CCCC(=O)O", commonWrong: [] },
];

check("no question given: finds it", judgeStructure("CCCC=O", KEY, null), { kind: "correct", problem: 5, name: "butanal" });
check("right answer to the question asked", judgeStructure("CCC(C)O", KEY, 1), { kind: "correct", problem: 1, name: "2-butanol" });
check("right answer, wrong question", judgeStructure("CCC(C)O", KEY, 5), { kind: "other-question", problem: 1, name: "2-butanol", asked: 5 });
check("the usual mistake is named", judgeStructure("CCCC(=O)O", KEY.slice(0, 2), null), { kind: "known-mistake", problem: 5, name: "butanoic acid (over-oxidised)" });
check("with no question given, a real answer beats a mistake", judgeStructure("CCCC(=O)O", KEY, null), { kind: "correct", problem: 7, name: "butanoic acid" });
check("on question 5, its own mistake beats question 7's answer", judgeStructure("CCCC(=O)O", KEY, 5), { kind: "known-mistake", problem: 5, name: "butanoic acid (over-oxidised)" });
check("on question 7 it is simply correct", judgeStructure("CCCC(=O)O", KEY, 7), { kind: "correct", problem: 7, name: "butanoic acid" });
check("matches nothing", judgeStructure("c1ccccc1", KEY, null), { kind: "no-match", asked: null });
check("matches nothing, question known", judgeStructure("c1ccccc1", KEY, 5), { kind: "no-match", asked: 5 });

console.log(`\n${pass}/${total} correct`);
if (pass !== total) process.exit(1);
