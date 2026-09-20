"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAgentMicrophone, useAgentSession, useAgentState } from "@deepgram/react";

// Flux needs audio silence to end a turn: SDK mute() drops frames entirely.
// Six seconds covers its default five-second end-of-turn timeout plus a margin.
// These are zero-filled PCM frames, never audio captured after the key is released.
const SILENCE_FRAME_MS = 80;
const SILENCE_FRAMES = 75;
const SILENCE_FRAME_BYTES = 16000 * 2 * SILENCE_FRAME_MS / 1000;

export function usePushToTalk(onMicLive: () => void) {
  const session = useAgentSession();
  const { state } = useAgentState();
  const { micActive, micMuted, setMicMuted } = useAgentMicrophone();
  const [holding, setHolding] = useState(false);
  const holdingRef = useRef(false);
  const silenceTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopSilence = useCallback(() => {
    if (silenceTimer.current !== null) clearInterval(silenceTimer.current);
    silenceTimer.current = null;
  }, []);

  const beginTalking = useCallback(() => {
    if (holdingRef.current) return;
    stopSilence();
    holdingRef.current = true;
    setHolding(true);
    onMicLive();
    setMicMuted(false);
  }, [onMicLive, setMicMuted, stopSilence]);

  const endTalking = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setHolding(false);
    setMicMuted(true);
    stopSilence();
    if (!micActive || session.state !== "connected") return;

    let remaining = SILENCE_FRAMES;
    const silence = new ArrayBuffer(SILENCE_FRAME_BYTES);
    silenceTimer.current = setInterval(() => {
      if (session.state !== "connected" || holdingRef.current) {
        stopSilence();
        return;
      }
      session.sendAudio(silence);
      if (--remaining === 0) stopSilence();
    }, SILENCE_FRAME_MS);
  }, [micActive, session, setMicMuted, stopSilence]);

  // Permission and device startup are asynchronous. Apply the CURRENT hold when
  // capture becomes ready, including release-before-ready and reconnect races.
  useEffect(() => {
    if (micActive) setMicMuted(!holdingRef.current);
  }, [micActive, setMicMuted]);

  useEffect(() => {
    if (state !== "connected") stopSilence();
  }, [state, stopSilence]);

  useEffect(() => stopSilence, [stopSilence]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']")) return;
      event.preventDefault();
      event.stopPropagation();
      beginTalking();
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !holdingRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      endTalking();
    };
    const hide = () => {
      if (document.visibilityState === "hidden") endTalking();
    };
    // Capture before the canvas handles Space as its pan shortcut.
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", endTalking);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", endTalking);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [beginTalking, endTalking]);

  return {
    holding,
    listening: holding && micActive && !micMuted && state === "connected",
    beginTalking,
    endTalking,
  };
}
