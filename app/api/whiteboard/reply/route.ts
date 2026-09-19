/**
 * The tutor's spoken reply. The one place a model is involved.
 *
 * DIVISION OF LABOUR, and it matters:
 *   - The CHECKER decides whether the step is wrong. Deterministic, 0.03ms, free.
 *   - The MODEL only decides what to SAY about it. Language needs language.
 *
 * So the model is handed the ground truth rather than asked to work it out. It
 * cannot be wrong about the maths, because it is never asked. That keeps the cost
 * story honest (correct steps still cost zero tokens - we only call this when
 * something is already known to be wrong) and stops the tutor hallucinating an
 * error that isn't there.
 *
 * THE HARD CONSTRAINT: the model knows the answer and must not give it away. It is
 * told the verdict AND the rung, and the rung caps what it may reveal. That is the
 * whole product - a tutor that knows and withholds - so it is stated twice in the
 * prompt and enforced again by the schema.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 30;

const ReplySchema = z.object({
  foundIt: z
    .boolean()
    .describe("True only if the learner named the actual error, even hesitantly."),
  reply: z
    .string()
    .describe(
      "What the tutor says next. One or two short sentences, spoken aloud, no markdown, no equations read out symbol by symbol.",
    ),
  escalate: z
    .boolean()
    .describe("True if the learner is stuck and should be given the next rung of help."),
});

/** What the tutor is allowed to reveal at each rung. */
const RUNG_LIMITS: Record<number, string> = {
  1: "You may say only that something is wrong somewhere. Do NOT say which line, which symbol, or what kind of mistake it is.",
  2: "You may say roughly where to look (which step), but NOT what is wrong with it.",
  3: "You may point at the specific step, but NOT name the rule they broke.",
  4: "You may name the rule they broke, but do NOT give them the corrected line.",
  5: "You may explain the error fully, but still do not write the corrected line for them.",
};

function describeVerdict(kind: string, detail: string): string {
  switch (kind) {
    case "direction":
      return `They divided or multiplied by a negative and kept the inequality pointing the same way. It should have flipped to "${detail}".`;
    case "rescaled":
      return `They changed the VALUE of a bare expression by scaling it by ${detail}. You may scale both sides of an equation, never a lone expression.`;
    default:
      return `The step does not follow from the one above it. ${detail}`;
  }
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return NextResponse.json({ error: "Set ANTHROPIC_API_KEY in .env.local." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const { previousStep, currentStep, verdictKind, verdictDetail, rung, said, history } =
    (body ?? {}) as {
      previousStep?: string;
      currentStep?: string;
      verdictKind?: string;
      verdictDetail?: string;
      rung?: number;
      said?: string;
      history?: { who: "tutor" | "learner"; text: string }[];
    };

  if (typeof currentStep !== "string" || typeof verdictKind !== "string") {
    return NextResponse.json({ error: "currentStep and verdictKind are required." }, { status: 400 });
  }

  const level = Math.min(Math.max(rung ?? 1, 1), 5);
  const transcript = (history ?? [])
    .slice(-6)
    .map((h) => `${h.who === "tutor" ? "You" : "Them"}: ${h.text}`)
    .join("\n");

  const system = `You are a maths tutor sitting beside someone working a problem on paper. You speak out loud, so keep it to one or two short sentences, conversational, no markdown.

YOU ALREADY KNOW WHAT IS WRONG. You must not simply tell them. The learner catching their own mistake is worth far more than being told, so you withhold and let them work.

${RUNG_LIMITS[level]}

Never repeat a sentence you have already said - if they are still stuck, say something different, or ask a question that moves them.
Never write out the corrected step.
If they ask you a direct question, answer it within the limit above rather than ignoring it.
If they have named the error, say so warmly and briefly, and stop helping.`;

  const started = Date.now();
  const client = new Anthropic();

  try {
    const response = await client.messages.parse({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5",
      max_tokens: 1000,
      system,
      // Low effort: this is a one-sentence conversational turn, and it is spoken
      // aloud while the learner waits.
      output_config: { format: zodOutputFormat(ReplySchema), effort: "low" },
      messages: [
        {
          role: "user",
          content: [
            previousStep ? `They had written: ${previousStep}` : "This is their first step.",
            `Then they wrote: ${currentStep}`,
            `GROUND TRUTH (you know this, they do not): ${describeVerdict(verdictKind, verdictDetail ?? "")}`,
            transcript ? `\nSo far:\n${transcript}` : "",
            said ? `\nThey just said: "${said}"` : "\nThey have not said anything yet.",
            `\nReply at rung ${level}.`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });

    const ms = Date.now() - started;
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return NextResponse.json({ error: "No usable reply.", ms }, { status: 502 });
    }

    const out = response.parsed_output;
    console.log(`[reply] ${ms}ms rung=${level} found=${out.foundIt} "${out.reply.slice(0, 70)}"`);
    return NextResponse.json({ ...out, ms });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Rate limited." }, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Claude ${error.status}: ${error.message}` }, { status: 502 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reply failed." },
      { status: 500 },
    );
  }
}
