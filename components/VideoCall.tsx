"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AgentProvider, useAgentClientTool, useAgentConversation, useAgentMicrophone, useAgentMode, useAgentSession, useAgentState, type AgentSessionConfig } from "@deepgram/react";
import { ensureAnonymousSession } from "@/lib/auth-client";
import { VOICE_LESSON_START, VoiceBoardSchema, voiceAgentSettings } from "@/lib/ai/voice-agent";
import { applyActions, describeBoard, learnerStroke, rubOut, type BoardElement, type ResolvedAction } from "@/lib/board";
import { ensureOk } from "@/lib/ndjson";
import type { BoardColor, Lesson } from "@/lib/schema";
import { plainVoiceText } from "@/lib/voice-text";
import { Board, INK } from "./Board";

interface Props { topic: string; lesson: Lesson; onClose: () => void }
const PENS: BoardColor[] = ["blue", "red", "green", "ink"];

export function VideoCall(props: Props) {
  const [micOn, setMicOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const config = useMemo<AgentSessionConfig>(() => ({
    auth: { tokenFactory: async () => {
      await ensureAnonymousSession();
      const response = await fetch("/api/voice/token", { cache: "no-store" });
      await ensureOk(response);
      const token = await response.json() as { access_token: string };
      return token.access_token;
    } },
    agent: voiceAgentSettings(props.topic, props.lesson),
    audio: { input: { encoding: "linear16", sampleRate: 16000 }, output: { encoding: "linear16", sampleRate: 24000 } },
    reconnect: { enabled: true, maxAttempts: 3 },
  }), [props.topic, props.lesson]);

  return <AgentProvider config={config} autoStart microphone={micOn}
    // Preserve quiet first syllables for faster barge-in; echo cancellation still removes tutor playback.
    microphoneOptions={{ echoCancellation: true, noiseSuppression: false, autoGainControl: true, sampleRate: 16000 }}
    onError={(event) => setError(event.description || "The voice service could not connect. Try reconnecting.")}
    onSdkError={(event) => {
      if (event.name === "NotAllowedError" || event.name === "NotFoundError" || event.name === "NotReadableError") {
        setMicOn(false);
        setError("Microphone unavailable. Allow microphone access and unmute, or reconnect to use chat.");
      } else setError(event.message || "Connection lost. Try reconnecting.");
    }}
    onInjectionRefused={() => setError("Your message could not be sent yet. Wait a moment and send it again.")}
  ><CallSession {...props} micOn={micOn} setMicOn={setMicOn} error={error} setError={setError} /></AgentProvider>;
}

function CallSession({ topic, lesson, onClose, micOn, setMicOn, error, setError }: Props & {
  micOn: boolean; setMicOn: (on: boolean) => void; error: string | null; setError: (error: string | null) => void;
}) {
  const session = useAgentSession();
  const { state, start, stop } = useAgentState();
  const { mode } = useAgentMode();
  const { micActive } = useAgentMicrophone();
  const { conversation, sendUserMessage } = useAgentConversation();
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [typed, setTyped] = useState("");
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [penColor, setPenColor] = useState<BoardColor>("blue");
  const [pending, setPending] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const elementsRef = useRef<BoardElement[]>([]);
  /** Ids of the strokes the tutor has not been asked to read yet. */
  const pendingRef = useRef(new Set<string>());
  const strokeCount = useRef(0);
  const boardRequest = useRef<AbortController | null>(null);
  const lessonStarted = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptEnd = useRef<HTMLDivElement>(null);
  const connected = state === "connected" && mode !== "idle";
  const status = error ? "error" : !connected ? "connecting" : userSpeaking && micOn ? "listening" : mode === "speaking" ? "speaking" : mode === "thinking" ? "thinking" : "your-turn";
  const transcript = conversation
    .filter((line) => line.role !== "user" || line.content !== VOICE_LESSON_START)
    .map((line) => ({ role: line.role === "assistant" ? "tutor" : "learner", text: line.role === "assistant" ? plainVoiceText(line.content) : line.content }));
  const latest = transcript.at(-1);
  const caption = userSpeaking ? "" : latest?.text ?? "";
  const captionSpeaker = latest?.role === "learner" ? "You" : "Tutor";

  function setBoard(next: BoardElement[]) { elementsRef.current = next; setElements(next); }
  function setPendingStrokes(ids: Set<string>) { pendingRef.current = ids; setPending(ids.size); }

  useAgentClientTool("read_whiteboard", () => JSON.stringify({ board: describeBoard(elementsRef.current) }));
  useAgentClientTool("update_whiteboard", async (fn) => {
    const parsed = VoiceBoardSchema.safeParse(JSON.parse(fn.arguments));
    if (!parsed.success) return JSON.stringify({ error: "Invalid board actions. Check the tool schema and try again." });
    boardRequest.current?.abort();
    const controller = new AbortController();
    boardRequest.current = controller;
    let actions: ResolvedAction[];
    if (parsed.data.actions.some((action) => action.type === "image")) {
      const response = await fetch("/api/voice/board", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data), signal: controller.signal,
      });
      await ensureOk(response);
      actions = (await response.json() as { actions: ResolvedAction[] }).actions;
    } else {
      actions = parsed.data.actions.filter((action) => action.type !== "image");
    }
    if (controller.signal.aborted) return JSON.stringify({ error: "The learner interrupted this update." });
    const readableActions = actions.map((action) => {
      if (action.type === "text") return { ...action, text: plainVoiceText(action.text) };
      if (action.type === "plot") return { ...action, xLabel: plainVoiceText(action.xLabel), yLabel: plainVoiceText(action.yLabel) };
      return action;
    });
    setBoard(applyActions(elementsRef.current, readableActions));
    return JSON.stringify({ board: describeBoard(elementsRef.current) });
  });

  useEffect(() => {
    const onSpeech = () => { lessonStarted.current = true; boardRequest.current?.abort(); setUserSpeaking(true); };
    const onText = (line: { role: string }) => {
      if (line.role === "user") lessonStarted.current = true;
      setUserSpeaking(false);
    };
    const onGreetingDone = () => {
      if (lessonStarted.current) return;
      lessonStarted.current = true;
      session.injectUserMessage(VOICE_LESSON_START);
    };
    const onConnected = () => setError(null);
    session.on("user-started-speaking", onSpeech);
    session.on("conversation-text", onText);
    session.on("agent-audio-done", onGreetingDone);
    session.on("settings-applied", onConnected);
    return () => {
      session.off("user-started-speaking", onSpeech);
      session.off("conversation-text", onText);
      session.off("agent-audio-done", onGreetingDone);
      session.off("settings-applied", onConnected);
      boardRequest.current?.abort();
    };
  }, [session, setError]);

  function toggleMic() { setError(null); setUserSpeaking(false); setMicOn(!micOn); }
  function onSubmitTyped(e: FormEvent) {
    e.preventDefault();
    const text = typed.trim();
    if (!text || !connected) return;
    lessonStarted.current = true;
    sendUserMessage(text);
    setTyped("");
  }
  function sendDrawing() {
    if (!pendingRef.current.size || !connected) return;
    lessonStarted.current = true;
    sendUserMessage(`I'm done drawing. Please use read_whiteboard to review my ${pendingRef.current.size} new strokes.`);
    setPendingStrokes(new Set());
  }
  function onStroke(points: number[], erased: boolean) {
    strokeCount.current += 1;
    // The call board has no eraser button, but a stylus turned upside down still means
    // "take that off", so the eraser end rubs out what it passes over.
    if (erased) {
      const els = elementsRef.current;
      const kept = rubOut(els, points);
      if (kept.length === els.length) return;
      setBoard(kept);
      // Rubbing out work the tutor has not seen yet unsays it: otherwise the board
      // can be empty and still offer to send strokes that are no longer there.
      keepPending(kept);
      return;
    }
    const stroke = learnerStroke(points, penColor, strokeCount.current);
    setBoard([...elementsRef.current, stroke]);
    setPendingStrokes(new Set([...pendingRef.current, ...strokeIds([stroke])]));
  }
  /** The ids of the learner's own strokes among these elements. */
  function strokeIds(elements: BoardElement[]): string[] {
    return elements.filter((el) => el.type === "stroke").map((el) => el.id);
  }
  /** Forgets the unread strokes that are no longer on the board. */
  function keepPending(kept: BoardElement[]) {
    const onBoard = new Set(strokeIds(kept));
    setPendingStrokes(new Set([...pendingRef.current].filter((id) => onBoard.has(id))));
  }
  function undoStroke() {
    const els = elementsRef.current;
    for (let i = els.length - 1; i >= 0; i--) {
      if (els[i].type === "stroke") {
        const kept = [...els.slice(0, i), ...els.slice(i + 1)];
        setBoard(kept);
        keepPending(kept);
        return;
      }
    }
  }
  function endCall() {
    boardRequest.current?.abort();
    stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    onClose();
  }
  function reconnect() {
    setError(null);
    stop();
    void start().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not reconnect. Try again."));
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    const timer = setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
    return () => { clearInterval(timer); dialog?.close(); };
  }, []);
  useEffect(() => {
    if (!cameraOn) return;
    let cancelled = false;
    const fail = () => {
      if (cancelled) return;
      setCameraOn(false);
      setCameraError("Camera unavailable. Allow camera access, then turn it on again.");
    };
    if (!navigator.mediaDevices) { fail(); return; }
    void navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 400 }, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      }).catch(fail);
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [cameraOn]);
  useEffect(() => { transcriptEnd.current?.scrollIntoView({ block: "end" }); }, [conversation, chatOpen]);

  const tutorStatus = {
    connecting: state === "reconnecting" ? "Reconnecting…" : state === "disconnected" ? "Call disconnected" : "Connecting…",
    thinking: "Thinking…", speaking: "Speaking", listening: "Listening to you", "your-turn": "Ready when you are", error: "Unable to connect",
  };
  const micLabel = micOn ? "Mute microphone" : "Unmute microphone";
  const micHint = !connected ? "Connecting your tutor…" : !micOn ? "You’re muted. Unmute to join in." : !micActive ? "Connecting microphone…" : userSpeaking ? "Listening. Take your time." : "Jump in anytime. Your tutor will listen.";
  const duration = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <dialog ref={dialogRef} className="call" aria-label={`Video lesson: ${lesson.title}`} onCancel={(e) => { e.preventDefault(); endCall(); }}>
      <header className="call-header">
        <div className="call-presenting"><span className="call-present-icon"><CallIcon name="present" /></span><span><strong>Your tutor</strong> is presenting</span></div>
        <span className="call-session-label">Live lesson <span aria-hidden="true">·</span> {topic}</span>
      </header>

      <div className="call-main" data-chat={chatOpen || undefined}>
        <section className="call-stage" aria-label="Shared whiteboard">
          <div className="call-board-header"><span><CallIcon name="board" /> Shared whiteboard</span><span className="call-board-hint">Draw together, learn together</span></div>
          <div className="call-board-canvas"><Board elements={elements} canDraw={true} penColor={penColor} onStroke={onStroke} /></div>
          <div className="call-board-tools">
            <div className="call-pens" role="group" aria-label="Pen color">
              {PENS.map((c) => <button key={c} type="button" className="pen-dot" aria-label={`${c} pen`} aria-pressed={penColor === c} onClick={() => setPenColor(c)}><span style={{ background: INK[c] }} /></button>)}
            </div>
            <button type="button" className="call-board-button" onClick={undoStroke} disabled={!elements.some((e) => e.type === "stroke")} aria-label="Undo last stroke" title="Undo last stroke"><CallIcon name="undo" /></button>
            {pending > 0 && <button type="button" className="call-board-send" onClick={sendDrawing} disabled={!connected}>Done drawing <CallIcon name="send" /></button>}
          </div>
          {captionsOn && caption && <div className="call-caption"><span className="call-caption-who">{captionSpeaker}</span>{caption}</div>}
        </section>

        <aside className="call-participants" aria-label="Participants">
          <div className="call-tile tutor-tile" data-speaking={status === "speaking" || undefined}>
            <span className="call-tile-badge">AI tutor</span>
            <div className="tutor-avatar" aria-hidden="true"><CallIcon name="spark" /></div>
            <div className="call-tile-bottom"><span>Tutor</span><span className="call-tile-status">{tutorStatus[status]}</span></div>
            {status === "speaking" && <span className="call-speaking-mark" aria-label="Tutor is speaking"><CallIcon name="wave" /></span>}
          </div>
          <div className="call-tile you-tile" data-speaking={status === "listening" || undefined}>
            {cameraOn ? <video ref={videoRef} autoPlay muted playsInline aria-label="Your camera" /> : <div className="you-avatar" aria-hidden="true">Y</div>}
            <span className="call-tile-mic" aria-label={micOn ? "Microphone on" : "Microphone muted"}><CallIcon name={micOn ? "mic" : "mic-off"} /></span>
            <div className="call-tile-bottom"><span>You</span><span className="call-tile-status">{!micOn ? "Muted" : status === "listening" ? "Speaking" : !cameraOn ? "Camera off" : ""}</span></div>
          </div>
          <p className="call-voice-hint" role="status">{micHint}</p>
        </aside>

        {chatOpen && <aside className="call-chat" id="call-chat-panel" aria-label="In-call messages">
          <div className="call-chat-header"><h2>In-call messages</h2><button type="button" onClick={() => setChatOpen(false)} aria-label="Close messages"><CallIcon name="close" /></button></div>
          <p className="call-chat-note">Your conversation, all in one place. You can type here anytime.</p>
          <div className="call-transcript" role="log" aria-label="Lesson conversation">
            {transcript.map((line, i) => <div className="call-message" key={i}><span className="who">{line.role === "tutor" ? "Tutor" : "You"}</span><p>{line.text}</p></div>)}
            <div ref={transcriptEnd} />
          </div>
          <form onSubmit={onSubmitTyped} className="call-type"><input className="call-input" placeholder="Send a message" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Message your tutor" /><button type="submit" disabled={!typed.trim() || !connected} aria-label="Send message"><CallIcon name="send" /></button></form>
        </aside>}
      </div>

      {(error || cameraError || state === "disconnected") && <div className="call-notice" role="alert"><span>{error || cameraError || "The call disconnected. Reconnect to continue."}</span>{error || state === "disconnected" ? <button type="button" onClick={reconnect}>Reconnect</button> : <button type="button" onClick={() => setCameraError(null)}>Dismiss</button>}</div>}
      <footer className="call-controls">
        <div className="call-details"><span className="call-duration">{duration}</span><div><p>{lesson.title}</p><span>{tutorStatus[status]}</span></div></div>
        <div className="call-primary-controls" role="group" aria-label="Call controls">
          <div className="call-control"><button type="button" className="call-control-button" data-off={!micOn || undefined} onClick={toggleMic} aria-label={micLabel} aria-pressed={micOn} title={micLabel}><CallIcon name={micOn ? "mic" : "mic-off"} /></button><span>{micOn ? "Mute" : "Unmute"}</span></div>
          <div className="call-control"><button type="button" className="call-control-button" data-off={!cameraOn || undefined} onClick={() => { setCameraError(null); setCameraOn(!cameraOn); }} aria-label={cameraOn ? "Turn camera off" : "Turn camera on"} aria-pressed={cameraOn} title={cameraOn ? "Turn camera off" : "Turn camera on"}><CallIcon name={cameraOn ? "camera" : "camera-off"} /></button><span>Camera</span></div>
          <div className="call-control"><button type="button" className="call-control-button" data-selected={captionsOn || undefined} onClick={() => setCaptionsOn(!captionsOn)} aria-label={captionsOn ? "Turn captions off" : "Turn captions on"} aria-pressed={captionsOn} title="Toggle captions"><CallIcon name="captions" /></button><span>Captions</span></div>
          <div className="call-control"><button type="button" className="call-control-button call-end" onClick={endCall} aria-label="Leave call" title="Leave call"><CallIcon name="hangup" /></button><span>Leave</span></div>
        </div>
        <div className="call-secondary-controls"><span className="call-people" title="2 participants"><CallIcon name="people" /><span>2</span></span><button type="button" className="call-control-button" data-selected={chatOpen || undefined} onClick={() => setChatOpen(!chatOpen)} aria-label={chatOpen ? "Hide messages" : "Show messages"} aria-expanded={chatOpen} aria-controls={chatOpen ? "call-chat-panel" : undefined} title="In-call messages"><CallIcon name="chat" /></button></div>
      </footer>
    </dialog>
  );
}

type IconName = "mic" | "mic-off" | "camera" | "camera-off" | "captions" | "hangup" | "chat" | "people" | "present" | "board" | "undo" | "send" | "close" | "spark" | "wave";
function CallIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></>,
    "mic-off": <><path d="M9 5V4a3 3 0 0 1 6 0v7M9 9v2a3 3 0 0 0 4 2.8M5 10v2a7 7 0 0 0 12 4.9M19 10v2c0 .6-.1 1.2-.2 1.8M12 19v3m-4 0h8M3 3l18 18" /></>,
    camera: <><rect x="2" y="5" width="14" height="14" rx="3" /><path d="m16 10 6-4v12l-6-4" /></>,
    "camera-off": <><path d="M7 5h6a3 3 0 0 1 3 3v2l6-4v12l-6-4M16 18a3 3 0 0 1-3 1H5a3 3 0 0 1-3-3V8c0-1 .4-1.8 1-2.3M3 3l18 18" /></>,
    captions: <><rect x="2" y="4" width="20" height="16" rx="3" /><path d="M10 9H7v6h3m7-6h-3v6h3" /></>,
    hangup: <path d="M3 16c-1 0-2-1-2-2v-2c6-6 16-6 22 0v2c0 1-1 2-2 2h-3c-1 0-2-1-2-2v-2a15 15 0 0 0-8 0v2c0 1-1 2-2 2Z" />,
    chat: <path d="M21 14a3 3 0 0 1-3 3H8l-6 4V5a3 3 0 0 1 3-3h13a3 3 0 0 1 3 3ZM7 7h10M7 12h7" />,
    people: <><circle cx="9" cy="7" r="3" /><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 4a3 3 0 0 1 0 6M19 14a5 5 0 0 1 3 5v2" /></>,
    present: <><rect x="2" y="3" width="20" height="15" rx="2" /><path d="M8 22h8m-4-4v4m0-8V7m-3 3 3-3 3 3" /></>,
    board: <><rect x="3" y="3" width="18" height="15" rx="2" /><path d="m8 22 4-4 4 4M7 8h10m-10 5h6" /></>,
    undo: <path d="M9 5 3 11l6 6M3 11h12a6 6 0 0 1 6 6" />,
    send: <path d="m22 2-7 20-4-9-9-4 20-7ZM11 13 22 2" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" /><path d="M20 2v4m-2-2h4" /></>,
    wave: <path d="M4 10v4m4-8v12m4-15v18m4-15v12m4-8v4" />,
  };
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
