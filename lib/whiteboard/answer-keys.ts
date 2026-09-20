/**
 * Answer keys for the sheets that have one, by file name.
 *
 * A drawn structure can only be judged against a known answer: reading a molecule says
 * what it IS, never whether it is what the question asked for. An uploaded sheet with
 * no key here is still a notebook, and the tutor says so rather than guessing.
 */
import ochemPractice from "../../fixtures/structures/ochem-practice.key.json" with { type: "json" };

export interface RawKeyEntry {
  problem: number;
  name: string;
  /** As written in the file. Not canonical; see structure-key.ts. */
  smiles: string;
  commonWrong?: { name: string; smiles: string }[];
}

const KEYS: Record<string, RawKeyEntry[]> = {
  [ochemPractice.sheet]: ochemPractice.answers,
};

export function answerKeyFor(sheetName: string | null | undefined): RawKeyEntry[] | null {
  return (sheetName && KEYS[sheetName]) || null;
}
