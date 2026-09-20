"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ensureOk, readNdjson } from "@/lib/ndjson";
import type { ProviderId } from "@/lib/providers/types";
import type { ChatMessage, Lesson } from "@/lib/schema";
import { ArrowUp, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RichText } from "./RichText";

interface Props {
  topic: string;
  lesson: Lesson;
  providerId: ProviderId;
  /** Called when the tutor rewrote the lesson. */
  onLessonChange: (lesson: Lesson) => void;
}

interface Entry extends ChatMessage {
  /** A status line ("Lesson updated."), not part of the conversation. */
  note?: boolean;
  /** Still being written. */
  streaming?: boolean;
}

const SUGGESTIONS = ["Explain this more simply", "Add a worked example", "Why does this matter?"];

/** Tutor panel: answers questions about the lesson and can rewrite it on request. */
export function LessonChat({ topic, lesson, providerId, onLessonChange }: Props) {
  const [messages, setMessages] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    const userMessage: ChatMessage = { role: "user", content };
    const prior: ChatMessage[] = messages
      .filter((m) => !m.note)
      .map((m) => ({ role: m.role, content: m.content }));
    const history = [...prior, userMessage].slice(-40);
    setMessages((m) => [...m, userMessage, { role: "assistant", content: "", streaming: true }]);
    setInput("");
    setSending(true);
    setError(null);
    const patchLast = (patch: Partial<Entry>) =>
      setMessages((m) => {
        const copy = m.slice();
        const i = copy.length - 1;
        if (i >= 0) copy[i] = { ...copy[i], ...patch };
        return copy;
      });
    try {
      const res = await fetch("/api/lesson/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, lesson, messages: history, provider: providerId }),
      });
      await ensureOk(res);
      let finished = false;
      await readNdjson(res, (event) => {
        if (event.type === "reply") {
          patchLast({ content: String(event.reply) });
        } else if (event.type === "done") {
          finished = true;
          patchLast({ content: String(event.reply), streaming: false });
          if (event.lesson) {
            setMessages((m) => [...m, { role: "assistant", content: "Lesson updated.", note: true }]);
            onLessonChange(event.lesson as Lesson);
          }
        } else if (event.type === "error") {
          throw new Error(String(event.error));
        }
      });
      if (!finished) throw new Error("The tutor never finished.");
    } catch (err) {
      // Drop an empty placeholder bubble; keep whatever partial text arrived.
      setMessages((m) =>
        m.filter((entry) => !(entry.streaming && !entry.content)).map((entry) =>
          entry.streaming ? { ...entry, streaming: false } : entry,
        ),
      );
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card size="sm" className="flex h-[min(720px,calc(100vh-140px))] min-h-[380px] flex-col gap-0 py-0">
      <CardHeader className="border-b py-3">
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="size-4 text-primary" aria-hidden="true" />
          Tutor
        </CardTitle>
      </CardHeader>
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="my-auto text-sm text-muted-foreground">
            <p>Ask anything about this lesson, or tell me to change it.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} type="button" variant="outline" size="sm" className="rounded-full font-normal" onClick={() => setInput(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.note ? (
            <p key={i} className="self-center text-xs text-muted-foreground">
              {m.content}
            </p>
          ) : m.streaming && !m.content ? (
            <div key={i} className="chat-bubble assistant chat-typing" aria-label="Tutor is thinking">
              <span />
              <span />
              <span />
            </div>
          ) : (
            <div key={i} className={`chat-bubble ${m.role}`}>
              <RichText text={m.content} />
              {m.streaming && <span className="stream-cursor" aria-hidden="true" />}
            </div>
          ),
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <form onSubmit={send} className="flex items-center gap-2 border-t p-3">
        <Input
          className="h-10 flex-1 rounded-full px-4"
          placeholder="Questions?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
          autoComplete="off"
          aria-label="Ask the tutor"
        />
        <Button type="submit" size="icon-lg" className="rounded-full" disabled={sending || !input.trim()} aria-label="Send">
          {sending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
        </Button>
      </form>
    </Card>
  );
}
