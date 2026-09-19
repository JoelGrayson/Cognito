"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ProviderSelect } from "@/components/ProviderSelect";
import { Roadmap, RoadmapSkeleton } from "@/components/Roadmap";
import type { ProviderId, ProviderInfo } from "@/lib/providers/types";
import type { MindMap } from "@/lib/schema";

interface Meta {
  provider: string;
  model: string;
  ms: number;
}

interface GenerateBody {
  topic: string;
  provider: ProviderId;
  current?: MindMap;
  instruction?: string;
}

const EXAMPLES = ["Three-phase power", "Machine learning", "Rust", "Jazz piano"];

export default function Home() {
  const [topic, setTopic] = useState("");
  /** The topic being mapped. Null means the landing screen. */
  const [query, setQuery] = useState<string | null>(null);
  const [map, setMap] = useState<MindMap | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modification, setModification] = useState("");

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providerId, setProviderId] = useState<ProviderId>("anthropic");
  const abortRef = useRef<AbortController | null>(null);

  // Find out which providers this server can actually use.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/providers")
      .then((r) => r.json())
      .then((list: ProviderInfo[]) => {
        if (cancelled) return;
        setProviders(list);
        setProviderId((current) => {
          const chosen = list.find((p) => p.id === current);
          if (chosen?.configured) return current;
          return list.find((p) => p.configured)?.id ?? current;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const generate = useCallback(async (body: GenerateBody) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mindmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setMap(data.mindMap);
      setMeta({ provider: data.provider, model: data.model, ms: data.ms });
      return true;
    } catch (err) {
      if (controller.signal.aborted) return false;
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return false;
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, []);

  function startTopic(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setMap(null);
    setMeta(null);
    setModification("");
    void generate({ topic: trimmed, provider: providerId });
  }

  function onSubmitTopic(e: FormEvent) {
    e.preventDefault();
    startTopic(topic);
  }

  async function onSubmitModification(e: FormEvent) {
    e.preventDefault();
    if (!query || !map || !modification.trim() || loading) return;
    const ok = await generate({
      topic: query,
      provider: providerId,
      current: map,
      instruction: modification.trim(),
    });
    if (ok) setModification("");
  }

  function reset() {
    abortRef.current?.abort();
    setQuery(null);
    setMap(null);
    setMeta(null);
    setError(null);
    setLoading(false);
    setTopic("");
    setModification("");
  }

  const providerLabel = providers.find((p) => p.id === meta?.provider)?.label ?? meta?.provider;

  if (query === null) {
    return (
      <main className="flex flex-1 flex-col items-center px-4 pt-[10vh] sm:px-8">
        <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">StructuredLearning.ai</h1>

        <form onSubmit={onSubmitTopic} className="mt-[12vh] w-full max-w-3xl">
          <input
            className="pill px-7 py-4 text-xl sm:text-2xl"
            placeholder="What do you want to learn?"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            autoFocus
            autoComplete="off"
            aria-label="What do you want to learn?"
          />
        </form>

        <div className="mt-5 flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-2 text-sm text-neutral-500">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Try</span>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                className="rounded-full px-2 py-0.5 hover:bg-neutral-100 hover:text-neutral-800"
                onClick={() => startTopic(example)}
              >
                {example}
              </button>
            ))}
          </div>
          <ProviderSelect providers={providers} value={providerId} onChange={setProviderId} />
        </div>

        {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col px-4 pb-10 sm:px-8">
      <header className="flex items-center justify-between py-4">
        <button
          type="button"
          onClick={reset}
          className="text-sm text-neutral-500 hover:text-neutral-900"
        >
          StructuredLearning.ai
        </button>
        <ProviderSelect providers={providers} value={providerId} onChange={setProviderId} disabled={loading} />
      </header>

      <div className="mx-auto w-full max-w-4xl">
        <h1 className="mt-6 text-center text-4xl font-medium tracking-tight sm:text-5xl">
          {map?.topic ?? query}
        </h1>

        <div className="mt-12">
          {map && !loading ? <Roadmap map={map} /> : null}
          {map && loading ? (
            <div className="opacity-50 transition-opacity">
              <Roadmap map={map} />
            </div>
          ) : null}
          {!map && loading ? <RoadmapSkeleton /> : null}
          {!map && !loading && error ? (
            <div className="panel px-6 py-16 text-center">
              <p className="text-red-600">{error}</p>
              <button
                type="button"
                className="mt-4 text-sm text-neutral-600 underline underline-offset-4 hover:text-neutral-900"
                onClick={() => startTopic(query)}
              >
                Try again
              </button>
            </div>
          ) : null}
        </div>

        {map && (
          <p className="mt-4 text-center text-sm text-neutral-500">
            {map.summary}
            {meta && (
              <span className="text-neutral-400">
                {" "}· {providerLabel} · {meta.model} · {(meta.ms / 1000).toFixed(1)}s
              </span>
            )}
          </p>
        )}

        {map && error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}

        <form onSubmit={onSubmitModification} className="relative mt-10">
          <input
            className="pill py-5 pl-7 pr-20 text-xl sm:text-2xl"
            placeholder="Enter modifications"
            value={modification}
            onChange={(e) => setModification(e.target.value)}
            disabled={!map}
            autoComplete="off"
            aria-label="Enter modifications"
          />
          <button
            type="submit"
            disabled={!map || loading || !modification.trim()}
            aria-label="Apply modifications"
            className="absolute right-2.5 top-1/2 flex h-[52px] w-[52px] -translate-y-1/2 items-center justify-center rounded-full bg-[var(--accent)] text-white transition-opacity hover:opacity-90 disabled:opacity-40 sm:h-[60px] sm:w-[60px]"
          >
            {loading ? (
              <span className="spinner" />
            ) : (
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5" />
                <path d="M5 12l7-7 7 7" />
              </svg>
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
