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

/** Mathpix confidence at or above this is a reading we act on as-is. */
export const TRUSTED_CONFIDENCE = 0.9;

/**
 * The verdict we are willing to act on, given whether the READING is trusted.
 *
 * A reading is trusted when Mathpix was sure, or when two independent readers agree.
 * Anything else may still act when it lands EXACTLY on the answer key - the right
 * answer, a listed mistake, another question's answer - because a misread landing
 * exactly on one of a handful of molecules is very unlikely. What an untrusted reading
 * can never do is produce a bare "that is wrong".
 *
 * Seen with a real stylus: a correct 2-bromo-2-methylbutane read as a dibromide at
 * 0.58, and the board circled right work. A shaky reading that differs from the key is
 * more likely our mistake than theirs, and accusing someone of an error they did not
 * make costs more than missing one.
 */
export function trustedVerdict(verdict: StructureVerdict | null, readingTrusted: boolean): StructureVerdict | null {
  if (!verdict || readingTrusted) return verdict;
  return verdict.kind === "no-match" ? null : verdict;
}
