import type { GenerateRequest } from "@/lib/schema";

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
