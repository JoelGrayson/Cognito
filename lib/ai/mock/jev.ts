import { mockDelay } from "./delay";
import type { JevAnswers, JevQuestion } from "../jev";

/**
 * Deterministic Jev answers for MOCK_AI=true: yes, the first option, the top
 * level, always confident. Callers gate on thresholds, so a confident mock
 * exercises the path that actually acts on the decision; MOCK_JEV_FAIL=true
 * exercises the fallback.
 */
export async function mockJev<Q extends Record<string, JevQuestion>>(questions: Q): Promise<JevAnswers<Q>> {
  await mockDelay();
  const answers: Record<string, unknown> = {};
  for (const [id, question] of Object.entries(questions)) {
    answers[id] = answerFor(question);
  }
  return answers as JevAnswers<Q>;
}

function answerFor(question: JevQuestion): unknown {
  if (question.type === "noul") return { type: "noul", noul: 0.95 };
  if (question.type === "choice") {
    const options = Object.keys(question.criteria);
    const probabilities = Object.fromEntries(options.map((option, i) => [option, i === 0 ? 1 : 0]));
    return { type: "choice", choice: options[0], probabilities, confidence: 0.95 };
  }
  const top = question.criteria.length - 1;
  return {
    type: "score",
    score: top,
    legend: Object.fromEntries(question.criteria.map((level, i) => [String(i), level])),
    probabilities: Object.fromEntries(question.criteria.map((_, i) => [String(i), i === top ? 1 : 0])),
    confidence: 0.95,
  };
}
