import type { MapNode, MindMap, Phase } from "@/lib/schema";

/** A single-stage map is one concept: one tile, no supporting blocks. */
export function tidyMap(map: MindMap): MindMap {
  if (map.stages.length !== 1 || map.stages[0].supporting.length === 0) return map;
  return { ...map, stages: [{ ...map.stages[0], supporting: [] }] };
}

/** Points at one block in a roadmap. */
export interface NodeRef {
  stage: number;
  kind: "core" | "supporting";
  index: number;
}

export function nodeAt(map: MindMap, ref: NodeRef): { node: MapNode; phase: Phase } | null {
  const stage = map.stages[ref.stage];
  if (!stage) return null;
  const node = ref.kind === "core" ? stage.core : stage.supporting[ref.index];
  return node ? { node, phase: stage.phase } : null;
}

export function sameRef(a: NodeRef | null | undefined, b: NodeRef | null | undefined): boolean {
  return !!a && !!b && a.stage === b.stage && a.kind === b.kind && a.index === b.index;
}

/** Lessons are cached per node name, so a revised map keeps lessons for blocks it kept. */
export function lessonKey(node: MapNode): string {
  return node.name.trim().toLowerCase();
}

/** The block whose lesson key matches, if the map has one. */
export function findRef(map: MindMap, key: string): NodeRef | null {
  for (let stage = 0; stage < map.stages.length; stage++) {
    const s = map.stages[stage];
    if (lessonKey(s.core) === key) return { stage, kind: "core", index: 0 };
    const index = s.supporting.findIndex((n) => lessonKey(n) === key);
    if (index !== -1) return { stage, kind: "supporting", index };
  }
  return null;
}
