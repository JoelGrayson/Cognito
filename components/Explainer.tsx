"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { applyActions, type BoardElement, type ResolvedAction } from "@/lib/board";
import type { ExplainerPlanDraft } from "@/lib/drafts";
import { ensureOk, readNdjson } from "@/lib/ndjson";
import type { ProviderId } from "@/lib/providers/types";
import type { Lesson } from "@/lib/schema";
import { speak, stopSpeaking } from "@/lib/speech";
import { Board } from "./Board";

interface Props {
  topic: string;
  lesson: Lesson;
  providerId: ProviderId;
  onClose: () => void;
}

/**
 * A narrated explainer: the voice talks while each scene is drawn, and the same
 * script reads as an article. Scenes stream in, so playback starts on scene one
 * while the rest are still being drawn.
 */
export function Explainer({ topic, lesson, providerId, onClose }: Props) {
  const [plan, setPlan] = useState<ExplainerPlanDraft | null>(null);
  const [scenes, setScenes] = useState<(ResolvedAction[] | undefined)[]>([]);
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [article, setArticle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const planRef = useRef<ExplainerPlanDraft | null>(null);
  const scenesRef = useRef<(ResolvedAction[] | undefined)[]>([]);
  const playingRef = useRef(false);
  const indexRef = useRef(0);
  const voiceRef = useRef(true);
  const closed = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  function showScene(i: number) {
    indexRef.current = i;
    setIndex(i);
    const actions = scenesRef.current[i];
    if (actions) setElements(applyActions([], actions));
  }

  /** Play from `from` until paused, closed or out of scenes, waiting for scenes still being drawn. */
  async function play(from: number) {
    playingRef.current = true;
    setPlaying(true);
    for (let i = from; !closed.current && playingRef.current; i++) {
      const scenes = planRef.current?.scenes ?? [];
      if (i >= scenes.length) {
        // Later scenes may still be streaming in.
        if (ready) break;
        await wait(400);
        i -= 1;
        continue;
      }
      while (!scenesRef.current[i] && !closed.current && playingRef.current) await wait(300);
      if (closed.current || !playingRef.current) break;
      showScene(i);
      await speak(scenes[i].narration, voiceRef.current);
    }
    if (!closed.current) {
      playingRef.current = false;
      setPlaying(false);
    }
  }

  function pause() {
    playingRef.current = false;
    setPlaying(false);
    stopSpeaking();
  }

  function jump(to: number) {
    const total = planRef.current?.scenes.length ?? 0;
    const next = Math.max(0, Math.min(total - 1, to));
    stopSpeaking();
    showScene(next);
    if (playingRef.current) {
      playingRef.current = false;
      void play(next);
    }
  }

  const start = useEffectEvent(() => {
    void (async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/explainer", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic, lesson, provider: providerId }),
        });
        await ensureOk(res);
        await readNdjson(res, (event) => {
          if (closed.current) return;
          if (event.type === "plan") {
            const next = event.plan as ExplainerPlanDraft;
            planRef.current = next;
            setPlan(next);
            setScenes((s) => (s.length >= next.scenes.length ? s : [...s, ...Array(next.scenes.length - s.length).fill(undefined)]));
          } else if (event.type === "scene") {
            const i = Number(event.index);
            scenesRef.current[i] = event.actions as ResolvedAction[];
            setScenes((s) => {
              const copy = s.slice();
              copy[i] = event.actions as ResolvedAction[];
              return copy;
            });
            if (i === indexRef.current) showScene(i);
            if (i === 0 && !playingRef.current) void play(0);
          } else if (event.type === "done") {
            setReady(true);
          } else if (event.type === "error") {
            throw new Error(String(event.error));
          }
        });
      } catch (err) {
        if (controller.signal.aborted || closed.current) return;
        setError(err instanceof Error ? err.message : "The explainer could not be made.");
      }
    })();
  });

  useEffect(() => {
    closed.current = false;
    start();
    return () => {
      closed.current = true;
      playingRef.current = false;
      abortRef.current?.abort();
      stopSpeaking();
    };
  }, []);

  const scene = plan?.scenes[index];
  const total = plan?.scenes.length ?? 0;
  const drawn = scenes.filter(Boolean).length;

  return (
    <div className="call" role="dialog" aria-modal="true" aria-label={`Explainer: ${lesson.title}`}>
      <header className="call-header">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-white">{plan?.title || lesson.title}</p>
          <p className="text-xs text-neutral-400">
            Explainer · {topic}
            {total > 0 && ` · scene ${index + 1} of ${total}`}
            {!ready && total > 0 && ` · drawing ${drawn}/${total}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="call-btn" data-on={article ? "true" : undefined} onClick={() => setArticle(!article)}>
            {article ? "Hide article" : "Read as article"}
          </button>
          <button
            type="button"
            className="call-btn call-end"
            onClick={() => {
              closed.current = true;
              pause();
              onClose();
            }}
          >
            Close
          </button>
        </div>
      </header>

      <div className="call-main" data-article={article ? "true" : undefined}>
        <div className="call-stage">
          {elements.length === 0 && !error && <p className="explainer-loading">Writing the explainer…</p>}
          <Board elements={elements} canDraw={false} penColor="blue" onStroke={() => {}} />
          {scene && (
            <div className="call-caption" aria-live="polite">
              {scene.narration}
            </div>
          )}
          {error && <p className="call-caption text-red-300">{error}</p>}
        </div>
        {article && (
          <aside className="explainer-article">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">{plan?.title}</h2>
            <ul className="mt-3 space-y-2">
              {(plan?.scenes ?? []).map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="explainer-bullet"
                    data-current={i === index ? "true" : undefined}
                    onClick={() => jump(i)}
                  >
                    {s.bullet || s.narration}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>

      <footer className="call-controls">
        <button type="button" className="call-btn" onClick={() => jump(index - 1)} disabled={index === 0}>
          ← Back
        </button>
        <button
          type="button"
          className="call-btn call-send"
          onClick={() => (playing ? pause() : void play(index))}
          disabled={total === 0}
        >
          {playing ? "Pause" : index === 0 ? "Play" : "Resume"}
        </button>
        <button type="button" className="call-btn" onClick={() => jump(index + 1)} disabled={index + 1 >= total}>
          Next →
        </button>
        <button
          type="button"
          className="call-btn"
          onClick={() => {
            stopSpeaking();
            showScene(0);
            if (!playingRef.current) void play(0);
          }}
          disabled={total === 0}
        >
          Restart
        </button>
        <button
          type="button"
          className="call-btn"
          data-on={voiceOn ? "true" : "false"}
          onClick={() => {
            voiceRef.current = !voiceOn;
            setVoiceOn(!voiceOn);
            if (voiceOn) stopSpeaking();
          }}
        >
          Voice {voiceOn ? "on" : "off"}
        </button>
        <span className="explainer-dots" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <i key={i} data-state={i === index ? "current" : scenes[i] ? "ready" : "pending"} />
          ))}
        </span>
      </footer>
    </div>
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
