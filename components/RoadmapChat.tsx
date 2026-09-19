"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ensureOk, readNdjson } from "@/lib/ndjson";
import type { ProviderId } from "@/lib/providers/types";
import type { ChatMessage, MindMap } from "@/lib/schema";
import { RichText } from "./RichText";

interface Props {
  topic: string;
  map: MindMap;
  providerId: ProviderId;
  /** The assistant revised the roadmap; the instruction that produced it comes along for the history. */
  onMapChange: (map: MindMap, instruction: string) => void;
  /** The roadmap is being generated, so changes have to wait. */
  busy?: boolean;
}

interface Entry extends ChatMessage {
  /** A status line ("Roadmap updated."), not part of the conversation. */
  note?: boolean;
  streaming?: boolean;
}

const SUGGESTIONS = ["Go deeper on the core", "I already know the basics", "Why this order?", "Make it shorter"];

/** Side panel on the roadmap: answers questions about the map and changes it on request. */
export function RoadmapChat({ topic, map, providerId, onMapChange, busy }: Props) {
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
    if (!content || sending || busy) return;
    const userMessage: ChatMessage = { role: "user", content };
    const prior: ChatMessage[] = messages.filter((m) => !m.note).map((m) => ({ role: m.role, content: m.content }));
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
      const res = await fetch("/api/mindmap/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, map, messages: history, provider: providerId }),
      });
      await ensureOk(res);
      let finished = false;
      await readNdjson(res, (event) => {
        if (event.type === "reply") {
          patchLast({ content: String(event.reply) });
        } else if (event.type === "done") {
          finished = true;
          patchLast({ content: String(event.reply), streaming: false });
          if (event.map) {
            setMessages((m) => [...m, { role: "assistant", content: "Roadmap updated.", note: true }]);
            onMapChange(event.map as MindMap, content);
          }
        } else if (event.type === "error") {
          throw new Error(String(event.error));
        }
      });
      if (!finished) throw new Error("The answer never finished.");
    } catch (err) {
      setMessages((m) =>
        m
          .filter((entry) => !(entry.streaming && !entry.content))
          .map((entry) => (entry.streaming ? { ...entry, streaming: false } : entry)),
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
            <p>Ask about this roadmap, or tell me how to change it.</p>
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
            <div key={i} className="chat-bubble assistant chat-typing" aria-label="Thinking">
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
          placeholder={busy ? "Writing the roadmap…" : "Ask or change the roadmap"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending || busy}
          autoComplete="off"
          aria-label="Ask about or change the roadmap"
        />
        <button type="submit" className="chat-send" disabled={sending || busy || !input.trim()} aria-label="Send">
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
