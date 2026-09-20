// @vitest-environment happy-dom
// What the S Pen needs from tldraw: a stroke that survives Android cancelling the
// pointer, and a finger that can still scroll the page once pen mode is on.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "tldraw";
import { usePenInput } from "./usePenInput";

function fakeEditor(container: HTMLElement, opts: { penMode?: boolean; pointing?: boolean; pinching?: boolean } = {}) {
  const camera = { x: 0, y: 0, z: 1 };
  const dispatch = vi.fn();
  const editor = {
    getContainer: () => container,
    getInstanceState: () => ({ isPenMode: opts.penMode ?? true }),
    getZoomLevel: () => camera.z,
    getCamera: () => ({ ...camera }),
    setCamera: (to: { x: number; y: number; z: number }) => Object.assign(camera, to),
    inputs: { getIsPointing: () => opts.pointing ?? false, getIsPinching: () => opts.pinching ?? false },
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
    send(pointer("pointerdown", { x: 30, y: 40 }, 1, "pen"));
    send(pointer("pointercancel", { x: 30, y: 40 }, 1, "pen"));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ name: "pointer_up", isPen: true }));
  });

  it("ends the stroke when the capture is taken away", () => {
    const { editor, dispatch } = fakeEditor(host, { pointing: true });
    mount(editor);
    send(pointer("pointerdown", { x: 30, y: 40 }, 1, "pen"));
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

  it("does not scroll with a palm that landed before the pen, even after pen-up", () => {
    const { editor, camera } = fakeEditor(host);
    mount(editor);
    send(pointer("pointerdown", { x: 100, y: 300 }, 1));
    send(pointer("pointerdown", { x: 200, y: 200 }, 2, "pen"));
    send(pointer("pointerup", { x: 220, y: 200 }, 2, "pen"));
    // The palm did not move while writing. It moves only after OCR can start.
    send(pointer("pointermove", { x: 100, y: 50 }, 1));
    expect(camera).toEqual({ x: 0, y: 0, z: 1 });

    send(pointer("pointerup", { x: 100, y: 50 }, 1));
    send(pointer("pointerdown", { x: 100, y: 300 }, 3));
    send(pointer("pointermove", { x: 100, y: 200 }, 3));
    expect(camera).toEqual({ x: 0, y: -100, z: 1 });
  });

  it("rejects a palm before tldraw has processed the queued pen-down", () => {
    const { editor, camera } = fakeEditor(host, { pointing: false });
    mount(editor);
    send(pointer("pointerdown", { x: 200, y: 200 }, 2, "pen"));
    send(pointer("pointerdown", { x: 100, y: 300 }, 1));
    send(pointer("pointermove", { x: 100, y: 200 }, 1));
    expect(camera).toEqual({ x: 0, y: 0, z: 1 });
  });

  it.each(["pointercancel", "lostpointercapture"])("ignores a palm's %s during a pen stroke", (event) => {
    const { editor, dispatch } = fakeEditor(host, { pointing: true });
    mount(editor);
    send(pointer("pointerdown", { x: 200, y: 200 }, 2, "pen"));
    send(pointer("pointerdown", { x: 100, y: 300 }, 1));
    send(pointer(event, { x: 100, y: 300 }, 1));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not send a second pen-up when normal release loses capture before the next frame", () => {
    const { editor, dispatch } = fakeEditor(host, { pointing: true });
    mount(editor);
    send(pointer("pointerdown", { x: 200, y: 200 }, 2, "pen"));
    send(pointer("pointerup", { x: 220, y: 200 }, 2, "pen"));
    send(pointer("lostpointercapture", { x: 220, y: 200 }, 2, "pen"));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("ends a palm-started pinch so the next pen-down is accepted", () => {
    const { editor, dispatch } = fakeEditor(host, { pinching: true });
    mount(editor);
    send(pointer("pointerdown", { x: 200, y: 200 }, 2, "pen"));
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: "pinch_end" }));
  });

  it("also completes a cancelled finger stroke when pen mode is off", () => {
    const { editor, dispatch } = fakeEditor(host, { penMode: false, pointing: true });
    mount(editor);
    send(pointer("pointerdown", { x: 100, y: 300 }, 1));
    send(pointer("pointercancel", { x: 110, y: 300 }, 1));
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: "pointer_up", isPen: false }));
  });

  it("keeps pen/palm touch events out of pinch handling until they lift", () => {
    const { editor } = fakeEditor(host);
    mount(editor);
    const pinch = vi.fn();
    canvas.addEventListener("touchmove", pinch);
    const touchMove = (count: number) => {
      const event = new Event("touchmove", { bubbles: true, cancelable: true });
      Object.assign(event, { touches: Array.from({ length: count }, () => ({ touchType: "direct" })) });
      act(() => canvas.dispatchEvent(event));
      return event;
    };
    send(pointer("pointerdown", { x: 100, y: 300 }, 1));
    send(pointer("pointerdown", { x: 200, y: 200 }, 2, "pen"));
    expect(touchMove(2).defaultPrevented).toBe(true);
    send(pointer("pointerup", { x: 220, y: 200 }, 2, "pen"));
    touchMove(1);
    expect(pinch).not.toHaveBeenCalled();
    send(pointer("pointerup", { x: 100, y: 300 }, 1));
    const end = new Event("touchend", { bubbles: true, cancelable: true });
    Object.assign(end, { touches: [] });
    act(() => canvas.dispatchEvent(end));
    // A new, intentional two-finger gesture still reaches tldraw.
    touchMove(2);
    expect(pinch).toHaveBeenCalledOnce();
  });
});
