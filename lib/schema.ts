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

/* ---------- Lessons ---------- */

export const ResourceSchema = z.object({
  title: z.string().describe("Name of the page, chapter, course or article"),
  url: z
    .string()
    .describe(
      "Full https URL of a well-known page you are confident exists: official documentation, Wikipedia, university course notes, textbook sites, standards bodies. Never invent a URL.",
    ),
  why: z.string().describe("A few words on what it is good for"),
});

export const LessonSectionSchema = z.object({
  heading: z.string().describe("Short section title, 2-6 words"),
  body: z
    .string()
    .describe(
      "1-3 paragraphs of teaching text separated by blank lines. May use **bold** for key terms, `code` for code or symbols, and lines starting with '- ' for bullets. No headings.",
    ),
});

/** The lesson as the model writes it. */
export const LessonContentSchema = z.object({
  title: z.string().describe("Lesson title, usually the node name"),
  summary: z.string().describe("One sentence on what the learner will understand after this lesson"),
  sections: z
    .array(LessonSectionSchema)
    .describe("3-6 sections in teaching order: motivate, explain, work an example, connect onward"),
  keyTakeaways: z.array(z.string()).describe("3-5 one-sentence takeaways"),
  resources: z.array(ResourceSchema).describe("3-5 useful resources"),
  videoQuery: z
    .string()
    .describe("A YouTube search query, 3-8 words, that finds a good explanatory video for this lesson"),
});

/** A video the server resolved from the model's search query. */
export const VideoSchema = z.object({
  id: z.string().nullable(),
  title: z.string().nullable(),
  searchUrl: z.string(),
});

/** The lesson as the client holds it: model content plus server-resolved extras. */
export const LessonSchema = LessonContentSchema.extend({ video: VideoSchema });

export type Resource = z.infer<typeof ResourceSchema>;
export type LessonSection = z.infer<typeof LessonSectionSchema>;
export type LessonContent = z.infer<typeof LessonContentSchema>;
export type Video = z.infer<typeof VideoSchema>;
export type Lesson = z.infer<typeof LessonSchema>;

/* ---------- Quiz ---------- */

export const QuizQuestionSchema = z.object({
  prompt: z.string().describe("The question"),
  choices: z
    .array(z.string())
    .describe("Exactly 4 answer choices with plausible distractors; no 'all of the above'"),
  answer: z.number().describe("0-based index of the correct choice"),
  explanation: z.string().describe("One or two sentences on why that answer is right"),
});

export const QuizSchema = z.object({
  questions: z
    .array(QuizQuestionSchema)
    .describe("5 questions that test understanding and application, not recall of wording"),
});

export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type Quiz = z.infer<typeof QuizSchema>;

/* ---------- Tutor chat ---------- */

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export const TutorReplySchema = z.object({
  reply: z
    .string()
    .describe("Answer to the learner in short paragraphs. May use **bold**, `code` and '- ' bullets."),
  updatedLesson: LessonContentSchema.nullable().describe(
    "The complete revised lesson if the learner asked to change the lesson content; otherwise null",
  ),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type TutorReply = z.infer<typeof TutorReplySchema>;

/** Plain JSON Schema for providers that take a raw schema (OpenAI-compatible APIs). */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const out = z.toJSONSchema(schema) as Record<string, unknown>;
  delete out.$schema;
  return out;
}
