// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoCall } from "./VideoCall";
import { LessonSchema } from "@/lib/schema";
import { VOICE_LESSON_START } from "@/lib/ai/voice-agent";

type Callback = (...args: unknown[]) => void;
const sdk = vi.hoisted(() => ({
  sessions: [] as Array<{ state: string; emit: (name: string, ...args: unknown[]) => void; disconnect: ReturnType<typeof vi.fn>; sendFunctionCallResponse: ReturnType<typeof vi.fn>; injectUserMessage: ReturnType<typeof vi.fn> }>,
  mics: [] as Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }>,
  players: [] as Array<{ interrupt: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; queue: ReturnType<typeof vi.fn> }>,
}));
vi.mock("@/lib/auth-client", () => ({ ensureAnonymousSession: vi.fn().mockResolvedValue(undefined) }));
// Exercise the real React SDK's interruption and lifecycle wiring with fake devices/transport.
vi.mock("@deepgram/agents", () => ({
  AgentSession: class {
    state = "idle";
    listeners = new Map<string, Set<Callback>>();
    constructor() { sdk.sessions.push(this); }
    on(name: string, fn: Callback) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name)!.add(fn); }
    off(name: string, fn: Callback) { this.listeners.get(name)?.delete(fn); }
    emit(name: string, ...args: unknown[]) { this.listeners.get(name)?.forEach((fn) => fn(...args)); }
    async connect() { this.state = "connected"; this.emit("connected"); this.emit("settings-applied", {}); }
    disconnect = vi.fn(() => { this.state = "disconnected"; this.emit("disconnected", "closed"); });
    sendAudio = vi.fn();
    injectUserMessage = vi.fn();
    sendFunctionCallResponse = vi.fn();
  },
  AgentMicrophone: class {
    constructor() { sdk.mics.push(this); }
    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn();
    mute = vi.fn();
    unmute = vi.fn();
  },
  AgentPlayer: class {
    constructor() { sdk.players.push(this); }
    interrupt = vi.fn();
    dispose = vi.fn();
    queue = vi.fn();
    getRemainingPlaybackTime = () => 0;
  },
}));

const lesson = LessonSchema.parse({
  title: "Forces", summary: "How objects move", tldr: "F = ma", sections: [],
  keyTakeaways: [], resources: [], videoQuery: "", video: { id: null, title: null, searchUrl: "" },
});
let root: Root;
let container: HTMLDivElement;
const button = (label: string) => {
  const el = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(el, label).not.toBeNull();
  return el!;
};
async function mount() {
  await act(async () => root.render(<VideoCall topic="Physics" lesson={lesson} onClose={() => root.unmount()} />));
  return sdk.sessions[0];
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sdk.sessions.length = sdk.mics.length = sdk.players.length = 0;
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("live voice lesson", () => {
  it("starts the worked example after the greeting once, without displaying the internal kickoff", async () => {
    const session = await mount();
    await act(async () => session.emit("agent-audio-done", {}));
    await act(async () => session.emit("agent-audio-done", {}));
    expect(session.injectUserMessage).toHaveBeenCalledExactlyOnceWith(VOICE_LESSON_START);
    await act(async () => session.emit("conversation-text", { role: "user", content: VOICE_LESSON_START }));
    await act(async () => button("Show messages").click());
    expect(container.textContent).not.toContain(VOICE_LESSON_START);
  });

  it("lets an interruption take priority over the automatic opening example", async () => {
    const session = await mount();
    await act(async () => session.emit("user-started-speaking", {}));
    await act(async () => session.emit("agent-audio-done", {}));
    expect(session.injectUserMessage).not.toHaveBeenCalled();
  });

  it("renders tutor math without LaTeX in captions, chat, and board labels", async () => {
    const session = await mount();
    const text = String.raw`Substituting \(x = 1\) gives \(\frac{0}{0}\).`;
    await act(async () => session.emit("conversation-text", { role: "assistant", content: text }));
    expect(container.querySelector(".call-caption")?.textContent).toContain("Substituting x = 1 gives 0/0.");
    await act(async () => button("Show messages").click());
    expect(container.querySelector(".call-transcript")?.textContent).toContain("Substituting x = 1 gives 0/0.");
    await act(async () => session.emit("function-call-request", { functions: [{ id: "math", name: "update_whiteboard", client_side: true, arguments: JSON.stringify({ actions: [{ type: "text", id: "equation", x: 50, y: 50, text: String.raw`\(\frac{x^{2}-1}{x-1}\)`, size: "large", color: "ink" }] }) }] }));
    expect(container.querySelector(".board")?.textContent).toContain("(x²-1)/(x-1)");
    expect(container.textContent).not.toContain("\\frac");
  });

  it("cuts off queued tutor audio on voice activity without a manual interrupt control", async () => {
    const session = await mount();
    const player = sdk.players[0];
    await act(async () => session.emit("audio", new ArrayBuffer(32)));
    expect(container.textContent).toContain("Speaking");
    const before = player.interrupt.mock.calls.length;
    await act(async () => session.emit("user-started-speaking", {}));
    expect(player.interrupt).toHaveBeenCalledTimes(before + 1);
    expect(container.textContent).toContain("Listening to you");
    expect([...container.querySelectorAll("button")].some((b) => /interrupt|talk|auto-listen/i.test(b.textContent ?? ""))).toBe(false);
  });

  it("releases the microphone on mute, stays muted on reconnect, and reopens on unmute", async () => {
    const session = await mount();
    const firstMic = sdk.mics[0];
    await act(async () => button("Mute microphone").click());
    expect(firstMic.stop).toHaveBeenCalled();
    expect(button("Unmute microphone").getAttribute("aria-pressed")).toBe("false");
    await act(async () => session.emit("connected"));
    expect(sdk.mics).toHaveLength(1);
    await act(async () => button("Unmute microphone").click());
    expect(sdk.mics).toHaveLength(2);
    expect(sdk.mics[1].start).toHaveBeenCalled();
    expect(button("Mute microphone").getAttribute("aria-pressed")).toBe("true");
  });

  it("validates board tool arguments and makes the updated board readable to the tutor", async () => {
    const session = await mount();
    await act(async () => session.emit("function-call-request", { functions: [{ id: "bad", name: "update_whiteboard", client_side: true, arguments: '{"actions":[{"type":"invented"}]}' }] }));
    expect(session.sendFunctionCallResponse).toHaveBeenLastCalledWith("bad", "update_whiteboard", expect.stringContaining("Invalid board actions"));
    await act(async () => session.emit("function-call-request", { functions: [{ id: "draw", name: "update_whiteboard", client_side: true, arguments: JSON.stringify({ actions: [{ type: "text", id: "equation", x: 50, y: 50, text: "F = ma", size: "large", color: "ink" }] }) }] }));
    expect(container.querySelector(".board")?.textContent).toContain("F = ma");
    await act(async () => session.emit("function-call-request", { functions: [{ id: "read", name: "read_whiteboard", client_side: true, arguments: "{}" }] }));
    expect(session.sendFunctionCallResponse).toHaveBeenLastCalledWith("read", "read_whiteboard", expect.stringContaining("F = ma"));
  });

  it("does not apply image results that arrive after the learner interrupts", async () => {
    const session = await mount();
    let resolve!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
    await act(async () => session.emit("function-call-request", { functions: [{ id: "image", name: "update_whiteboard", client_side: true, arguments: JSON.stringify({ actions: [{ type: "image", id: "diagram", x: 20, y: 20, w: 100, h: 100, query: "force" }] }) }] }));
    await act(async () => session.emit("user-started-speaking", {}));
    await act(async () => resolve(Response.json({ actions: [{ type: "text", id: "late", x: 20, y: 20, text: "Stale response", size: "large", color: "ink" }] })));
    expect(container.textContent).not.toContain("Stale response");
  });

  it("disconnects and releases devices and audio when the call is left", async () => {
    const session = await mount();
    await act(async () => button("Leave call").click());
    expect(session.disconnect).toHaveBeenCalled();
    expect(sdk.mics[0].stop).toHaveBeenCalled();
    expect(sdk.players[0].interrupt).toHaveBeenCalled();
    expect(sdk.players[0].dispose).toHaveBeenCalled();
    expect(container.querySelector("dialog")).toBeNull();
  });
});
