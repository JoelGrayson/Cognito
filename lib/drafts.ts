import type { Lesson, MapNode, MindMap, Phase, QuizQuestion, Resource, Video } from "@/lib/schema";

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

const PHASES = new Set<Phase>(["prerequisite", "core", "advanced"]);

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function node(value: unknown): MapNode | null {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name) return null;
  return { name: value.name, subtitle: str(value.subtitle), description: str(value.description) };
}

/** Whatever complete-enough stages a partially streamed roadmap has. */
export function partialMindMap(raw: unknown): MindMap | null {
  if (!isRecord(raw)) return null;
  const stages: MindMap["stages"] = [];
  if (Array.isArray(raw.stages)) {
    for (const s of raw.stages) {
      if (!isRecord(s)) continue;
      const core = node(s.core);
      if (!core) continue;
      const phase = PHASES.has(s.phase as Phase) ? (s.phase as Phase) : "core";
      const supporting = Array.isArray(s.supporting)
        ? s.supporting.map(node).filter((n): n is MapNode => n !== null)
        : [];
      stages.push({ phase, core, supporting });
    }
  }
  return { topic: str(raw.topic), summary: str(raw.summary), stages };
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
