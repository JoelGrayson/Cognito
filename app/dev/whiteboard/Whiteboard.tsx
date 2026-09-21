/**
 * The handwriting whiteboard: write a line, start the next one underneath, and each
 * step is read (Mathpix) and checked against the one before it with the real checker.
 * On a blank board or on an uploaded worksheet.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AgentProvider,
  useAgentClientTool,
  useAgentMode,
  useAgentPlayer,
  useAgentSession,
  useAgentState,
  type AgentSessionConfig,
} from "@deepgram/react";
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
import { usePushToTalk } from "./usePushToTalk";
import { usePenInput } from "./usePenInput";
import { latexToMathjs, isMultiLineReading } from "@/lib/whiteboard/ink";
import { createAnnotator, type Annotator, type Mark } from "@/lib/whiteboard/annotate";
import { marksFor } from "@/lib/whiteboard/marks";
import { locateOperator } from "@/lib/whiteboard/locate";
import { pagesOf } from "@/lib/whiteboard/pdf";
import { masteryOf } from "@/lib/whiteboard/mastery";
import type { Subject, SubjectPanel } from "@/lib/subjects";
import { deleteSheet, fileOf, listSheets, saveSheet, sheetId, type SavedSheet } from "@/lib/whiteboard/library";
import {
  anchorsFrom,
  premiseFor,
  problemFor,
  questionsFrom,
  type Premise,
  type PrintedLine,
  type ProblemAnchor,
} from "@/lib/whiteboard/worksheet";
import { answerKeyFor, circuitKeyFor, type CircuitKeyEntry } from "@/lib/whiteboard/answer-keys";
import { canonicalKey, loadRDKit } from "@/lib/whiteboard/rdkit";
import { readStructures, verdictLine, type StructureReading } from "@/lib/whiteboard/structures";
import { assessExplanation } from "@/lib/whiteboard/explanation";
import { spokenFor, ASK_WHY } from "@/lib/whiteboard/voice";
import { workContext, type StepView } from "@/lib/whiteboard/context";
import { parsePlotArgs, planPlot, type Plot } from "@/lib/whiteboard/graph";
import { GraphsPanel, type DesmosState } from "./Graphs";
import { PLOT_GRAPH, READ_WORK, TUTOR_VOICES, TUTOR_VOICE_MODEL, whiteboardAgentSettings } from "@/lib/ai/whiteboard-agent";
import { ensureAnonymousSession } from "@/lib/auth-client";
import { DEFAULT_CONFIG, type HintLevel } from "@/lib/whiteboard/policy";
import type { Verdict } from "@/lib/whiteboard/checker/circuit";
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
  verdict: Verdict;
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
  verdict: Verdict | null;
  checkMs: number | null;
}

/**
 * The tutor's voice is one Deepgram voice agent session, the same stack the live
 * lessons run on. It is held open for the whole page and is used in two directions:
 * the checker's findings are injected into its mouth verbatim, and push-to-talk
 * unmutes the microphone so the learner can just ask it something.
 *
 * The microphone is not acquired until the first hold - a permission prompt the
 * moment the page opens reads as hostile - and once acquired it stays open but
 * muted, because re-acquiring it on every press swallows the first word.
 */
export function Whiteboard({ subject, autoSheet = false }: { subject: Subject; autoSheet?: boolean }) {
  const [micLive, setMicLive] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const config = useMemo<AgentSessionConfig>(
    () => ({
      auth: {
        tokenFactory: async () => {
          // The token route is authenticated; on this page there may be no session yet.
          await ensureAnonymousSession();
          const res = await fetch("/api/voice/token", { cache: "no-store" });
          if (!res.ok) {
            throw new Error(
              res.status === 503
                ? "Voice is off: set DEEPGRAM_API_KEY in .env.local."
                : "Couldn't start the tutor's voice.",
            );
          }
          return ((await res.json()) as { access_token: string }).access_token;
        },
      },
      agent: whiteboardAgentSettings(subject.name, subject.panels.includes("graphs")),
      audio: {
        input: { encoding: "linear16", sampleRate: 16000 },
        output: { encoding: "linear16", sampleRate: 24000 },
      },
      // Most of a whiteboard session is spent writing with the mic muted.
      // The SDK's ten-second default can race the service's idle timeout.
      keepAliveInterval: 5000,
      reconnect: { enabled: true, maxAttempts: 3 },
    }),
    [subject.name, subject.panels],
  );

  return (
    <AgentProvider
      config={config}
      autoStart
      microphone={micLive}
      microphoneOptions={{
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
        sampleRate: 16000,
      }}
      onError={(e) => setVoiceError(e.description || "The tutor's voice dropped out.")}
      onSdkError={(e) =>
        setVoiceError(
          e.name === "NotAllowedError"
            ? "Couldn't reach the microphone — check the browser permission."
            : e.message || "The tutor's voice dropped out.",
        )
      }
    >
      <Notebook
        subject={subject}
        autoSheet={autoSheet}
        onMicLive={() => setMicLive(true)}
        voiceError={voiceError}
        clearVoiceError={() => setVoiceError(null)}
      />
    </AgentProvider>
  );
}

function Notebook({
  subject,
  autoSheet,
  onMicLive,
  voiceError,
  clearVoiceError,
}: {
  subject: Subject;
  /** Load the built-in algebra sheet on mount (`?sheet=sample`) — the lesson → practice link. */
  autoSheet: boolean;
  onMicLive: () => void;
  voiceError: string | null;
  clearVoiceError: () => void;
}) {
  const editorRef = useRef<Editor | null>(null);
  /** The same editor, as state: the Dock renders from it, the callbacks read the ref. */
  const [editor, setEditor] = useState<Editor | null>(null);
  const [drawingUnavailable, setDrawingUnavailable] = useState(false);
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

  // tldraw 5.4.2 replaces the editor with this marker after five seconds for an
  // invalid production license. Its license state is not a public API. Observe
  // only the container's direct children, not the shapes changed by every stroke.
  // The notice lives outside tldraw, so it survives the editor being removed.
  useEffect(() => {
    const container = boxRef.current?.querySelector(".tl-container");
    if (!container) return;
    const observer = new MutationObserver(() => {
      setDrawingUnavailable(container.querySelector('[data-testid="tl-license-expired"]') !== null);
    });
    observer.observe(container, { childList: true });
    return () => observer.disconnect();
  }, []);

  // Readings mirrored into a ref: the commit callback is registered once at mount
  // and would otherwise close over a stale array.
  const recorderRef = useRef<StrokeRecorder | null>(null);
  const session = useAgentSession();
  const { state: agentState } = useAgentState();
  const { mode: agentMode } = useAgentMode();
  const { holding, listening, beginTalking, endTalking } = usePushToTalk(onMicLive);
  usePenInput(editor);
  const { setOutputMuted } = useAgentPlayer();
  const [voiceOn, setVoiceOn] = useState(true);
  const voiceOnRef = useRef(voiceOn);
  useEffect(() => {
    voiceOnRef.current = voiceOn;
  }, [voiceOn]);
  const [said, setSaid] = useState<string | null>(null);
  /** Utterance for a line that was read provisionally and hasn't been spoken yet. */
  const pendingSpeechRef = useRef<{ lineId: number; text: string; gen: number } | null>(null);
  /** Lines already settled by a line break. Kept separately because the two halves
   *  race: the idle OCR request is async, so a fast next line can finalize before
   *  the reading even exists. Whichever arrives second speaks. */
  const finalizedRef = useRef<Set<number>>(new Set());
  /** Every read and every reply is stamped with a generation. Anything that resumes
   *  after an await checks its stamp before touching shared state - otherwise a
   *  response that arrives 800ms late redraws a mark the learner has already fixed,
   *  or speaks about a line they have since rewritten. */
  const genRef = useRef(0);
  const [voiceId, setVoiceId] = useState<string>(TUTOR_VOICE_MODEL);
  const [heard, setHeard] = useState<string | null>(null);
  /** The step currently under discussion. Set when a mark is drawn, cleared once the
   *  learner names the error - that is what makes "speaking is the hint request"
   *  possible without a button. */
  const openRef = useRef<Finding | null>(null);
  /** Every wrong step not yet resolved, by lineId. The marks on the canvas are always
   *  a pure function of this map - see redrawMarks. */
  const findingsRef = useRef<Map<number, Finding>>(new Map());
  /** Steps judged to follow, by lineId, and whether the learner may see that yet.
   *  Drawn as ticks by redrawMarks, alongside the findings. */
  const followedRef = useRef<Map<number, { verdict: Verdict; revealed: boolean }>>(new Map());
  /** A drawing has no "next line" to say it is finished, so structures are only ever
   *  checked when asked. Written lines - algebra steps, circuit equations - can be. */
  const checksSteps = subject.checker === "algebra-steps" || subject.checker === "circuit-laws";
  const checksCircuits = subject.checker === "circuit-laws";
  const [mode, setMode] = useState<CheckMode>(checksSteps ? "live" : "when-done");
  /** Numbered questions on the sheet, for subjects whose questions are prose. */
  const questionsRef = useRef<ProblemAnchor[]>([]);
  const [structures, setStructures] = useState<StructureReading[]>([]);
  /** Bumped by reset. A structure check that comes back to a different generation was
   *  for a board that has since been cleared, and must not draw on the new one. */
  const structureGenRef = useRef(0);
  const modeRef = useRef<CheckMode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const [checking, setChecking] = useState(false);
  /** Reads still on the wire. "Check my work" has to wait for them, or the last line
   *  is judged after the verdict has already been announced. */
  const inflightRef = useRef<Set<Promise<void>>>(new Set());
  const anchorsRef = useRef<ProblemAnchor[]>([]);
  /** The sheet's circuits by anchor id (the negated question number), for subjects
   *  whose lines are judged against a circuit rather than the line above. */
  const circuitsRef = useRef<Map<number, CircuitKeyEntry>>(new Map());
  const [worksheet, setWorksheet] = useState<{ id: string; name: string; pages: number; problems: number } | null>(
    null,
  );
  /** One side panel at a time; null is closed. */
  const [panel, setPanel] = useState<SubjectPanel | null>(null);
  /** What the tutor has drawn on the graph. The panel is a view of this, so
   *  closing it and opening it again shows the same curves. */
  const [plots, setPlots] = useState<Plot[]>([]);
  /** Whatever the learner typed into the calculator, held across closings of the
   *  panel - the calculator itself only exists while the panel is open. */
  const graphStateRef = useRef<DesmosState | null>(null);
  /** Bumped by reset, so an open calculator empties itself too. */
  const [graphReset, setGraphReset] = useState(0);
  const canGraph = subject.panels.includes("graphs");
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

  const agentStateRef = useRef(agentState);
  useEffect(() => {
    agentStateRef.current = agentState;
  }, [agentState]);

  /** An announcement made before the session was up, or during a reconnect. Only
   *  the newest is kept: by the time the socket is back, an older one is describing
   *  a line the learner has moved on from. */
  const heldRef = useRef<{ text: string; gen: number } | null>(null);

  /** Put words in the tutor's mouth. What the checker found is spoken verbatim -
   *  the verdict is deterministic and nothing may rephrase it into an accusation
   *  the checker never made. Queued rather than interrupting, so the tutor never
   *  talks over the learner; the words are on screen either way. */
  const speak = useCallback(
    (text: string, gen: number = genRef.current) => {
      if (!voiceOnRef.current) return;
      if (agentStateRef.current !== "connected") {
        // Connecting takes a second or two, and the first line can be written and
        // checked inside it. Hold the words rather than dropping them silently.
        // Stamped with the read these words came FROM, not the newest one: reads can
        // land out of order, and a later one may already have superseded this.
        const previous = heldRef.current;
        if (!previous || gen >= previous.gen) heldRef.current = { text, gen };
        return;
      }
      session.injectAgentMessage(text, "queue");
    },
    [session],
  );

  useEffect(() => {
    if (agentState !== "connected") return;
    const held = heldRef.current;
    heldRef.current = null;
    // Not if any line has been re-read since - the words were about the page as it
    // stood then, and the canned phrases repeat, so text alone cannot tell the two
    // apart. Reset clears the hold outright.
    if (held && held.gen === genRef.current && voiceOnRef.current)
      session.injectAgentMessage(held.text, "queue");
  }, [agentState, session]);

  // The voice toggle silences the tutor without dropping the session: the learner
  // can still talk to it and read the answer in the bubble.
  useEffect(() => setOutputMuted(!voiceOn), [voiceOn, setOutputMuted]);

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
        speak(pending.text, pending.gen);
      }
      return;
    }

    // The line checkers read equations. Running one over a drawn molecule would
    // produce confident nonsense, so a subject without one is just a notebook.
    if (!checksSteps) return;

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
      let parsed = latexToMathjs(raw);
      const problem = lineBounds ? problemFor(lineBounds, anchorsRef.current) : null;

      let premise: Premise | null;
      let judged: { verdict: Verdict; checkMs: number } | null = null;
      if (checksCircuits) {
        // The premise of a circuit line is the circuit it is written under, never the
        // line above: every KVL sum, KCL sum and value is judged against the solution.
        const { checkCircuitLine, solveCircuit, stripUnits } = await import("@/lib/whiteboard/checker/circuit");
        parsed = stripUnits(parsed);
        const circuit = problem ? circuitsRef.current.get(problem.id) : undefined;
        premise = problem && circuit ? { text: `the circuit of question ${-problem.id}`, lineId: problem.id } : null;
        if (circuit) {
          const t0 = performance.now();
          judged = { verdict: checkCircuitLine(parsed, solveCircuit(circuit)), checkMs: performance.now() - t0 };
        }
      } else {
        // The previous STEP is the newest trusted earlier line of the same problem, or
        // the printed problem itself -- see premiseFor.
        premise = premiseFor(readingsRef.current, lineId, problem, DEFAULT_CONFIG.recognitionConfidenceFloor);
        const { checkStep } = await import("@/lib/whiteboard/checker/numeric");
        if (premise) {
          const t0 = performance.now();
          judged = { verdict: checkStep(premise.text, parsed), checkMs: performance.now() - t0 };
        }
      }
      const verdict = judged?.verdict ?? null;
      const checkMs = judged?.checkMs ?? null;

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
          setSaid(utterance);

          // Speak only once the line is FINAL. A mark is glanceable and self-corrects
          // on the next read; a spoken accusation cannot be taken back, and an idle
          // commit is explicitly provisional - the learner may still be writing.
          if (reason === "line-break") {
            speak(utterance, gen);
          } else if (wasFinalized) {
            // Finalization won the race and arrived before this reading existed.
            // Consume it now rather than waiting for an event that already passed.
            speak(utterance, gen);
          } else {
            // Provisional: hold the words until the line is settled, so a half-read
            // line never becomes a spoken accusation - but the step is not silenced
            // forever either, which is what happened before "finalized" existed.
            pendingSpeechRef.current = { lineId, text: utterance, gen };
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
  }, [checksCircuits, checksSteps, redrawMarks, speak]);

  /** Chemistry's "check my work": read every drawn structure, judge each against the
   *  sheet's answer key, tick the right ones and circle the rest. */
  const checkStructures = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const rawKey = answerKeyFor(worksheet?.name);
    if (!rawKey) {
      const line = "I don't have an answer key for this sheet, so I can't check it. Open the organic chemistry practice sheet from your worksheets.";
      setSaid(line);
      return speak(line);
    }

    setChecking(true);
    setError(null);
    const gen = ++structureGenRef.current;
    try {
      const rdkit = await loadRDKit();
      const read = await readStructures(editor, rdkit, canonicalKey(rdkit, rawKey), questionsRef.current);
      if (gen !== structureGenRef.current) return;
      setStructures(read);

      annotatorRef.current?.clear();
      const bounds = new Map(read.map((r, i) => [i, r.bounds]));
      // Same hint ladder as the steps: below rung 4 a wrong structure is circled and
      // nothing more; from rung 4 the margin says what was actually drawn.
      const nameIt = rungRef.current >= 4;
      annotatorRef.current?.draw(
        read.flatMap((r, i): Mark[] => {
          // A question, not a circle: see StructureReading.suspected.
          if (r.suspected) return [{ kind: "margin-note", lineId: i, text: "?", tone: "problem" }];
          if (!r.verdict) return [];
          if (r.verdict.kind === "correct") return [{ kind: "tick", lineId: i }];
          const circle: Mark = { kind: "circle", lineId: i, tone: "problem" };
          return nameIt && r.verdict.kind !== "no-match"
            ? [circle, { kind: "margin-note", lineId: i, text: r.verdict.name, tone: "problem" }]
            : [circle];
        }),
        (i) => bounds.get(i),
      );

      const judged = read.flatMap((r) => (r.verdict ? [r.verdict] : []));
      const wrong = judged.filter((v) => v.kind !== "correct");
      const unread = read.length - judged.length;
      let line: string;
      if (read.length === 0) line = "There's nothing drawn yet.";
      else if (wrong.length === 0 && read.some((r) => r.suspected)) {
        const q = read.find((r) => r.suspected)?.asked;
        line = `${q ? `Question ${q}` : "One of them"} doesn't look like the answer to me, but I'm not sure I read it right. Compare it with what I read, in the side panel.`;
      } else if (judged.length === 0) line = "I couldn't read those as structures. Try drawing them a little larger, with the letters clear of the lines.";
      else if (wrong.length === 0) line = `${judged.length === 1 ? "That structure is" : `All ${judged.length} structures are`} right.${unread ? " One I couldn't read." : ""}`;
      else line = `${wrong.length === 1 ? "" : `I've circled ${wrong.length}. `}${verdictLine(wrong[0], nameIt)}`;
      setSaid(line);
      speak(line);
    } catch (e) {
      if (gen === structureGenRef.current) setError(e instanceof Error ? e.message : "Couldn't check the structures.");
    } finally {
      setChecking(false);
    }
  }, [speak, worksheet?.name]);

  /** "I'm done" - settle the last line, wait for every read, then say it all at once. */
  const checkNow = useCallback(async () => {
    if (subject.checker === "structure-key") return checkStructures();
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
          : checksCircuits && circuitsRef.current.size === 0
            ? "I can't check these without the circuit. Open the circuits practice sheet from your worksheets."
            : checksCircuits
              ? "Every equation I could read holds for the circuit."
              : "I didn't find a step that doesn't follow.";
    } else {
      const first = fresh[0];
      openRef.current = first;
      const count = fresh.length > 1 ? `I've marked ${fresh.length} steps. Start with the first one.` : "";
      const why = ASK_WHY[Math.floor(Math.random() * ASK_WHY.length)];
      utterance = `${count} ${spokenFor(first.rung, first.verdict.kind)} ${why}`.trim();
    }
    setSaid(utterance);
    speak(utterance);
  }, [checkStructures, checksCircuits, redrawMarks, speak, subject.checker]);

  /** The learner just named the error, and the agent has not been told yet. */
  const justFoundRef = useRef(false);

  /** Everything the tutor may know about the page, gated by the rung of the step
   *  under discussion - see lib/whiteboard/context.ts. */
  useAgentClientTool(
    READ_WORK,
    useCallback(() => {
      const visible = readingsRef.current.filter((r) => !r.hidden);
      const open = openRef.current;
      const steps: StepView[] = visible.map((r, i) => ({
        position: i + 1,
        text: r.parsed || r.raw,
        status:
          open?.lineId === r.lineId
            ? "marked"
            : followedRef.current.get(r.lineId)?.revealed
              ? "follows"
              : "unjudged",
      }));
      const justFound = justFoundRef.current;
      justFoundRef.current = false;
      return workContext({
        subject: subject.name,
        steps,
        justFound,
        open: open
          ? {
              position: visible.findIndex((r) => r.lineId === open.lineId) + 1,
              premise: open.premise,
              step: open.parsedStep,
              verdict: open.verdict,
              rung: open.rung,
            }
          : null,
      });
    }, [subject.name]),
  );

  /** The tutor draws on the shared calculator. Whether it MAY is decided here,
   *  off the same rung that gates its words - see lib/whiteboard/graph.ts. */
  useAgentClientTool(
    PLOT_GRAPH,
    useCallback(
      (fn: { arguments: string }) => {
        // The tool is not offered on a subject without a graph panel, but a model
        // that calls it anyway is told no rather than opening one.
        if (!canGraph) return `There is no graph on the ${subject.name} page. Say it instead.`;
        const plan = planPlot(parsePlotArgs(fn.arguments), openRef.current?.rung ?? null);
        if (!plan.ok) return plan.message;
        setPlots(plan.plots);
        // No point drawing into a panel they cannot see. On a narrow screen this
        // takes over the canvas, which is the right trade when a graph was asked
        // for - but wiping the graph is no reason to open it.
        if (plan.plots.length > 0) setPanel("graphs");
        return plan.message;
      },
      [canGraph, subject.name],
    ),
  );

  // Every learner turn is also a move in the hint ladder. The agent decides the
  // WORDS; whether they actually found the error stays with the deterministic
  // check, which knows - a model guessing "yes" closes a real error because the
  // learner happened to name some other plausible mistake.
  useEffect(() => {
    const onText = (msg: { role: string; content: string }) => {
      if (msg.role === "assistant") {
        setSaid(msg.content);
        return;
      }
      if (msg.role !== "user") return;
      setHeard(msg.content);
      const open = openRef.current;
      if (!open) return;

      // Explaining and not getting there IS the request for more help, so the
      // learner never has to press anything to ask. The system still never
      // volunteers a rung unprompted - this IS the prompt.
      if (assessExplanation(msg.content, open.verdict).kind === "found-it") {
        findingsRef.current.delete(open.lineId);
        justFoundRef.current = true;
        openRef.current = revealedFindings()[0] ?? null;
      } else {
        open.rung = Math.min(open.rung + 1, 5) as HintLevel;
      }
      redrawMarks();
    };
    session.on("conversation-text", onText);
    return () => void session.off("conversation-text", onText);
  }, [session, redrawMarks, revealedFindings]);

  /** Clears the learner's ink and the tutor's marks. An uploaded sheet stays. */
  const reset = useCallback(() => {
    setReadings([]);
    setStructures([]);
    structureGenRef.current += 1;
    annotatorRef.current?.clear();
    setError(null);
    recorderRef.current?.clear();
    setSaid(null);
    setHeard(null);
    heldRef.current = null;
    pendingSpeechRef.current = null;
    finalizedRef.current.clear();
    openRef.current = null;
    findingsRef.current.clear();
    followedRef.current.clear();
    justFoundRef.current = false;
    boundsRef.current.clear();
    setPlots([]);
    // Their graph is their working too: a new sheet should not open onto the
    // last one's curves.
    graphStateRef.current = null;
    setGraphReset((n) => n + 1);
    session.clearConversationHistory();
    const editor = editorRef.current;
    if (!editor) return;
    const ink = editor
      .getCurrentPageShapes()
      .filter((sh) => !(sh.meta as { worksheetPage?: boolean }).worksheetPage)
      .map((sh) => sh.id);
    if (ink.length > 0) editor.deleteShapes(ink);
  }, [session]);

  const removeWorksheet = useCallback(() => {
    anchorsRef.current = [];
    circuitsRef.current = new Map();
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
        // License validation can unmount the editor while the PDF is rendering.
        if (editor.isDisposed) return;
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
        questionsRef.current = questionsFrom(printed);
        if (checksCircuits) {
          // A circuit question poses no statement to step from, so its anchor only says
          // which circuit the line beneath belongs to. Ids are negated like the algebra
          // anchors' so they never collide with a lineId; -id is the printed number.
          anchorsRef.current = questionsRef.current.map((q) => ({ ...q, id: -q.id }));
          circuitsRef.current = new Map(
            (circuitKeyFor(file.name) ?? [])
              .filter((c) => anchorsRef.current.some((a) => a.id === -c.problem))
              .map((c) => [-c.problem, c]),
          );
        } else {
          anchorsRef.current = anchorsFrom(printed);
        }
        setProblems(anchorsRef.current);
        setWorksheet({
          id: sheetId(file),
          name: file.name,
          pages: pages.length,
          problems: checksCircuits
            ? circuitsRef.current.size
            : checksSteps
              ? anchorsRef.current.filter((a) => a.parsed).length
              : questionsRef.current.length,
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
    [checksCircuits, checksSteps, reset, removeWorksheet, refreshSheets],
  );

  /** The subject's bundled sheet, fetched as a File so it goes through the same load path as an upload. */
  const loadSampleSheet = useCallback(async () => {
    const res = await fetch(subject.sampleSheet.path);
    if (!res.ok) return setError("Couldn't load the sample worksheet.");
    await loadWorksheet(new File([await res.blob()], subject.sampleSheet.file, { type: "application/pdf" }));
  }, [loadWorksheet, subject.sampleSheet]);

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
          {checksSteps && (
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
                      // Switch the running session's voice, then audition it, so it
                      // can be chosen without writing anything.
                      session.updateSpeak({ provider: { type: "deepgram", version: "v1", model: e.target.value } });
                      speak("Something in there doesn't hold up. Want to take another look?");
                    }}
                    className={field}
                  >
                    {TUTOR_VOICES.map(([model, name]) => (
                      <option key={model} value={model}>
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
        <Rail
          panels={subject.panels}
          open={panel}
          graphed={plots.length > 0 && panel !== "graphs"}
          onToggle={(id) => setPanel((open) => (open === id ? null : id))}
        />
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
            sample={subject.sampleSheet}
            onSample={() => {
              closeLibraryIfCovering();
              void loadSampleSheet();
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
          {/* The graph is a tab over the sheet, not a sidebar: it takes the whole
              canvas. The canvas stays mounted underneath so the ink and the editor
              survive switching back. */}
          {panel === "graphs" && (
            <GraphsPanel
              plots={plots}
              stateRef={graphStateRef}
              resetKey={graphReset}
            />
          )}
          <div className="absolute inset-0">
            <Tldraw
              components={NOTEBOOK_UI}
              licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
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
                // ?sheet=sample lands straight on the algebra worksheet, e.g. from a lesson page.
                if (autoSheet) void loadSampleSheet();
                // React dev-mode mounts twice. Without this, two store listeners end up
                // registered and every line is submitted twice.
                recorderRef.current?.stop();
                const recorder = recordStrokes(
                  editor,
                  (commit) => {
                    const read = submitLine(commit);
                    inflightRef.current.add(read);
                    void read.finally(() => inflightRef.current.delete(read));
                  },
                  { ...DEFAULT_ENDPOINT_CONFIG, finalLineIdleMs: idleMs },
                );
                recorderRef.current = recorder;
                return () => recorder.stop();
              }}
            />
          </div>

          {drawingUnavailable && (
            <div role="alert" className="absolute inset-0 z-[300] grid place-items-center bg-(--wb-card) p-8 text-center">
              <div className="max-w-sm space-y-2">
                <p className="wb-serif text-2xl">Whiteboard unavailable</p>
                <p className="text-sm text-(--wb-muted)">
                  This site&apos;s drawing license is missing or expired. Please contact the site owner.
                </p>
              </div>
            </div>
          )}

          {!drawingUnavailable && (error ?? voiceError) && (
            <div className="wb-pop absolute inset-x-3 top-3 z-[300] mx-auto flex max-w-md items-start gap-2 rounded-2xl border border-(--wb-bad-ink)/15 bg-(--wb-bad) px-4 py-2.5 text-sm text-(--wb-bad-ink)">
              <span className="flex-1">{error ?? voiceError}</span>
              <button
                onClick={() => {
                  setError(null);
                  clearVoiceError();
                }}
                aria-label="Dismiss"
                className="mt-0.5"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          )}

          {/* wrap-reverse: on a tablet the dock and the check button are wider than the
              canvas together, and a single row pushed the pen off one edge and the button
              off the other. When they do not fit, the button takes its own row ABOVE the
              dock, so the dock stays where the hand expects it. */}
          <div hidden={drawingUnavailable} className="pointer-events-none absolute inset-x-3 bottom-3 z-[300] flex flex-wrap-reverse items-center justify-center gap-2 sm:bottom-4">
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
                holding={holding}
                onTalkStart={beginTalking}
                onTalkEnd={endTalking}
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
              ) : holding ? (
                <TutorBubble text={agentState === "connected" ? "Opening your microphone… Keep holding, and wait for “I'm listening”." : "Connecting to your tutor…"} />
              ) : agentMode === "thinking" ? (
                <TutorBubble text="Let me think…" />
              ) : said ? (
                <TutorBubble text={said} onDismiss={() => setSaid(null)} />
              ) : (
                <p className="pt-2.5 text-sm text-(--wb-muted)">
                  {checksCircuits
                    ? "Open a circuit sheet and write your KVL, KCL and answers under each one. I'll speak up if an equation doesn't hold. Hold space, or the mic, to ask me something."
                    : checksSteps
                    ? "I'll speak up if a step doesn't follow. Hold space, or the mic, to ask me something."
                    : subject.checker
                      ? "Draw your structures, then press Check my work. Hold space, or the mic, to ask me something."
                      : "Draw away. Hold space, or the mic, to ask me something."}
                </p>
              )}
              {heard && <p className="mt-2 text-xs text-(--wb-muted)">Heard: “{heard}”</p>}
            </div>
          </div>
          <h2 className="wb-serif shrink-0 px-5 pb-2 pt-4 text-xl">{checksCircuits ? "Your equations" : checksSteps ? "Your steps" : "Your structures"}</h2>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {structures.length > 0 && (
              <ol className="space-y-2.5">
                {structures.map((s, i) => (
                  <li key={i} className="rounded-2xl border border-(--wb-line) p-3.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-widest text-(--wb-muted)">
                        {s.asked === null ? `Structure ${i + 1}` : `Question ${s.asked}`}
                      </span>
                      {!s.verdict ? (
                        // A molecule was read but not trusted enough to judge by.
                        <Tag tone={s.suspected ? "butter" : "quiet"}>
                          {s.suspected ? "Is this what you drew?" : s.svg ? "Not sure I read this right" : "Couldn\u2019t read"}
                        </Tag>
                      ) : s.verdict.kind === "correct" ? (
                        <Tag tone="good">Right</Tag>
                      ) : (
                        <Tag tone="bad">Take another look</Tag>
                      )}
                    </div>
                    {s.svg && (
                      <div
                        className="h-24 overflow-hidden rounded-xl bg-white [&>svg]:h-full [&>svg]:w-full"
                        dangerouslySetInnerHTML={{ __html: s.svg }}
                      />
                    )}
                    <p className="mt-1.5 text-[11px] text-(--wb-muted)">
                      {s.svg ? "What I read from your drawing" : "Nothing I could read as a molecule"}
                      {s.confidence !== null && ` · confidence ${s.confidence.toFixed(2)}`}
                    </p>
                  </li>
                ))}
              </ol>
            )}
            {readings.length === 0 && structures.length === 0 && (
              <div className="grid place-items-center gap-3 px-6 py-10 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-(--wb-butter) text-(--wb-butter-ink)">
                  <Icon name="pen" />
                </span>
                <p className="text-sm text-(--wb-muted)">
                  {!subject.checker
                    ? `Step checking for ${subject.name.toLowerCase()} is coming soon. For now this is your notebook: upload a worksheet and draw on it.`
                    : !checksSteps
                    ? "Open a worksheet, draw each structure under its question, then press Check my work."
                    : checksCircuits
                    ? "Open the circuits sheet, then write each KVL or KCL equation under its circuit. Each one is checked against the circuit as you write it."
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
                          {r.verdict.kind === "sign" && ` — flip the sign of ${r.verdict.term} and it holds`}
                          {r.verdict.kind === "wrong-value" &&
                            ` — ${r.verdict.variable} is ${r.verdict.expected.toFixed(3)}, not ${r.verdict.got}`}
                          {r.verdict.kind === "not-holding" &&
                            ` — in the circuit, left side ${r.verdict.lhs.toFixed(3)}, right side ${r.verdict.rhs.toFixed(3)}`}
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
