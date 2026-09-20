/**
 * Which strokes belong to the same drawing. Pure geometry.
 *
 * Mathpix reads ONE chemical diagram per image: given two molecules side by side it
 * returns the first and silently drops the second (seen in testing). So a page of
 * structures has to be cut into one picture per molecule, and the only thing that
 * says where one molecule ends is the empty space around it.
 */
import { mergeBounds, type Bounds } from "./strokes.ts";

export interface Cluster {
  /** Indices into the input, in input order. */
  members: number[];
  bounds: Bounds;
}

/** Strokes closer than this are one drawing. A bond to a label ("-OH") leaves a gap of
 *  a few pixels; two molecules leave a gap the size of a molecule. */
export const DEFAULT_JOIN_GAP = 36;

function gapBetween(a: Bounds, b: Bounds): number {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  return Math.hypot(dx, dy);
}

/** Single-link clustering on the gap between stroke boxes, left to right. */
export function clusterByGap(strokes: Bounds[], joinGap = DEFAULT_JOIN_GAP): Cluster[] {
  const parent = strokes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < strokes.length; i++) {
    for (let j = i + 1; j < strokes.length; j++) {
      if (gapBetween(strokes[i], strokes[j]) <= joinGap) parent[find(i)] = find(j);
    }
  }

  const groups = new Map<number, number[]>();
  strokes.forEach((_, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), i]);
  });
  return [...groups.values()]
    .map((members) => ({ members, bounds: members.map((i) => strokes[i]).reduce(mergeBounds) }))
    .sort((a, b) => a.bounds.minX - b.bounds.minX || a.bounds.minY - b.bounds.minY);
}
