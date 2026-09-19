import OpenAI from "openai";
import {
  type ReasoningEffort,
  DEFAULT_CODEX_BASE_URL,
  DEFAULT_MODEL,
  createCodexFetch,
  listCodexModels,
} from "@opencoredev/loginwithchatgpt-core";
import { toJsonSchema } from "@/lib/schema";
import { getChatGPTAuth, chatgptConfig, hasUsableCredentials, loadChatGPTAccount } from "@/lib/chatgpt/tokens";
import { extractJson } from "./openai-compatible";
import {
  ProviderError,
  type Provider,
  type ProviderContext,
  type ProviderInfo,
  type StructuredRequest,
  type StructuredResult,
} from "./types";

const model = () => process.env.CHATGPT_MODEL || DEFAULT_MODEL;
const modelCache = new Map<string, { expiresAt: number; models: string[] }>();

export function invalidateChatGPTModelCache(userId: string): void {
  modelCache.delete(userId);
}

function mapEffort(effort: StructuredRequest<unknown>["effort"]): ReasoningEffort | undefined {
  if (effort === "minimal") return "low";
  return effort;
}

async function info(ctx?: ProviderContext): Promise<ProviderInfo> {
  const loaded = ctx?.userId ? await loadChatGPTAccount(ctx.userId) : undefined;
  const configured = Boolean(loaded && hasUsableCredentials(loaded.credentials));
  return {
    id: "chatgpt",
    label: "ChatGPT",
    model: model(),
    configured,
    hint: "Sign in with ChatGPT to use your own plan",
  };
}

async function availableModels(userId: string, auth: { accessToken: string; accountId: string }) {
  const cached = modelCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.models;
  const models = await listCodexModels({
    config: chatgptConfig,
    getAuth: () => auth,
  });
  modelCache.set(userId, { models, expiresAt: Date.now() + 10 * 60 * 1000 });
  return models;
}

function chooseModel(override: string | undefined, available: string[]): string {
  const requested = override ?? model();
  if (available.includes(requested) || available.length === 0) return requested;
  return available.find((slug) => slug.includes("gpt-5")) ?? available[0] ?? requested;
}

async function structured<T>(
  req: StructuredRequest<T>,
  override?: string,
  ctx?: ProviderContext,
): Promise<StructuredResult<T>> {
  if (!ctx?.userId) throw new ProviderError("Sign in with ChatGPT first.", 401);
  const userId = ctx.userId;
  const auth = await getChatGPTAuth(userId);
  if (!auth) throw new ProviderError("Sign in with ChatGPT first.", 401);

  let available: string[];
  try {
    available = await availableModels(userId, auth);
  } catch (error) {
    throw normalize(error);
  }

  const chosen = chooseModel(override, available);
  const client = new OpenAI({
    apiKey: "chatgpt",
    baseURL: DEFAULT_CODEX_BASE_URL,
    fetch: createCodexFetch({
      config: chatgptConfig,
      getAuth: () => getChatGPTAuth(userId).then((value) => {
        if (!value) throw new ProviderError("Sign in with ChatGPT first.", 401);
        return value;
      }),
    }),
  });
  const schema = toJsonSchema(req.schema);
  const attempts = [
    { format: { type: "json_schema" as const, name: req.name, schema, strict: true }, reminder: false },
    { format: undefined, reminder: true },
  ];
  let lastError: unknown;

  for (const attempt of attempts) {
    const instructions = attempt.reminder
      ? `${req.system}\n\nRespond with a single JSON object and nothing else. It must match this JSON Schema:\n${JSON.stringify(schema)}`
      : req.system;
    try {
      const response = await client.responses.create({
        model: chosen,
        instructions,
        input: req.user,
        stream: true,
        ...(attempt.format ? { text: { format: attempt.format } } : {}),
        reasoning: mapEffort(req.effort) ? { effort: mapEffort(req.effort) } : undefined,
      });
      let text = "";
      for await (const event of response) {
        const item = event as {
          type?: string;
          delta?: string;
          message?: string;
          error?: { message?: string };
          response?: { error?: { message?: string } };
        };
        if (item.type === "response.output_text.delta" && item.delta) {
          text += item.delta;
          req.onText?.(text);
        } else if (item.type === "response.failed" || item.type === "error") {
          throw new ProviderError(
            item.message ?? item.error?.message ?? item.response?.error?.message ?? "ChatGPT response failed.",
            502,
          );
        }
      }
      const parsed = req.schema.safeParse(JSON.parse(extractJson(text)));
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new ProviderError(
          `ChatGPT returned JSON that did not match the schema (${issue?.path.join(".")}: ${issue?.message}).`,
          502,
        );
      }
      return { output: parsed.data, model: chosen };
    } catch (error) {
      lastError = error;
      if (error instanceof OpenAI.BadRequestError && !attempt.reminder) continue;
      break;
    }
  }
  throw normalize(lastError);
}

function normalize(error: unknown): ProviderError | Error {
  if (error instanceof ProviderError) return error;
  if (error instanceof OpenAI.AuthenticationError || (error instanceof OpenAI.APIError && (error.status === 401 || error.status === 403))) {
    return new ProviderError("ChatGPT rejected the session. Reconnect your ChatGPT account.", 401);
  }
  if (error instanceof OpenAI.RateLimitError || (error instanceof OpenAI.APIError && error.status === 429)) {
    return new ProviderError("ChatGPT is rate limited. Try again in a moment.", 429);
  }
  if (error instanceof OpenAI.APIError) {
    return new ProviderError(`ChatGPT error ${error.status}: ${error.message}`, 502);
  }
  const candidate = error as { code?: string; status?: number };
  if (candidate?.code === "refresh_token_invalid") {
    return new ProviderError("Your ChatGPT session expired. Reconnect your ChatGPT account.", 401);
  }
  if (candidate?.status === 401 || candidate?.status === 403) {
    return new ProviderError("ChatGPT rejected the session. Reconnect your ChatGPT account.", 401);
  }
  if (candidate?.status === 429) return new ProviderError("ChatGPT is rate limited. Try again in a moment.", 429);
  if (error instanceof SyntaxError) return new ProviderError("ChatGPT returned invalid JSON.", 502);
  return error instanceof Error ? error : new Error(String(error));
}

export const chatgptProvider: Provider = {
  id: "chatgpt",
  label: "ChatGPT",
  model,
  info,
  structured,
};
