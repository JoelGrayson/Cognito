import { z } from "zod";

export const NodeId = z.string().regex(/^[a-z0-9_]{1,60}$/);
export type NodeId = z.infer<typeof NodeId>;

export const DraftNode = z.object({
  id: NodeId,
  title: z.string().min(1).max(80),
  summary: z.string().max(140),
  kind: z.enum(["core", "optional"]),
  parentId: NodeId.optional(),
  estMinutes: z.number().int().min(0).max(600),
  scope: z.enum(["included", "known", "excluded"]),
  objectives: z.array(z.string().min(1)).optional(),
});
export type DraftNode = z.infer<typeof DraftNode>;

export const PlanNode = DraftNode.extend({
  objectives: z.array(z.string().min(1)).min(1),
});
export type PlanNode = z.infer<typeof PlanNode>;

export const Edge = z.object({
  id: z.string(),
  source: NodeId,
  target: NodeId,
  kind: z.enum(["prerequisite", "related"]),
});
export type Edge = z.infer<typeof Edge>;

export const DraftGraph = z.object({
  title: z.string(),
  nodes: z.array(DraftNode).max(30),
  edges: z.array(Edge),
});
export type DraftGraph = z.infer<typeof DraftGraph>;

export const PlanGraph = DraftGraph.extend({ nodes: z.array(PlanNode).max(30) });
export type PlanGraph = z.infer<typeof PlanGraph>;

export const LearnerProfile = z.object({
  goal: z.string(),
  goalType: z.enum(["career", "exam", "project", "curiosity"]).optional(),
  deadline: z.iso.date().optional(),
  hoursPerWeek: z.number().min(1),
  priorKnowledge: z.array(z.object({
    concept: z.string(),
    level: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  })),
  preferences: z.object({
    formats: z.array(z.enum(["reading", "video", "practice", "discussion", "voice"])),
    pace: z.enum(["relaxed", "steady", "intense"]),
  }),
  tutorStyle: z.enum(["encouraging", "socratic", "rigorous"]).optional(),
  availability: z.object({
    daysPerWeek: z.number().int().min(1).max(7),
    timeOfDay: z.enum(["morning", "afternoon", "evening"]).optional(),
    timezone: z.string().optional(),
  }).optional(),
  constraints: z.string().optional(),
});
export type LearnerProfile = z.infer<typeof LearnerProfile>;

// Questionnaire fields arrive incrementally, including nested preferences.
export const OnboardingProfile = LearnerProfile.partial().extend({
  preferences: LearnerProfile.shape.preferences.partial().optional(),
  availability: LearnerProfile.shape.availability.unwrap().partial().optional(),
  /** The concept list shown for rating. Persisted so ratings survive revisits. */
  concepts: z.array(z.string().min(1)).optional(),
  /** AI provider chosen on screen 1; unset means the default (Cerebras). */
  provider: z.enum(["cerebras", "anthropic", "openai", "chatgpt", "xai", "local"]).optional(),
});
export type OnboardingProfile = z.infer<typeof OnboardingProfile>;

export const ScheduleWeek = z.object({
  week: z.number().int().positive(),
  nodeIds: z.array(NodeId),
  minutes: z.number().int().nonnegative(),
});
export type ScheduleWeek = z.infer<typeof ScheduleWeek>;

export const GraphOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_node"), node: DraftNode }),
  z.object({ op: z.literal("update_node"), id: NodeId, patch: DraftNode.omit({ id: true }).partial() }),
  z.object({ op: z.literal("remove_node"), id: NodeId }),
  z.object({ op: z.literal("add_edge"), edge: Edge }),
  z.object({ op: z.literal("remove_edge"), id: z.string() }),
]);
export type GraphOp = z.infer<typeof GraphOp>;

export const Progress = z.enum(["todo", "in_progress", "done"]);
export type Progress = z.infer<typeof Progress>;
export const OnboardingStep = z.enum(["questionnaire", "workshop", "generating", "done"]);
export type OnboardingStep = z.infer<typeof OnboardingStep>;
export const WorkshopMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});
export type WorkshopMessage = z.infer<typeof WorkshopMessage>;

// Each content kind will define its own payload schema in the learning module.
export const ContentBody = z.json();
export type ContentBody = z.infer<typeof ContentBody>;

// Saved plan as seen by every reader (lib/plans). Dates are ISO 8601 strings;
// the Drizzle repo converts from timestamptz.
export const StudyPlan = z.object({
  id: z.string(),
  userId: z.string(),
  version: z.number().int().positive(),
  title: z.string(),
  profile: LearnerProfile,
  graph: PlanGraph,
  order: z.array(NodeId),
  schedule: z.array(ScheduleWeek),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type StudyPlan = z.infer<typeof StudyPlan>;

// What GET /api/onboarding returns and OnboardingRepo stores.
export const OnboardingState = z.object({
  step: OnboardingStep,
  profile: OnboardingProfile,
  draftGraph: DraftGraph.nullable(),
  /** The roadmap record the active draft came from — saves write through to it. */
  activeRoadmapId: z.string().nullable(),
  messages: z.array(WorkshopMessage),
});
export type OnboardingState = z.infer<typeof OnboardingState>;
