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
import { judgeStructure, type KeyEntry, type StructureVerdict } from "./structure-key";
import { problemFor, type ProblemAnchor } from "./worksheet";

export interface StructureReading {
  /** Page space: where the drawing is, for marking it. */
  bounds: Bounds;
  /** The printed question it sits under; null on a blank page. */
  asked: number | null;
  smiles: string | null;
  confidence: number | null;
  /** RDKit's drawing of what was read; null when it read nothing valid. */
  svg: string | null;
  /** null when nothing valid was read, which is never evidence of a mistake. */
  verdict: StructureVerdict | null;
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
      const data = res?.ok ? await res.json().catch(() => null) : null;

      const drawn = depict(rdkit, data?.smiles ?? null, 200, 130);
      return {
        bounds: cluster.bounds,
        asked,
        smiles: data?.smiles ?? null,
        confidence: data?.confidence ?? null,
        svg: drawn.svg,
        verdict: drawn.canonical ? judgeStructure(drawn.canonical, key, asked) : null,
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
