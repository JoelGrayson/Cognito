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
import { latexToMathjs } from "@/lib/whiteboard/ink";
import { createAnnotator, type Annotator } from "@/lib/whiteboard/annotate";
import { marksFor } from "@/lib/whiteboard/marks";
import type { HintLevel } from "@/lib/whiteboard/policy";
import {
  recordStrokes,
  mergeBounds,
  type Bounds,
  toStrokePayload,
  DEFAULT_ENDPOINT_CONFIG,
  type Commit,
  type StrokeRecorder,
} from "@/lib/whiteboard/strokes";
import type { Equivalence } from "@/lib/whiteboard/checker/numeric";

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
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Request failed.");
        return;
      }

      const raw = data.latex || data.text || "";
      const parsed = latexToMathjs(raw);

      // The previous STEP is the newest reading from an earlier line -- not simply
      // the last array entry, which may be this same line's provisional reading.
      const previous =
        [...readingsRef.current].reverse().find((r) => r.lineId < lineId)?.parsed ?? null;

      const { checkStep } = await import("@/lib/whiteboard/checker/numeric");
      const t0 = performance.now();
      const verdict = previous ? checkStep(previous, parsed) : null;
      const checkMs = previous ? performance.now() - t0 : null;

      // Draw on the learner's work. Marks are tagged, so redrawing never touches ink.
      if (verdict) {
        const marks = marksFor(verdict, lineId, rungRef.current);
        if (marks.length > 0) {
          annotatorRef.current?.draw(marks, (id) => boundsRef.current.get(id));
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

  const reset = () => {
    setReadings([]);
    setError(null);
    recorderRef.current?.clear();
    annotatorRef.current?.clear();
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
            <option value={4}>4 — + what went wrong</option>
            <option value={5}>5 — + arrow to prior step</option>
          </select>
        </label>
        <span className="font-mono text-[10px] text-neutral-600">
          idle {idleMs}ms
        </span>
        <div className="ml-auto flex gap-2">
          {busy && <span className="text-xs text-neutral-400">reading…</span>}
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
              annotatorRef.current = createAnnotator(editor);
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
