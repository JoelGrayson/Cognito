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

/* ---------- Editing a map by hand ---------- */

function withStages(map: MindMap, stages: MindMap["stages"]): MindMap {
  return { ...map, stages };
}

/** Put a block in a slot, including an empty one, which is what a drag onto a gap needs. */
function setNode(map: MindMap, ref: NodeRef, node: MapNode): MindMap {
  return withStages(
    map,
    map.stages.map((stage, i) => {
      if (i !== ref.stage) return stage;
      if (ref.kind === "core") return { ...stage, core: node };
      const supporting = stage.supporting.slice();
      if (ref.index < supporting.length) supporting[ref.index] = node;
      else supporting.push(node);
      return { ...stage, supporting: supporting.slice(0, 2) };
    }),
  );
}

/** Replace one block's text. */
export function updateNode(map: MindMap, ref: NodeRef, patch: Partial<MapNode>): MindMap {
  return withStages(
    map,
    map.stages.map((stage, i) => {
      if (i !== ref.stage) return stage;
      if (ref.kind === "core") return { ...stage, core: { ...stage.core, ...patch } };
      return {
        ...stage,
        supporting: stage.supporting.map((n, j) => (j === ref.index ? { ...n, ...patch } : n)),
      };
    }),
  );
}

/**
 * Remove one block. Removing a stage's core promotes its first supporting block;
 * a stage with nothing left is dropped, and the stage below it loses any arrow to it.
 */
export function removeNode(map: MindMap, ref: NodeRef): MindMap {
  const stages = map.stages.map((stage, i) => {
    if (i !== ref.stage) return stage;
    if (ref.kind === "supporting") {
      return { ...stage, supporting: stage.supporting.filter((_, j) => j !== ref.index) };
    }
    const [promoted, ...rest] = stage.supporting;
    return promoted ? { ...stage, core: promoted, supporting: rest } : null;
  });
  const kept: MindMap["stages"] = [];
  stages.forEach((stage, i) => {
    if (stage) {
      kept.push(stage);
      return;
    }
    // The stage is gone: whatever followed it can no longer require it.
    const next = stages[i + 1];
    if (next) stages[i + 1] = { ...next, link: next.link === "requires" ? "recommended" : next.link };
  });
  return withStages(map, kept);
}

/** Move a block to another slot, swapping with whatever is there. */
export function moveNode(map: MindMap, from: NodeRef, to: NodeRef): MindMap {
  if (sameRef(from, to)) return map;
  const moving = nodeAt(map, from)?.node;
  if (!moving) return map;
  const target = nodeAt(map, to)?.node ?? null;
  // A swap is two replacements. Moving into an empty slot puts the block there, then
  // clears its old home, which may drop a stage that is now empty.
  if (target) return setNode(setNode(map, to, moving), from, target);
  return removeNode(setNode(map, to, moving), from);
}

/** Where a block can be dropped: every slot of every stage. */
export function slotRefs(map: MindMap): NodeRef[] {
  return map.stages.flatMap((_, stage) => [
    { stage, kind: "supporting" as const, index: 0 },
    { stage, kind: "core" as const, index: 0 },
    { stage, kind: "supporting" as const, index: 1 },
  ]);
}

/** How many blocks a map has: each stage's core block plus its supporting ones. */
export function countBlocks(map: MindMap): number {
  return map.stages.reduce((n, s) => n + 1 + s.supporting.length, 0);
}

/** Every block in a map, in roadmap order: each stage's core block, then its supporting blocks. */
export function allRefs(map: MindMap): NodeRef[] {
  return map.stages.flatMap((stage, i) => [
    { stage: i, kind: "core" as const, index: 0 },
    ...stage.supporting.map((_, index) => ({ stage: i, kind: "supporting" as const, index })),
  ]);
}
