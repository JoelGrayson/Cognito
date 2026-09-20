/**
 * Jev, TypeSafe's System One model: typed decisions instead of text.
 *
 * A request carries a `state` (what to judge) and a map of questions, each a
 * noul (yes/no probability), a choice (one of a fixed option set) or a score
 * (position on an ordered rubric). Every answer comes back with calibrated
 * probabilities, so THRESHOLDS are the point: branch on the number, and keep a
 * fallback for whatever sits below your threshold.
 *
 * Jev writes nothing, so it never replaces a provider in `lib/providers`; it
 * decides, and a provider generates when generation is needed.
 *
 * MOCK_AI=true answers from `mockJev` without a network call. MOCK_JEV_FAIL=true
 * makes every call fail, to exercise the caller's fallback.
 */
import { z } from "zod";
import { mockJev } from "./mock/jev";
import { JEV_MODEL } from "./models";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const TIMEOUT_MS = 10000;
/** 429 and 529 are the documented retryable statuses. */
const RETRY_STATUSES = new Set([429, 529]);
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 250;

/** Text, a record, or a list of items. Jev reads text only: no images or audio. */
export type JevState = string | Record<string, unknown> | unknown[];

/**
 * The question itself, or an object holding the question in one field and the
 * data it refers to in others (referenced from the question in `backticks`).
 */
export type JevInstructions = string | Record<string, unknown>;

export interface NoulQuestion {
  type: "noul";
  instructions: JevInstructions;
  /** What a yes (near 1) and a no (near 0) mean. */
  criteria?: { true?: string; false?: string };
}

export interface ChoiceQuestion<K extends string = string> {
  type: "choice";
  instructions: JevInstructions;
  /** Option to rubric description, or null where the name says enough. Max 255. */
  criteria: Record<K, string | null>;
}

export interface ScoreQuestion {
  type: "score";
  instructions: JevInstructions;
  /** Ordered level descriptions, lowest first. Two to ten of them. */
  criteria: readonly string[];
}

export type JevQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export function noul(instructions: JevInstructions, criteria?: NoulQuestion["criteria"]): NoulQuestion {
  return criteria ? { type: "noul", instructions, criteria } : { type: "noul", instructions };
}

export function choice<K extends string>(
  instructions: JevInstructions,
  criteria: Record<K, string | null>,
): ChoiceQuestion<K> {
  return { type: "choice", instructions, criteria };
}

export function score<const C extends readonly string[]>(
  instructions: JevInstructions,
  criteria: C,
): ScoreQuestion {
  return { type: "score", instructions, criteria };
}

export interface NoulAnswer {
  type: "noul";
  /** Probability the answer is yes, 0 to 1. */
  noul: number;
}

export interface ChoiceAnswer<K extends string = string> {
  type: "choice";
  /** The highest-probability option. */
  choice: K;
  probabilities: Record<K, number>;
  confidence: number;
}

export interface ScoreAnswer {
  type: "score";
  /** Probability-weighted level; lands between levels when the model is torn. */
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
}

type AnswerFor<Q> = Q extends NoulQuestion
  ? NoulAnswer
  : Q extends ChoiceQuestion<infer K>
    ? ChoiceAnswer<K>
    : Q extends ScoreQuestion
      ? ScoreAnswer
      : never;

export type JevAnswers<Q extends Record<string, JevQuestion>> = { [K in keyof Q]: AnswerFor<Q[K]> };

export interface JevResult<Q extends Record<string, JevQuestion>> {
  answers: JevAnswers<Q>;
  /** The versioned model that answered, e.g. "jev-1.13.0". Log it: thresholds are tuned per version. */
  model: string;
  ms: number;
}

const AnswerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("noul"), noul: z.number() }),
  z.object({
    type: z.literal("choice"),
    choice: z.string(),
    probabilities: z.record(z.string(), z.number()),
    confidence: z.number(),
  }),
  z.object({
    type: z.literal("score"),
    score: z.number(),
    legend: z.record(z.string(), z.string()),
    probabilities: z.record(z.string(), z.number()),
    confidence: z.number(),
  }),
]);

const ResponseSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), AnswerSchema),
});

export class JevError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "JevError";
  }
}

export function jevConfigured(): boolean {
  return isMockJev() || Boolean(process.env.TYPESAFE_API_KEY);
}

const isMockJev = () => process.env.MOCK_AI === "true";

export interface AskOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * One evaluation of `state` against every question, answered in parallel.
 * Throws JevError when the key is missing or the API never answers; callers
 * that have a cheaper path should use `tryAsk` instead.
 */
export async function ask<Q extends Record<string, JevQuestion>>(
  state: JevState,
  questions: Q,
  options: AskOptions = {},
): Promise<JevResult<Q>> {
  const started = Date.now();
  if (isMockJev()) {
    if (process.env.MOCK_JEV_FAIL === "true") throw new JevError("Mock Jev failure.");
    return { answers: await mockJev(questions), model: `${JEV_MODEL}-mock`, ms: Date.now() - started };
  }

  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new JevError("Set TYPESAFE_API_KEY in .env.local to use Jev.", 401);
  if (Object.keys(questions).length === 0) throw new JevError("A Jev request needs at least one question.", 422);

  const body = JSON.stringify({ model: JEV_MODEL, state, questions });
  let last: JevError | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await post(key, body, options).catch((error: unknown) => {
      last = new JevError(error instanceof Error ? error.message : String(error));
      return null;
    });
    if (res?.ok) {
      const parsed = ResponseSchema.safeParse(await res.json());
      if (!parsed.success) throw new JevError("Jev returned an unexpected body.");
      return { answers: parsed.data.answers as JevAnswers<Q>, model: parsed.data.model, ms: Date.now() - started };
    }
    if (res) {
      last = new JevError(`Jev request failed with ${res.status}.`, res.status);
      if (!RETRY_STATUSES.has(res.status)) break;
    }
    if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_MS * 2 ** (attempt - 1));
  }
  throw last ?? new JevError("Jev request failed.");
}

/** `ask`, with failure as null: for the callers that keep working without a decision. */
export async function tryAsk<Q extends Record<string, JevQuestion>>(
  state: JevState,
  questions: Q,
  options: AskOptions = {},
): Promise<JevResult<Q> | null> {
  try {
    return await ask(state, questions, options);
  } catch (error) {
    console.warn("[jev]", error instanceof Error ? error.message : error);
    return null;
  }
}

async function post(key: string, body: string, options: AskOptions): Promise<Response> {
  return fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body,
    signal: options.signal ?? AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
    cache: "no-store",
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
