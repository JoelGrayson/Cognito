import { BadRequest } from "@/lib/api";
import { ProviderError } from "@/lib/providers";

export type Emit = (event: Record<string, unknown>) => void;

/**
 * A newline-delimited JSON response. `produce` runs after the headers are
 * sent, so anything it throws is reported as a final {type:"error"} line.
 */
export function ndjson(produce: (emit: Emit) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit: Emit = (event) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true;
        }
      };
      try {
        await produce(emit);
      } catch (error) {
        emit({ type: "error", error: describe(error) });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

function describe(error: unknown): string {
  if (error instanceof ProviderError || error instanceof BadRequest) return error.message;
  console.error("stream failed", error);
  return error instanceof Error ? error.message : "Request failed.";
}

/** Drops partial updates that arrive faster than `ms`; callers emit the final one themselves. */
export function throttle(emit: Emit, ms = 80): Emit {
  let last = 0;
  return (event) => {
    const now = Date.now();
    if (now - last < ms) return;
    last = now;
    emit(event);
  };
}
