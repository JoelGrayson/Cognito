// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AgentProvider, type AgentSessionConfig } from "@deepgram/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePushToTalk } from "./usePushToTalk";

type Callback = (...args: unknown[]) => void;
const sdk = vi.hoisted(() => ({
  sessions: [] as Array<{
    state: string;
    emit: (name: string, ...args: unknown[]) => void;
    sendAudio: ReturnType<typeof vi.fn>;
  }>,
  mics: [] as Array<{
    muted: boolean;
    send: (data: ArrayBuffer) => void;
    stop: ReturnType<typeof vi.fn>;
  }>,
  startMic: vi.fn<() => Promise<void>>(),
}));

// Keep the real React adapter: exercise its asynchronous mic startup/mute wiring.
vi.mock("@deepgram/agents", () => ({
  AgentSession: class {
    state = "idle";
    listeners = new Map<string, Set<Callback>>();
    constructor() { sdk.sessions.push(this); }
    on(name: string, fn: Callback) {
      if (!this.listeners.has(name)) this.listeners.set(name, new Set());
      this.listeners.get(name)!.add(fn);
    }
    off(name: string, fn: Callback) { this.listeners.get(name)?.delete(fn); }
    emit(name: string, ...args: unknown[]) { this.listeners.get(name)?.forEach((fn) => fn(...args)); }
    async connect() { this.state = "connected"; this.emit("connected"); this.emit("settings-applied", {}); }
    disconnect() { this.state = "disconnected"; this.emit("disconnected", "closed"); }
    sendAudio = vi.fn();
  },
  AgentMicrophone: class {
    muted = false;
    constructor(private onAudio: (data: ArrayBuffer) => void) { sdk.mics.push(this); }
    start = () => sdk.startMic();
    stop = vi.fn();
    mute() { this.muted = true; }
    unmute() { this.muted = false; }
    send(data: ArrayBuffer) { if (!this.muted) this.onAudio(data); }
  },
  AgentPlayer: class {
    interrupt() {}
    dispose() {}
  },
}));

const config: AgentSessionConfig = { auth: { tokenFactory: async () => "test" }, agent: {} };
function Controls({ onMicLive }: { onMicLive: () => void }) {
  const { holding, listening, beginTalking, endTalking } = usePushToTalk(onMicLive);
  return <>
    <button onPointerDown={beginTalking} onPointerUp={endTalking}>Talk</button>
    <output>{listening ? "Listening" : holding ? "Starting" : "Muted"}</output>
    <input aria-label="Equation" />
    <div contentEditable suppressContentEditableWarning><span>Editable math</span></div>
  </>;
}
function Harness() {
  const [microphone, setMicrophone] = useState(false);
  return <AgentProvider config={config} autoStart microphone={microphone} tts={false}>
    <Controls onMicLive={() => setMicrophone(true)} />
  </AgentProvider>;
}

let root: Root;
let container: HTMLDivElement;
const status = () => container.querySelector("output")!.textContent;
const press = async () => act(async () => { container.querySelector("button")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); });
const release = async () => act(async () => { container.querySelector("button")!.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })); });
const advance = async (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sdk.sessions.length = sdk.mics.length = 0;
  sdk.startMic.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("whiteboard push-to-talk", () => {
  it("mutes captured speech immediately on release but sends silence to finalize the turn", async () => {
    expect(sdk.mics).toHaveLength(0);
    await press();
    expect(status()).toBe("Listening");
    const mic = sdk.mics[0];
    const session = sdk.sessions[0];
    const speech = new Int16Array([1000, -1000]).buffer;
    mic.send(speech);
    expect(session.sendAudio).toHaveBeenCalledWith(speech);

    await release();
    expect(status()).toBe("Muted");
    expect(mic.muted).toBe(true);
    session.sendAudio.mockClear();
    mic.send(speech);
    expect(session.sendAudio).not.toHaveBeenCalled();
    await advance(6000);
    expect(session.sendAudio).toHaveBeenCalledTimes(75);
    for (const [frame] of session.sendAudio.mock.calls) {
      expect(frame.byteLength).toBe(2560);
      expect(new Int16Array(frame).every((sample) => sample === 0)).toBe(true);
    }
    await advance(6000);
    expect(session.sendAudio).toHaveBeenCalledTimes(75);
  });

  it("cancels trailing silence when the next hold begins and reuses the microphone", async () => {
    await press();
    await release();
    await advance(160);
    await press();
    const session = sdk.sessions[0];
    session.sendAudio.mockClear();
    await advance(6000);
    expect(session.sendAudio).not.toHaveBeenCalled();
    expect(sdk.mics).toHaveLength(1);
    expect(sdk.mics[0].muted).toBe(false);
    expect(status()).toBe("Listening");
  });

  it("does not claim to listen before permission resolves, and respects release before ready", async () => {
    let ready!: () => void;
    sdk.startMic.mockImplementation(() => new Promise<void>((resolve) => { ready = resolve; }));
    await press();
    expect(status()).toBe("Starting");
    await release();
    await act(async () => ready());
    expect(status()).toBe("Muted");
    expect(sdk.mics[0].muted).toBe(true);
    await advance(6000);
    expect(sdk.sessions[0].sendAudio).not.toHaveBeenCalled();
    await press();
    expect(status()).toBe("Listening");
    expect(sdk.mics[0].muted).toBe(false);
  });

  it("unmutes when the learner presses again during microphone startup", async () => {
    let ready!: () => void;
    sdk.startMic.mockImplementation(() => new Promise<void>((resolve) => { ready = resolve; }));
    await press();
    await release();
    await press();
    await act(async () => ready());
    expect(status()).toBe("Listening");
    expect(sdk.mics[0].muted).toBe(false);
  });

  it.each(["disconnect", "unmount"])("cancels pending silence on %s", async (event) => {
    await press();
    await release();
    await advance(80);
    const session = sdk.sessions[0];
    await act(async () => {
      if (event === "unmount") root.render(null);
      else { session.state = "disconnected"; session.emit("disconnected", "closed"); }
    });
    session.sendAudio.mockClear();
    await advance(6000);
    expect(session.sendAudio).not.toHaveBeenCalled();
  });

  it("handles Space before canvas shortcuts, and mutes when the window loses focus", async () => {
    const canvasHandler = vi.fn((event: Event) => event.stopPropagation());
    container.addEventListener("keydown", canvasHandler);
    await act(async () => { container.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true })); });
    expect(status()).toBe("Listening");
    expect(canvasHandler).not.toHaveBeenCalled();
    await act(async () => { window.dispatchEvent(new Event("blur")); });
    expect(status()).toBe("Muted");
    expect(sdk.mics[0].muted).toBe(true);
  });

  it("leaves Space available in inputs and contenteditable math fields", async () => {
    for (const target of [container.querySelector("input")!, container.querySelector("span")!]) {
      const event = new KeyboardEvent("keydown", { code: "Space", bubbles: true, cancelable: true });
      await act(async () => { target.dispatchEvent(event); });
      expect(event.defaultPrevented).toBe(false);
    }
    expect(sdk.mics).toHaveLength(0);
    expect(status()).toBe("Muted");
  });
});
