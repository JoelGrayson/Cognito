"use client";

import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import { applyActions, describeBoard, learnerStroke, type BoardElement, type ResolvedAction } from "@/lib/board";
import { ensureOk } from "@/lib/ndjson";
import type { ProviderId } from "@/lib/providers/types";
import type { BoardColor, Lesson } from "@/lib/schema";
import { loadVoice, pacedSpeaker, type Listener, type Speaker, type Voice } from "@/lib/voice";
import { Board, INK } from "./Board";

type Status = "thinking" | "speaking" | "listening" | "your-turn" | "drawing" | "ended" | "error";
interface Line {
  role: "tutor" | "learner";
  text: string;
}
interface Turn {
  say: string;
  actions: ResolvedAction[];
  next: "answer" | "draw" | "continue" | "end";
}

interface Props {
  topic: string;
  lesson: Lesson;
  providerId: ProviderId;
  onClose: () => void;
}

const PENS: BoardColor[] = ["blue", "red", "green", "ink"];
/** The tutor may keep talking without a reply at most this many turns in a row. */
const MAX_CONTINUES = 2;

/**
 * A lesson taught over a "video call": the tutor talks, draws on a shared
 * whiteboard, asks questions and asks the learner to draw. The learner replies
 * by voice or by typing.
 */
export function VideoCall({ topic, lesson, providerId, onClose }: Props) {
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [transcript, setTranscript] = useState<Line[]>([]);
  const [status, setStatus] = useState<Status>("thinking");
  const [caption, setCaption] = useState("");
  const [heard, setHeard] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [voiceOn, setVoiceOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [penColor, setPenColor] = useState<BoardColor>("blue");
  const [pending, setPending] = useState(0);
  const [voiceReady, setVoiceReady] = useState(false);

  // Latest values for the async turn loop.
  const elementsRef = useRef<BoardElement[]>([]);
  const transcriptRef = useRef<Line[]>([]);
  const pendingRef = useRef(0);
  const strokeCount = useRef(0);
  const continues = useRef(0);
  const ended = useRef(false);
  const interrupted = useRef(false);
  const micOnRef = useRef(true);
  const voiceOnRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const voiceRef = useRef<Voice | null>(null);
  const listenerRef = useRef<Listener | null>(null);
  const speakerRef = useRef<Speaker | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptEnd = useRef<HTMLDivElement>(null);

  const voice = voiceReady ? voiceRef.current : null;
  const canListen = voice?.canListen ?? false;

  function setBoard(next: BoardElement[]) {
    elementsRef.current = next;
    setElements(next);
  }
  function addLine(line: Line) {
    transcriptRef.current = [...transcriptRef.current, line];
    setTranscript(transcriptRef.current);
  }
  function setPendingStrokes(n: number) {
    pendingRef.current = n;
    setPending(n);
  }

  /** Ask the tutor for its next turn, then say it, draw it, and wait for what it asked for. */
  async function requestTurn() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/lesson/call", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          lesson,
          board: describeBoard(elementsRef.current),
          transcript: transcriptRef.current.slice(-30),
          provider: providerId,
        }),
      });
      await ensureOk(res);
      const turn = (await res.json()) as Turn;
      if (ended.current || controller.signal.aborted) return;
      setBoard(applyActions(elementsRef.current, turn.actions));
      addLine({ role: "tutor", text: turn.say });
      setCaption(turn.say);
      setStatus("speaking");
      interrupted.current = false;
      if (voiceOnRef.current && voiceRef.current) {
        const speaker = voiceRef.current.speak(turn.say);
        speakerRef.current = speaker;
        await speaker.done;
        if (speakerRef.current === speaker) speakerRef.current = null;
      } else {
        await pacedSpeaker(turn.say).done;
      }
      if (ended.current) return;
      if (interrupted.current) {
        interrupted.current = false;
        listen();
        return;
      }
      afterTurn(turn.next);
    } catch (err) {
      if (controller.signal.aborted || ended.current) return;
      setError(err instanceof Error ? err.message : "The tutor could not respond.");
      setStatus("error");
    }
  }

  function nextTurn() {
    stopListening();
    setError(null);
    setStatus("thinking");
    void requestTurn();
  }

  function afterTurn(next: Turn["next"]) {
    if (next === "end") {
      setStatus("ended");
      return;
    }
    if (next === "continue" && continues.current < MAX_CONTINUES) {
      continues.current += 1;
      nextTurn();
      return;
    }
    continues.current = 0;
    if (next === "draw") {
      setStatus("drawing");
      return;
    }
    setStatus("your-turn");
    if (micOnRef.current) listen();
  }

  /** The learner said or typed something. */
  function reply(text: string) {
    const strokes = pendingRef.current;
    const note = strokes ? ` (I drew ${strokes} stroke${strokes === 1 ? "" : "s"} on the board.)` : "";
    addLine({ role: "learner", text: `${text}${note}` });
    setPendingStrokes(0);
    continues.current = 0;
    nextTurn();
  }

  function sendDrawing() {
    const strokes = pendingRef.current;
    if (!strokes) return;
    addLine({ role: "learner", text: `(I drew ${strokes} stroke${strokes === 1 ? "" : "s"} on the board. Take a look.)` });
    setPendingStrokes(0);
    continues.current = 0;
    nextTurn();
  }

  function listen() {
    if (!voice || ended.current) {
      setStatus("your-turn");
      return;
    }
    listenerRef.current?.abort();
    const listener = voice.listen(
      {
        onInterim: setHeard,
        onFinal: (text) => {
          setHeard("");
          if (ended.current) return;
          if (text) reply(text);
          else setStatus((s) => (s === "listening" ? "your-turn" : s));
        },
        onError: () => setStatus("your-turn"),
      },
      navigator.language,
    );
    if (!listener) {
      setStatus("your-turn");
      return;
    }
    listenerRef.current = listener;
    setStatus("listening");
  }

  function stopListening() {
    listenerRef.current?.abort();
    listenerRef.current = null;
    setHeard("");
  }

  /** Mic button: interrupt the tutor, start listening, or stop listening. */
  function onMic() {
    if (status === "speaking") {
      interrupted.current = true;
      speakerRef.current?.cancel();
      return;
    }
    if (status === "listening") {
      listenerRef.current?.stop();
      return;
    }
    if (status === "your-turn" || status === "drawing" || status === "error") listen();
  }

  function onSubmitTyped(e: FormEvent) {
    e.preventDefault();
    const text = typed.trim();
    if (!text || status === "thinking") return;
    setTyped("");
    if (status === "speaking") speakerRef.current?.cancel();
    stopListening();
    reply(text);
  }

  function onStroke(points: number[]) {
    strokeCount.current += 1;
    setBoard([...elementsRef.current, learnerStroke(points, penColor, strokeCount.current)]);
    setPendingStrokes(pendingRef.current + 1);
  }

  function undoStroke() {
    const els = elementsRef.current;
    for (let i = els.length - 1; i >= 0; i--) {
      if (els[i].type === "stroke") {
        setBoard([...els.slice(0, i), ...els.slice(i + 1)]);
        setPendingStrokes(Math.max(0, pendingRef.current - 1));
        return;
      }
    }
  }

  function endCall() {
    ended.current = true;
    abortRef.current?.abort();
    stopListening();
    speakerRef.current?.cancel();
    onClose();
  }

  // Start the call on mount; stop everything on unmount.
  const start = useEffectEvent(() => {
    ended.current = false;
    void requestTurn();
  });
  useEffect(() => {
    let cancelled = false;
    void loadVoice().then((loadedVoice) => {
      if (cancelled) return;
      voiceRef.current = loadedVoice;
      setVoiceReady(true);
      start();
    });
    return () => {
      cancelled = true;
      ended.current = true;
      abortRef.current?.abort();
      listenerRef.current?.abort();
      speakerRef.current?.cancel();
    };
  }, []);

  // The learner's camera, when switched on.
  useEffect(() => {
    if (!cameraOn) return;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 640, height: 400 }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setCameraOn(false));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [cameraOn]);

  // Keep the newest line of the transcript in view.
  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: "end" });
  }, [transcript]);

  const tutorStatus: Record<Status, string> = {
    thinking: "Thinking…",
    speaking: "Speaking",
    listening: "Listening to you…",
    "your-turn": "Your turn",
    drawing: "Waiting for your drawing",
    ended: "Lesson finished",
    error: "Connection problem",
  };

  return (
    <div className="call" role="dialog" aria-modal="true" aria-label={`Video lesson: ${lesson.title}`}>
      <header className="call-header">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-white">{lesson.title}</p>
          <p className="text-xs text-neutral-400">Video lesson · {topic}</p>
        </div>
        <button type="button" className="call-btn call-end" onClick={endCall}>
          End call
        </button>
      </header>

      <div className="call-main">
        <div className="call-stage">
          <Board elements={elements} canDraw={status !== "ended"} penColor={penColor} onStroke={onStroke} />
          {status === "drawing" && <div className="call-banner">Your turn at the whiteboard: draw, then press Done</div>}
          {(heard || caption) && (
            <div className="call-caption" aria-live="polite">
              {heard ? <span className="text-green-300">You: {heard}</span> : caption}
            </div>
          )}
        </div>

        <aside className="call-side">
          <div className="call-tile" data-state={status}>
            <div className="tutor-avatar" aria-hidden="true">
              {status === "thinking" ? <span className="thinking-dots"><i /><i /><i /></span> : "T"}
            </div>
            <span className="call-tile-name">Tutor · {tutorStatus[status]}</span>
          </div>
          <div className="call-tile you-tile" data-listening={status === "listening" ? "true" : undefined}>
            {cameraOn ? <video ref={videoRef} autoPlay muted playsInline /> : <div className="you-avatar">You</div>}
            <span className="call-tile-name">You{status === "listening" ? " · speaking" : ""}</span>
          </div>
          <div className="call-transcript">
            {transcript.map((l, i) => (
              <p key={i}>
                <span className="who">{l.role === "tutor" ? "Tutor" : "You"}</span>
                {l.text}
              </p>
            ))}
            {error && <p className="text-red-300">{error}</p>}
            <div ref={transcriptEnd} />
          </div>
        </aside>
      </div>

      <footer className="call-controls">
        <button
          type="button"
          className="call-btn"
          data-active={status === "listening" ? "true" : undefined}
          onClick={onMic}
          disabled={!canListen || status === "thinking" || status === "ended"}
          title={canListen ? "Talk (also interrupts the tutor)" : "Voice input is unavailable in this browser; type instead"}
        >
          {status === "listening" ? "Listening… tap to send" : status === "speaking" ? "Interrupt" : "Talk"}
        </button>
        <button
          type="button"
          className="call-btn"
          data-on={micOn ? "true" : "false"}
          onClick={() => {
            micOnRef.current = !micOn;
            setMicOn(!micOn);
          }}
          title="Start listening automatically after the tutor asks you something"
        >
          Auto-listen {micOn ? "on" : "off"}
        </button>
        <button
          type="button"
          className="call-btn"
          data-on={voiceOn ? "true" : "false"}
          onClick={() => {
            voiceOnRef.current = !voiceOn;
            setVoiceOn(!voiceOn);
            if (voiceOn) speakerRef.current?.cancel();
          }}
        >
          Tutor voice {voiceOn ? "on" : "off"}
        </button>
        <button type="button" className="call-btn" data-on={cameraOn ? "true" : "false"} onClick={() => setCameraOn(!cameraOn)}>
          Camera {cameraOn ? "on" : "off"}
        </button>

        <span className="call-pens" role="group" aria-label="Pen colour">
          {PENS.map((c) => (
            <button
              key={c}
              type="button"
              className="pen-dot"
              style={{ background: INK[c] }}
              data-on={penColor === c ? "true" : undefined}
              onClick={() => setPenColor(c)}
              aria-label={`${c} pen`}
            />
          ))}
        </span>
        <button type="button" className="call-btn" onClick={undoStroke} disabled={!elements.some((e) => e.type === "stroke")}>
          Undo
        </button>
        {pending > 0 && (
          <button type="button" className="call-btn call-send" onClick={sendDrawing} disabled={status === "thinking"}>
            {status === "drawing" ? "Done drawing" : "Show my drawing"}
          </button>
        )}

        <form onSubmit={onSubmitTyped} className="call-type">
          <input
            className="call-input"
            placeholder={status === "ended" ? "Ask a follow-up to keep going" : "Type a reply"}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-label="Type a reply to the tutor"
          />
        </form>
      </footer>
    </div>
  );
}
