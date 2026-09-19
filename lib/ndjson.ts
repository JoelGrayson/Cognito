export type StreamEvent = Record<string, unknown> & { type: string };

/** Reads a newline-delimited JSON body, calling `onEvent` for each line as it arrives. */
export async function readNdjson(res: Response, onEvent: (event: StreamEvent) => void): Promise<void> {
  if (!res.body) throw new Error("The server sent no response body.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const handle = (line: string) => {
    const trimmed = line.trim();
    if (trimmed) onEvent(JSON.parse(trimmed) as StreamEvent);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      handle(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
    }
  }
  handle(buffer);
}

/** Throws the server's error message for a non-2xx response. */
export async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return;
  let message = `Request failed (${res.status})`;
  try {
    const data = await res.json();
    if (typeof data?.error === "string") message = data.error;
  } catch {
    // no JSON body
  }
  throw new Error(message);
}
