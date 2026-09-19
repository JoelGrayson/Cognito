import { NextResponse } from "next/server";
import type { z } from "zod";
import { PROVIDERS, ProviderError, isProviderId, type Provider } from "@/lib/providers";

/** A request the client got wrong; the message goes straight back to them. */
export class BadRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequest";
  }
}

/** Wraps a route handler so thrown BadRequest / ProviderError become JSON errors. */
export function apiHandler(fn: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      return await fn(request);
    } catch (error) {
      if (error instanceof BadRequest) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error instanceof ProviderError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error("request failed", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Request failed." },
        { status: 500 },
      );
    }
  };
}

/** Parse the JSON body against a schema, or throw a BadRequest naming the first problem. */
export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new BadRequest("Request body must be JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? issue.path.join(".") : "body";
    throw new BadRequest(`Invalid request (${where}: ${issue?.message ?? "invalid"}).`);
  }
  return parsed.data;
}

export function providerFrom(id: unknown): Provider {
  if (!isProviderId(id)) throw new BadRequest("Unknown provider.");
  return PROVIDERS[id];
}
