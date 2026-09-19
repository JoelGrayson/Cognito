/**
 * Best-effort parse of a JSON document that is still being streamed.
 * Closes open strings, arrays and objects, and drops a dangling key or
 * half-written literal, so the caller can render what has arrived so far.
 * Returns undefined when nothing sensible can be recovered yet.
 */
export function parsePartialJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // fall through to repair
  }

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  if (stack.length === 0 && !inString) return undefined;

  let s = text;
  if (escaped) s = s.slice(0, -1);
  if (inString) s += '"';

  for (;;) {
    const before = s;
    s = s.replace(/[\s,]+$/, "");
    // A literal that has not finished arriving: tru, fals, nul ...
    s = s.replace(/(?<=[:[,\s])(?:t|tr|tru|f|fa|fal|fals|n|nu|nul)$/, "");
    // A key with no value yet: "name":
    s = s.replace(/"(?:[^"\\]|\\.)*"\s*:\s*$/, "");
    // A key with no colon yet, sitting directly inside an object.
    if (stack[stack.length - 1] === "{") s = s.replace(/([{,])\s*"(?:[^"\\]|\\.)*"$/, "$1");
    if (s === before) break;
  }

  for (let i = stack.length - 1; i >= 0; i--) s += stack[i] === "{" ? "}" : "]";
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}
