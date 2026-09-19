import type { MapNode, MindMap, Phase } from "@/lib/schema";

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
