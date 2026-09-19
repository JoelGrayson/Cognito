import type { LearnerProfile } from "@/types/learning";

export const sampleProfile: LearnerProfile = {
  goal: "learn enough linear algebra to understand neural networks",
  goalType: "curiosity",
  deadline: "2026-11-01",
  hoursPerWeek: 4,
  priorKnowledge: [
    { concept: "Vectors", level: 1 },
    { concept: "Matrices", level: 0 },
    { concept: "Derivatives", level: 2 },
  ],
  preferences: { formats: ["reading", "practice"], pace: "steady" },
  tutorStyle: "socratic",
  availability: { daysPerWeek: 4, timezone: "America/New_York" },
};
