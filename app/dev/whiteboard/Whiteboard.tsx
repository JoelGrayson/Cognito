/**
 * The handwriting whiteboard: write a line, start the next one underneath, and each
 * step is read (Mathpix) and checked against the one before it with the real checker.
 * On a blank board or on an uploaded worksheet.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AssetRecordType,
  Tldraw,
  createShapeId,
  type Editor,
  type TLComponents,
} from "tldraw";
import "tldraw/tldraw.css";
import "./whiteboard.css";
import { Mascot } from "@/components/Mascot";
import { Dock, Icon, Library, MasteryPanel, Rail, Tag, TutorBubble, type PenColor, type PenSize } from "./ui";
import { latexToMathjs, isMultiLineReading } from "@/lib/whiteboard/ink";
import { createAnnotator, type Annotator } from "@/lib/whiteboard/annotate";
import { marksFor } from "@/lib/whiteboard/marks";
import { locateOperator } from "@/lib/whiteboard/locate";
import { pagesOf } from "@/lib/whiteboard/pdf";
import { masteryOf } from "@/lib/whiteboard/mastery";
import type { Subject } from "@/lib/subjects";
import { deleteSheet, fileOf, listSheets, saveSheet, sheetId, type SavedSheet } from "@/lib/whiteboard/library";
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

/** A notebook, not a diagramming tool: drop everything that floats over the page or
 *  leads off it. The style panel in particular opens on top of the worksheet's
 *  right-hand margin. The toolbar is replaced by the Dock. */
const NOTEBOOK_UI: TLComponents = {
  Toolbar: null,
  MenuPanel: null,
  StylePanel: null,
  PageMenu: null,
  MainMenu: null,
  ActionsMenu: null,
  NavigationPanel: null,
  HelpMenu: null,
  DebugPanel: null,
};

const RUNG_OPTIONS = [
  [0, "Stay silent"],
  [1, "A “?” in the margin"],
  [2, "“Look here”"],
  [3, "Circle or strike it"],
  [4, "Circle the sign and say why"],
  [5, "Plus an arrow to the prior step"],
] as const;

const MODE_OPTIONS = [
  ["live", "Check as I go"],
  ["when-done", "Check when I'm done"],
] as const;

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

export function Whiteboard({ subject }: { subject: Subject }) {
  const editorRef = useRef<Editor | null>(null);
  /** The same editor, as state: the Dock renders from it, the callbacks read the ref. */
  const [editor, setEditor] = useState<Editor | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
  /** Between releasing the mic and the tutor answering: a transcription and a model
   *  call, several seconds in which the page otherwise shows nothing at all. */
  const [thinking, setThinking] = useState(false);
  /** Last few turns, so the tutor can avoid repeating itself. */
  const historyRef = useRef<{ who: "tutor" | "learner"; text: string }[]>([]);
  /** The step currently under discussion. Set when a mark is drawn, cleared once the
   *  learner names the error - that is what makes "speaking is the hint request"
   *  possible without a button. */
  const openRef = useRef<Finding | null>(null);
  /** Every wrong step not yet resolved, by lineId. The marks on the canvas are always
   *  a pure function of this map - see redrawMarks. */
  const findingsRef = useRef<Map<number, Finding>>(new Map());
  /** Steps judged to follow, by lineId, and whether the learner may see that yet.
   *  Drawn as ticks by redrawMarks, alongside the findings. */
  const followedRef = useRef<Map<number, { verdict: Equivalence; revealed: boolean }>>(new Map());
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
  const [worksheet, setWorksheet] = useState<{ id: string; name: string; pages: number; problems: number } | null>(
    null,
  );
  /** One side panel at a time; null is closed. */
  const [panel, setPanel] = useState<"worksheets" | "mastery" | null>(null);
  /** The anchors again, as state: the mastery panel renders from them. */
  const [problems, setProblems] = useState<ProblemAnchor[]>([]);
  const [sheets, setSheets] = useState<SavedSheet[]>([]);
  // The library is a convenience: where IndexedDB is unavailable (private windows) the
  // shelf is simply empty and uploading still works.
  const refreshSheets = useCallback(() => listSheets().then(setSheets, () => setSheets([])), []);
  useEffect(() => void refreshSheets(), [refreshSheets]);
  const [uploading, setUploading] = useState(false);
  const [penColor, setPenColor] = useState<PenColor>("black");
  const [penSize, setPenSize] = useState<PenSize>("m");
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
    for (const [lineId, f] of followedRef.current) {
      if (f.revealed) annotatorRef.current?.draw(marksFor(f.verdict, lineId, rungRef.current), lookupBounds);
    }
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

    // The only checker there is reads algebra. Running it over a drawn molecule would
    // produce confident nonsense, so a subject without a checker is just a notebook.
    if (!subject.checker) return;

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
      const hadTick = followedRef.current.delete(lineId);
      if (findingsRef.current.delete(lineId) || hadTick) redrawMarks();
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
      if (verdict?.kind === "equivalent" && trusted) {
        followedRef.current.set(lineId, { verdict, revealed: !held });
        if (!held) redrawMarks();
      }
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
  }, [redrawMarks, subject.checker]);

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
    for (const f of followedRef.current.values()) f.revealed = true;
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
    setThinking(true);
    try {
      const { transcript } = await ptt.stopAndTranscribe();
      if (!transcript) {
        setSaid("I didn't catch that. Hold the mic, say it again, then let go.");
        return;
      }

      const open = openRef.current;
      // Nothing is under discussion, so there is nothing to explain.
      if (!open) {
        setSaid("I heard you, but there's no step marked to talk about yet.");
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
    } finally {
      setThinking(false);
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
    followedRef.current.clear();
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
    setProblems([]);
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
        void saveSheet(file, pages).then(refreshSheets, () => {});
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
        setProblems(anchorsRef.current);
        setWorksheet({
          id: sheetId(file),
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
    [reset, removeWorksheet, refreshSheets],
  );

  /** Below xl the library covers the canvas, so choosing something has to dismiss it;
   *  docked beside the canvas it stays put, like a sidebar. */
  const closeLibraryIfCovering = () => {
    if (!window.matchMedia("(min-width: 1280px)").matches) setPanel(null);
  };

  const outline =
    "inline-flex items-center gap-2 rounded-xl border border-(--wb-line) bg-(--wb-card) px-3.5 py-2 text-sm hover:bg-(--wb-hover) disabled:opacity-50";
  const field = "w-full rounded-lg border border-(--wb-line) bg-(--wb-card) px-2 py-1.5 text-sm";

  return (
    /* h-dvh, not h-screen: on iOS Safari h-screen is the WRONG height because of the
       address bar, and the canvas ends up pushed off the bottom of the viewport.
       overscroll-none stops the page rubber-banding while you draw. */
    /* fixed, over the site nav: the nav sits above this page in the root layout, so an
       h-dvh box starts 65px down and its bottom 65px - the Dock - falls off the screen.
       A notebook wants the whole screen anyway. */
    <div className="wb fixed inset-0 z-50 flex h-dvh flex-col overscroll-none">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="wb-serif text-2xl font-medium tracking-tight">
          Cognito
        </Link>
        <span className="h-6 w-px bg-(--wb-line)" />
        <span className="text-lg text-(--wb-muted)">{subject.name}</span>
        {worksheet && (
          <span className="flex items-center gap-2 rounded-md bg-(--wb-butter) py-1 pl-2.5 pr-1.5 text-[11px] font-medium uppercase tracking-wider text-(--wb-butter-ink)">
            <span className="max-w-40 truncate">{worksheet.name}</span>
            <span className="normal-case tracking-normal opacity-70">
              {worksheet.pages}p · {worksheet.problems} problems read
            </span>
            <button onClick={removeWorksheet} aria-label="Remove worksheet" className="rounded p-0.5 hover:bg-black/5">
              <Icon name="x" size={12} />
            </button>
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {(busy || checking) && (
            <span className="text-sm text-(--wb-muted)">{checking ? "checking…" : "reading…"}</span>
          )}
          {uploading && <span className="text-sm text-(--wb-muted)">opening…</span>}
          {subject.checker && (
            <div className="flex rounded-xl border border-(--wb-line) bg-(--wb-card) p-1 text-sm">
              {MODE_OPTIONS.map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => {
                    setMode(value);
                    modeRef.current = value;
                    // Going live with verdicts still held back would strand them.
                    if (value === "live" && mode === "when-done") void checkNow();
                  }}
                  className={`rounded-lg px-3 py-1 ${
                    mode === value ? "bg-(--wb-primary) text-(--wb-card)" : "text-(--wb-muted) hover:text-(--wb-ink)"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Cleared so picking the same file again still fires a change.
              e.target.value = "";
              if (file) {
                closeLibraryIfCovering();
                void loadWorksheet(file);
              }
            }}
          />
          <div className="relative">
            <button
              onClick={() => setSettingsOpen((open) => !open)}
              aria-label="Tutor settings"
              aria-expanded={settingsOpen}
              className={`${outline} px-2.5`}
            >
              <Icon name="sliders" size={18} />
            </button>
            {settingsOpen && (
              <div className="wb-pop absolute right-0 top-full z-[400] mt-2 w-72 space-y-3 rounded-2xl border border-(--wb-line) bg-(--wb-card) p-4 shadow-[0_12px_40px_rgb(59_42_31/0.16)]">
                <p className="text-[11px] font-medium uppercase tracking-widest text-(--wb-muted)">Tutor settings</p>
                <label className="block space-y-1 text-sm">
                  <span>How much the first hint shows</span>
                  <select value={rung} onChange={(e) => setRung(Number(e.target.value) as HintLevel)} className={field}>
                    {RUNG_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {value} · {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 text-sm">
                  <span>Voice</span>
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
                    className={field}
                  >
                    {VOICE_OPTIONS.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="font-mono text-[10px] text-(--wb-muted)">
                  idle {idleMs}ms · {box}
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Column on phones/tablets, row on desktop. min-h-0/min-w-0 are load-bearing:
          without them a flex child refuses to shrink and the canvas collapses to 0px. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 sm:px-4 sm:pb-4 lg:flex-row">
        <Rail panels={subject.panels} open={panel} onToggle={(id) => setPanel((open) => (open === id ? null : id))} />
        {panel === "mastery" && (
          <MasteryPanel mastery={masteryOf(readings, problems)} onClose={() => setPanel(null)} />
        )}
        {panel === "worksheets" && (
          <Library
            sheets={sheets}
            currentId={worksheet?.id ?? null}
            busy={uploading}
            onClose={() => setPanel(null)}
            onUpload={() => fileRef.current?.click()}
            onBlank={() => {
              reset();
              removeWorksheet();
              closeLibraryIfCovering();
            }}
            onSample={async () => {
              const res = await fetch(SAMPLE_SHEET);
              closeLibraryIfCovering();
              if (!res.ok) return setError("Couldn't load the sample worksheet.");
              await loadWorksheet(new File([await res.blob()], "algebra-practice.pdf", { type: "application/pdf" }));
            }}
            onOpen={async (id) => {
              const file = await fileOf(id).catch(() => null);
              closeLibraryIfCovering();
              if (!file) return setError("Couldn't find that worksheet in this browser any more.");
              await loadWorksheet(file);
            }}
            onDelete={(id) => {
              if (worksheet?.id === id) removeWorksheet();
              void deleteSheet(id).then(refreshSheets, () => {});
            }}
          />
        )}
        <div
          ref={boxRef}
          className="relative min-h-[55dvh] w-full flex-1 touch-none overflow-hidden rounded-3xl border border-(--wb-line) bg-(--wb-card) shadow-[0_1px_3px_rgb(59_42_31/0.06)] lg:min-h-0"
        >
          <div className="absolute inset-0">
            <Tldraw
              components={NOTEBOOK_UI}
              onMount={(editor) => {
                editorRef.current = editor;
                setEditor(editor);
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

          {error && (
            <div className="wb-pop absolute inset-x-3 top-3 z-[300] mx-auto flex max-w-md items-start gap-2 rounded-2xl border border-(--wb-bad-ink)/15 bg-(--wb-bad) px-4 py-2.5 text-sm text-(--wb-bad-ink)">
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} aria-label="Dismiss" className="mt-0.5">
                <Icon name="x" size={14} />
              </button>
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[300] flex items-center justify-center gap-2 sm:bottom-4">
            <div className="pointer-events-auto max-w-full">
              <Dock
                editor={editor}
                penColor={penColor}
                onPenColor={setPenColor}
                penSize={penSize}
                onPenSize={setPenSize}
                voiceOn={voiceOn}
                onVoiceOn={setVoiceOn}
                listening={listening}
                onTalkStart={() => void beginTalking()}
                onTalkEnd={() => void endTalking()}
                onReset={reset}
              />
            </div>
            {mode === "when-done" && (
              <button
                onClick={() => void checkNow()}
                disabled={checking}
                className="pointer-events-auto inline-flex shrink-0 items-center gap-2 rounded-full bg-(--wb-primary) px-5 py-3 text-sm font-medium text-(--wb-card) shadow-[0_6px_24px_rgb(59_42_31/0.2)] disabled:opacity-50"
              >
                <Icon name="check" size={16} />
                Check my work
              </button>
            )}
          </div>
        </div>

        <aside className="flex max-h-[38dvh] shrink-0 flex-col overflow-hidden rounded-3xl border border-(--wb-line) bg-(--wb-card) lg:max-h-none lg:w-80 2xl:w-96">
          {/* The tutor lives here, not over the canvas: anywhere on the page it would
              cover the problem the learner is working on. */}
          <div className="flex shrink-0 items-start gap-2 border-b border-(--wb-line) px-4 py-3">
            <Mascot size={52} listening={listening} />
            <div className="min-w-0 flex-1 pt-1">
              {listening ? (
                <TutorBubble text="I'm listening…" />
              ) : thinking ? (
                <TutorBubble text="Let me think…" />
              ) : said ? (
                <TutorBubble text={said} onDismiss={() => setSaid(null)} />
              ) : (
                <p className="pt-2.5 text-sm text-(--wb-muted)">
                  {subject.checker ? "I'll speak up if a step doesn't follow." : "Draw away. I'm just keeping you company."}
                </p>
              )}
            </div>
          </div>
          <h2 className="wb-serif shrink-0 px-5 pb-2 pt-4 text-xl">Your steps</h2>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {readings.length === 0 && (
              <div className="grid place-items-center gap-3 px-6 py-10 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-(--wb-butter) text-(--wb-butter-ink)">
                  <Icon name="pen" />
                </span>
                <p className="text-sm text-(--wb-muted)">
                  {!subject.checker
                    ? `Step checking for ${subject.name.toLowerCase()} is coming soon. For now this is your notebook: upload a worksheet and draw on it.`
                    : mode === "live"
                    ? "Write a line, then start the next one underneath. Nothing to press."
                    : "Work the whole thing through, then press Check my work."}
                </p>
              </div>
            )}

            <ol className="space-y-2.5">
              {readings.map((r, i) => (
                <li key={i} className="rounded-2xl border border-(--wb-line) p-3.5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium uppercase tracking-widest text-(--wb-muted)">
                      Step {i + 1}
                    </span>
                    {r.hidden ? (
                      <Tag tone="butter">Held until you check</Tag>
                    ) : r.verdict ? (
                      r.verdict.kind === "equivalent" ? (
                        <Tag tone="good">Follows</Tag>
                      ) : r.verdict.kind === "undetermined" ? (
                        <Tag tone="quiet">Couldn&apos;t tell</Tag>
                      ) : (
                        <Tag tone="bad">Take another look</Tag>
                      )
                    ) : (
                      r.provisional && <Tag tone="quiet">Still writing?</Tag>
                    )}
                  </div>
                  <div className="break-all font-mono text-[15px]">{r.raw || "(nothing read)"}</div>
                  <details className="mt-2 text-[11px] text-(--wb-muted)">
                    <summary className="cursor-pointer select-none">Details</summary>
                    <div className="mt-1.5 space-y-1">
                      <div className="break-all font-mono">→ {r.parsed}</div>
                      <div>
                        {r.strokeCount} strokes
                        {r.confidence !== null && ` · confidence ${r.confidence.toFixed(2)}`} ·{" "}
                        <span className={r.ms < 400 ? "text-(--wb-good-ink)" : "text-(--wb-butter-ink)"}>
                          read in {r.ms}ms
                        </span>
                        {r.provisional && " · still writing?"}
                      </div>
                      {r.verdict && !r.hidden && (
                        <div>
                          <strong>{r.verdict.kind}</strong>
                          {r.verdict.kind === "direction" &&
                            ` — expected "${r.verdict.expected}", got "${r.verdict.got}"`}
                          {r.verdict.kind === "undetermined" && ` — ${r.verdict.why}`}
                          {r.verdict.kind === "not-equivalent" &&
                            ` — at ${r.verdict.witness.variable}=${r.verdict.witness.at.toFixed(2)}: previous ${r.verdict.witness.previousValue.toFixed(2)}, yours ${r.verdict.witness.currentValue.toFixed(2)}`}
                          {r.checkMs !== null && ` (${r.checkMs.toFixed(2)}ms)`}
                        </div>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
