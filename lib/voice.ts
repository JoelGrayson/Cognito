export interface Listener {
  stop(): void;
  abort(): void;
}

export interface ListenHandlers {
  onInterim(text: string): void;
  onFinal(text: string): void;
  onError(): void;
}

export interface Speaker {
  done: Promise<void>;
  cancel(): void;
}

export interface Voice {
  canListen: boolean;
  listen(handlers: ListenHandlers, lang: string): Listener | null;
  speak(text: string): Speaker;
}

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
}

type RecognitionConstructor = new () => Recognition;

function recognitionCtor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pacedDuration(text: string): number {
  return Math.min(9000, 1200 + text.split(/\s+/).length * 260);
}

export function pacedSpeaker(text: string): Speaker {
  let settled = false;
  let settle!: () => void;
  const timer = setTimeout(finish, pacedDuration(text));
  const done = new Promise<void>((resolve) => {
    settle = resolve;
  });
  function finish() {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    settle();
  }
  return { done, cancel: finish };
}

function browserVoice(): Voice {
  const canListen = recognitionCtor() !== null;

  return {
    canListen,
    listen(handlers, lang): Listener | null {
      const Ctor = recognitionCtor();
      if (!Ctor) return null;
      const recognition = new Ctor();
      let aborted = false;
      let finished = false;
      let finalText = "";

      recognition.lang = lang || "en-US";
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) finalText += result[0].transcript;
          else interim += result[0].transcript;
        }
        handlers.onInterim(`${finalText}${interim}`);
      };
      recognition.onerror = () => {
        if (!aborted) handlers.onError();
      };
      recognition.onend = () => {
        if (finished) return;
        finished = true;
        handlers.onInterim("");
        const text = finalText.trim();
        if (!aborted) handlers.onFinal(text);
      };
      try {
        recognition.start();
      } catch {
        aborted = true;
        finished = true;
        recognition.abort();
        return null;
      }

      return {
        stop() {
          if (!finished) recognition.stop();
        },
        abort() {
          aborted = true;
          finished = true;
          recognition.abort();
        },
      };
    },
    speak(text): Speaker {
      const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
      if (!synth) return pacedSpeaker(text);

      let settled = false;
      let settle!: () => void;
      const done = new Promise<void>((resolve) => {
        settle = resolve;
      });
      const finish = () => {
        if (settled) return;
        settled = true;
        settle();
      };

      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices();
      const preferred =
        voices.find((voice) => /Google US English|Samantha|Ava|Allison/i.test(voice.name) && voice.lang.startsWith("en")) ??
        voices.find((voice) => voice.lang.startsWith(navigator.language.slice(0, 2)));
      if (preferred) utterance.voice = preferred;
      utterance.rate = 1.04;
      utterance.onend = finish;
      utterance.onerror = finish;
      synth.speak(utterance);
      const timer = setTimeout(finish, 3000 + text.length * 90);

      return {
        done,
        cancel() {
          synth.cancel();
          clearTimeout(timer);
          finish();
        },
      };
    },
  };
}

function deepgramImplementation(): Voice {
  const canListen =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices;

  return {
    canListen,
    listen(handlers, lang): Listener | null {
      if (!canListen) return null;

      let ws: WebSocket | null = null;
      let recorder: MediaRecorder | null = null;
      let stream: MediaStream | null = null;
      let keepAlive: ReturnType<typeof setInterval> | undefined;
      let finishTimer: ReturnType<typeof setTimeout> | undefined;
      let finalText = "";
      let interim = "";
      let transcriptSeen = false;
      let stopRequested = false;
      let aborted = false;
      let finished = false;
      let errorReported = false;

      const teardown = () => {
        if (keepAlive) clearInterval(keepAlive);
        if (finishTimer) clearTimeout(finishTimer);
        keepAlive = undefined;
        finishTimer = undefined;
        if (recorder && recorder.state !== "inactive") recorder.stop();
        recorder = null;
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
        if (ws) {
          ws.onopen = null;
          ws.onmessage = null;
          ws.onclose = null;
          ws.onerror = null;
          if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) ws.close();
        }
        ws = null;
      };
      const reportTerminalError = () => {
        if (errorReported || aborted) return;
        errorReported = true;
        handlers.onError();
      };
      const finish = () => {
        if (finished) return;
        finished = true;
        teardown();
        handlers.onInterim("");
        const text = finalText.trim();
        handlers.onFinal(text);
      };
      const fail = () => {
        if (finished) return;
        finished = true;
        teardown();
        reportTerminalError();
      };
      const send = (message: string) => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(message);
      };
      const requestStop = () => {
        if (finished || aborted) return;
        stopRequested = true;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          finish();
          return;
        }
        send(JSON.stringify({ type: "Finalize" }));
        send(JSON.stringify({ type: "CloseStream" }));
        finishTimer = setTimeout(finish, 500);
      };

      const setup = async () => {
        try {
          const tokenResponse = await fetch("/api/voice/token", { cache: "no-store" });
          if (!tokenResponse.ok) throw new Error("Deepgram token request failed.");
          const token = (await tokenResponse.json()) as { access_token?: string };
          if (!token.access_token) throw new Error("Deepgram token response was invalid.");
          if (aborted || finished) return;

          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          if (aborted || finished || stopRequested) {
            stream.getTracks().forEach((track) => track.stop());
            stream = null;
            finish();
            return;
          }

          const language = (lang || "en").split("-")[0] || "en";
          const query = new URLSearchParams({
            model: "nova-3",
            interim_results: "true",
            smart_format: "true",
            endpointing: "400",
            utterance_end_ms: "1200",
            vad_events: "true",
            language,
          });
          const socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${query}`, ["bearer", token.access_token]);
          ws = socket;
          socket.onopen = () => {
            if (aborted || finished) {
              socket.close();
              stream?.getTracks().forEach((track) => track.stop());
              stream = null;
              return;
            }
            if (stopRequested) {
              requestStop();
              return;
            }
            try {
              recorder = new MediaRecorder(stream!, { mimeType: "audio/webm;codecs=opus" });
              recorder.ondataavailable = (event) => {
                if (event.data.size > 0 && ws?.readyState === WebSocket.OPEN) ws.send(event.data);
              };
              recorder.start(250);
              keepAlive = setInterval(() => send(JSON.stringify({ type: "KeepAlive" })), 8000);
            } catch {
              fail();
            }
          };
          socket.onmessage = (event) => {
            if (finished) return;
            let message: {
              type?: string;
              is_final?: boolean;
              speech_final?: boolean;
              channel?: { alternatives?: Array<{ transcript?: string }> };
            };
            try {
              message = JSON.parse(String(event.data)) as typeof message;
            } catch {
              return;
            }
            const transcript = message.channel?.alternatives?.[0]?.transcript ?? "";
            if (transcript) transcriptSeen = true;
            if (message.type === "Results") {
              if (message.is_final && transcript) {
                finalText = `${finalText} ${transcript}`.trim();
                interim = "";
              } else {
                interim = transcript;
              }
              handlers.onInterim(`${finalText}${interim ? ` ${interim}` : ""}`);
              if (message.speech_final && finalText.trim()) finish();
            } else if (message.type === "UtteranceEnd" && finalText.trim()) {
              finish();
            }
          };
          socket.onerror = () => {
            if (!transcriptSeen) fail();
          };
          socket.onclose = () => {
            if (finished) return;
            if (stopRequested || finalText.trim()) finish();
            else {
              finished = true;
              teardown();
              reportTerminalError();
            }
          };
        } catch {
          if (!aborted && !finished) fail();
        }
      };
      void setup();

      return {
        stop: requestStop,
        abort() {
          if (finished) return;
          aborted = true;
          finished = true;
          teardown();
        },
      };
    },
    speak(text): Speaker {
      if (typeof window === "undefined") return pacedSpeaker(text);

      const controller = new AbortController();
      let audio: HTMLAudioElement | null = null;
      let url: string | null = null;
      let fallback: Speaker | null = null;
      let settled = false;
      let settle!: () => void;
      const done = new Promise<void>((resolve) => {
        settle = resolve;
      });
      const finish = () => {
        if (settled) return;
        settled = true;
        if (fallback) fallback.cancel();
        if (audio) {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        }
        if (url) URL.revokeObjectURL(url);
        settle();
      };
      const useFallback = () => {
        if (settled) return;
        fallback = pacedSpeaker(text);
        void fallback.done.then(finish);
      };

      void fetch("/api/voice/speak", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
        .then(async (response) => {
          if (!response.ok) {
            useFallback();
            return;
          }
          const blob = await response.blob();
          if (settled) return;
          url = URL.createObjectURL(blob);
          audio = new Audio(url);
          audio.onended = finish;
          audio.onerror = finish;
          try {
            await audio.play();
          } catch {
            finish();
          }
        })
        .catch(() => {
          if (!settled) useFallback();
        });

      return {
        done,
        cancel() {
          if (settled) return;
          controller.abort();
          finish();
        },
      };
    },
  };
}

function deepgramListen(handlers: ListenHandlers, lang: string): Listener | null {
  return deepgramImplementation().listen(handlers, lang);
}

function deepgramSpeak(text: string): Speaker {
  return deepgramImplementation().speak(text);
}

function deepgramVoice(): Voice {
  const implementation = deepgramImplementation();
  return {
    canListen: implementation.canListen,
    listen: deepgramListen,
    speak: deepgramSpeak,
  };
}

let voicePromise: Promise<Voice> | null = null;

export function loadVoice(): Promise<Voice> {
  if (!voicePromise) {
    voicePromise = fetch("/api/voice/token", { cache: "no-store" })
      .then((response) => {
        const browser = browserVoice();
        if (response.ok) return deepgramVoice();
        if (response.status === 401 || response.status === 503) return browser;
        return { ...browser, speak: deepgramSpeak };
      })
      .catch(() => browserVoice());
  }
  return voicePromise;
}
