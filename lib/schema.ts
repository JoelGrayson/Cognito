import { z } from "zod";

export const PhaseSchema = z.enum(["prerequisite", "core", "advanced"]);

export const NodeSchema = z.object({
  name: z.string().describe("Short label, 1-4 words"),
  subtitle: z
    .string()
    .describe("The key concepts inside this node, 2-5 words, comma-separated"),
  description: z.string().describe("One sentence on what this covers and why"),
});

export const StageSchema = z.object({
  phase: PhaseSchema.describe(
    "prerequisite = background needed before the topic itself; core = the topic proper; advanced = deeper or applied material that builds on the core",
  ),
  core: NodeSchema.describe("The main thing to learn at this stage; these form the spine"),
  supporting: z
    .array(NodeSchema)
    .describe("0-2 things learned alongside the core node at this stage"),
});

export const MindMapSchema = z.object({
  topic: z.string().describe("The topic, cleaned up as a short title"),
  summary: z
    .string()
    .describe("One sentence on what the learner will be able to do"),
  stages: z
    .array(StageSchema)
    .describe("4-7 stages in learning order, top to bottom"),
});

export type Phase = z.infer<typeof PhaseSchema>;
export type MapNode = z.infer<typeof NodeSchema>;
export type Stage = z.infer<typeof StageSchema>;
export type MindMap = z.infer<typeof MindMapSchema>;

/** What the client sends to generate or revise a map. */
export interface GenerateRequest {
  topic: string;
  /** When revising: the map as it currently stands. */
  current?: MindMap;
  /** When revising: what to change. */
  instruction?: string;
}

/** Plain JSON Schema for providers that take a raw schema (OpenAI-compatible APIs). */
export function mindMapJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(MindMapSchema) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}
