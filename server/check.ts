import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { MARK_GRID, type CheckResponse } from "../shared/types.ts";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";

const coord = z.number().min(0).max(MARK_GRID);
const markSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("circle"), cx: coord, cy: coord, r: z.number().min(5).max(400) }),
  z.object({ kind: z.literal("underline"), x1: coord, x2: coord, y: coord }),
  z.object({ kind: z.literal("cross"), x: coord, y: coord, size: z.number().min(5).max(200) }),
  z.object({ kind: z.literal("check"), x: coord, y: coord, size: z.number().min(5).max(200) }),
  z.object({ kind: z.literal("arrow"), x1: coord, y1: coord, x2: coord, y2: coord }),
  z.object({ kind: z.literal("text"), x: coord, y: coord, text: z.string().min(1).max(60) }),
]);

const resultSchema = z.object({
  verdict: z.enum(["correct", "partial", "incorrect", "unclear"]),
  feedback: z.string().min(1),
  issues: z.array(z.string()).default([]),
  marks: z.array(markSchema).max(20).default([]),
});

const SYSTEM = `You are a teacher grading a student's handwritten work on a worksheet page.
The image is the page: the printed question(s) plus the student's handwriting on top.
Coordinates: the page is a ${MARK_GRID}x${MARK_GRID} grid, x rightwards and y downwards, (0,0) top-left.

Grade the work like a careful human marker with a red pen:
- Decide whether the final answer and the reasoning are correct.
- Write "feedback": 2-4 plain sentences addressed to the student. Be specific, kind and direct. If something is wrong, say what and why, and how to fix it. Do not use markdown.
- List "issues": each distinct mistake in one short sentence (empty if correct).
- Draw "marks" in red pen ON the student's writing, placed accurately:
  - "check" next to correct steps or the correct final answer,
  - "cross" or "circle" on a wrong step, wrong sign, arithmetic slip, or missing term,
  - "underline" under a specific wrong value,
  - "arrow" from a mark to a short "text" note (<= 6 words, e.g. "sign flips here", "forgot to divide by 2"),
  - never more than ~8 marks; do not obscure the student's writing with huge shapes.
If the page has no student work, or it is illegible, use verdict "unclear" and say so.`;

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic();
  return client;
}

export async function check(imageDataUrl: string, question?: string): Promise<CheckResponse> {
  const data = imageDataUrl.slice(imageDataUrl.indexOf(",") + 1);
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    tools: [
      {
        name: "grade",
        description: "Return the grade, written feedback and red-pen marks for the page.",
        input_schema: z.toJSONSchema(resultSchema) as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: "grade" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data } },
          {
            type: "text",
            text: question
              ? `The question printed on the page is:\n${question}\n\nGrade the student's handwritten work.`
              : "Grade the student's handwritten work on this page.",
          },
        ],
      },
    ],
  });

  const tool = res.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") throw new Error("model returned no grade");
  return resultSchema.parse(tool.input);
}
