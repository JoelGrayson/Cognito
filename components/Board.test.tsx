// @vitest-environment happy-dom
// The board has to survive a tablet: a stylus writing, a palm resting on the glass,
// and Android taking the pointer away mid-stroke.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board } from "./Board";

/** happy-dom has no SVG geometry, so board space is screen space for these tests. */
function stubGeometry(svg: SVGSVGElement) {
  class Point {
    constructor(public x: number, public y: number) {}
    matrixTransform() { return this; }
  }
  (globalThis as unknown as { DOMPoint: unknown }).DOMPoint = Point;
  svg.getScreenCTM = () => ({ inverse: () => ({}) }) as unknown as DOMMatrix;
  svg.setPointerCapture = () => {};
  svg.releasePointerCapture = () => {};
}

interface Down {
  pointerId: number;
  pointerType?: string;
  button?: number;
  buttons?: number;
}

/** A pointer event happy-dom will carry the fields we read through. */
function pointer(type: string, at: { x: number; y: number }, opts: Down): PointerEvent {
  const event = new Event(type, { bubbles: true }) as PointerEvent;
  Object.assign(event, {
    clientX: at.x,
    clientY: at.y,
    pointerId: opts.pointerId,
    pointerType: opts.pointerType ?? "pen",
    button: opts.button ?? 0,
    buttons: opts.buttons ?? 1,
    pressure: 0.5,
    isPrimary: true,
  });
  return event;
}

let container: HTMLDivElement;
let root: Root;
const strokes = vi.fn<(points: number[], erased: boolean) => void>();

function mount(props: { erasing?: boolean } = {}) {
  act(() => {
    root.render(<Board elements={[]} canDraw penColor="blue" onStroke={strokes} {...props} />);
  });
  const svg = container.querySelector("svg")!;
  stubGeometry(svg);
  return svg;
}

function send(svg: SVGSVGElement, type: string, at: { x: number; y: number }, opts: Down) {
  act(() => {
    svg.dispatchEvent(pointer(type, at, opts));
  });
}

/** Write a short line with one pointer, without lifting it. */
function write(svg: SVGSVGElement, opts: Down) {
  send(svg, "pointerdown", { x: 10, y: 10 }, opts);
  send(svg, "pointermove", { x: 40, y: 12 }, opts);
  send(svg, "pointermove", { x: 70, y: 14 }, opts);
}

beforeEach(() => {
  strokes.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Board pointer handling", () => {
  it("draws a stroke from one pointer", () => {
    const svg = mount();
    write(svg, { pointerId: 1 });
    send(svg, "pointerup", { x: 70, y: 14 }, { pointerId: 1 });
    expect(strokes).toHaveBeenCalledTimes(1);
    expect(strokes.mock.calls[0][0]).toEqual([10, 10, 40, 12, 70, 14]);
    expect(strokes.mock.calls[0][1]).toBe(false);
  });

  it("ignores a finger once the stylus has been used", () => {
    const svg = mount();
    write(svg, { pointerId: 1 });
    send(svg, "pointerup", { x: 70, y: 14 }, { pointerId: 1 });
    strokes.mockClear();

    write(svg, { pointerId: 2, pointerType: "touch" });
    send(svg, "pointerup", { x: 70, y: 14 }, { pointerId: 2, pointerType: "touch" });
    expect(strokes).not.toHaveBeenCalled();
  });

  it("keeps a palm landing mid-stroke out of the line", () => {
    const svg = mount();
    send(svg, "pointerdown", { x: 10, y: 10 }, { pointerId: 1 });
    // The heel of the hand lands on the far side of the page while the pen writes.
    send(svg, "pointerdown", { x: 600, y: 400 }, { pointerId: 2, pointerType: "touch" });
    send(svg, "pointermove", { x: 620, y: 410 }, { pointerId: 2, pointerType: "touch" });
    send(svg, "pointermove", { x: 40, y: 12 }, { pointerId: 1 });
    send(svg, "pointerup", { x: 40, y: 12 }, { pointerId: 1 });

    expect(strokes).toHaveBeenCalledTimes(1);
    expect(strokes.mock.calls[0][0]).toEqual([10, 10, 40, 12]);
  });

  it("keeps the stroke when the system cancels the pointer", () => {
    const svg = mount();
    write(svg, { pointerId: 1 });
    send(svg, "pointercancel", { x: 70, y: 14 }, { pointerId: 1 });
    expect(strokes).toHaveBeenCalledTimes(1);
    expect(strokes.mock.calls[0][0]).toEqual([10, 10, 40, 12, 70, 14]);
  });

  it("rubs out with the eraser end of the stylus", () => {
    const svg = mount();
    write(svg, { pointerId: 1, button: 5, buttons: 32 });
    send(svg, "pointerup", { x: 70, y: 14 }, { pointerId: 1, button: 5, buttons: 0 });
    expect(strokes.mock.calls[0][1]).toBe(true);
  });
});
