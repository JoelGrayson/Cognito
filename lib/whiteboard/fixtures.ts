/**
 * Fixture capture. Handwriting is the ONE input in this system that cannot be
 * synthesized -- Mathpix is trained on human strokes, so machine-drawn "writing"
 * tests nothing. So we capture real strokes the first time a human writes them and
 * replay them forever after.
 *
 * What this unlocks: tuning latexToMathjs(), the checker, and eventually the
 * interrupt policy against REAL readings, with no tablet and no human in the loop.
 * Per build-the-lever: the harness is the artifact, not the one-off test.
 *
 * Server-only (uses fs). Never import from a client component.
 */
import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const DIR = join(process.cwd(), "fixtures");
const FILE = join(DIR, "readings.jsonl");

export interface Fixture {
  strokes: { x: number[][]; y: number[][] };
  /** What Mathpix returned for these strokes. */
  text: string;
  latex: string;
  confidence: number | null;
  ms: number;
  ts?: string;
  /** Filled in by hand when curating: what a human says this SHOULD read as. */
  expected?: string;
}

/** Append-only, one JSON object per line. Never throws -- a capture failure must
 *  never break a live reading. */
export async function appendFixture(f: Fixture): Promise<void> {
  // Dev-only: the filesystem is read-only on serverless hosts, and this is a
  // tuning aid, not a product feature.
  if (process.env.NODE_ENV === "production") return;
  try {
    await mkdir(DIR, { recursive: true });
    await appendFile(FILE, JSON.stringify({ ...f, ts: new Date().toISOString() }) + "\n", "utf8");
  } catch (err) {
    console.warn("[fixtures] capture failed (ignored):", err);
  }
}

export async function loadFixtures(): Promise<Fixture[]> {
  try {
    const raw = await readFile(FILE, "utf8");
    return raw.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Fixture);
  } catch {
    return [];
  }
}

export async function fixtureCount(): Promise<number> {
  try {
    await readdir(DIR);
    return (await loadFixtures()).length;
  } catch {
    return 0;
  }
}
