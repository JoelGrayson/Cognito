"use client";

import { Streamdown } from "streamdown";

export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <Streamdown className={`prose-lite ${className ?? ""}`.trim()}>{text}</Streamdown>
  );
}
