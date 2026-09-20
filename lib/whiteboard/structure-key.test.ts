/**
 * Judging a drawing against the answer key, with nothing typed by the learner.
 *
 *   node --experimental-strip-types lib/whiteboard/structure-key.test.ts
 */
import { judgeStructure, trustedVerdict, type KeyEntry } from "./structure-key.ts";

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
check("another question's mistake is just wrong here", judgeStructure("CCCC(=O)O", KEY.slice(0, 2), 1), { kind: "no-match", asked: 1 });
check("matches nothing", judgeStructure("c1ccccc1", KEY, null), { kind: "no-match", asked: null });
check("matches nothing, question known", judgeStructure("c1ccccc1", KEY, 5), { kind: "no-match", asked: 5 });

// REGRESSION, seen with a real stylus: a correct answer misread at 0.58 was circled.
const WRONG = { kind: "no-match", asked: 6 } as const;
const RIGHT = { kind: "correct", problem: 6, name: "2-bromo-2-methylbutane" } as const;
const MISTAKE = { kind: "known-mistake", problem: 5, name: "butanoic acid (over-oxidised)" } as const;
check("an untrusted reading never says a bare 'wrong'", trustedVerdict(WRONG, false), null);
check("a trusted reading does", trustedVerdict(WRONG, true), WRONG);
check("an untrusted reading that matches the key still ticks", trustedVerdict(RIGHT, false), RIGHT);
check("an untrusted reading that lands on a listed mistake still names it", trustedVerdict(MISTAKE, false), MISTAKE);

console.log(`\n${pass}/${total} correct`);
if (pass !== total) process.exit(1);
