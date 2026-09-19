import type {
  ChatMessage,
  GenerateRequest,
  LessonContent,
  LessonPlan,
  MapNode,
  MindMap,
  Phase,
} from "@/lib/schema";

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

/* ---------- Lesson: plan first, then sections in parallel ---------- */

export interface LessonRequest {
  /** The roadmap's topic. */
  topic: string;
  node: MapNode;
  phase: Phase;
  /** The whole roadmap, so the lesson knows what came before and what comes next. */
  map: MindMap;
}

export const PLAN_SYSTEM_PROMPT = `You are an expert teacher planning one lesson inside a larger learning roadmap. The learner has clicked a single block of the roadmap. Plan a lesson that teaches exactly that block, at the depth its position in the roadmap implies. The sections will be written afterwards, one at a time, from your plan alone.

Guidelines:
- 3-6 sections in teaching order: motivate, explain the core ideas, work a concrete example, connect to what comes next. Each section's intent is one sentence saying exactly what it must cover, precise enough that a writer who sees only the plan will not overlap the neighbouring sections.
- Assume the learner knows the earlier stages of the roadmap and nothing from later ones.
- Key takeaways: 3-5 one-sentence statements the learner should be able to make afterwards.
- Write in the same language the roadmap is written in.`;

export function planPrompt(req: LessonRequest): string {
  return [
    `Roadmap topic: ${req.topic}`,
    `Roadmap, in learning order:`,
    outline(req.map),
    ``,
    `Plan the lesson for this block:`,
    `Name: ${req.node.name}`,
    `Key concepts: ${req.node.subtitle}`,
    `Description: ${req.node.description}`,
    `Phase: ${req.phase}`,
  ].join("\n");
}

export const EXTRAS_SYSTEM_PROMPT = `You pick further reading and a video for one lesson inside a learning roadmap.

Guidelines:
- Resources: 3-5 real, well-known pages: official documentation, Wikipedia, university course notes, textbook sites, standards bodies. Give full https URLs and only ones you are confident exist. Never invent a URL.
- videoQuery: the search you would type into YouTube to find a good explanatory video for this lesson.
- Write in the same language the roadmap is written in.`;

export function extrasPrompt(req: LessonRequest): string {
  return [
    `Roadmap topic: ${req.topic}`,
    `The lesson is about this block: ${req.node.name} (${req.node.subtitle}). ${req.node.description} Phase: ${req.phase}.`,
  ].join("\n");
}

export const SECTION_SYSTEM_PROMPT = `You are an expert teacher writing one section of a lesson. The other sections are being written separately from the same plan, so cover exactly what your section is for and do not repeat what the others cover. Do not introduce or summarise the whole lesson.

Guidelines:
- Teach, don't list. Explain the ideas and why they matter. Include a concrete example (a calculation, a code snippet, a worked scenario) when the section's intent calls for it.
- 1-3 short paragraphs separated by blank lines, about 120-220 words; a worked example may run to 300.
- You may use **bold** for key terms, \`code\` for code or symbols, and lines starting with "- " for bullet lists. No headings and no section title.
- Assume the learner knows the earlier stages of the roadmap and nothing from later ones.
- Write in the same language as the plan.`;

export function sectionPrompt(req: LessonRequest & { outline: LessonPlan; index: number }): string {
  const section = req.outline.sections[req.index];
  return [
    `Roadmap topic: ${req.topic}`,
    `Block being taught: ${req.node.name} (${req.node.subtitle}). ${req.node.description} Phase: ${req.phase}.`,
    `Lesson: ${req.outline.title}`,
    `Summary: ${req.outline.summary}`,
    `Plan:`,
    ...req.outline.sections.map((s, i) => `${i + 1}. ${s.heading}: ${s.intent}`),
    ``,
    `Write section ${req.index + 1}, "${section.heading}": ${section.intent}`,
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
