import { NextResponse } from "next/server";
import { PROVIDERS, ProviderError, isProviderId } from "@/lib/providers";
import { MindMapSchema, type GenerateRequest } from "@/lib/schema";

// Roadmap generation can take a while on reasoning models.
export const maxDuration = 120;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const { topic, provider, model, current, instruction } = (body ?? {}) as Record<string, unknown>;

  if (typeof topic !== "string" || !topic.trim()) {
    return NextResponse.json({ error: "Tell me what you want to learn." }, { status: 400 });
  }
  if (topic.length > 500) {
    return NextResponse.json({ error: "Keep the topic under 500 characters." }, { status: 400 });
  }
  if (!isProviderId(provider)) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  }
  if (model !== undefined && typeof model !== "string") {
    return NextResponse.json({ error: "Model must be a string." }, { status: 400 });
  }

  const req: GenerateRequest = { topic: topic.trim() };
  if (instruction !== undefined || current !== undefined) {
    if (typeof instruction !== "string" || !instruction.trim()) {
      return NextResponse.json({ error: "Tell me what to change." }, { status: 400 });
    }
    if (instruction.length > 2000) {
      return NextResponse.json({ error: "Keep the modification under 2000 characters." }, { status: 400 });
    }
    const parsed = MindMapSchema.safeParse(current);
    if (!parsed.success) {
      return NextResponse.json({ error: "The current roadmap is malformed." }, { status: 400 });
    }
    req.current = parsed.data;
    req.instruction = instruction.trim();
  }

  const started = Date.now();
  try {
    const result = await PROVIDERS[provider].generate(req, model);
    return NextResponse.json({
      mindMap: result.mindMap,
      provider,
      model: result.model,
      ms: Date.now() - started,
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("mindmap generation failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed." },
      { status: 500 },
    );
  }
}
