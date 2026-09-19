import type { DraftGraph, DraftNode, Edge, GraphOp, LearnerProfile, WorkshopMessage } from "@/types/learning";

/** Share of each week reserved for review, matching the scheduler default. */
export const REVIEW_SHARE = 0.2;
/** Chat history sent to editGraph. */
export const MAX_HISTORY_MESSAGES = 6;

const cell = (text: string) => text.replace(/\s*\|\s*/g, " / ").replace(/\s+/g, " ").trim();

/** `id | title | kind | scope | parentId | estMinutes` (parentId is `-` for top-level nodes). */
export function serializeNode(node: DraftNode): string {
  return [node.id, cell(node.title), node.kind, node.scope, node.parentId ?? "-", node.estMinutes].join(" | ");
}

/** `source>target (kind)`. */
export function serializeEdge(edge: Edge): string {
  return `${edge.source}>${edge.target} (${edge.kind})`;
}

/**
 * Compact graph text for edit turns. The first five columns are the spec format; a sixth
 * `estMinutes` column is appended because scope pushback needs the time of each topic.
 */
export function serializeGraph(graph: DraftGraph): string {
  return [
    `title: ${cell(graph.title)}`,
    "nodes (id | title | kind | scope | parentId | estMinutes):",
    ...graph.nodes.map(serializeNode),
    "edges (source>target (kind)):",
    ...(graph.edges.length ? graph.edges.map(serializeEdge) : ["(none)"]),
  ].join("\n");
}

/** One line of JSON per op, for the userEditLog. */
export function serializeOps(ops: GraphOp[]): string {
  return ops.length ? ops.map((op) => JSON.stringify(op)).join("\n") : "(none)";
}

/** The last `limit` chat messages, one per line. */
export function serializeMessages(messages: WorkshopMessage[], limit = MAX_HISTORY_MESSAGES): string {
  const recent = messages.slice(-limit);
  return recent.length ? recent.map((m) => `${m.role}: ${m.content.replace(/\s+/g, " ").trim()}`).join("\n") : "(none)";
}

export function serializeProfile(profile: LearnerProfile): string {
  const knowledge = profile.priorKnowledge.length
    ? profile.priorKnowledge.map((k) => `${k.concept}=${k.level}`).join(", ")
    : "none given";
  const lines = [
    `goal: ${profile.goal}`,
    `goalType: ${profile.goalType ?? "unspecified"}`,
    `deadline: ${profile.deadline ?? "none"}`,
    `hoursPerWeek: ${profile.hoursPerWeek}`,
    `daysPerWeek: ${profile.availability?.daysPerWeek ?? "unspecified"}`,
    `pace: ${profile.preferences.pace}`,
    `formats: ${profile.preferences.formats.join(", ") || "any"}`,
    `priorKnowledge (0 never heard, 1 heard of, 2 can explain): ${knowledge}`,
  ];
  if (profile.constraints) lines.push(`constraints: ${profile.constraints}`);
  return lines.join("\n");
}

/** Leaves are nodes that no other node names as its parent. */
export function leafNodes(graph: DraftGraph): DraftNode[] {
  const parents = new Set(graph.nodes.flatMap((n) => (n.parentId ? [n.parentId] : [])));
  return graph.nodes.filter((n) => !parents.has(n.id));
}

export interface TimeBudget {
  /** Minutes of included leaves (what would be scheduled). */
  includedMinutes: number;
  /** Study minutes available before the deadline, or undefined without a deadline. */
  availableMinutes?: number;
  weeksToDeadline?: number;
  /** Included minutes minus available minutes; positive means over budget. */
  overByMinutes?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Study minutes available until the deadline, or undefined without one. Computed in code, not by the model. */
export function availableStudyTime(
  profile: LearnerProfile,
  now: Date = new Date(),
): { weeks: number; minutes: number } | undefined {
  if (!profile.deadline) return undefined;
  const weeks = Math.max(0, (Date.parse(profile.deadline) - now.getTime()) / DAY_MS) / 7;
  return {
    weeks: Math.round(weeks * 10) / 10,
    minutes: Math.round(profile.hoursPerWeek * 60 * (1 - REVIEW_SHARE) * weeks),
  };
}

/** `now` is injectable for tests. */
export function timeBudget(profile: LearnerProfile, graph: DraftGraph, now: Date = new Date()): TimeBudget {
  const includedMinutes = leafNodes(graph)
    .filter((n) => n.scope === "included")
    .reduce((sum, n) => sum + n.estMinutes, 0);
  const available = availableStudyTime(profile, now);
  if (!available) return { includedMinutes };
  return {
    includedMinutes,
    availableMinutes: available.minutes,
    weeksToDeadline: available.weeks,
    overByMinutes: includedMinutes - available.minutes,
  };
}

export function serializeBudget(budget: TimeBudget): string {
  const parts = [`included study time: ${budget.includedMinutes} min`];
  if (budget.availableMinutes !== undefined) {
    parts.push(
      `time available before the deadline (${budget.weeksToDeadline} weeks, ${Math.round(REVIEW_SHARE * 100)}% kept for review): ${budget.availableMinutes} min`,
      budget.overByMinutes! > 0 ? `OVER BUDGET by ${budget.overByMinutes} min` : "within budget",
    );
  } else {
    parts.push("no deadline set");
  }
  return parts.join("; ");
}
