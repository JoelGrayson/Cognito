"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ProviderId } from "@/lib/providers/types";
import type { ChatMessage, Lesson } from "@/lib/schema";
import { trpc } from "@/lib/trpc";
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
  }, [messages, sending]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    const userMessage: ChatMessage = { role: "user", content };
    const prior: ChatMessage[] = messages
      .filter((m) => !m.note)
      .map((m) => ({ role: m.role, content: m.content }));
    const history = [...prior, userMessage].slice(-40);
    setMessages((m) => [...m, { role: "user", content }]);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const data = await trpc.tutor.mutate({ topic, lesson, messages: history, provider: providerId });
      const additions: Entry[] = [{ role: "assistant", content: data.reply }];
      if (data.lesson) additions.push({ role: "assistant", content: "Lesson updated.", note: true });
      setMessages((m) => [...m, ...additions]);
      if (data.lesson) onLessonChange(data.lesson);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-panel">
      <div ref={listRef} className="chat-messages">
        {messages.length === 0 && !sending && (
          <div className="chat-empty">
            <p>Ask anything about this lesson, or tell me to change it.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chat-chip" onClick={() => setInput(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.note ? (
            <p key={i} className="chat-note">
              {m.content}
            </p>
          ) : (
            <div key={i} className={`chat-bubble ${m.role}`}>
              <RichText text={m.content} />
            </div>
          ),
        )}
        {sending && (
          <div className="chat-bubble assistant chat-typing" aria-label="Tutor is thinking">
            <span />
            <span />
            <span />
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      <form onSubmit={send} className="chat-form">
        <input
          className="pill chat-input"
          placeholder="Questions?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
          autoComplete="off"
          aria-label="Ask the tutor"
        />
        <button type="submit" className="chat-send" disabled={sending || !input.trim()} aria-label="Send">
          {sending ? (
            <span className="spinner" />
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5" />
              <path d="M5 12l7-7 7 7" />
            </svg>
          )}
        </button>
      </form>
    </div>
  );
}
