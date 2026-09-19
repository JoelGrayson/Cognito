import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, BadRequest, providerFrom, readJson } from "@/lib/api";
import { SYSTEM_PROMPT, userPrompt } from "@/lib/prompt";
import { MindMapSchema, type GenerateRequest } from "@/lib/schema";

// Roadmap generation can take a while on reasoning models.
export const maxDuration = 120;

const BodySchema = z.object({
  topic: z.string(),
  provider: z.string(),
  model: z.string().optional(),
  current: z.unknown().optional(),
  instruction: z.string().optional(),
});

export const POST = apiHandler(async (request) => {
  const body = await readJson(request, BodySchema);
  const topic = body.topic.trim();
  if (!topic) throw new BadRequest("Tell me what you want to learn.");
  if (topic.length > 500) throw new BadRequest("Keep the topic under 500 characters.");
  const provider = providerFrom(body.provider);

  const req: GenerateRequest = { topic };
  if (body.instruction !== undefined || body.current !== undefined) {
    const instruction = body.instruction?.trim();
    if (!instruction) throw new BadRequest("Tell me what to change.");
    if (instruction.length > 2000) throw new BadRequest("Keep the modification under 2000 characters.");
    const current = MindMapSchema.safeParse(body.current);
    if (!current.success) throw new BadRequest("The current roadmap is malformed.");
    req.current = current.data;
    req.instruction = instruction;
  }

  const started = Date.now();
  const result = await provider.structured(
    { name: "mind_map", schema: MindMapSchema, system: SYSTEM_PROMPT, user: userPrompt(req) },
    body.model,
  );
  return NextResponse.json({
    mindMap: result.output,
    provider: provider.id,
    model: result.model,
    ms: Date.now() - started,
  });
});
