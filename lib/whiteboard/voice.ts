/**
 * Voice, client side. A mouth and a push-to-talk ear.
 *
 * Why push-to-talk and not an open mic: the learner's hands are on a pen, the room
 * is loud, and an open mic turns "has she finished speaking?" into the same
 * endpointing problem that cost three debugging rounds on the ink side. Holding a
 * key removes the question entirely -- release IS the end of turn.
 *
 * Both directions run on ONE ElevenLabs key (Flash for speech, Scribe for
 * transcription). A second STT vendor was in the plan for its better turn
 * detection, but that only helps an open mic, and push-to-talk has no turn to
 * detect.
 */

export interface Speaker {
  /** Say something. Cancels whatever is currently playing. */
  say(text: string, voiceId?: string): Promise<void>;
  /** Stop mid-sentence. This is barge-in: the learner always outranks the tutor. */
  stop(): void;
  readonly speaking: boolean;
}

export function createSpeaker(): Speaker {
  let current: HTMLAudioElement | null = null;
  let speaking = false;

  function stop() {
    if (current) {
      current.pause();
      URL.revokeObjectURL(current.src);
      current = null;
    }
    speaking = false;
  }

  return {
    get speaking() {
      return speaking;
    },
    stop,
    async say(text: string, voiceId?: string) {
      stop(); // never let two utterances overlap
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceId }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({ error: "speak failed" }));
        throw new Error(detail.error ?? "speak failed");
      }
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      current = audio;
      speaking = true;
      audio.onended = () => {
        speaking = false;
      };
      try {
        await audio.play();
      } catch {
        // Browsers block audio until the page has had a user gesture. Not fatal --
        // the first click anywhere unlocks it, so fail quietly rather than throwing
        // in the middle of a tutoring turn.
        speaking = false;
      }
    },
  };
}

export interface PushToTalk {
  /** Begin capturing. Safe to call twice. */
  start(): Promise<void>;
  /** Stop and transcribe what was said. Returns "" if nothing was captured. */
  stopAndTranscribe(): Promise<{ transcript: string; ms: number }>;
  readonly recording: boolean;
  dispose(): void;
}

export function createPushToTalk(): PushToTalk {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let recording = false;

  return {
    get recording() {
      return recording;
    },

    async start() {
      if (recording) return;
      // Ask for the mic lazily -- on first hold, not on page load. A permission
      // prompt the moment the page opens reads as hostile.
      stream ??= await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      chunks = [];
      recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.start();
      recording = true;
    },

    async stopAndTranscribe() {
      if (!recorder || !recording) return { transcript: "", ms: 0 };
      const done = new Promise<void>((resolve) => {
        recorder!.onstop = () => resolve();
      });
      recorder.stop();
      recording = false;
      await done;

      const blob = new Blob(chunks, { type: "audio/webm" });
      // A clip this short is a mis-tap, not speech.
      if (blob.size < 2000) return { transcript: "", ms: 0 };

      const res = await fetch("/api/voice/transcribe", {
        method: "POST",
        headers: { "Content-Type": "audio/webm" },
        body: blob,
      });
      if (!res.ok) return { transcript: "", ms: 0 };
      const data = await res.json();
      return { transcript: (data.transcript ?? "").trim(), ms: data.ms ?? 0 };
    },

    dispose() {
      recorder?.stream.getTracks().forEach((t) => t.stop());
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      recorder = null;
      recording = false;
    },
  };
}

/**
 * What the tutor says out loud at each rung.
 *
 * Note what rung 1 does NOT say: which line, or what is wrong. It asks the learner
 * to go find it. And after a correction it asks "why" rather than explaining -- the
 * point is to make them articulate the reasoning, not to hand it over.
 */
export const SPOKEN: Record<number, string> = {
  1: "Something in there doesn't hold up. Want to take another look?",
  2: "It's in one of these lines. Have another go.",
  3: "Check that step.",
  4: "Think about what you did to both sides there.",
  5: "That step doesn't follow from the one above it.",
};

/**
 * What to say at rungs 4 and 5, where the words depend on WHICH mistake it was.
 *
 * Rungs 1-3 reveal nothing about the nature of the error, so one phrase serves them
 * all. Rung 4 names the misconception - so a rung-only lookup asserted a negative
 * division had happened no matter what the verdict was, and told a learner who had
 * halved an expression that they "divided by a negative". Confidently wrong tutoring
 * is worse than vague tutoring.
 */
export function spokenFor(rung: number, verdictKind: string): string {
  if (rung < 4) return SPOKEN[rung] ?? SPOKEN[1];

  switch (verdictKind) {
    case "direction":
      return rung >= 5
        ? "You divided both sides by a negative, so the inequality has to turn around."
        : "You divided by a negative there. What should happen to the sign?";
    case "rescaled":
      return rung >= 5
        ? "You can scale both sides of an equation, but not a lone expression — its value changed."
        : "That changed the value, not just the form. What did you multiply through by?";
    default:
      return rung >= 5
        ? "That step doesn't follow from the one above it."
        : "Compare it with the line above — something doesn't carry over.";
  }
}

/** Asked after a step is marked, to make the learner explain rather than be told. */
export const ASK_WHY = [
  "Why did you do that step?",
  "Talk me through that line.",
  "Why doesn't that one work?",
] as const;
