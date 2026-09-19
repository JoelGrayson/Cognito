import { z } from "zod";
import { apiHandler, BadRequest, providerFrom, readJson } from "@/lib/api";
import { parsePartialJson } from "@/lib/partial-json";
import { MAP_CHAT_SYSTEM_PROMPT, mapChatPrompt } from "@/lib/prompt";
import { tidyMap } from "@/lib/roadmap";
import { ChatMessageSchema, MapChatReplySchema, MindMapInputSchema } from "@/lib/schema";
import { ndjson, throttle } from "@/lib/stream";

export const maxDuration = 120;

const BodySchema = z.object({
  topic: z.string().trim().min(1).max(500),
  map: MindMapInputSchema,
  messages: z
    .array(ChatMessageSchema.extend({ content: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(40),
  provider: z.string(),
  model: z.string().optional(),
});

/**
 * Answers a question about a roadmap, or revises it. Streams newline-delimited JSON:
 *   {type:"reply", reply}                     the answer, as it is written
 *   {type:"done", reply, map, provider, model, ms}
 *   {type:"error", error}
 */
export const POST = apiHandler(async (request) => {
  const body = await readJson(request, BodySchema);
  const provider = providerFrom(body.provider);
  const last = body.messages[body.messages.length - 1];
  if (last.role !== "user") throw new BadRequest("The last message must be from the learner.");

  const started = Date.now();
  return ndjson(async (emit) => {
    const partial = throttle(emit);
    const result = await provider.structured(
      {
        name: "map_chat_reply",
        schema: MapChatReplySchema,
        system: MAP_CHAT_SYSTEM_PROMPT,
        user: mapChatPrompt(body.topic, body.map, body.messages),
        effort: "minimal",
        onText: (text) => {
          const draft = parsePartialJson(text) as { reply?: unknown } | undefined;
          if (draft && typeof draft.reply === "string") partial({ type: "reply", reply: draft.reply });
        },
      },
      body.model,
    );

    emit({
      type: "done",
      reply: result.output.reply,
      map: result.output.updatedMap ? tidyMap(result.output.updatedMap) : null,
      provider: provider.id,
      model: result.model,
      ms: Date.now() - started,
    });
  });
});
