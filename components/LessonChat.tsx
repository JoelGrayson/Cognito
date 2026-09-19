"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ensureOk, readNdjson } from "@/lib/ndjson";
import type { ProviderId } from "@/lib/providers/types";
import type { ChatMessage, Lesson } from "@/lib/schema";
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
    <div className="chat-panel">
      <div ref={listRef} className="chat-messages">
        {messages.length === 0 && (
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
