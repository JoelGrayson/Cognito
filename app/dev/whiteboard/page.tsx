/**
 * THE SPIKE. Answers one question: can Mathpix read your handwriting well enough,
 * and fast enough, to build the interrupt loop on top of it?
 *
 * Write a line, hit Read. Write the next line, hit Read again. The second reading is
 * checked against the first with the real checker, so this proves the whole chain --
 * pen -> text -> "does this step follow?" -- not just the OCR.
 *
 * Judge it on three things, in this order:
 *   1. Does it read YOUR messy handwriting correctly? (accuracy is everything)
 *   2. Is the round trip under ~400ms? (the number is printed on screen)
 *   3. Does latexToMathjs() produce something the checker can parse?
 * If 1 fails, switch to typed input and keep the rest of the design.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import { latexToMathjs, isMultiLineReading } from "@/lib/whiteboard/ink";
import { createAnnotator, type Annotator } from "@/lib/whiteboard/annotate";
import { marksFor } from "@/lib/whiteboard/marks";
import { locateOperator } from "@/lib/whiteboard/locate";
import { assessExplanation, replyTo } from "@/lib/whiteboard/explanation";
import { createSpeaker, createPushToTalk, spokenFor, ASK_WHY, type Speaker, type PushToTalk } from "@/lib/whiteboard/voice";

/** Free-tier-safe voices, verified against this account. Library voices return 402. */
const VOICE_OPTIONS = [
  ["XrExE9yKIg1WjnnlVkGX", "Matilda"],
  ["EXAVITQu4vr4xnSDxMaL", "Sarah"],
  ["FGY2WhTYpPnrIDTdsKH5", "Laura"],
  ["cgSgspJ2msm6clMCkdW9", "Jessica"],
  ["Xb7hH8MSUJpSbSDYk0k2", "Alice"],
  ["pFZP5JQG7iQjIQuC4Bku", "Lily"],
  ["JBFqnCBsd6RMkjVDRZzb", "George"],
  ["IKne3meq5aSn9XLyUdCD", "Charlie"],
  ["N2lVS1w4EtoT3dr4eOWO", "Callum"],
  ["bIHbv24MWmeRgasZH58o", "Will"],
  ["iP95p4xoKVk53GoZ742B", "Chris"],
  ["onwK4e9ZLuTAKqWW03F9", "Daniel"],
] as const;
import type { HintLevel } from "@/lib/whiteboard/policy";
import type { Equivalence } from "@/lib/whiteboard/checker/numeric";
import {
  recordStrokes,
  type TimedStroke,
  mergeBounds,
  type Bounds,
  toStrokePayload,
  DEFAULT_ENDPOINT_CONFIG,
  type Commit,
  type StrokeRecorder,
} from "@/lib/whiteboard/strokes";

interface Reading {
  lineId: number;
  bounds: Bounds | null;
  provisional: boolean;
  raw: string;
  parsed: string;
  ms: number;
  confidence: number | null;
  strokeCount: number;
  verdict: Equivalence | null;
  checkMs: number | null;
}

export default function SpikePage() {
  const editorRef = useRef<Editor | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // ?idle=800 overrides the last-line wait, so the right value can be found by
  // reloading rather than rebuilding. Read once; changing it means a reload anyway.
  const [idleMs] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_ENDPOINT_CONFIG.finalLineIdleMs;
    const q = Number(new URLSearchParams(window.location.search).get("idle"));
    return Number.isFinite(q) && q >= 200 && q <= 10000 ? q : DEFAULT_ENDPOINT_CONFIG.finalLineIdleMs;
  });
  // On-device size readout. `.tl-container` is width:100%/height:100%, so it needs a
  // parent with a DEFINITE height -- a flex-sized parent doesn't reliably give one.
  // If this badge reads 0 in either axis, that's the bug, visible instead of guessed.
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState("measuring…");
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const tl = el.querySelector(".tl-container")?.getBoundingClientRect();
      setBox(`box ${Math.round(r.width)}x${Math.round(r.height)} · tl ${tl ? `${Math.round(tl.width)}x${Math.round(tl.height)}` : "none"}`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Readings mirrored into a ref: the commit callback is registered once at mount
  // and would otherwise close over a stale array.
  const recorderRef = useRef<StrokeRecorder | null>(null);
  const speakerRef = useRef<Speaker | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const voiceOnRef = useRef(voiceOn);
  useEffect(() => {
    voiceOnRef.current = voiceOn;
  }, [voiceOn]);
  const [said, setSaid] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState<string>(VOICE_OPTIONS[0][0]);
  const pttRef = useRef<PushToTalk | null>(null);
  const [listening, setListening] = useState(false);
  /** What the learner said, newest last. This is the artifact that matters: the
   *  point of asking "why" is that they articulate it, not that we grade it. */
  const [explanations, setExplanations] = useState<{ text: string; ms: number; outcome: string }[]>([]);
  /** Last few turns, so the tutor can avoid repeating itself. */
  const historyRef = useRef<{ who: "tutor" | "learner"; text: string }[]>([]);
  /** The step currently under discussion. Set when a mark is drawn, cleared once the
   *  learner names the error - that is what makes "speaking is the hint request"
   *  possible without a button. */
  const openRef = useRef<{
    verdict: Equivalence;
    lineId: number;
    strokes: TimedStroke[];
    raw: string;
    parsedStep: string;
    /** Hint depth belongs to THIS step. Page-wide depth leaked into later errors:
     *  climb to rung 4 on one mistake, and the next mistake opened at rung 4
     *  unasked - which breaks the invariant that help is only ever requested. */
    rung: HintLevel;
    /** Idle commits are provisional; the learner may still be writing. Don't let a
     *  half-read line become a spoken accusation. */
    provisional: boolean;
  } | null>(null);
  const voiceIdRef = useRef(voiceId);
  useEffect(() => {
    voiceIdRef.current = voiceId;
  }, [voiceId]);
  const annotatorRef = useRef<Annotator | null>(null);
  /** lineId -> where that line sits on the canvas. This is what lets marks be placed
   *  without anyone computing coordinates. */
  const boundsRef = useRef<Map<number, Bounds>>(new Map());
  const readingsRef = useRef<Reading[]>([]);
  // Synced in an effect, not during render -- a render-phase ref write is unsafe
  // under concurrent rendering.
  useEffect(() => {
    readingsRef.current = readings;
  }, [readings]);

  // TESTING: mark immediately at this rung instead of waiting for the learner to ask.
  // Ship-time default is 1 (a "?" in the margin, no location) -- see policy.ts.
  const [rung, setRung] = useState<HintLevel>(3);
  const rungRef = useRef<HintLevel>(rung);
  useEffect(() => {
    rungRef.current = rung;
  }, [rung]);

  const submitLine = useCallback(async ({ strokes, lineId, reason }: Commit) => {
    const payload = toStrokePayload(strokes);
    if (!payload) return;

    // Remember where this line is before anything async happens.
    const lineBounds = strokes.length
      ? strokes.map((s) => s.bounds).reduce(mergeBounds)
      : null;
    if (lineBounds) boundsRef.current.set(lineId, lineBounds);

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/whiteboard/strokes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, debug: { lineId, reason, strokes: strokes.length } }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Request failed.");
        return;
      }

      const raw = data.latex || data.text || "";
      if (isMultiLineReading(raw)) {
        // Several lines got read as one. Don't record it, and above all don't let it
        // become the "previous step" the next line is checked against.
        setError("Read several lines at once — press Reset and write one line at a time.");
        return;
      }
      const parsed = latexToMathjs(raw);

      // The previous STEP is the newest reading from an earlier line -- not simply
      // the last array entry, which may be this same line's provisional reading.
      const previous =
        [...readingsRef.current].reverse().find((r) => r.lineId < lineId)?.parsed ?? null;

      const { checkStep } = await import("@/lib/whiteboard/checker/numeric");
      const t0 = performance.now();
      const verdict = previous ? checkStep(previous, parsed) : null;
      const checkMs = previous ? performance.now() - t0 : null;

      // A re-read of the same line supersedes whatever we said about it. Without
      // this, a bad provisional read leaves an obsolete accusation open: the learner
      // finishes the line correctly and the tutor still discusses the broken version.
      if (openRef.current?.lineId === lineId) {
        openRef.current = null;
        annotatorRef.current?.clear();
        setSaid(null);
        historyRef.current = [];
      }

      // Draw on the learner's work. Marks are tagged, so redrawing never touches ink.
      if (verdict) {
        // Locate the offending symbol so the higher rungs can point AT it.
        const symbol = locateOperator(strokes, raw);
        const marks = marksFor(verdict, lineId, rungRef.current, symbol);
        if (marks.length > 0) {
          annotatorRef.current?.draw(marks, (id) => boundsRef.current.get(id));

          // Open the discussion regardless of whether we speak: push-to-talk needs a
          // step to talk ABOUT, and it must work with the voice toggle off.
          openRef.current = {
            verdict,
            lineId,
            strokes,
            raw,
            parsedStep: parsed,
            rung: rungRef.current,
            provisional: reason === "idle",
          };

          const line = spokenFor(rungRef.current, verdict.kind);
          const why = ASK_WHY[Math.floor(Math.random() * ASK_WHY.length)];
          const utterance = `${line} ${why}`;
          historyRef.current = [{ who: "tutor", text: utterance }];
          setSaid(utterance);

          // Speak only once the line is FINAL. A mark is glanceable and self-corrects
          // on the next read; a spoken accusation cannot be taken back, and an idle
          // commit is explicitly provisional - the learner may still be writing.
          if (voiceOnRef.current && reason === "line-break") {
            speakerRef.current?.say(utterance, voiceIdRef.current).catch((e) => {
              setError(e instanceof Error ? e.message : "Voice failed.");
            });
          }
        }
      }

      const next: Reading = {
        lineId,
        bounds: lineBounds,
        provisional: reason === "idle",
        raw,
        parsed,
        ms: data.ms,
        confidence: data.confidence,
        strokeCount: data.strokeCount,
        verdict,
        checkMs,
      };

      setReadings((r) => {
        const at = r.findIndex((x) => x.lineId === lineId);
        // Same line read again (they kept writing after an idle commit): replace,
        // don't append. Otherwise a mid-line pause would invent a phantom step.
        if (at >= 0) return [...r.slice(0, at), next, ...r.slice(at + 1)];
        return [...r, next];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, []);

  const beginTalking = useCallback(async () => {
    if (pttRef.current?.recording) return;
    // The learner always outranks the tutor: talking cuts it off mid-sentence.
    speakerRef.current?.stop();
    pttRef.current ??= createPushToTalk();
    try {
      await pttRef.current.start();
      setListening(true);
    } catch {
      setError("Couldn't reach the microphone — check the browser permission.");
    }
  }, []);

  const endTalking = useCallback(async () => {
    const ptt = pttRef.current;
    if (!ptt?.recording) return;
    setListening(false);
    try {
      const { transcript, ms } = await ptt.stopAndTranscribe();
      if (!transcript) return;

      const open = openRef.current;
      if (!open) {
        setExplanations((e) => [...e, { text: transcript, ms, outcome: "" }]);
        return;
      }

      // Explaining and not getting there IS the request for more help, so the
      // learner never has to press anything to ask. The system still never
      // volunteers a rung unprompted - this IS the prompt.
      historyRef.current.push({ who: "learner", text: transcript });

      // Ask the model what to say. It is handed the verdict as ground truth and the
      // rung as a ceiling on what it may reveal -- it decides the WORDS, never the
      // maths. Falls back to the canned lines if it is unavailable, so a missing key
      // or a flaky network degrades instead of breaking mid-demo.
      let outcome = assessExplanation(transcript, open.verdict);
      let line = replyTo(outcome, open.verdict);
      let fromModel = false;

      try {
        const r = await fetch("/api/whiteboard/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // reverse first: find() walks forwards and would return the OLDEST earlier
            // line, so with three or more steps the model would be shown a different
            // transition than the checker actually judged.
            previousStep:
              [...readingsRef.current].reverse().find((x) => x.lineId < open.lineId)?.parsed ?? null,
            currentStep: open.parsedStep,
            verdictKind: open.verdict.kind,
            verdictDetail:
              open.verdict.kind === "direction"
                ? open.verdict.expected
                : open.verdict.kind === "rescaled"
                  ? String(open.verdict.by.toFixed(2))
                  : "",
            rung: open.rung,
            said: transcript,
            history: historyRef.current.slice(-6),
          }),
        });
        if (r.ok) {
          const d = await r.json();
          if (d.reply) {
            line = d.reply;
            fromModel = true;
            // Take the model's WORDS, not its judgement. At rungs 1-2 it is
            // deliberately not told the verdict or shown the working, so its
            // foundIt is a guess - and a wrong guess closes a real error because
            // the learner happened to name some other plausible mistake. Whether
            // they found it stays with the deterministic check, which knows.
            if (open.rung >= 3 && d.foundIt && outcome.kind !== "found-it") {
              outcome = { kind: "not-yet" };
            }
          }
        }
      } catch {
        // keep the canned line
      }

      setExplanations((e) => [...e, { text: transcript, ms, outcome: outcome.kind }]);

      if (outcome.kind === "found-it") {
        openRef.current = null; // they did the work; get out of the way
      } else {
        const next = Math.min(open.rung + 1, 5) as HintLevel;
        open.rung = next;
        annotatorRef.current?.clear();
        const symbol = locateOperator(open.strokes, open.raw);
        annotatorRef.current?.draw(
          marksFor(open.verdict, open.lineId, next, symbol),
          (id) => boundsRef.current.get(id),
        );
        // Only bolt the canned rung line on when the model didn't write one.
        if (!fromModel) line = `${line} ${spokenFor(next, open.verdict.kind)}`.trim();
      }

      historyRef.current.push({ who: "tutor", text: line });

      setSaid(line);
      if (voiceOnRef.current) {
        speakerRef.current?.say(line, voiceIdRef.current).catch(() => {});
      }
    } catch {
      setError("Transcription failed.");
    }
  }, []);

  // Hold SPACE to talk. A key rather than a button because the learner's hand is
  // already on a pen -- reaching for a target on screen breaks the thought.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      e.preventDefault();
      void beginTalking();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      void endTalking();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [beginTalking, endTalking]);

  useEffect(() => () => pttRef.current?.dispose(), []);

  const reset = () => {
    setReadings([]);
    setError(null);
    recorderRef.current?.clear();
    annotatorRef.current?.clear();
    speakerRef.current?.stop();
    setSaid(null);
    setExplanations([]);
    openRef.current = null;
    historyRef.current = [];
    boundsRef.current.clear();
    const editor = editorRef.current;
    if (editor) {
      editor.selectAll();
      editor.deleteShapes(editor.getSelectedShapeIds());
    }
  };

  return (
    /* h-dvh, not h-screen: on iOS Safari h-screen is the WRONG height because of the
       address bar, and the canvas ends up pushed off the bottom of the viewport.
       overscroll-none stops the page rubber-banding while you draw. */
    <div className="flex h-dvh flex-col overscroll-none bg-neutral-950 text-neutral-100">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-800 px-3 py-2">
        <h1 className="text-sm font-semibold">Handwriting spike</h1>
        <span className="hidden text-xs text-neutral-500 sm:inline">
          just write — lines commit themselves
        </span>
        <label className="flex items-center gap-1 text-[11px] text-neutral-500">
          rung
          <select
            value={rung}
            onChange={(e) => setRung(Number(e.target.value) as HintLevel)}
            className="rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-[11px] text-neutral-200"
          >
            <option value={0}>0 — silent</option>
            <option value={1}>1 — “?” in margin</option>
            <option value={2}>2 — “look here”</option>
            <option value={3}>3 — circle / strike</option>
            <option value={4}>4 — circle the sign + why</option>
            <option value={5}>5 — + arrow to prior step</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-[11px] text-neutral-500">
          <input type="checkbox" checked={voiceOn} onChange={(e) => setVoiceOn(e.target.checked)} />
          voice
        </label>
        <select
          value={voiceId}
          onChange={(e) => {
            setVoiceId(e.target.value);
            // Speak on change so the voice can be auditioned without writing anything.
            speakerRef.current
              ?.say("Something in there doesn't hold up. Want to take another look?", e.target.value)
              .catch(() => {});
          }}
          className="rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-[11px] text-neutral-200"
        >
          {VOICE_OPTIONS.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <span className="font-mono text-[10px] text-neutral-600">
          idle {idleMs}ms
        </span>
        <div className="ml-auto flex gap-2">
          {busy && <span className="text-xs text-neutral-400">reading…</span>}
          <button
            onMouseDown={beginTalking}
            onMouseUp={endTalking}
            onMouseLeave={endTalking}
            onTouchStart={(e) => {
              e.preventDefault();
              void beginTalking();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              void endTalking();
            }}
            className={`select-none rounded px-4 py-2 text-sm font-medium ${
              listening ? "bg-red-500 text-white" : "border border-neutral-700 text-neutral-200"
            }`}
          >
            {listening ? "listening…" : "hold to talk"}
          </button>
          <button onClick={reset} className="rounded border border-neutral-700 px-3 py-2 text-sm">
            Reset
          </button>
        </div>
      </header>

      {/* Column on phones/tablets, row on desktop. min-h-0/min-w-0 are load-bearing:
          without them a flex child refuses to shrink and the canvas collapses to 0px. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          ref={boxRef}
          className="relative min-h-[55dvh] w-full flex-1 touch-none lg:min-h-0"
        >
          <span className="pointer-events-none absolute right-1 top-1 z-[300] rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
            {box}
          </span>
          <div className="absolute inset-0">
            <Tldraw
            onMount={(editor) => {
              editorRef.current = editor;
              // Open on the pencil, not the select tool -- otherwise the first
              // scribble silently does nothing and it looks broken.
              editor.setCurrentTool("draw");
              // Auto-commit: starting a new line commits the previous one. No timer,
              // so you can pause mid-line to think without anything firing.
              // Start from a clean canvas. Ink that survives a reload gets replayed
              // into the recorder as one batch of "added" strokes, which merges every
              // previous line into a single commit -- observed as an 11-stroke read
              // coming back as a \begin{aligned} block that then fails to parse.
              const existing = editor.getCurrentPageShapes().map((sh) => sh.id);
              if (existing.length > 0) editor.deleteShapes(existing);

              annotatorRef.current = createAnnotator(editor);
              speakerRef.current ??= createSpeaker();
              // React dev-mode mounts twice. Without this, two store listeners end up
              // registered and every line is submitted twice.
              recorderRef.current?.stop();
              recorderRef.current = recordStrokes(
                editor,
                (commit) => void submitLine(commit),
                { ...DEFAULT_ENDPOINT_CONFIG, finalLineIdleMs: idleMs },
              );
            }}
            />
          </div>
        </div>

        <aside className="max-h-[38dvh] shrink-0 overflow-y-auto border-t border-neutral-800 p-3 lg:max-h-none lg:w-96 lg:border-l lg:border-t-0 lg:p-4">
          {error && (
            <p className="mb-3 rounded border border-red-900 bg-red-950/50 p-2 text-xs text-red-300">{error}</p>
          )}
          {explanations.length > 0 && (
            <div className="mb-3 space-y-1">
              {explanations.map((x, i) => (
                <p key={i} className="rounded border border-sky-900 bg-sky-950/40 p-2 text-xs text-sky-200">
                  you: “{x.text}”
                  {x.outcome && (
                    <span
                      className={`ml-1 ${x.outcome === "found-it" ? "text-green-400" : "text-neutral-500"}`}
                    >
                      · {x.outcome}
                    </span>
                  )}
                </p>
              ))}
            </div>
          )}
          {said && (
            <p className="mb-3 rounded border border-neutral-700 bg-neutral-900 p-2 text-xs italic text-neutral-300">
              “{said}”
            </p>
          )}
          {readings.length === 0 && !error && (
            <p className="text-xs text-neutral-500">
              Write a line, then start the next one underneath. Nothing to press.
            </p>
          )}

          <ol className="space-y-2">
            {readings.map((r, i) => (
              <li key={i} className="rounded border border-neutral-800 p-2.5 text-xs">
                <div className="mb-1 flex items-center justify-between text-neutral-500">
                  <span>
                    step {i + 1}
                    {r.provisional && <span className="ml-1 text-neutral-600">· still writing?</span>}
                  </span>
                  <span className={r.ms < 400 ? "text-green-400" : "text-amber-400"}>{r.ms}ms</span>
                </div>
                <div className="break-all font-mono text-sm text-neutral-100">{r.raw || "(nothing read)"}</div>
                <div className="mt-1 break-all font-mono text-[11px] text-neutral-400">→ {r.parsed}</div>
                <div className="mt-1 text-[11px] text-neutral-500">
                  {r.strokeCount} strokes
                  {r.confidence !== null && ` · confidence ${r.confidence.toFixed(2)}`}
                </div>
                {r.verdict && (
                  <div
                    className={`mt-2 rounded px-2 py-1 text-[11px] ${
                      r.verdict.kind === "equivalent"
                        ? "bg-green-950/60 text-green-300"
                        : r.verdict.kind === "undetermined"
                          ? "bg-neutral-800 text-neutral-400"
                          : "bg-red-950/60 text-red-300"
                    }`}
                  >
                    <strong>{r.verdict.kind}</strong>
                    {r.verdict.kind === "direction" &&
                      ` — expected "${r.verdict.expected}", got "${r.verdict.got}"`}
                    {r.verdict.kind === "undetermined" && ` — ${r.verdict.why}`}
                    {r.verdict.kind === "not-equivalent" &&
                      ` — at ${r.verdict.witness.variable}=${r.verdict.witness.at.toFixed(2)}: previous ${r.verdict.witness.previousValue.toFixed(2)}, yours ${r.verdict.witness.currentValue.toFixed(2)}`}
                    {r.checkMs !== null && (
                      <span className="ml-1 text-neutral-500">({r.checkMs.toFixed(2)}ms)</span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
