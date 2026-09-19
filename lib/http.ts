import type { z } from "zod";

// Error bodies are always `{ errors: string[] }`. Never include stack traces.
export function jsonError(errors: string[], status: number): Response {
  return Response.json({ errors }, { status });
}

export function serverError(err: unknown): Response {
  console.error("[api]", err instanceof Error ? err.message : err);
  return jsonError(["Something went wrong. Please try again."], 500);
}

export function zodErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

/** Reads the JSON body and validates it. Returns a ready-made 400 on failure. */
export async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<Parsed<z.output<S>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: jsonError(["Request body must be valid JSON."], 400) };
  }
  const result = schema.safeParse(raw);
  if (!result.success) return { ok: false, response: jsonError(zodErrors(result.error), 400) };
  return { ok: true, data: result.data };
}
