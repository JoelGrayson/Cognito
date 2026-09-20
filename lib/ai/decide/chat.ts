/**
 * Is the learner asking a question, or asking for the lesson to change?
 *
 * The tutor call answers both with one schema, so every "what does this word
 * mean?" is generated against a response format that also contains an entire
 * `LessonContent` — sections, resources, videoQuery. Jev reads the turn and says
 * which it is, and the answer-only turns then run against a schema half the size.
 *
 * The asymmetry decides the threshold. Routing a rewrite to the answer schema
 * takes away the thing the learner asked for; routing a question to the full
 * schema costs nothing but the tokens we have always spent. So the narrow path
 * needs `ANSWER_FLOOR` confidence, and everything else keeps today's behavior.
 */
import { choice, jevConfigured, tryAsk } from "@/lib/ai/jev";
import type { ChatMessage, LessonContent } from "@/lib/schema";

/** How sure Jev must be that nothing needs rewriting before we drop the lesson schema. */
export const ANSWER_FLOOR = 0.85;

/** Jev answers in well under a second, and the tutor reply is still waiting behind it. */
const DEADLINE_MS = 1500;

export type TutorRoute = "answer" | "rewrite";

export interface TutorRouting {
  route: TutorRoute;
  /** Probability of the chosen route, before the floor is applied. */
  probability: number;
  model: string;
  ms: number;
}

const QUESTION =
  "What is the learner asking for in their last message, read in the context of the conversation " +
  "and the lesson they are reading?";

/** Null when Jev cannot answer, so the caller keeps the full rewrite-capable schema. */
export async function routeTutorTurn(
  lesson: LessonContent,
  messages: ChatMessage[],
): Promise<TutorRouting | null> {
  if (!jevConfigured()) return null;

  const result = await tryAsk(
    {
      lesson: { title: lesson.title, summary: lesson.summary, sections: lesson.sections.map((s) => s.heading) },
      conversation: messages.map((m) => `${m.role === "user" ? "Learner" : "Tutor"}: ${m.content}`),
    },
    {
      route: choice(QUESTION, {
        answer:
          "An answer: a question about the material, an example or a walkthrough in the reply, or chat. The lesson text stays as it is.",
        rewrite:
          "A change to the lesson itself: simpler or deeper, add an example to it, add or remove a section, shift the focus, fix a mistake in it.",
      }),
    },
    // Nothing is streamed until this returns, and the wait comes out of the
    // route's own deadline. A routing decision that has not landed by now is
    // not worth delaying the answer for: take the wide schema and generate.
    { timeoutMs: DEADLINE_MS },
  );
  if (!result) return null;

  const { choice: route, probabilities } = result.answers.route;
  return { route, probability: probabilities[route], model: result.model, ms: result.ms };
}

/** Whether this turn can safely skip the lesson-rewrite half of the tutor schema. */
export function answerOnly(routing: TutorRouting | null): boolean {
  return routing !== null && routing.route === "answer" && routing.probability >= ANSWER_FLOOR;
}
