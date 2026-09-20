"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ChatGPTConnect } from "@/components/ChatGPTConnect";
import { ProviderSelect } from "@/components/ProviderSelect";
import { ensureAnonymousSession } from "@/lib/auth-client";
import { topicPath } from "@/lib/legacy-paths";
import type { ProviderId, ProviderInfo } from "@/lib/providers/types";
import { trpc } from "@/lib/trpc";

const EXAMPLES = ["Three-phase power", "Machine learning", "Rust", "Jazz piano"];

/** Asks what to learn, then opens the new roadmap's page, which writes it. */
export function LegacyHome() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  /** Optional context typed under the topic: the goal and what the learner already knows. */
  const [details, setDetails] = useState("");
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providerId, setProviderId] = useState<ProviderId>("openai");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshProviders = useCallback(
    () =>
      trpc.providers.query().then((list) => {
        setProviders(list);
        setProviderId((current) => {
          if (list.find((p) => p.id === current)?.configured) return current;
          return list.find((p) => p.configured)?.id ?? current;
        });
      }),
    [],
  );

  // Find out which providers this server can actually use.
  useEffect(() => {
    refreshProviders().catch(() => {});
  }, [refreshProviders]);

  async function start(value: string, extra = "") {
    const trimmed = value.trim();
    if (!trimmed || starting) return;
    setStarting(true);
    setError(null);
    try {
      await ensureAnonymousSession();
      const roadmap = await trpc.legacy.create.mutate({
        topic: trimmed,
        details: extra.trim() || undefined,
        provider: providerId,
      });
      router.push(topicPath(roadmap.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStarting(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void start(topic, details);
  }

  return (
    <main className="relative flex flex-1 flex-col items-center px-4 pt-[10vh] sm:px-8">
      <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">Cognition</h1>

      <form onSubmit={onSubmit} className="mt-[12vh] w-full max-w-3xl">
        <div className="relative">
          <input
            className="pill py-4 pl-7 pr-16 text-xl sm:pr-[72px] sm:text-2xl"
            placeholder="What do you want to learn?"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            autoFocus
            autoComplete="off"
            aria-label="What do you want to learn?"
          />
          <button
            type="submit"
            disabled={!topic.trim() || starting}
            aria-label="Start roadmap"
            title="Start roadmap"
            className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--accent)] text-white transition-opacity hover:opacity-90 disabled:opacity-40 sm:h-12 sm:w-12"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5" />
              <path d="M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
        {(topic.trim() || details.trim()) && (
          <div className="details-box">
            <textarea
              className="details-input"
              placeholder="Add more details for what you want to learn and what you already know."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              rows={3}
              maxLength={2000}
              aria-label="Details: what you want to learn and what you already know"
            />
            <p className="details-hint">Press ↑, Enter in the topic, or ⌘ Enter here, to start</p>
          </div>
        )}
      </form>

      <div className="mt-5 flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-2 text-sm text-neutral-500">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>Try</span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className="rounded-full px-2 py-0.5 hover:bg-neutral-100 hover:text-neutral-800"
              onClick={() => void start(example)}
            >
              {example}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProviderSelect providers={providers} value={providerId} onChange={setProviderId} disabled={starting} />
          <ChatGPTConnect
            onConnected={() => void refreshProviders().then(() => setProviderId("chatgpt"))}
            onDisconnected={() => void refreshProviders()}
          />
        </div>
      </div>

      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
    </main>
  );
}
