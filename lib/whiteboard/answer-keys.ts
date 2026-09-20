/**
 * Answer keys for the sheets that have one, by file name.
 *
 * A drawn structure can only be judged against a known answer: reading a molecule says
 * what it IS, never whether it is what the question asked for. An uploaded sheet with
 * no key here is still a notebook, and the tutor says so rather than guessing.
 */
import ochemPractice from "../../fixtures/structures/ochem-practice.key.json" with { type: "json" };
import circuitsPractice from "../../fixtures/circuits/circuits-practice.key.json" with { type: "json" };
import type { Circuit } from "./checker/circuit.ts";

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

/** A circuit sheet's key is the circuits themselves, one per printed question number;
 *  the page solves them (checker/circuit.ts) rather than storing answers. */
export interface CircuitKeyEntry extends Circuit {
  problem: number;
  title: string;
}

const CIRCUIT_KEYS: Record<string, CircuitKeyEntry[]> = {
  [circuitsPractice.sheet]: circuitsPractice.circuits as CircuitKeyEntry[],
};

export function circuitKeyFor(sheetName: string | null | undefined): CircuitKeyEntry[] | null {
  return (sheetName && CIRCUIT_KEYS[sheetName]) || null;
}
