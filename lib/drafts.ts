import type { Lesson, MapNode, QuizQuestion, Resource, Video } from "@/lib/schema";
import type { VideoJudging } from "@/lib/video";

/* Shapes of things while they are still streaming in, plus the sanitisers
   that turn a half-parsed JSON object into one of them. Client-safe. */

/** A lesson being written: bodies fill in, links and video arrive once checked. */
export interface LessonDraft {
  title: string;
  summary: string;
  /** Empty until the plan has written it. */
  tldr: string;
  sections: { heading: string; body: string; done: boolean }[];
  keyTakeaways: string[];
  videoQuery: string;
  /** null while links are still being checked. */
  resources: Resource[] | null;
  /** null while a video is still being looked up. */
  video: Video | null;
  /** How the video was chosen. Only known while the lesson is being written. */
  videoJudging?: VideoJudging;
}

export function emptyDraft(node: MapNode): LessonDraft {
  return {
    title: node.name,
    summary: node.description,
    tldr: "",
    sections: [],
    keyTakeaways: [],
    videoQuery: "",
    resources: null,
    video: null,
  };
}

export function draftFromLesson(lesson: Lesson): LessonDraft {
  return {
    ...lesson,
    tldr: lesson.tldr ?? "",
    sections: lesson.sections.map((s) => ({ ...s, done: true })),
  };
}

/** The outline as it streams: headings appear one by one. */
export interface OutlineDraft {
  title: string;
  summary: string;
  tldr: string;
  sections: { heading: string }[];
  keyTakeaways: string[];
}

/** A quiz question that may still be arriving. */
export interface QuestionDraft {
  prompt: string;
  choices: string[];
  answer?: number;
  explanation?: string;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function partialOutline(raw: unknown): OutlineDraft | null {
  if (!isRecord(raw)) return null;
  const sections = Array.isArray(raw.sections)
    ? raw.sections
        .filter((s): s is Record<string, unknown> => isRecord(s) && typeof s.heading === "string")
        .map((s) => ({ heading: s.heading as string }))
    : [];
  return {
    title: str(raw.title),
    summary: str(raw.summary),
    tldr: str(raw.tldr),
    sections,
    keyTakeaways: strings(raw.keyTakeaways),
  };
}

export function partialQuiz(raw: unknown): QuestionDraft[] | null {
  if (!isRecord(raw) || !Array.isArray(raw.questions)) return null;
  const questions: QuestionDraft[] = [];
  for (const q of raw.questions) {
    if (!isRecord(q) || typeof q.prompt !== "string") continue;
    questions.push({
      prompt: q.prompt,
      choices: strings(q.choices),
      answer: typeof q.answer === "number" ? q.answer : undefined,
      explanation: typeof q.explanation === "string" ? q.explanation : undefined,
    });
  }
  return questions;
}

export function questionFromDraft(q: QuestionDraft): QuizQuestion | null {
  if (q.answer === undefined || q.explanation === undefined || q.choices.length < 2) return null;
  return { prompt: q.prompt, choices: q.choices, answer: q.answer, explanation: q.explanation };
}

/** An explainer script as it streams: scenes appear one by one. */
export interface ExplainerPlanDraft {
  title: string;
  scenes: { narration: string; bullet: string; visual: string }[];
}

export function partialPlan(raw: unknown): ExplainerPlanDraft | null {
  if (!isRecord(raw)) return null;
  const scenes = Array.isArray(raw.scenes)
    ? raw.scenes
        .filter(isRecord)
        .filter((s) => typeof s.narration === "string" && s.narration)
        .map((s) => ({ narration: s.narration as string, bullet: str(s.bullet), visual: str(s.visual) }))
    : [];
  return { title: str(raw.title), scenes };
}
