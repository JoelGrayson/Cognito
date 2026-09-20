// @vitest-environment happy-dom
// What the S Pen needs from tldraw: a stroke that survives Android cancelling the
// pointer, and a finger that can still scroll the page once pen mode is on.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "tldraw";
import { usePenInput } from "./usePenInput";

function fakeEditor(container: HTMLElement, opts: { penMode?: boolean; pointing?: boolean } = {}) {
  const camera = { x: 0, y: 0, z: 1 };
  const dispatch = vi.fn();
  const editor = {
    getContainer: () => container,
    getInstanceState: () => ({ isPenMode: opts.penMode ?? true }),
    getZoomLevel: () => camera.z,
    getCamera: () => ({ ...camera }),
    setCamera: (to: { x: number; y: number; z: number }) => Object.assign(camera, to),
    inputs: { getIsPointing: () => opts.pointing ?? false, getIsPinching: () => false },
    dispatch,
  };
  return { editor: editor as unknown as Editor, dispatch, camera };
}

function pointer(type: string, at: { x: number; y: number }, id = 1, pointerType = "touch") {
  const event = new Event(type, { bubbles: true }) as PointerEvent;
  Object.assign(event, { clientX: at.x, clientY: at.y, pointerId: id, pointerType, pressure: 0.5 });
  return event;
}

let host: HTMLDivElement;
let canvas: HTMLDivElement;
let root: Root;

function mount(editor: Editor) {
  function Harness() {
    usePenInput(editor);
    return null;
  }
  act(() => {
    root = createRoot(document.createElement("div"));
    root.render(<Harness />);
  });
}
function send(event: PointerEvent) {
  act(() => {
    canvas.dispatchEvent(event);
  });
}

beforeEach(() => {
  host = document.createElement("div");
  canvas = document.createElement("div");
  canvas.className = "tl-canvas";
  host.appendChild(canvas);
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("usePenInput", () => {
  it("ends the stroke when the system cancels the pen", () => {
    const { editor, dispatch } = fakeEditor(host, { pointing: true });
    mount(editor);
    send(pointer("pointercancel", { x: 30, y: 40 }, 1, "pen"));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ name: "pointer_up", isPen: true }));
  });

  it("ends the stroke when the capture is taken away", () => {
    const { editor, dispatch } = fakeEditor(host, { pointing: true });
    mount(editor);
    send(pointer("lostpointercapture", { x: 30, y: 40 }, 1, "pen"));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ name: "pointer_up" }));
  });

  it("leaves a finished stroke alone", () => {
    const { editor, dispatch } = fakeEditor(host);
    mount(editor);
    send(pointer("lostpointercapture", { x: 30, y: 40 }, 1, "pen"));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("pans the page with one finger in pen mode", () => {
    const { editor, camera } = fakeEditor(host);
    mount(editor);
    send(pointer("pointerdown", { x: 100, y: 300 }));
    send(pointer("pointermove", { x: 100, y: 200 }));
    expect(camera).toEqual({ x: 0, y: -100, z: 1 });
  });

  it("does not pan under a palm while the pen writes", () => {
    const { editor, camera } = fakeEditor(host, { pointing: true });
    mount(editor);
    send(pointer("pointerdown", { x: 100, y: 300 }));
    send(pointer("pointermove", { x: 100, y: 200 }));
    expect(camera).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("leaves two fingers to tldraw's pinch", () => {
    const { editor, camera } = fakeEditor(host);
    mount(editor);
    send(pointer("pointerdown", { x: 100, y: 300 }, 1));
    send(pointer("pointerdown", { x: 300, y: 300 }, 2));
    send(pointer("pointermove", { x: 100, y: 200 }, 1));
    expect(camera).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("leaves the finger to tldraw when no pen has been used", () => {
    const { editor, camera } = fakeEditor(host, { penMode: false });
    mount(editor);
    send(pointer("pointerdown", { x: 100, y: 300 }));
    send(pointer("pointermove", { x: 100, y: 200 }));
    expect(camera).toEqual({ x: 0, y: 0, z: 1 });
  });
});
