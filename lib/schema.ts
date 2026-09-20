import { z } from "zod";

export const PhaseSchema = z.enum(["prerequisite", "core", "advanced"]);

export const NodeSchema = z.object({
  name: z.string().describe("Short label, 1-4 words"),
  subtitle: z
    .string()
    .describe("The key concepts inside this node, 2-5 words, comma-separated"),
  description: z.string().describe("One sentence on what this covers and why"),
});

export type Phase = z.infer<typeof PhaseSchema>;
export type MapNode = z.infer<typeof NodeSchema>;

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
      "Fact-dense teaching text: mostly '- ' bullets, one new fact each, with a short paragraph only where reasoning needs prose. May use **bold** for key terms, `code` for short code or symbols, and a fenced ``` block on its own lines for any multi-line code. No headings, no filler.",
    ),
});

/** The lesson as the model writes it. */
export const LessonContentSchema = z.object({
  title: z.string().describe("Lesson title, usually the node name"),
  summary: z.string().describe("One sentence on what the learner will understand after this lesson"),
  tldr: z
    .string()
    .describe(
      "TL;DR: 2-3 dense sentences a learner could read instead of the whole lesson: the core idea, why it matters, and the one thing to remember; no filler",
    ),
  sections: z
    .array(LessonSectionSchema)
    .describe("3-6 sections in teaching order: motivate, explain, work an example, connect onward"),
  keyTakeaways: z.array(z.string()).describe("3-5 one-sentence takeaways"),
  resources: z.array(ResourceSchema).describe("3-5 useful resources"),
  videoQuery: z
    .string()
    .describe("A YouTube search query, 3-8 words, that finds a clear explainer for exactly this lesson in the roadmap's context; empty if a video would add little"),
});

/** Writing a lesson, part one: the plan the sections are written from. */
export const LessonPlanSchema = z.object({
  title: z.string().describe("Lesson title, usually the node name"),
  summary: z.string().describe("One sentence on what the learner will understand after this lesson"),
  tldr: z
    .string()
    .describe(
      "TL;DR: 2-3 dense sentences a learner could read instead of the whole lesson: the core idea, why it matters, and the one thing to remember; no filler",
    ),
  sections: z
    .array(
      z.object({
        heading: z.string().describe("Short section title, 2-6 words"),
        intent: z
          .string()
          .describe(
            "One sentence saying exactly what this section teaches, precise enough that it can be written on its own without overlapping the neighbouring sections",
          ),
      }),
    )
    .describe("3-6 sections in teaching order: motivate, explain, work an example, connect onward"),
  keyTakeaways: z.array(z.string()).describe("3-5 one-sentence takeaways"),
});

/** Written alongside the plan: where else to look. */
export const LessonExtrasSchema = z.object({
  searchQuery: z
    .string()
    .describe("A web search query, 3-8 words, that finds authoritative reading (documentation, Wikipedia, course notes, textbooks) for exactly this lesson in the roadmap's context"),
  resources: z.array(ResourceSchema).describe("3-5 useful resources, used when web search is unavailable"),
  videoQuery: z
    .string()
    .describe("A YouTube search query, 3-8 words, that finds a clear explainer for exactly this lesson in the roadmap's context; empty if a video would add little"),
});

/** The model's verdict on web search results as further reading. */
export const ResourcePickSchema = z.object({
  picks: z
    .array(
      z.object({
        index: z.number().int().min(0).describe("Index of the search result"),
        why: z.string().describe("A few words on what it is good for"),
      }),
    )
    .describe("The 3-5 results worth reading, best first; fewer if few are good, empty if none are"),
});

/** Phase two: one section's text, written from the plan. */
export const SectionBodySchema = z.object({
  body: z
    .string()
    .describe(
      "Fact-dense teaching text: mostly '- ' bullets, one new fact each, with a short paragraph only where reasoning needs prose. May use **bold** for key terms, `code` for short code or symbols, and a fenced ``` block on its own lines for any multi-line code. No headings, no filler.",
    ),
});

/** A video the server resolved from the model's search query. */
export const VideoSchema = z.object({
  id: z.string().nullable(),
  title: z.string().nullable(),
  searchUrl: z.string(),
});

/** Choosing which search result, if any, to show beside a lesson. */
export const VideoPickSchema = z.object({
  ratings: z
    .array(
      z.object({
        index: z.number().int().describe("0-based index of the search result"),
        why: z.string().describe("A few words on what the video is actually about"),
        fit: z
          .enum(["strong", "weak", "off-topic"])
          .describe("strong only if it clearly teaches this lesson's subject in the roadmap's field and era"),
      }),
    )
    .describe("One rating per search result, in order"),
});

/** The lesson as the client holds it: model content plus server-resolved extras. */
export const LessonSchema = LessonContentSchema.extend({
  // Lessons written before TL;DRs existed have none.
  tldr: z.string().default(""),
  video: VideoSchema,
});

export type Resource = z.infer<typeof ResourceSchema>;
export type LessonPlan = z.infer<typeof LessonPlanSchema>;
export type LessonExtras = z.infer<typeof LessonExtrasSchema>;
export type ResourcePick = z.infer<typeof ResourcePickSchema>;
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
    .describe(
      "Answer to the learner in short paragraphs. May use **bold**, `code`, '- ' bullets and fenced ``` blocks for multi-line code.",
    ),
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

/* ---------- Video lesson: whiteboard actions and tutor turns ---------- */

export const BoardColorSchema = z
  .enum(["ink", "blue", "red", "green", "orange", "purple"])
  .describe("ink for most things; other colours to tell quantities apart, e.g. red for forces");

const id = z.string().describe("Short unique id, e.g. 'f1', so it can be erased later");
const num = z.number();

/**
 * One change to the whiteboard. A plain union (anyOf in JSON Schema), because
 * OpenAI's strict mode rejects the oneOf a discriminated union would produce.
 */
export const BoardActionSchema = z.union([
  z.object({
    type: z.literal("text"),
    id,
    x: num.describe("Left edge"),
    y: num.describe("Top edge"),
    text: z.string().describe("A label, equation or short note. Unicode math is fine: v², √, Δ, θ, ω, →, ≈"),
    size: z.enum(["small", "medium", "large"]),
    color: BoardColorSchema,
  }),
  z.object({
    type: z.literal("line"),
    id,
    x1: num,
    y1: num,
    x2: num,
    y2: num,
    arrow: z.boolean().describe("Arrowhead at (x2, y2), for vectors and forces"),
    dashed: z.boolean(),
    color: BoardColorSchema,
  }),
  z.object({ type: z.literal("rect"), id, x: num, y: num, w: num, h: num, fill: z.boolean(), color: BoardColorSchema }),
  z.object({ type: z.literal("circle"), id, cx: num, cy: num, r: num, fill: z.boolean(), color: BoardColorSchema }),
  z.object({
    type: z.literal("path"),
    id,
    points: z.array(num).describe("Flat list x1, y1, x2, y2, ... of at least 2 points; use many points for smooth curves"),
    closed: z.boolean(),
    color: BoardColorSchema,
  }),
  z.object({
    type: z.literal("plot"),
    id,
    x: num,
    y: num,
    w: num,
    h: num,
    fn: z
      .string()
      .describe("y as a function of x, e.g. 'sin(x)', '0.5*9.8*x^2', 'exp(-x)*cos(4*x)'. Supports + - * / ^, sin cos tan sqrt exp log abs, pi and e"),
    xMin: num,
    xMax: num,
    yMin: num,
    yMax: num,
    xLabel: z.string(),
    yLabel: z.string(),
    color: BoardColorSchema,
  }),
  z.object({
    type: z.literal("image"),
    id,
    x: num,
    y: num,
    w: num,
    h: num,
    query: z.string().describe("Search for a real photo or standard diagram on Wikimedia Commons, e.g. 'inclined plane free body diagram'"),
  }),
  z.object({ type: z.literal("erase"), id: z.string().describe("id of an element to remove") }),
  z.object({ type: z.literal("clear") }),
]);

export const TutorTurnSchema = z.object({
  say: z
    .string()
    .describe("What you say aloud this turn: 1-3 short spoken sentences, about 60 words at most. Plain speech, no markdown"),
  actions: z.array(BoardActionSchema).describe("Whiteboard changes to make while you speak, in drawing order; empty if none"),
  next: z
    .enum(["answer", "draw", "continue", "end"])
    .describe("answer = wait for the learner to reply; draw = wait for the learner to draw on the board; continue = keep teaching without waiting; end = the lesson is finished"),
});

export type BoardColor = z.infer<typeof BoardColorSchema>;
export type BoardAction = z.infer<typeof BoardActionSchema>;
export type TutorTurn = z.infer<typeof TutorTurnSchema>;

/* ---------- Code exercises ---------- */

export const CODE_LANGUAGES = [
  "python",
  "javascript",
  "typescript",
  "rust",
  "go",
  "java",
  "c",
  "cpp",
  "csharp",
  "sql",
  "shell",
  "ruby",
  "kotlin",
  "swift",
  "php",
] as const;

export const ExerciseSchema = z.object({
  title: z.string().describe("Short exercise title, 2-6 words"),
  language: z.enum(CODE_LANGUAGES).describe("The language the lesson uses; python when the lesson is not about a specific language"),
  task: z
    .string()
    .describe("What to do: 2-5 '- ' bullets naming the exact functions or variables to write, with inputs and expected outputs. Fact-dense, no filler"),
  starterCode: z
    .string()
    .describe("5-25 lines that already run: signatures, TODO comments and any setup, with the core logic missing"),
  solution: z.string().describe("A complete, idiomatic solution that passes every test"),
  tests: z
    .array(
      z.object({
        name: z.string().describe("What the test checks, e.g. 'handles an empty list'"),
        expression: z
          .string()
          .describe("One boolean expression in the exercise language, evaluated after the code runs, e.g. add(2, 3) == 5. No statements, prints or asserts"),
      }),
    )
    .describe("3-6 tests covering the normal case and edge cases"),
});

export const CodeReviewSchema = z.object({
  verdict: z.enum(["correct", "almost", "incorrect"]),
  feedback: z
    .string()
    .describe("2-4 '- ' bullets: what works, what is wrong and why, citing specific lines or values. No filler"),
  hint: z.string().describe("One next step that nudges toward the fix without giving the full answer; empty if correct"),
});

/** The review with the verdict already settled elsewhere: prose only. */
export const CodeReviewProseSchema = CodeReviewSchema.omit({ verdict: true });

export type CodeLanguage = (typeof CODE_LANGUAGES)[number];
export type Exercise = z.infer<typeof ExerciseSchema>;
export type CodeReview = z.infer<typeof CodeReviewSchema>;

/* ---------- Explainer: a narrated, drawn walkthrough of a topic ---------- */

export const ExplainerPlanSchema = z.object({
  title: z.string().describe("Punchy title, 2-6 words"),
  scenes: z
    .array(
      z.object({
        narration: z
          .string()
          .describe("What the voice says over this scene: 1-2 spoken sentences, 15-35 words, plain speech, no markdown"),
        bullet: z
          .string()
          .describe("The same point as one written line for the article version: fact-dense, under 20 words"),
        visual: z
          .string()
          .describe("What the board should show: the diagram, graph, labelled sketch or photo, in one line"),
      }),
    )
    .describe("8-14 scenes that tell the topic start to finish, each one idea"),
});

export const SceneBoardSchema = z.object({
  actions: z.array(BoardActionSchema).describe("3-8 whiteboard actions drawing this scene, in drawing order"),
});

export type ExplainerPlan = z.infer<typeof ExplainerPlanSchema>;
export type ExplainerScene = ExplainerPlan["scenes"][number];

/* ---------- Marking a page of handwritten work ---------- */

export const WorkCheckSchema = z.object({
  verdict: z.enum(["correct", "mistakes", "unreadable"]),
  summary: z
    .string()
    .describe("One or two plain sentences: what the work does, and what is wrong. Name the line or step"),
  marks: z
    .array(BoardActionSchema)
    .describe(
      "What to draw on the page: circle each mistake, write the correction next to it, and add a short note. Red for mistakes, green for a tick, ink for notes. Nothing when the work is correct except a tick",
    ),
});

export type WorkCheck = z.infer<typeof WorkCheckSchema>;
