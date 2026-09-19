import { Fragment, type ReactNode } from "react";

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "code"; text: string };

/** Everything after a list marker, or the line itself. */
function withoutMarker(line: string): string {
  return line.replace(/^(?:[-*\u2022]|\d+[.)])\s+/, "");
}

/** Paragraphs, bullet / numbered lists, code blocks and stray headings; nothing fancier. */
function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  const pushItem = (kind: "ul" | "ol", item: string) => {
    flush();
    const last = blocks[blocks.length - 1];
    if (last && last.kind === kind) last.items.push(item);
    else blocks.push({ kind, items: [item] });
  };

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n];
    const line = raw.trim();

    // A fenced code block. While streaming, an unclosed fence runs to the end.
    if (line.startsWith("```")) {
      flush();
      const code: string[] = [];
      for (n += 1; n < lines.length && !lines[n].trim().startsWith("```"); n++) code.push(lines[n]);
      blocks.push({ kind: "code", text: dedent(code).join("\n") });
      continue;
    }

    // Multi-line code a model wrapped in single backticks, often after a bullet:
    // "- `fn main() {" ... "}`". An opening backtick with no closing one on the
    // same line starts it; the next line holding a backtick ends it.
    const opened = withoutMarker(line);
    if (opened.startsWith("`") && !opened.startsWith("```") && (opened.match(/`/g) ?? []).length % 2 === 1) {
      let end = n + 1;
      while (end < lines.length && !lines[end].includes("`")) end++;
      if (end < lines.length) {
        flush();
        const code = [opened.slice(1), ...lines.slice(n + 1, end), lines[end].replace(/`\s*$/, "")];
        blocks.push({ kind: "code", text: dedent(code.filter((l, i) => l.trim() || (i > 0 && i < code.length - 1))).join("\n") });
        n = end;
        continue;
      }
    }

    if (!line) {
      flush();
      continue;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      pushItem("ul", bullet[1]);
      continue;
    }
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      pushItem("ol", numbered[1]);
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "h", text: heading[1] });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

/** Drop the indentation every non-blank line shares. */
function dedent(lines: string[]): string[] {
  const indents = lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)![0].length);
  const common = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(common));
}

/** **bold** and `code` inside a line. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={`prose-lite ${className ?? ""}`.trim()}>
      {parseBlocks(text).map((block, i) => {
        switch (block.kind) {
          case "p":
            return <p key={i}>{inline(block.text)}</p>;
          case "h":
            return (
              <p key={i} className="font-semibold">
                {inline(block.text)}
              </p>
            );
          case "ul":
            return (
              <ul key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </ol>
            );
          case "code":
            return (
              <pre key={i}>
                <code>{block.text}</code>
              </pre>
            );
        }
      })}
    </div>
  );
}
