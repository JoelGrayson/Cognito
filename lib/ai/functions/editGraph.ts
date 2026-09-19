import { applyOps, GraphOpError } from "@/lib/graph/applyOps";
import { validateGraph } from "@/lib/graph/validate";
import type { DraftGraph, GraphOp, LearnerProfile, WorkshopMessage } from "@/types/learning";
import { FAST_MODEL } from "../models";
import {
  serializeBudget,
  serializeGraph,
  serializeMessages,
  serializeOps,
  serializeProfile,
  timeBudget,
} from "../serialize";
import { callForcedTool, editGraphTool, type AiCallOptions } from "../tools";

export interface EditGraphInput {
  profile: LearnerProfile;
  graph: DraftGraph;
  /** Direct edits the learner made since the last chat turn. Ground truth: never reverted. */
  userEditLog: GraphOp[];
  /** Chat history before `message`; only the last 6 are sent. */
  messages: WorkshopMessage[];
  message: string;
}

export interface EditGraphResult {
  message: string;
  ops: GraphOp[];
}

export const EDIT_GRAPH_SYSTEM = `You are the editing assistant for a learner's roadmap graph in a workshop. The learner chats with you to reshape the graph. Call edit_graph exactly once with your reply and the ops.

Ops (applied in order by code, then the result is validated):
- add_node { node }, update_node { id, patch }, remove_node { id }, add_edge { edge }, remove_edge { id }.
- Node ids are lowercase snake_case and never change. Preserve the ids of existing nodes; only reference ids that exist in the graph (or that an earlier op in your list adds).
- Containers (nodes that have children) keep estMinutes 0. Leaves have estMinutes 15 to 90. The graph stays two levels deep, has at most 30 nodes, and prerequisite edges must never form a cycle. Edge id is "<source>__<target>".
- Prefer update_node with scope "excluded" or kind "optional" to demote a topic instead of remove_node. remove_node deletes the node, its children and its edges. When you exclude a container, exclude its children as well.

Rules:
- The learner's own edits (the "Learner edits since the last turn" section) are ground truth. Never revert or undo them, even if you would have structured things differently.
- Return the smallest set of ops that satisfies the request. If the request needs no graph change, return an empty ops list.
- Scope pushback: the user message states the time budget, computed for you. If the included study time is over budget (before your ops, or after them), say so plainly in the message and propose demotions as ops (mark lower-priority topics kind "optional" or scope "excluded"). Never silently drop topics: every topic you demote or exclude must be named in the message.
- The message is 1 to 3 sentences, plain text, at most one clarifying question. Say what you changed, and whether the plan now fits the time available.`;

function buildPrompt(input: EditGraphInput, now: Date): string {
  const { profile, graph, userEditLog, messages, message } = input;
  return [
    `Learner profile:\n${serializeProfile(profile)}`,
    `Current graph:\n${serializeGraph(graph)}`,
    `Time budget: ${serializeBudget(timeBudget(profile, graph, now))}`,
    `Learner edits since the last turn (ground truth, already applied to the graph above):\n${serializeOps(userEditLog)}`,
    `Recent chat:\n${serializeMessages(messages)}`,
    `Learner's new message:\n${message}`,
  ].join("\n\n");
}

/** Problems with an op list: applyOps failures (missing ids) and validateGraph errors on the result. */
export function checkOps(graph: DraftGraph, ops: GraphOp[]): string[] {
  let next: DraftGraph;
  try {
    next = applyOps(graph, ops);
  } catch (error) {
    if (error instanceof GraphOpError) return [error.message];
    throw error;
  }
  const result = validateGraph(next);
  return result.ok ? [] : result.errors.map((e) => `After applying the ops: ${e}`);
}

/**
 * Turns one chat message into ops. The ops are checked by running applyOps then validateGraph on
 * the current graph; any failure (including GraphOpError for a missing id) is fed back for one
 * retry, then AiValidationError is thrown. The caller applies the ops itself (applyOps again).
 */
export async function editGraph(input: EditGraphInput, options: AiCallOptions = {}): Promise<EditGraphResult> {
  return callForcedTool({
    model: FAST_MODEL,
    system: EDIT_GRAPH_SYSTEM,
    prompt: buildPrompt(input, new Date()),
    tool: editGraphTool,
    maxTokens: 2500,
    check: (out) => checkOps(input.graph, out.ops),
    ...options,
  });
}
