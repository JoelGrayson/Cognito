/**
 * Judging a drawn structure against a sheet's answer key. Pure: no RDKit, no DOM.
 *
 * Everything here compares CANONICAL SMILES, which the caller gets from RDKit. Two
 * spellings of one molecule ("CCC(C)O", "OC(C)CC") only compare equal once both have
 * been through the same canonicaliser, so a raw SMILES must never reach this file.
 *
 * The learner is never asked what they meant. The key is small, so a drawing is
 * compared against every answer on the sheet, and against the usual wrong answers,
 * which is how the verdict can name the mistake instead of only saying "wrong".
 */
export interface KeyEntry {
  problem: number;
  name: string;
  /** Canonical. */
  smiles: string;
  commonWrong: { name: string; smiles: string }[];
}

export type StructureVerdict =
  | { kind: "correct"; problem: number; name: string }
  /** A right answer, to a different question than the one they said they were on. */
  | { kind: "other-question"; problem: number; name: string; asked: number }
  /** The usual wrong answer to a question: the verdict can say what went wrong. */
  | { kind: "known-mistake"; problem: number; name: string }
  | { kind: "no-match"; asked: number | null };

export function judgeStructure(canonical: string, key: KeyEntry[], asked: number | null): StructureVerdict {
  // The question they said they are on is settled first, answer and mistakes both, so
  // its own usual mistake wins over another question that happens to have that
  // molecule as its answer.
  const own = key.find((e) => e.problem === asked);
  if (own) {
    if (own.smiles === canonical) return { kind: "correct", problem: own.problem, name: own.name };
    const mistake = own.commonWrong.find((w) => w.smiles === canonical);
    if (mistake) return { kind: "known-mistake", problem: own.problem, name: mistake.name };
  }

  const answered = key.find((e) => e.smiles === canonical);
  if (answered) {
    return asked === null
      ? { kind: "correct", problem: answered.problem, name: answered.name }
      : { kind: "other-question", problem: answered.problem, name: answered.name, asked };
  }
  // Another question's usual mistake says nothing about THIS question. Naming it would
  // circle the drawing under question 1 while the tutor talks about question 5.
  if (asked === null) {
    for (const entry of key) {
      const mistake = entry.commonWrong.find((w) => w.smiles === canonical);
      if (mistake) return { kind: "known-mistake", problem: entry.problem, name: mistake.name };
    }
  }
  return { kind: "no-match", asked };
}
