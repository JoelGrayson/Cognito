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
import {
  AssetRecordType,
  DefaultColorStyle,
  Tldraw,
  createShapeId,
  type Editor,
  type TLComponents,
} from "tldraw";
import "tldraw/tldraw.css";
import { latexToMathjs, isMultiLineReading } from "@/lib/whiteboard/ink";
import { createAnnotator, type Annotator } from "@/lib/whiteboard/annotate";
import { marksFor } from "@/lib/whiteboard/marks";
import { locateOperator } from "@/lib/whiteboard/locate";
import { pagesOf } from "@/lib/whiteboard/pdf";
import { anchorsFrom, premiseFor, problemFor, type PrintedLine, type ProblemAnchor } from "@/lib/whiteboard/worksheet";
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
import { DEFAULT_CONFIG, type HintLevel } from "@/lib/whiteboard/policy";
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

/** When the tutor speaks up: on every line as it is written, or only once asked. */
type CheckMode = "live" | "when-done";

/** Worksheet pages are tagged like the tutor's marks are, so Reset can clear the
 *  learner's ink and leave the sheet they are working on. */
const WORKSHEET_META = { worksheetPage: true } as const;
/** Page-space width of an uploaded sheet, and the gap between its pages. */
const SHEET_WIDTH = 900;
const SHEET_GAP = 32;
/** Six open-ended problems the step checker can judge end to end: equations,
 *  inequalities, one expression. One per row, so no two read as a single line. */
const SAMPLE_SHEET = "/worksheets/algebra-practice.pdf";

/** A notebook, not a diagramming tool: keep the toolbar (pen, eraser, highlighter) and
 *  undo, drop everything that floats over the page or leads off it. The style panel in
 *  particular opens on top of the worksheet's right-hand margin. */
const NOTEBOOK_UI: TLComponents = {
  StylePanel: null,
  PageMenu: null,
  MainMenu: null,
  ActionsMenu: null,
  NavigationPanel: null,
  HelpMenu: null,
  DebugPanel: null,
};
/** Red is left out on purpose: it is the tutor's pen. */
const PEN_COLORS = [
  ["black", "bg-neutral-900"],
  ["blue", "bg-blue-600"],
  ["green", "bg-emerald-600"],
] as const;
type PenColor = (typeof PEN_COLORS)[number][0];

/** A step the checker has judged wrong. Everything the tutor later needs to mark it,
 *  talk about it, and escalate on it. */
interface Finding {
  verdict: Equivalence;
  lineId: number;
  strokes: TimedStroke[];
  raw: string;
  parsedStep: string;
  /** The exact step the checker judged against. The reply request must use THIS,
   *  not re-derive it - a low-confidence line is skipped by the checker but was
   *  still being picked as the model's premise, so the verdict and the explanation
   *  described different pairs of steps. */
  premise: string;
  /** Where that premise is on the canvas; negative for a printed problem. */
  premiseLineId: number;
  /** Hint depth belongs to THIS step. Page-wide depth leaked into later errors:
   *  climb to rung 4 on one mistake, and the next mistake opened at rung 4
   *  unasked - which breaks the invariant that help is only ever requested. */
  rung: HintLevel;
  /** Which read produced this finding. */
  gen: number;
  /** Idle commits are provisional; the learner may still be writing. Don't let a
   *  half-read line become a spoken accusation. */
  provisional: boolean;
  /** False while "check when I'm done" is holding it back. An unrevealed finding is
   *  never drawn, spoken, or shown in the panel. */
  revealed: boolean;
}

interface Reading {
  lineId: number;
  /** The printed problem this line is working on; null on a blank canvas. */
  problemId: number | null;
  /** The verdict is being held back until the learner asks for the check. */
  hidden: boolean;
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

/** Speak, and surface a failure rather than swallowing it. Every call site used to
 *  drop its own rejection, so an utterance that never played was indistinguishable
 *  from a tutor that had nothing to say. */
function speakOrReport(
  speaker: Speaker | null,
  report: (message: string | null) => void,
  text: string,
  voice?: string,
): void {
  speaker
    ?.say(text, voice)
    // Clear on success too. A "playback blocked" banner left standing while the next
    // line plays aloud is worse than the silence it was added to explain.
    .then(() => report(null))
    .catch((e) => report(e instanceof Error ? e.message : "Voice failed."));
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
  /** Utterance for a line that was read provisionally and hasn't been spoken yet. */
  const pendingSpeechRef = useRef<{ lineId: number; text: string } | null>(null);
  /** Lines already settled by a line break. Kept separately because the two halves
   *  race: the idle OCR request is async, so a fast next line can finalize before
   *  the reading even exists. Whichever arrives second speaks. */
  const finalizedRef = useRef<Set<number>>(new Set());
  /** Every read and every reply is stamped with a generation. Anything that resumes
   *  after an await checks its stamp before touching shared state - otherwise a
   *  response that arrives 800ms late redraws a mark the learner has already fixed,
   *  or speaks about a line they have since rewritten. */
  const genRef = useRef(0);
  const [voiceId, setVoiceId] = useState<string>(VOICE_OPTIONS[0][0]);
  const pttRef = useRef<PushToTalk | null>(null);
  const [listening, setListening] = useState(false);
  /** Last few turns, so the tutor can avoid repeating itself. */
  const historyRef = useRef<{ who: "tutor" | "learner"; text: string }[]>([]);
  /** The step currently under discussion. Set when a mark is drawn, cleared once the
   *  learner names the error - that is what makes "speaking is the hint request"
   *  possible without a button. */
  const openRef = useRef<Finding | null>(null);
  /** Every wrong step not yet resolved, by lineId. The marks on the canvas are always
   *  a pure function of this map - see redrawMarks. */
  const findingsRef = useRef<Map<number, Finding>>(new Map());
  const [mode, setMode] = useState<CheckMode>("live");
  const modeRef = useRef<CheckMode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const [checking, setChecking] = useState(false);
  /** Reads still on the wire. "Check my work" has to wait for them, or the last line
   *  is judged after the verdict has already been announced. */
  const inflightRef = useRef<Set<Promise<void>>>(new Set());
  const anchorsRef = useRef<ProblemAnchor[]>([]);
  const [worksheet, setWorksheet] = useState<{ name: string; pages: number; problems: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [penColor, setPenColor] = useState<PenColor>("black");
  const fileRef = useRef<HTMLInputElement | null>(null);
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

  const lookupBounds = useCallback(
    (id: number) => boundsRef.current.get(id) ?? anchorsRef.current.find((a) => a.id === id)?.bounds,
    [],
  );

  const revealedFindings = useCallback(
    () => [...findingsRef.current.values()].filter((f) => f.revealed).sort((a, b) => a.lineId - b.lineId),
    [],
  );

  /** Redraw from scratch rather than patching: with several steps marked at once,
   *  escalating one of them must not wipe the others. Marks are tagged, so this never
   *  touches the learner's ink. */
  const redrawMarks = useCallback(() => {
    annotatorRef.current?.clear();
    for (const f of revealedFindings()) {
      const symbol = locateOperator(f.strokes, f.raw);
      annotatorRef.current?.draw(marksFor(f.verdict, f.lineId, f.rung, symbol, f.premiseLineId), lookupBounds);
    }
  }, [lookupBounds, revealedFindings]);

  const submitLine = useCallback(async ({ strokes, lineId, reason }: Commit) => {
    // "finalized" carries no strokes: a line read on idle has now been settled by a
    // line break. Nothing new to read - just say what we held back.
    if (reason === "finalized") {
      finalizedRef.current.add(lineId);
      // The reading is no longer provisional, whether or not there was speech held.
      setReadings((r) =>
        r.map((x) => (x.lineId === lineId ? { ...x, provisional: false } : x)),
      );
      const pending = pendingSpeechRef.current;
      if (pending?.lineId === lineId) {
        pendingSpeechRef.current = null;
        finalizedRef.current.delete(lineId);
        if (voiceOnRef.current) {
          speakOrReport(speakerRef.current, setError, pending.text, voiceIdRef.current);
        }
      }
      return;
    }

    const payload = toStrokePayload(strokes);
    if (!payload) return;

    const gen = ++genRef.current;

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

      // The previous STEP is the newest trusted earlier line of the same problem, or
      // the printed problem itself -- see premiseFor.
      const problem = lineBounds ? problemFor(lineBounds, anchorsRef.current) : null;
      const premise = premiseFor(
        readingsRef.current,
        lineId,
        problem,
        DEFAULT_CONFIG.recognitionConfidenceFloor,
      );
      const previous = premise?.text ?? null;

      const { checkStep } = await import("@/lib/whiteboard/checker/numeric");
      const t0 = performance.now();
      const verdict = previous ? checkStep(previous, parsed) : null;
      const checkMs = previous ? performance.now() - t0 : null;

      // This read is done: whatever finalization was waiting on it is spent, whether
      // the line turned out wrong, correct, untrusted or unparseable. Leaving the
      // marker behind let a LATER provisional read of a resumed line consume it and
      // speak while the learner was still writing.
      const wasFinalized = finalizedRef.current.delete(lineId);

      // A re-read of the same line supersedes whatever we said about it. Without
      // this, a bad provisional read leaves an obsolete accusation open: the learner
      // finishes the line correctly and the tutor still discusses the broken version.
      if (findingsRef.current.delete(lineId)) redrawMarks();
      if (openRef.current?.lineId === lineId) {
        openRef.current = null;
        pendingSpeechRef.current = null;
        finalizedRef.current.delete(lineId);
        setSaid(null);
        historyRef.current = [];
      }

      // policy.ts has always carried this rule; the page simply never asked. Below
      // the recognition floor we assume WE misread rather than that they erred --
      // accusing someone of a mistake they did not make costs more trust than
      // missing one costs learning, and it is doubly true out loud.
      const trusted =
        typeof data.confidence !== "number" ||
        data.confidence >= DEFAULT_CONFIG.recognitionConfidenceFloor;

      const held = modeRef.current === "when-done";
      const wrong = verdict && verdict.kind !== "equivalent" && verdict.kind !== "undetermined";
      if (wrong && trusted && premise) {
        const finding: Finding = {
          verdict,
          lineId,
          strokes,
          raw,
          parsedStep: parsed,
          premise: premise.text,
          premiseLineId: premise.lineId,
          gen,
          rung: rungRef.current,
          provisional: reason === "idle",
          revealed: !held,
        };

        if (held) {
          // Judged, and kept quiet. checkNow reveals it.
          findingsRef.current.set(lineId, finding);
        } else if (marksFor(verdict, lineId, finding.rung).length > 0) {
          // Draw on the learner's work. Open the discussion regardless of whether we
          // speak: push-to-talk needs a step to talk ABOUT, and it must work with the
          // voice toggle off.
          findingsRef.current.set(lineId, finding);
          redrawMarks();
          openRef.current = finding;

          const line = spokenFor(finding.rung, verdict.kind);
          const why = ASK_WHY[Math.floor(Math.random() * ASK_WHY.length)];
          const utterance = `${line} ${why}`;
          historyRef.current = [{ who: "tutor", text: utterance }];
          setSaid(utterance);

          // Speak only once the line is FINAL. A mark is glanceable and self-corrects
          // on the next read; a spoken accusation cannot be taken back, and an idle
          // commit is explicitly provisional - the learner may still be writing.
          if (reason === "line-break") {
            if (voiceOnRef.current) {
              speakOrReport(speakerRef.current, setError, utterance, voiceIdRef.current);
            }
          } else if (wasFinalized) {
            // Finalization won the race and arrived before this reading existed.
            // Consume it now rather than waiting for an event that already passed.
            if (voiceOnRef.current) {
              speakOrReport(speakerRef.current, setError, utterance, voiceIdRef.current);
            }
          } else {
            // Provisional: hold the words until the line is settled, so a half-read
            // line never becomes a spoken accusation - but the step is not silenced
            // forever either, which is what happened before "finalized" existed.
            pendingSpeechRef.current = { lineId, text: utterance };
          }
        }
      }

      const next: Reading = {
        lineId,
        problemId: problem?.id ?? null,
        hidden: held,
        bounds: lineBounds,
        provisional: reason === "idle" && !wasFinalized,
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
  }, [redrawMarks]);

  /** "I'm done" - settle the last line, wait for every read, then say it all at once. */
  const checkNow = useCallback(async () => {
    speakerRef.current?.stop();
    recorderRef.current?.flush();
    setChecking(true);
    while (inflightRef.current.size > 0) await Promise.allSettled([...inflightRef.current]);
    setChecking(false);

    setReadings((r) => r.map((x) => (x.hidden ? { ...x, hidden: false } : x)));
    const fresh = [...findingsRef.current.values()]
      .filter((f) => !f.revealed)
      .sort((a, b) => a.lineId - b.lineId);
    for (const f of fresh) {
      f.revealed = true;
      f.provisional = false;
      // The rung in force when they ASKED, not when they happened to write the line.
      f.rung = rungRef.current;
    }
    redrawMarks();
    pendingSpeechRef.current = null;

    let utterance: string;
    if (fresh.length === 0) {
      utterance =
        readingsRef.current.length === 0
          ? "There's nothing written yet."
          : "I didn't find a step that doesn't follow.";
    } else {
      const first = fresh[0];
      openRef.current = first;
      const count = fresh.length > 1 ? `I've marked ${fresh.length} steps. Start with the first one.` : "";
      const why = ASK_WHY[Math.floor(Math.random() * ASK_WHY.length)];
      utterance = `${count} ${spokenFor(first.rung, first.verdict.kind)} ${why}`.trim();
      historyRef.current = [{ who: "tutor", text: utterance }];
    }
    setSaid(utterance);
    if (voiceOnRef.current) speakOrReport(speakerRef.current, setError, utterance, voiceIdRef.current);
  }, [redrawMarks]);

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
      const { transcript } = await ptt.stopAndTranscribe();
      if (!transcript) return;

      const open = openRef.current;
      // Nothing is under discussion, so there is nothing to explain.
      if (!open) return;

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
            // The premise the checker actually used - see openRef.premise.
            previousStep: open.premise,
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
          // Discard a reply whose discussion has been superseded - the learner may
          // have fixed the line while the model was thinking.
          if (openRef.current !== open) return;
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
              // The model wrote `reply` and `foundIt` together, so its words are a
              // congratulation. Keeping them while escalating would tell the learner
              // "exactly, nice catch" and then hand them a bigger hint.
              line = replyTo(outcome, open.verdict);
              fromModel = false;
            }
          }
        }
      } catch {
        // keep the canned line
      }

      if (outcome.kind === "found-it") {
        // They did the work; get out of the way - and if a whole sheet was marked at
        // once, move on to the next step rather than leaving them to guess which.
        findingsRef.current.delete(open.lineId);
        const following = revealedFindings()[0] ?? null;
        openRef.current = following;
        if (following) {
          line = `${line} There's another step marked. Have a look at that one next.`;
          historyRef.current = [];
        }
      } else {
        const next = Math.min(open.rung + 1, 5) as HintLevel;
        open.rung = next;
        // Only bolt the canned rung line on when the model didn't write one.
        if (!fromModel) line = `${line} ${spokenFor(next, open.verdict.kind)}`.trim();
      }
      redrawMarks();

      historyRef.current.push({ who: "tutor", text: line });

      setSaid(line);
      if (voiceOnRef.current) {
        speakOrReport(speakerRef.current, setError, line, voiceIdRef.current);
      }
    } catch {
      setError("Transcription failed.");
    }
  }, [redrawMarks, revealedFindings]);

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

  /** Clears the learner's ink and the tutor's marks. An uploaded sheet stays. */
  const reset = useCallback(() => {
    setReadings([]);
    setError(null);
    recorderRef.current?.clear();
    speakerRef.current?.stop();
    setSaid(null);
    pendingSpeechRef.current = null;
    finalizedRef.current.clear();
    openRef.current = null;
    findingsRef.current.clear();
    historyRef.current = [];
    boundsRef.current.clear();
    const editor = editorRef.current;
    if (!editor) return;
    const ink = editor
      .getCurrentPageShapes()
      .filter((sh) => !(sh.meta as { worksheetPage?: boolean }).worksheetPage)
      .map((sh) => sh.id);
    if (ink.length > 0) editor.deleteShapes(ink);
  }, []);

  const removeWorksheet = useCallback(() => {
    anchorsRef.current = [];
    setWorksheet(null);
    const editor = editorRef.current;
    if (!editor) return;
    editor.setCameraOptions({ ...editor.getCameraOptions(), constraints: undefined });
    const sheets = editor
      .getCurrentPageShapes()
      .filter((sh) => (sh.meta as { worksheetPage?: boolean }).worksheetPage);
    editor.run(
      () => {
        editor.deleteShapes(sheets.map((sh) => sh.id));
        editor.deleteAssets(
          sheets.flatMap((sh) => {
            const assetId = (sh.props as { assetId?: string | null }).assetId;
            return assetId ? [assetId as ReturnType<typeof AssetRecordType.createId>] : [];
          }),
        );
      },
      { history: "ignore", ignoreShapeLock: true },
    );
  }, []);

  /** Lay the sheet's pages down the canvas as locked images, then read the print on
   *  each so the handwriting can be checked against the problem it belongs to. */
  const loadWorksheet = useCallback(
    async (file: File) => {
      const editor = editorRef.current;
      if (!editor) return;
      setUploading(true);
      setError(null);
      try {
        const pages = await pagesOf(file);
        // A new sheet is a new session: old working would be anchored to problems
        // that are no longer there.
        reset();
        removeWorksheet();

        let y = 0;
        const placed = pages.map((page) => {
          const scale = SHEET_WIDTH / page.w;
          const at = { y, scale };
          y += page.h * scale + SHEET_GAP;
          return at;
        });
        editor.run(
          () => {
            pages.forEach((page, i) => {
              const assetId = AssetRecordType.createId();
              editor.createAssets([
                {
                  id: assetId,
                  typeName: "asset",
                  type: "image",
                  meta: {},
                  props: {
                    name: `${file.name} p${i + 1}`,
                    src: page.src,
                    w: page.w,
                    h: page.h,
                    mimeType: "image/jpeg",
                    isAnimated: false,
                  },
                },
              ]);
              editor.createShape({
                id: createShapeId(),
                type: "image",
                x: 0,
                y: placed[i].y,
                isLocked: true,
                meta: WORKSHEET_META,
                props: { assetId, w: SHEET_WIDTH, h: page.h * placed[i].scale },
              });
            });
          },
          { history: "ignore" },
        );
        // The sheet IS the canvas now: fit its width, scroll down through the pages,
        // and never drift off into empty space. Fit-width rather than whole-page, which
        // makes the print too small to write beside on a landscape screen.
        editor.setCameraOptions({
          ...editor.getCameraOptions(),
          constraints: {
            bounds: { x: 0, y: 0, w: SHEET_WIDTH, h: y - SHEET_GAP },
            padding: { x: SHEET_GAP, y: SHEET_GAP },
            origin: { x: 0.5, y: 0 },
            initialZoom: "fit-x",
            baseZoom: "fit-x",
            behavior: "contain",
          },
        });
        editor.setCamera(editor.getCamera(), { reset: true });
        editor.setCurrentTool("draw");

        const printed: PrintedLine[] = [];
        let unread = 0;
        await Promise.all(
          pages.map(async (page, i) => {
            const res = await fetch("/api/whiteboard/worksheet", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ image: page.src }),
            }).catch(() => null);
            const data = res?.ok ? await res.json().catch(() => null) : null;
            if (!data) {
              unread++;
              return;
            }
            const { y: top, scale } = placed[i];
            for (const l of data.lines as PrintedLine[]) {
              printed.push({
                text: l.text,
                bounds: {
                  minX: l.bounds.minX * scale,
                  maxX: l.bounds.maxX * scale,
                  minY: l.bounds.minY * scale + top,
                  maxY: l.bounds.maxY * scale + top,
                },
              });
            }
          }),
        );
        anchorsRef.current = anchorsFrom(printed);
        setWorksheet({
          name: file.name,
          pages: pages.length,
          problems: anchorsRef.current.filter((a) => a.parsed).length,
        });
        if (unread > 0) {
          setError(
            "Couldn't read the printed problems, so steps are only checked against each other. Reset between problems.",
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't open that file.");
      } finally {
        setUploading(false);
      }
    },
    [reset, removeWorksheet],
  );

  return (
    /* h-dvh, not h-screen: on iOS Safari h-screen is the WRONG height because of the
       address bar, and the canvas ends up pushed off the bottom of the viewport.
       overscroll-none stops the page rubber-banding while you draw. */
    /* fixed, over the site nav: the nav sits above this page in the root layout, so an
       h-dvh box starts 65px down and its bottom 65px - tldraw's pen and eraser toolbar -
       falls off the screen. A notebook wants the whole screen anyway. */
    <div className="fixed inset-0 z-50 flex h-dvh flex-col overscroll-none bg-neutral-950 text-neutral-100">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-800 px-3 py-2">
        <h1 className="text-sm font-semibold">Handwriting spike</h1>
        <span className="hidden text-xs text-neutral-500 sm:inline">
          write on a blank board or an uploaded worksheet
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
            speakOrReport(
              speakerRef.current,
              setError,
              "Something in there doesn't hold up. Want to take another look?",
              e.target.value,
            );
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
        <div className="flex overflow-hidden rounded border border-neutral-700 text-[11px]">
          {(
            [
              ["live", "check as I go"],
              ["when-done", "check when I'm done"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => {
                setMode(value);
                modeRef.current = value;
                // Going live with verdicts still held back would strand them.
                if (value === "live" && mode === "when-done") void checkNow();
              }}
              className={`px-2 py-1 ${mode === value ? "bg-neutral-200 text-neutral-900" : "text-neutral-400"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Pen colour">
          {PEN_COLORS.map(([color, swatch]) => (
            <button
              key={color}
              role="radio"
              aria-checked={penColor === color}
              aria-label={color}
              onClick={() => {
                setPenColor(color);
                editorRef.current?.setStyleForNextShapes(DefaultColorStyle, color);
                editorRef.current?.setCurrentTool("draw");
              }}
              className={`h-5 w-5 rounded-full border border-neutral-500 ${swatch} ${
                penColor === color ? "ring-2 ring-neutral-200 ring-offset-1 ring-offset-neutral-950" : ""
              }`}
            />
          ))}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Cleared so picking the same file again still fires a change.
            e.target.value = "";
            if (file) void loadWorksheet(file);
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="rounded border border-neutral-700 px-2 py-1 text-[11px] text-neutral-200 disabled:opacity-50"
        >
          {uploading ? "opening…" : worksheet ? "replace worksheet" : "upload worksheet"}
        </button>
        {!worksheet && (
          <button
            onClick={async () => {
              const res = await fetch(SAMPLE_SHEET);
              if (!res.ok) return setError("Couldn't load the sample worksheet.");
              void loadWorksheet(new File([await res.blob()], "algebra-practice.pdf", { type: "application/pdf" }));
            }}
            disabled={uploading}
            className="rounded border border-neutral-700 px-2 py-1 text-[11px] text-neutral-400 disabled:opacity-50"
          >
            try the sample
          </button>
        )}
        {worksheet && (
          <span className="flex items-center gap-1 text-[11px] text-neutral-500">
            <span className="max-w-40 truncate">{worksheet.name}</span>· {worksheet.pages}p · {worksheet.problems}{" "}
            problems read
            <button onClick={removeWorksheet} aria-label="Remove worksheet" className="px-1 text-neutral-400">
              ✕
            </button>
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {(busy || checking) && (
            <span className="self-center text-xs text-neutral-400">{checking ? "checking…" : "reading…"}</span>
          )}
          {mode === "when-done" && (
            <button
              onClick={() => void checkNow()}
              disabled={checking}
              className="rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 disabled:opacity-50"
            >
              Check my work
            </button>
          )}
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
            components={NOTEBOOK_UI}
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

              // Swallow pasted text. tldraw turns any text paste into a black text
              // shape, and a system dictation tool listening alongside push-to-talk
              // pastes what it heard - so the learner's own words landed on the page,
              // looking like something the tutor wrote.
              editor.registerExternalContentHandler("text", () => {});

              annotatorRef.current = createAnnotator(editor);
              speakerRef.current ??= createSpeaker();
              // React dev-mode mounts twice. Without this, two store listeners end up
              // registered and every line is submitted twice.
              recorderRef.current?.stop();
              recorderRef.current = recordStrokes(
                editor,
                (commit) => {
                  const read = submitLine(commit);
                  inflightRef.current.add(read);
                  void read.finally(() => inflightRef.current.delete(read));
                },
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
          {said && (
            <p className="mb-3 rounded border border-red-900 bg-red-950/40 p-2 text-sm italic text-red-300">
              “{said}”
            </p>
          )}
          {readings.length === 0 && !error && (
            <p className="text-xs text-neutral-500">
              {mode === "live"
                ? "Write a line, then start the next one underneath. Nothing to press."
                : "Work the whole thing through, then press Check my work."}
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
                {r.hidden && <div className="mt-2 text-[11px] text-neutral-600">held until you check</div>}
                {r.verdict && !r.hidden && (
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
