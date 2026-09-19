import { mockDelay } from "./delay";

const LINEAR_ALGEBRA = [
  "Vectors",
  "Matrix operations",
  "Linear systems",
  "Determinants",
  "Vector spaces",
  "Linear transformations",
  "Eigenvalues and eigenvectors",
  "Orthogonality",
];

// Strips filler like "I want to learn" so the topic reads naturally inside a concept.
function topicOf(goal: string): string {
  const topic = goal
    .replace(/^(i (want|need|would like) to |i'd like to )?(learn|study|understand|master|get better at)\s+/i, "")
    .split(/\s+(?:for|to|in|with|so|because)\s+/i)[0]
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(" ");
  return topic || "the topic";
}

/**
 * Deterministic concepts for MOCK_AI=true.
 * Failure switches for testing the level-selector fallback: a goal containing
 * "failtest", or MOCK_AI_FAIL_CONCEPTS=true.
 */
export async function mockConcepts(goal: string): Promise<string[]> {
  await mockDelay();
  if (process.env.MOCK_AI_FAIL_CONCEPTS === "true" || /failtest/i.test(goal)) {
    throw new Error("Mock concepts failure (forced)");
  }
  if (/linear algebra/i.test(goal)) return [...LINEAR_ALGEBRA];
  const topic = topicOf(goal);
  return [
    `${topic} basics`,
    "Core terminology",
    "Fundamental principles",
    "Common tools",
    "Worked examples",
    "Intermediate techniques",
    "Problem solving",
    "Advanced topics",
  ];
}
