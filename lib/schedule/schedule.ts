import type { DraftGraph, DraftNode, PlanGraph, ScheduleWeek } from "@/types/learning";
import { kahnOrder, prerequisiteLinks } from "@/lib/graph/topoSort";

export interface ScheduleResult {
  order: string[];
  schedule: ScheduleWeek[];
  overshoot?: { lastWeek: number; deadlineWeek: number };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Decisions where the spec is silent:
 * - A leaf is a node nobody lists as `parentId`. A leaf is scheduled only if it and its container
 *   are both `scope: "included"` (marking a container known or excluded skips its children).
 * - A leaf is "optional" if its own kind or its container's kind is optional; optional leaves
 *   come after all core leaves, in the same relative order.
 * - Order: containers (and standalone leaves) are sorted by prerequisite edges lifted to the
 *   top level (an edge between children counts as an edge between their containers); children keep
 *   array order except that edges between siblings are honoured. If lifted edges form a cycle
 *   (valid graphs can do this) the top-level array order is used instead.
 * - Weeks with no leaf starting in them (skipped by a very long leaf) are omitted.
 * - deadlineWeek = max(1, ceil((deadline - now) / 7 days)); overshoot when lastWeek > deadlineWeek.
 *   lastWeek is the week in which the final leaf ends, i.e. ceil(totalMinutes / capacity).
 *   Deadlines are UTC midnight; an unparseable deadline is ignored.
 */
export function computeOrderAndSchedule(
  graph: DraftGraph | PlanGraph,
  profile: { hoursPerWeek: number; deadline?: string },
  opts: { reviewShare?: number; now?: Date } = {},
): ScheduleResult {
  const { reviewShare = 0.2, now = new Date() } = opts;
  const nodes: DraftNode[] = graph.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const containers = new Set(nodes.map((n) => n.parentId).filter((id): id is string => id !== undefined));
  const topOf = (id: string): string => {
    const parent = byId.get(id)?.parentId;
    return parent !== undefined && byId.has(parent) ? parent : id;
  };

  // Rank top-level units by lifted prerequisite edges.
  const links = prerequisiteLinks(graph);
  const topIds = nodes.filter((n) => topOf(n.id) === n.id).map((n) => n.id);
  const lifted = links
    .map((l) => ({ source: topOf(l.source), target: topOf(l.target) }))
    .filter((l) => l.source !== l.target);
  const liftedOrder = kahnOrder(topIds, lifted);
  const unitOrder = liftedOrder.remaining.length === 0 ? liftedOrder.order : topIds;

  // Expand units into leaves; children ordered by sibling edges, then array order.
  const leaves: DraftNode[] = [];
  for (const unit of unitOrder) {
    const members = nodes.filter((n) => n.id === unit || n.parentId === unit).filter((n) => !containers.has(n.id));
    const siblingIds = members.map((n) => n.id);
    const memberSet = new Set(siblingIds);
    const siblingLinks = links.filter((l) => memberSet.has(l.source) && memberSet.has(l.target));
    const sorted = kahnOrder(siblingIds, siblingLinks);
    const ids = sorted.remaining.length === 0 ? sorted.order : siblingIds;
    for (const id of ids) leaves.push(byId.get(id)!);
  }

  const included = leaves.filter((leaf) => {
    const container = leaf.parentId !== undefined ? byId.get(leaf.parentId) : undefined;
    return leaf.scope === "included" && (container === undefined || container.scope === "included");
  });
  const isOptional = (leaf: DraftNode) =>
    leaf.kind === "optional" || (leaf.parentId !== undefined && byId.get(leaf.parentId)?.kind === "optional");
  const ordered = [...included.filter((l) => !isOptional(l)), ...included.filter(isOptional)];

  const capacity = Math.round(profile.hoursPerWeek * 60 * (1 - reviewShare) * 1e6) / 1e6;
  const schedule: ScheduleWeek[] = [];
  let cumulative = 0;
  for (const leaf of ordered) {
    const week = capacity > 0 ? Math.floor(cumulative / capacity) + 1 : 1;
    let entry = schedule.at(-1);
    if (!entry || entry.week !== week) {
      entry = { week, nodeIds: [], minutes: 0 };
      schedule.push(entry);
    }
    entry.nodeIds.push(leaf.id);
    entry.minutes += leaf.estMinutes;
    cumulative += leaf.estMinutes;
  }

  const result: ScheduleResult = { order: ordered.map((l) => l.id), schedule };

  const deadline = profile.deadline ? Date.parse(profile.deadline) : NaN;
  if (schedule.length > 0 && capacity > 0 && !Number.isNaN(deadline)) {
    const deadlineWeek = Math.max(1, Math.ceil((deadline - now.getTime()) / WEEK_MS));
    const lastWeek = Math.max(schedule[schedule.length - 1].week, Math.ceil(cumulative / capacity));
    if (lastWeek > deadlineWeek) result.overshoot = { lastWeek, deadlineWeek };
  }
  return result;
}
