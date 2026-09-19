"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { LessonView, type LessonState } from "@/components/Lesson";
import { ProviderSelect } from "@/components/ProviderSelect";
import { ChatGPTConnect } from "@/components/ChatGPTConnect";
import { Roadmap, RoadmapLegend, RoadmapSkeleton } from "@/components/Roadmap";
import { RoadmapChat } from "@/components/RoadmapChat";
import { emptyDraft, type LessonDraft, type OutlineDraft } from "@/lib/drafts";
import { ensureOk, readNdjson } from "@/lib/ndjson";
import { RichText } from "@/components/RichText";
import { readSettings } from "@/lib/settings";
import type { ProviderId, ProviderInfo } from "@/lib/providers/types";
import { ensureAnonymousSession } from "@/lib/auth-client";
import { findRef, lessonKey, nodeAt, type NodeRef } from "@/lib/roadmap";
import {
  deleteRoadmap,
  listRoadmaps,
  loadLesson as loadSavedLesson,
  loadMap,
  loadRoadmap,
  newRoadmapId,
  roadmapStorageKey,
  roadmapsVersion,
  roadmapUrl,
  ROADMAP_PATH,
  saveLesson,
  saveMap,
  subscribeRoadmaps,
} from "@/lib/saved-roadmaps";
import { asList, type Lesson, type MapNode, type MindMap, type Resource, type Video } from "@/lib/schema";
import { trpc } from "@/lib/trpc";

interface Meta {
  provider: string;
  model: string;
  ms: number;
}

interface GenerateBody {
  topic: string;
  details?: string;
  provider: ProviderId;
  current?: MindMap;
  instruction?: string;
}

const EXAMPLES = ["Three-phase power", "Machine learning", "Rust", "Jazz piano"];

/** Lessons written at once by "Generate all". Each lesson already makes several calls in parallel. */
const BULK_CONCURRENCY = 3;

export default function Home() {
  const [topic, setTopic] = useState("");
  /** Optional context typed under the topic: the goal and what the learner already knows. */
  const [details, setDetails] = useState("");
  /** The details the current roadmap was made with; revisions send them again. */
  const [queryDetails, setQueryDetails] = useState("");
  /** The topic being mapped. Null means the landing screen. */
  const [query, setQuery] = useState<string | null>(null);
  const [map, setMap] = useState<MindMap | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** True while `map` is a partial roadmap still streaming in. */
  const [mapDraft, setMapDraft] = useState(false);

  /** The block whose lesson is open. Null means the roadmap view. */
  const [selected, setSelected] = useState<NodeRef | null>(null);
  /** Lessons already generated, by node name. */
  const [lessons, setLessons] = useState<Record<string, LessonState>>({});

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providerId, setProviderId] = useState<ProviderId>("openai");
  const abortRef = useRef<AbortController | null>(null);
  /** Mirrors `selected` for callbacks that must not re-create on every selection. */
  const selectedRef = useRef<NodeRef | null>(null);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  /** Id of the current map in this browser's storage; lesson links point at it. */
  const [roadmapId, setRoadmapId] = useState<string | null>(null);
  const roadmapIdRef = useRef<string | null>(null);
  useEffect(() => {
    roadmapIdRef.current = roadmapId;
  }, [roadmapId]);
  /** Maps this tab generated. Only these are written to storage; other tabs add lessons. */
  const ownedIds = useRef(new Set<string>());
  /** The change the learner asked for, by id of the revised map it produced. */
  const instructions = useRef(new Map<string, string>());
  /** Roadmaps saved in this browser, for the home page. -1 on the server, which has no storage. */
  const savedVersion = useSyncExternalStore(subscribeRoadmaps, roadmapsVersion, () => -1);
  /** This tab was opened from a lesson link while the map was still streaming in its original tab. */
  const [remoteDraft, setRemoteDraft] = useState(false);
  /** Set once the address has been read, so the address is not overwritten before that. */
  const restoredRef = useRef(false);
  /** Lessons already written to storage, as `${roadmapId}:${lessonKey}`, so each is written once. */
  const savedLessons = useRef(new Map<string, Lesson>());
  /** Mirrors `lessons` for the "Generate all" workers, which run across many renders. */
  const lessonsRef = useRef(lessons);
  useEffect(() => {
    lessonsRef.current = lessons;
  }, [lessons]);
  /** Progress of "Generate all"; null when it is not running. */
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const bulkAbortRef = useRef<AbortController | null>(null);

  const refreshProviders = useCallback(() => {
    return trpc.providers.query().then((list) => {
      setProviders(list);
      setProviderId((current) => {
        const chosen = list.find((p) => p.id === current);
        if (chosen?.configured) return current;
        return list.find((p) => p.configured)?.id ?? current;
      });
    });
  }, []);

  // Find out which providers this server can actually use.
  useEffect(() => {
    let cancelled = false;
    refreshProviders()
      .then(() => {
        if (cancelled) return;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshProviders]);

  /** Generate or revise the roadmap, showing stages as they stream in. `fallback` is restored on failure. */
  const generate = useCallback(async (body: GenerateBody, fallback: MindMap | null) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    // Lessons being written in bulk were planned against the old map.
    bulkAbortRef.current?.abort();
    bulkAbortRef.current = null;
    setBulk(null);
    const previousId = roadmapIdRef.current;
    const id = newRoadmapId();
    ownedIds.current.add(id);
    if (body.instruction) instructions.current.set(id, body.instruction);
    setRoadmapId(id);
    setRemoteDraft(false);
    setLoading(true);
    setError(null);
    setMapDraft(false);
    try {
      await ensureAnonymousSession();
      if (controller.signal.aborted) return null;
      const res = await fetch("/api/mindmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      await ensureOk(res);
      let finished = false;
      let finalMap: MindMap | null = null;
      await readNdjson(res, (event) => {
        if (controller.signal.aborted) return;
        if (event.type === "partial") {
          setMap(event.mindMap as MindMap);
          setMapDraft(true);
        } else if (event.type === "done") {
          finished = true;
          finalMap = event.mindMap as MindMap;
          setMap(finalMap);
          setMapDraft(false);
          setMeta({ provider: String(event.provider), model: String(event.model), ms: Number(event.ms) });
        } else if (event.type === "error") {
          throw new Error(String(event.error));
        }
      });
      if (!finished || !finalMap) throw new Error("The roadmap never finished.");
      return finalMap;
    } catch (err) {
      if (controller.signal.aborted) return null;
      // A lesson may be open on a block that already streamed in. For a fresh map, keep what
      // arrived. For a failed revision the old map comes back, so close the lesson instead of
      // leaving it pointed at a block that may no longer exist.
      if (fallback) {
        setMap(fallback);
        setSelected(null);
        setRoadmapId(previousId);
      } else {
        setMap((current) => (selectedRef.current && current?.stages.length ? current : null));
        if (!selectedRef.current) setRoadmapId(null);
      }
      setMapDraft(false);
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return null;
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, []);

  const loadLesson = useCallback(
    async (ref: NodeRef, currentMap: MindMap, currentTopic: string, provider: ProviderId, signal?: AbortSignal) => {
      const at = nodeAt(currentMap, ref);
      if (!at) return;
      const key = lessonKey(at.node);
      let draft = emptyDraft(at.node);
      const show = (next: LessonDraft) => {
        draft = next;
        setLessons((s) => ({ ...s, [key]: { status: "streaming", draft: next } }));
      };
      setLessons((s) => ({ ...s, [key]: { status: "loading" } }));
      try {
        const res = await fetch("/api/lesson", {
          method: "POST",
          signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: currentTopic,
            node: at.node,
            phase: at.phase,
            map: currentMap,
            provider,
          }),
        });
        await ensureOk(res);
        let finished = false;
        await readNdjson(res, (event) => {
          switch (event.type) {
            case "outline": {
              const o = event.outline as OutlineDraft;
              show({
                ...draft,
                title: o.title || at.node.name,
                summary: o.summary || at.node.description,
                tldr: o.tldr,
                sections: o.sections.map((sec, i) => ({
                  heading: sec.heading,
                  body: draft.sections[i]?.body ?? "",
                  done: draft.sections[i]?.done ?? false,
                })),
                keyTakeaways: o.keyTakeaways,
              });
              break;
            }
            case "section": {
              const index = Number(event.index);
              const sections = draft.sections.slice();
              sections[index] = {
                heading: sections[index]?.heading ?? "",
                body: String(event.body),
                done: Boolean(event.done),
              };
              show({ ...draft, sections });
              break;
            }
            case "resources":
              show({ ...draft, resources: event.resources as Resource[] });
              break;
            case "video":
              show({ ...draft, video: event.video as Video });
              break;
            case "done":
              finished = true;
              setLessons((s) => ({ ...s, [key]: { status: "ready", lesson: event.lesson as Lesson } }));
              break;
            case "error":
              throw new Error(String(event.error));
          }
        });
        if (!finished) throw new Error("The lesson never finished.");
      } catch (err) {
        if (signal?.aborted) {
          // Stopped on purpose: forget the half-written lesson so opening the block starts it again.
          setLessons((s) => {
            if (s[key]?.status === "ready") return s;
            const next = { ...s };
            delete next[key];
            return next;
          });
          return;
        }
        const message = err instanceof Error ? err.message : "Something went wrong.";
        const partial = draft.sections.length > 0 ? draft : undefined;
        setLessons((s) => ({ ...s, [key]: { status: "error", message, draft: partial } }));
      }
    },
    [],
  );

  /** Rebuild the page from a lesson link (`?r=<id>&lesson=<name>`) opened in a new tab. */
  // Only read on the home page, where the list is shown.
  const history = useMemo(
    () => (query === null && savedVersion >= 0 ? listRoadmaps() : []),
    [query, savedVersion],
  );

  const restoreFromAddress = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("r");
    if (!id) return;
    const saved = loadRoadmap(id);
    if (!saved) {
      setError("That roadmap isn't saved in this browser. Start it again below.");
      return;
    }
    setQuery(saved.topic);
    setQueryDetails(saved.details ?? "");
    setMap(saved.map);
    setRoadmapId(id);
    setProviderId(saved.provider);
    setRemoteDraft(!saved.complete);
    for (const [key, lesson] of Object.entries(saved.lessons)) savedLessons.current.set(`${id}:${key}`, lesson);
    setLessons(
      Object.fromEntries(
        Object.entries(saved.lessons).map(([key, lesson]) => [key, { status: "ready", lesson } as LessonState]),
      ),
    );
    const key = params.get("lesson");
    const ref = key ? findRef(saved.map, key) : null;
    if (key && ref) {
      setSelected(ref);
      if (!saved.lessons[key]) void loadLesson(ref, saved.map, saved.topic, saved.provider);
    }
  }, [loadLesson]);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    // Reading the address and localStorage has to wait until after mount: the server render has neither.
    restoreFromAddress();
  }, [restoreFromAddress]);

  // Keep the address pointing at what is on screen, so it can be reloaded or shared across tabs.
  useEffect(() => {
    if (!restoredRef.current) return;
    const at = map && selected ? nodeAt(map, selected) : null;
    const url = roadmapId && map ? roadmapUrl(roadmapId, at ? lessonKey(at.node) : undefined) : ROADMAP_PATH;
    if (url !== window.location.pathname + window.location.search) window.history.replaceState(null, "", url);
  }, [roadmapId, map, selected]);

  // Save what lesson links opened in new tabs need to rebuild the page. The tab that
  // generated a map saves it, including while it streams; any tab saves finished lessons.
  useEffect(() => {
    if (!roadmapId || !query || !map || !ownedIds.current.has(roadmapId)) return;
    saveMap(roadmapId, {
      topic: query,
      provider: providerId,
      map,
      complete: !loading,
      instruction: instructions.current.get(roadmapId),
      details: queryDetails || undefined,
    });
  }, [roadmapId, query, queryDetails, map, loading, providerId]);

  useEffect(() => {
    if (!roadmapId) return;
    for (const [key, state] of Object.entries(lessons)) {
      if (state.status !== "ready") continue;
      const tag = `${roadmapId}:${key}`;
      if (savedLessons.current.get(tag) === state.lesson) continue;
      savedLessons.current.set(tag, state.lesson);
      saveLesson(roadmapId, key, state.lesson);
    }
  }, [roadmapId, lessons]);

  // Opened mid-stream from another tab: follow that tab's map until it finishes.
  useEffect(() => {
    if (!remoteDraft || !roadmapId) return;
    const key = roadmapStorageKey(roadmapId);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      const saved = loadMap(roadmapId);
      if (!saved) return;
      setMap(saved.map);
      if (saved.complete) setRemoteDraft(false);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [remoteDraft, roadmapId]);

  /** Address of a block's lesson, for opening it in a new tab. */
  function lessonHref(ref: NodeRef): string | undefined {
    if (!roadmapId || !map) return undefined;
    const at = nodeAt(map, ref);
    return at ? roadmapUrl(roadmapId, lessonKey(at.node)) : undefined;
  }

  /** Write every lesson that is not written yet, a few at a time, in roadmap order. */
  async function generateAll(currentMap = map, currentTopic = query, provider = providerId) {
    if (!currentMap || !currentTopic || bulkAbortRef.current) return;
    const id = roadmapIdRef.current;
    const needsLesson = (ref: NodeRef) => {
      const at = nodeAt(currentMap, ref);
      const state = at ? lessonsRef.current[lessonKey(at.node)] : undefined;
      return !!at && (!state || state.status === "error");
    };
    const queue = allRefs(currentMap).filter(needsLesson);
    if (queue.length === 0) return;

    const controller = new AbortController();
    bulkAbortRef.current = controller;
    const total = queue.length;
    let done = 0;
    setBulk({ done, total });

    const worker = async () => {
      for (let ref = queue.shift(); ref && !controller.signal.aborted; ref = queue.shift()) {
        // Skip blocks opened by hand or written by another tab since the queue was built.
        if (needsLesson(ref)) {
          const at = nodeAt(currentMap, ref)!;
          const key = lessonKey(at.node);
          const saved = id ? loadSavedLesson(id, key) : null;
          if (saved && id) {
            savedLessons.current.set(`${id}:${key}`, saved);
            setLessons((s) => ({ ...s, [key]: { status: "ready", lesson: saved } }));
          } else {
            await loadLesson(ref, currentMap, currentTopic, provider, controller.signal);
          }
        }
        if (controller.signal.aborted) return;
        done += 1;
        setBulk({ done, total });
      }
    };
    await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, total) }, worker));
    if (bulkAbortRef.current === controller) {
      bulkAbortRef.current = null;
      setBulk(null);
    }
  }

  function stopGenerateAll() {
    bulkAbortRef.current?.abort();
    bulkAbortRef.current = null;
    setBulk(null);
  }

  function startTopic(value: string, extra = "") {
    const trimmed = value.trim();
    if (!trimmed) return;
    const context = extra.trim();
    stopGenerateAll();
    setQuery(trimmed);
    setQueryDetails(context);
    setMap(null);
    setMeta(null);
    setSelected(null);
    setLessons({});
    const provider = providerId;
    void generate({ topic: trimmed, details: context || undefined, provider }, null).then((done) => {
      if (done && readSettings().autoGenerateLessons) void generateAll(done, trimmed, provider);
    });
  }

  function onSubmitTopic(e: FormEvent) {
    e.preventDefault();
    startTopic(topic, details);
  }

  /** The assistant revised the roadmap: it becomes the current map, under a new id. */
  function applyRevisedMap(next: MindMap, instruction: string) {
    stopGenerateAll();
    const id = newRoadmapId();
    ownedIds.current.add(id);
    instructions.current.set(id, instruction);
    setRoadmapId(id);
    setRemoteDraft(false);
    setMap(next);
    setMapDraft(false);
    setMeta(null);
    setSelected((current) => (current && nodeAt(next, current) ? current : null));
    if (query && readSettings().autoGenerateLessons) void generateAll(next, query, providerId);
  }

  /** Open a block's lesson, generating it the first time. */
  function openLesson(ref: NodeRef) {
    if (!map || !query) return;
    const at = nodeAt(map, ref);
    if (!at) return;
    setSelected(ref);
    setError(null);
    const key = lessonKey(at.node);
    const existing = lessons[key];
    if (!existing || existing.status === "error") {
      // Another tab may already have written this lesson for the same map.
      const saved = roadmapId ? loadSavedLesson(roadmapId, key) : null;
      if (saved && roadmapId) {
        savedLessons.current.set(`${roadmapId}:${key}`, saved);
        setLessons((s) => ({ ...s, [key]: { status: "ready", lesson: saved } }));
      } else {
        void loadLesson(ref, map, query, providerId);
      }
    }
    window.scrollTo({ top: 0 });
  }

  function closeLesson() {
    setSelected(null);
    window.scrollTo({ top: 0 });
  }

  /** The tutor rewrote the open lesson. */
  function updateLesson(lesson: Lesson) {
    if (!map || !selected) return;
    const at = nodeAt(map, selected);
    if (!at) return;
    setLessons((s) => ({ ...s, [lessonKey(at.node)]: { status: "ready", lesson } }));
  }

  function reset() {
    abortRef.current?.abort();
    stopGenerateAll();
    setQuery(null);
    setMap(null);
    setMeta(null);
    setError(null);
    setLoading(false);
    setTopic("");
    setDetails("");
    setQueryDetails("");
    setSelected(null);
    setLessons({});
    setMapDraft(false);
    setRoadmapId(null);
    setRemoteDraft(false);
  }

  const providerLabel = providers.find((p) => p.id === meta?.provider)?.label ?? meta?.provider;

  if (query === null) {
    return (
      <main className="relative flex flex-1 flex-col items-center px-4 pt-[10vh] sm:px-8">
        <nav className="absolute right-4 top-4 flex items-center gap-4 text-sm text-neutral-500 sm:right-8">
          <Link href="/about" className="hover:text-neutral-900">
            About
          </Link>
          <Link href="/settings" className="hover:text-neutral-900">
            Settings
          </Link>
        </nav>
        <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">StructuredLearning.ai</h1>

        <form onSubmit={onSubmitTopic} className="mt-[12vh] w-full max-w-3xl">
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
              disabled={!topic.trim()}
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
                onClick={() => startTopic(example)}
              >
                {example}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ProviderSelect providers={providers} value={providerId} onChange={setProviderId} />
            <ChatGPTConnect onConnected={() => void refreshProviders().then(() => setProviderId("chatgpt"))} onDisconnected={() => void refreshProviders()} />
          </div>
        </div>

        {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

        {history.length > 0 && (
          <section className="mt-16 w-full max-w-3xl pb-16" aria-labelledby="history-heading">
            <h2 id="history-heading" className="px-2 text-sm font-medium text-neutral-500">
              Your roadmaps
            </h2>
            <ul className="mt-2 divide-y divide-neutral-100">
              {history.map((h) => (
                <li key={h.id} className="history-item">
                  <a href={roadmapUrl(h.id)} className="history-link">
                    <span className="block truncate text-[15px] text-neutral-900">{h.title}</span>
                    <span className="block truncate text-sm text-neutral-500">
                      {h.instruction ? <>Revised: &ldquo;{h.instruction}&rdquo;</> : <>&ldquo;{h.topic}&rdquo;</>}
                    </span>
                  </a>
                  <span className="shrink-0 text-right text-xs text-neutral-400">
                    {h.lessonsWritten} of {h.blocks} lessons
                    <br />
                    {timeAgo(h.savedAt)}
                  </span>
                  <button
                    type="button"
                    className="history-remove"
                    onClick={() => deleteRoadmap(h.id)}
                    aria-label={`Remove ${h.title}`}
                    title="Remove"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    );
  }

  const isReady = (node: MapNode) => lessons[lessonKey(node)]?.status === "ready";
  const unwritten = map ? allRefs(map).filter((ref) => !isReady(nodeAt(map, ref)!.node)).length : 0;

  const selectedAt = map && selected ? nodeAt(map, selected) : null;
  const lessonState: LessonState = selectedAt
    ? (lessons[lessonKey(selectedAt.node)] ?? { status: "loading" })
    : { status: "loading" };

  return (
    <main className="flex flex-1 flex-col px-4 pb-10 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-2 py-4">
        <button
          type="button"
          onClick={reset}
          className="text-sm text-neutral-500 hover:text-neutral-900"
        >
          StructuredLearning.ai
        </button>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link href="/about" className="text-sm text-neutral-500 hover:text-neutral-900">
            About
          </Link>
          <Link href="/settings" className="mr-2 text-sm text-neutral-500 hover:text-neutral-900">
            Settings
          </Link>
          <ProviderSelect providers={providers} value={providerId} onChange={setProviderId} disabled={loading} />
          <ChatGPTConnect onConnected={() => void refreshProviders().then(() => setProviderId("chatgpt"))} onDisconnected={() => void refreshProviders()} />
        </div>
      </header>

      {map && selected && selectedAt ? (
        <div className="mx-auto mt-4 w-full max-w-6xl">
          <LessonView
            topic={query}
            map={map}
            selected={selected}
            state={lessonState}
            providerId={providerId}
            onSelectNode={openLesson}
            onBack={closeLesson}
            onRetry={() => void loadLesson(selected, map, query, providerId)}
            onLessonChange={updateLesson}
            mapStreaming={(loading && mapDraft) || remoteDraft}
            lessonHref={lessonHref}
            isReady={isReady}
          />
        </div>
      ) : (
        <div className="roadmap-layout">
          <div className="min-w-0">
          <h1 className="mt-6 text-center text-4xl font-medium tracking-tight sm:text-5xl">
            {map?.topic || query}
          </h1>

          <RoadmapIntro map={map} writing={loading || remoteDraft} />

          <div className="mt-10">
            {map && !loading && !remoteDraft ? (
              <Roadmap map={map} onSelect={openLesson} hrefFor={lessonHref} isReady={isReady} />
            ) : null}
            {map && ((loading && mapDraft) || (!loading && remoteDraft)) ? (
              <Roadmap
                map={map}
                pending={Math.max(1, 5 - map.stages.length)}
                onSelect={openLesson}
                hrefFor={lessonHref}
                isReady={isReady}
                streaming
              />
            ) : null}
            {map && loading && !mapDraft ? (
              <div className="opacity-50 transition-opacity">
                <Roadmap map={map} isReady={isReady} />
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

          {map && <RoadmapLegend structure={map.stages.length > 1} />}

          {map && !mapDraft && !remoteDraft && (
            <p className="mt-4 text-center text-sm text-neutral-500">
              {/* The outcome at the top says the same thing, better. */}
              {asList(map.outcome).length === 0 && map.summary}
              {meta && !loading && (
                <span className="text-neutral-400">
                  {" "}· {providerLabel} · {meta.model} · {(meta.ms / 1000).toFixed(1)}s
                </span>
              )}
              {!loading && <span className="block mt-1 text-neutral-400">Click a block to open its lesson.</span>}
            </p>
          )}

          {map && !loading && !remoteDraft && (bulk || unwritten > 0) && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm text-neutral-600">
              {bulk ? (
                <>
                  <span aria-live="polite">
                    Writing lessons: {bulk.done} of {bulk.total} done
                  </span>
                  <button type="button" className="bulk-button" onClick={stopGenerateAll}>
                    Stop
                  </button>
                </>
              ) : (
                <button type="button" className="bulk-button" onClick={() => void generateAll()}>
                  {unwritten === 1 ? "Write the lesson" : `Generate all ${unwritten} lessons`}
                </button>
              )}
            </div>
          )}

          {map && error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}

          {map && !mapDraft && !remoteDraft && (map.nextSteps ?? []).length > 0 && (
            <section className="mt-10" aria-labelledby="next-steps">
              <h2 id="next-steps" className="text-center text-sm font-medium text-neutral-500">
                Next steps
              </h2>
              <ul className="next-steps">
                {(map.nextSteps ?? []).map((n) => (
                  <li key={n.topic}>
                    <button type="button" className="next-step" onClick={() => startTopic(n.topic)}>
                      <span className="block font-medium text-neutral-900">{n.topic} →</span>
                      {n.why && <span className="mt-0.5 block text-sm text-neutral-500">{n.why}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          </div>

          {map && (
            <aside className="roadmap-aside">
              <RoadmapChat
                topic={query}
                map={map}
                providerId={providerId}
                onMapChange={applyRevisedMap}
                busy={loading || remoteDraft}
              />
            </aside>
          )}
        </div>
      )}
    </main>
  );
}

/** Every block in a map, in roadmap order: each stage's core block, then its supporting blocks. */
function allRefs(map: MindMap): NodeRef[] {
  return map.stages.flatMap((stage, i) => [
    { stage: i, kind: "core" as const, index: 0 },
    ...stage.supporting.map((_, index) => ({ stage: i, kind: "supporting" as const, index })),
  ]);
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", then a date. */
function timeAgo(ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(ms).toLocaleDateString();
}

/** "What you need to know" and "What you will know at the end", under the roadmap's title. */
function RoadmapIntro({ map, writing }: { map: MindMap | null; writing: boolean }) {
  // Roadmaps saved before these lists existed have neither; early ones stored a sentence.
  const start = asList(map?.startingPoint);
  const end = asList(map?.outcome);
  if (!writing && start.length === 0 && end.length === 0) return null;
  const line = (label: string, items: string[], className: string) => (
    <div className={`intro-card ${className}`}>
      <p className="intro-label">{label}</p>
      {items.length > 0 ? (
        <RichText text={items.map((item) => `- ${item}`).join("\n")} className="intro-list mt-1.5" />
      ) : (
        <div className="mt-2.5 space-y-2" aria-busy="true">
          <div className="skeleton-line w-full" />
          <div className="skeleton-line w-2/3" />
        </div>
      )}
    </div>
  );
  return (
    <div className="intro">
      {line("What you need to know", start, "intro-start")}
      {line("What you will know at the end", end, "intro-end")}
      {map?.plan && <p className="intro-plan">{map.plan}</p>}
    </div>
  );
}
