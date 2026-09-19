import type { ChatMessage, GenerateRequest, LessonContent, MapNode, MindMap, Phase } from "@/lib/schema";

/* ---------- Roadmap ---------- */

export const SYSTEM_PROMPT = `You are an expert curriculum designer. The user names something they want to learn. Lay out the knowledge they need as a learning roadmap.

Structure:
- stages: ordered top to bottom in the sequence a learner should tackle them. Each stage has one core node (the main thing to learn at that stage; the core nodes form the spine of the roadmap) and 0-2 supporting nodes learned alongside it.
- phase: "prerequisite" for background a learner needs before the topic itself, "core" for the topic proper, "advanced" for deeper or applied material that builds on the core. Phases appear in that order.

Guidelines:
- Aim for 4-7 stages. Most stages have 2 supporting nodes; use fewer when nothing genuinely belongs alongside.
- Node names are 1-4 words. Subtitles list the key concepts in 2-5 words, comma-separated (e.g. "P, Q, S, power factor"). Descriptions are one plain sentence.
- Match the scope of the request. A narrow topic gets a narrow, deep roadmap; a broad field gets a broad one.
- Be specific to the topic. Avoid generic filler like "Practice" or "Advanced topics" unless it names what to practice.
- Write in the same language the user wrote in.`;

export function userPrompt(req: GenerateRequest): string {
  const topic = req.topic.trim();
  if (req.current && req.instruction?.trim()) {
    return [
      `I want to learn: ${topic}`,
      ``,
      `Here is the current roadmap as JSON:`,
      JSON.stringify(req.current),
      ``,
      `Apply this change: ${req.instruction.trim()}`,
      ``,
      `Keep everything else as it is unless the change requires adjusting it. Return the full updated roadmap.`,
    ].join("\n");
  }
  return `I want to learn: ${topic}`;
}

/* ---------- Lesson ---------- */

export interface LessonRequest {
  /** The roadmap's topic. */
  topic: string;
  node: MapNode;
  phase: Phase;
  /** The whole roadmap, so the lesson knows what came before and what comes next. */
  map: MindMap;
}

export const LESSON_SYSTEM_PROMPT = `You are an expert teacher writing one lesson inside a larger learning roadmap. The learner has clicked a single block of the roadmap; teach exactly that block, at the depth its position in the roadmap implies.

Guidelines:
- Teach, don't list. Explain the ideas, why they matter and how they connect. Work through at least one concrete example (a calculation, a code snippet, a worked scenario) wherever the subject allows.
- Assume the learner knows the earlier stages of the roadmap and nothing from later ones.
- 3-6 sections, each 1-3 short paragraphs. Section bodies may use **bold** for key terms, \`code\` for code or symbols, and lines starting with "- " for bullet lists. No headings inside bodies.
- Resources: 3-5 real, well-known pages: official documentation, Wikipedia, university course notes, textbook sites, standards bodies. Give full https URLs and only ones you are confident exist. Never invent a URL.
- videoQuery: the search you would type into YouTube to find a good explanatory video for this lesson.
- Write in the same language the roadmap is written in.`;

export function lessonPrompt(req: LessonRequest): string {
  return [
    `Roadmap topic: ${req.topic}`,
    `Roadmap, in learning order:`,
    outline(req.map),
    ``,
    `Write the lesson for this block:`,
    `Name: ${req.node.name}`,
    `Key concepts: ${req.node.subtitle}`,
    `Description: ${req.node.description}`,
    `Phase: ${req.phase}`,
  ].join("\n");
}

function outline(map: MindMap): string {
  return map.stages
    .map((s, i) => {
      const alongside = s.supporting.map((n) => n.name).join(", ");
      return `${i + 1}. [${s.phase}] ${s.core.name}${alongside ? ` (alongside: ${alongside})` : ""}`;
    })
    .join("\n");
}

/* ---------- Tutor chat ---------- */

export const TUTOR_SYSTEM_PROMPT = `You are a patient tutor sitting next to a learner who is reading a lesson. You can see the lesson. Answer their questions directly and concretely, tying answers back to the lesson where that helps. Keep replies short: a few sentences to a few short paragraphs. You may use **bold**, \`code\` and "- " bullets.

If the learner asks you to change the lesson itself (make it simpler or deeper, add or remove a section, add an example, shift the focus, fix a mistake), return the complete revised lesson in updatedLesson and use reply to say briefly what you changed. Keep everything they did not ask about as it was, including resources and videoQuery unless the change calls for new ones. If they are only asking a question, set updatedLesson to null.`;

export function tutorPrompt(topic: string, lesson: LessonContent, history: ChatMessage[]): string {
  const transcript = history
    .map((m) => `${m.role === "user" ? "Learner" : "Tutor"}: ${m.content}`)
    .join("\n\n");
  return [
    `Roadmap topic: ${topic}`,
    `The lesson the learner is reading, as JSON:`,
    JSON.stringify(lesson),
    ``,
    `Conversation so far. Reply to the last learner message.`,
    transcript,
  ].join("\n");
}

/* ---------- Quiz ---------- */

export const QUIZ_SYSTEM_PROMPT = `You write short quizzes that check whether a learner understood a lesson. Questions test understanding and application, not recall of exact wording. Each question has exactly 4 choices with one correct answer and plausible distractors. Vary which position holds the correct answer. Explanations are one or two sentences. Write in the language of the lesson.`;

export function quizPrompt(lesson: LessonContent): string {
  return `Write a 5-question quiz for this lesson:\n${JSON.stringify(lesson)}`;
}
