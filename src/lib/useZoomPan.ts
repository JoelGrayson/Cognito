import { useEffect, useRef, useState, type RefObject } from "react";

export interface View {
  scale: number;
  x: number;
  y: number;
}

const MIN = 0.5;
const MAX = 6;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Pt {
  x: number;
  y: number;
}

/**
 * Two-finger pinch / pan on touch, ctrl+wheel or trackpad pinch on desktop.
 * With `fingerPans`, a single finger also pans. Uses pointer events so a
 * stylus (`pointerType === "pen"`) is never treated as a finger.
 */
export function useZoomPan(ref: RefObject<HTMLElement | null>, fingerPans: boolean) {
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const fingerPansRef = useRef(fingerPans);
  fingerPansRef.current = fingerPans;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fingers = new Map<number, Pt>();
    let last: { d: number; cx: number; cy: number } | null = null;
    let drag: Pt | null = null;

    const zoomAt = (factor: number, cx: number, cy: number, dx = 0, dy = 0) => {
      const v = viewRef.current;
      const r = el.getBoundingClientRect();
      // Focal point relative to the page's untransformed layout origin (offsetLeft/Top ignore transforms).
      const page = el.firstElementChild as HTMLElement | null;
      const px = cx - r.left - (page?.offsetLeft ?? 0), py = cy - r.top - (page?.offsetTop ?? 0);
      const scale = clamp(v.scale * factor, MIN, MAX);
      const k = scale / v.scale;
      setView({ scale, x: px - (px - v.x) * k + dx, y: py - (py - v.y) * k + dy });
    };

    const pinch = () => {
      const [a, b] = [...fingers.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 2) {
        drag = null;
        last = pinch();
      } else if (fingers.size === 1 && fingerPansRef.current) {
        drag = { x: e.clientX, y: e.clientY };
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!fingers.has(e.pointerId)) return;
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 2 && last) {
        const cur = pinch();
        zoomAt(cur.d / last.d, cur.cx, cur.cy, cur.cx - last.cx, cur.cy - last.cy);
        last = cur;
      } else if (fingers.size === 1 && drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag = { x: e.clientX, y: e.clientY };
        setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!fingers.delete(e.pointerId)) return;
      last = fingers.size === 2 ? pinch() : null;
      drag = fingers.size === 1 && fingerPansRef.current ? [...fingers.values()][0] : null;
    };
    // Belt-and-braces: some mobile browsers ignore touch-action for pinch/scroll.
    const onTouchMove = (e: TouchEvent) => {
      if (fingers.size > 0) e.preventDefault();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("wheel", onWheel);
    };
  }, [ref]);

  const reset = () => setView({ scale: 1, x: 0, y: 0 });
  return { view, reset };
}
