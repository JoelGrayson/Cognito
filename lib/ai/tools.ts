import { z } from "zod";
import { ConceptsResponse } from "@/lib/onboarding/schemas";
import { DraftGraph, GraphOp, NodeId } from "@/types/learning";

export {
  AiValidationError,
  callForcedTool,
  toInputSchema,
  type AiCallOptions,
  type AttemptReport,
  type ToolClient,
} from "./withRetry";

/** Tool input for `edit_graph`: a short reply plus the ops to apply. */
export const EditGraphOutput = z.object({
  message: z.string().min(1).max(600),
  ops: z.array(GraphOp).max(40),
});
export type EditGraphOutput = z.infer<typeof EditGraphOutput>;

export const OBJECTIVES_MIN = 2;
export const OBJECTIVES_MAX = 4;
export const OBJECTIVE_MAX_CHARS = 120;
export const ENRICH_MINUTES_MIN = 15;
export const ENRICH_MINUTES_MAX = 90;

/** Tool input for `set_objectives`: objectives (and optionally a corrected estimate) per leaf. */
export const SetObjectivesOutput = z.object({
  nodes: z.array(
    z.object({
      id: NodeId,
      objectives: z.array(z.string().min(1).max(OBJECTIVE_MAX_CHARS)).min(OBJECTIVES_MIN).max(OBJECTIVES_MAX),
      estMinutes: z.number().int().min(ENRICH_MINUTES_MIN).max(ENRICH_MINUTES_MAX).optional(),
    }),
  ),
});
export type SetObjectivesOutput = z.infer<typeof SetObjectivesOutput>;

/** One tool per AI function. The name is what `tool_choice` forces; the schema becomes `input_schema`. */
export const setConceptsTool = {
  name: "set_concepts",
  description: "Return the concepts the learner can rate their familiarity with.",
  schema: ConceptsResponse,
};

export const setGraphTool = {
  name: "set_graph",
  description: "Return the complete topic roadmap as a graph of nodes and edges.",
  schema: DraftGraph,
};

export const editGraphTool = {
  name: "edit_graph",
  description: "Reply to the learner in 1 to 3 sentences and return the smallest list of graph ops that fulfils the request (empty if none).",
  schema: EditGraphOutput,
};

export const setObjectivesTool = {
  name: "set_objectives",
  description: "Return 2 to 4 learning objectives, and optionally a corrected time estimate, for every requested topic.",
  schema: SetObjectivesOutput,
};

export const TOOLS = [setConceptsTool, setGraphTool, editGraphTool, setObjectivesTool] as const;
