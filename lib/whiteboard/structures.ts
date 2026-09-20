/**
 * Reading and judging every structure drawn on the board. Browser only.
 *
 * The chemistry counterpart of the step checker, with the same division of labour:
 * Mathpix READS the drawing, RDKit and the answer key DECIDE, and nothing here asks a
 * model whether the chemistry is right.
 */
import type { Editor, TLShapeId } from "tldraw";
import { clusterByGap } from "./cluster";
import { depict, type RDKit } from "./rdkit";
import type { Bounds } from "./strokes";
import { judgeStructure, trustedVerdict, TRUSTED_CONFIDENCE, type KeyEntry, type StructureVerdict } from "./structure-key";
import { problemFor, type ProblemAnchor } from "./worksheet";

export interface StructureReading {
  /** Page space: where the drawing is, for marking it. */
  bounds: Bounds;
  /** The printed question it sits under; null on a blank page. */
  asked: number | null;
  smiles: string | null;
  confidence: number | null;
  /** Which reader the SMILES came from. */
  reader: "mathpix" | "gemini" | null;
  /** RDKit's drawing of what was read; null when it read nothing valid. */
  svg: string | null;
  /** null when nothing valid was read, which is never evidence of a mistake. */
  verdict: StructureVerdict | null;
  /**
   * A reading we do not trust says this is not the answer. Not an accusation - the
   * reading may be ours to blame - but silence was the wrong answer too: seen with a
   * real stylus, a stray extra bond made a 2-butanol into 3-methyl-2-butanol, one
   * reader saw exactly that, the other saw nonsense, and the board said nothing. So it
   * is raised as a question, beside a drawing of what was read, and the learner judges.
   */
  suspected: boolean;
}

type Meta = { whiteboardMark?: boolean; worksheetPage?: boolean };

function dataUrlOf(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function readStructures(
  editor: Editor,
  rdkit: RDKit,
  key: KeyEntry[],
  questions: ProblemAnchor[],
): Promise<StructureReading[]> {
  const ink = editor.getCurrentPageShapes().flatMap((s) => {
    if (s.type !== "draw" || (s.meta as Meta).whiteboardMark) return [];
    const b = editor.getShapePageBounds(s.id);
    return b ? [{ id: s.id, bounds: { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY } }] : [];
  });

  return Promise.all(
    clusterByGap(ink.map((s) => s.bounds)).map(async (cluster): Promise<StructureReading> => {
      const asked = problemFor(cluster.bounds, questions)?.id ?? null;
      const ids = cluster.members.map((m) => ink[m].id) as TLShapeId[];
      // Only the ink: the printed page behind it would be read as part of the diagram.
      const { blob } = await editor.toImage(ids, { format: "png", background: true, padding: 32, scale: 2, darkMode: false });
      const res = await fetch("/api/whiteboard/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: await dataUrlOf(blob), intended: asked === null ? "" : `question ${asked}` }),
      }).catch(() => null);
      const data = await res?.json().catch(() => null);
      // A failed request is not an unreadable drawing. Folding the two together had
      // the tutor ask for larger lettering when the network was down.
      if (!res?.ok || !data) throw new Error(data?.error ?? "Couldn't reach the structure reader. Check the connection and try again.");

      const drawn = depict(rdkit, data.smiles ?? null, 200, 130);
      // Trusted: Mathpix was sure, or the second reader came to the same molecule.
      const second = depict(rdkit, data.mathpixSmiles ?? null).canonical;
      const readingTrusted =
        data.reader === "mathpix"
          ? (data.confidence ?? 0) >= TRUSTED_CONFIDENCE
          : drawn.canonical !== null && drawn.canonical === second;
      // Two molecules in one cutout means the cut was wrong. Only the first was read,
      // and its verdict would be drawn beside both, ticking a wrong one by association.
      const oneStructure = (data.structuresSeen ?? 1) <= 1;
      const judged = drawn.canonical && oneStructure ? judgeStructure(drawn.canonical, key, asked) : null;
      const verdict = trustedVerdict(judged, readingTrusted);
      return {
        suspected: judged?.kind === "no-match" && verdict === null,
        bounds: cluster.bounds,
        asked,
        smiles: data.smiles ?? null,
        confidence: data.confidence ?? null,
        reader: data.reader ?? null,
        svg: drawn.svg,
        verdict,
      };
    }),
  );
}

/** One sentence for one verdict. `nameIt` is the hint ladder: below it the tutor says a
 *  structure is wrong, and only from it upward says what it actually is. */
export function verdictLine(v: StructureVerdict, nameIt: boolean): string {
  switch (v.kind) {
    case "correct":
      return `Question ${v.problem} is right.`;
    case "other-question":
      return `That's the answer to question ${v.problem}, drawn under question ${v.asked}.`;
    case "known-mistake":
      return nameIt ? `Question ${v.problem}: that's ${v.name}.` : `Question ${v.problem} isn't right yet. Look at what the reagent actually does.`;
    case "no-match":
      return v.asked === null ? "One structure doesn't match any question." : `Question ${v.asked} isn't right yet.`;
  }
}
