import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { toJsonSchema } from "@/lib/schema";
import {
  ProviderError,
  type Provider,
  type ProviderContext,
  type ProviderId,
  type ProviderInfo,
  type StructuredRequest,
  type StructuredResult,
} from "./types";

/**
 * OpenAI, xAI (Grok), Ollama, LM Studio, vLLM and llama.cpp all speak the
 * OpenAI chat-completions protocol, so one implementation covers them all.
 * Only the base URL, credentials and default model differ.
 */
export interface OpenAICompatibleConfig {
  id: ProviderId;
  label: string;
  defaultModel: string;
  /** Env var holding the model override. */
  modelEnv: string;
  /** Env var holding the API key. */
  apiKeyEnv: string;
  /** Local servers usually ignore the key; use this when the env var is unset. */
  apiKeyFallback?: string;
  /** Fixed base URL, or an env var (with default) for it. */
  baseUrlEnv?: string;
  defaultBaseUrl?: string;
  hint: string;
  /** If true, `info()` pings the server instead of checking for a key. */
  probe?: boolean;
  /**
   * If true and no model is configured, ask the server which models it has
   * and pick one (preferring names containing `preferModel`).
   */
  autoDetectModel?: boolean;
  preferModel?: string;
  /** Whether the server accepts `reasoning_effort` (OpenAI does; most others reject it). */
  supportsReasoningEffort?: boolean;
}

type ResponseFormat = NonNullable<ChatCompletionCreateParamsNonStreaming["response_format"]>;

/** Pull JSON out of a model reply that may include thinking tags or code fences. */
export function extractJson(text: string): string {
  let s = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new ProviderError("Model reply did not contain a JSON object.", 502);
  }
  return s.slice(start, end + 1);
}

export function createOpenAICompatibleProvider(cfg: OpenAICompatibleConfig): Provider {
  const model = () => process.env[cfg.modelEnv] || cfg.defaultModel;
  const baseURL = () =>
    (cfg.baseUrlEnv ? process.env[cfg.baseUrlEnv] : undefined) || cfg.defaultBaseUrl;
  const apiKey = () => process.env[cfg.apiKeyEnv] || cfg.apiKeyFallback;

  /** Model to use: explicit override, env var, auto-detected from the server, or the default. */
  async function resolveModel(override?: string): Promise<string> {
    if (override) return override;
    if (process.env[cfg.modelEnv]) return process.env[cfg.modelEnv] as string;
    if (cfg.autoDetectModel) {
      const available = await listModels(`${baseURL()}/models`, apiKey());
      const prefer = cfg.preferModel?.toLowerCase();
      const match = prefer ? available.find((m) => m.toLowerCase().includes(prefer)) : undefined;
      if (match) return match;
      if (available.length > 0) return available[0];
    }
    return cfg.defaultModel;
  }

  async function info(_ctx?: ProviderContext): Promise<ProviderInfo> {
    void _ctx;
    let ok: boolean;
    if (cfg.probe) {
      ok = await reachable(`${baseURL()}/models`, apiKey());
    } else {
      ok = Boolean(apiKey());
    }
    return {
      id: cfg.id,
      label: cfg.label,
      model: ok ? await resolveModel() : model(),
      configured: ok,
      hint: cfg.hint,
    };
  }

  async function structured<T>(
    req: StructuredRequest<T>,
    override?: string,
    _ctx?: ProviderContext,
  ): Promise<StructuredResult<T>> {
    void _ctx;
    const key = apiKey();
    if (!key) {
      throw new ProviderError(`${cfg.label} is not configured. ${cfg.hint}.`, 400);
    }
    const client = new OpenAI({ apiKey: key, baseURL: baseURL() });
    const chosen = await resolveModel(override);
    const schema = toJsonSchema(req.schema);

    // Most servers accept a JSON schema. Older local servers only accept
    // json_object, and some accept neither, so degrade gracefully.
    const attempts: Array<{ format?: ResponseFormat; remind: boolean }> = [
      { format: { type: "json_schema", json_schema: { name: req.name, schema, strict: true } }, remind: false },
      { format: { type: "json_object" }, remind: true },
      { format: undefined, remind: true },
    ];

    let lastError: unknown;
    for (const attempt of attempts) {
      const system = attempt.remind
        ? `${req.system}\n\nRespond with a single JSON object and nothing else. It must match this JSON Schema:\n${JSON.stringify(schema)}`
        : req.system;
      const params = {
        model: chosen,
        messages: [
          { role: "system" as const, content: system },
          req.image
            ? {
                role: "user" as const,
                content: [
                  { type: "text" as const, text: req.user },
                  { type: "image_url" as const, image_url: { url: req.image } },
                ],
              }
            : { role: "user" as const, content: req.user },
        ],
        ...(attempt.format ? { response_format: attempt.format } : {}),
        ...(cfg.supportsReasoningEffort && req.effort ? { reasoning_effort: req.effort } : {}),
      };
      try {
        let text = "";
        let finish: string | null = null;
        if (req.onText) {
          const stream = await client.chat.completions.create({ ...params, stream: true });
          for await (const chunk of stream) {
            const choice = chunk.choices[0];
            if (!choice) continue;
            const delta = choice.delta?.content;
            if (delta) {
              text += delta;
              req.onText(text);
            }
            if (choice.finish_reason) finish = choice.finish_reason;
          }
        } else {
          const completion = await client.chat.completions.create(params);
          const choice = completion.choices[0];
          if (!choice) throw new ProviderError(`${cfg.label} returned no choices.`, 502);
          text = choice.message.content ?? "";
          finish = choice.finish_reason;
        }
        if (finish === "length") {
          throw new ProviderError(`${cfg.label} ran out of output tokens before finishing.`, 502);
        }
        const parsed = req.schema.safeParse(JSON.parse(extractJson(text)));
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          throw new ProviderError(
            `${cfg.label} returned JSON that did not match the schema (${issue?.path.join(".")}: ${issue?.message}).`,
            502,
          );
        }
        return { output: parsed.data, model: chosen };
      } catch (error) {
        lastError = error;
        // Only a rejected request shape is worth retrying with a looser format.
        if (error instanceof OpenAI.BadRequestError) continue;
        break;
      }
    }
    throw normalize(lastError, cfg.label, baseURL());
  }

  return { id: cfg.id, label: cfg.label, model, info, structured };
}

function normalize(error: unknown, label: string, baseURL?: string): Error {
  if (error instanceof ProviderError) return error;
  if (error instanceof OpenAI.AuthenticationError) {
    return new ProviderError(`${label} rejected the API key.`, 401);
  }
  if (error instanceof OpenAI.RateLimitError) {
    return new ProviderError(`${label} is rate limited. Try again in a moment.`, 429);
  }
  if (error instanceof OpenAI.NotFoundError) {
    return new ProviderError(`${label} could not find that model (${error.message}).`, 400);
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new ProviderError(`Could not reach ${label} at ${baseURL ?? "its API"}. Is it running?`, 503);
  }
  if (error instanceof OpenAI.APIError) {
    return new ProviderError(`${label} error ${error.status}: ${error.message}`, 502);
  }
  if (error instanceof SyntaxError) {
    return new ProviderError(`${label} returned invalid JSON.`, 502);
  }
  return error instanceof Error ? error : new Error(String(error));
}

async function reachable(url: string, apiKey?: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Model ids from an OpenAI-compatible `GET /models`, or [] if unreachable. */
async function listModels(url: string, apiKey?: string): Promise<string[]> {
  try {
    const res = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: Array<{ id?: string }> };
    return (body.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}
