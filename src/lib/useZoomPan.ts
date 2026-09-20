import { useEffect, useRef, useState, type RefObject } from "react";

export interface View {
  scale: number;
  x: number;
  y: number;
}

const MIN = 0.5;
const MAX = 6;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const TAP_MS = 300;
const TAP_GAP_MS = 350;
const TAP_SLOP = 12;

interface Pt {
  x: number;
  y: number;
}

/**
 * Two-finger pinch / pan on touch, ctrl+wheel or trackpad pinch on desktop.
 * With `fingerPans`, a single finger also pans. Uses pointer events so a
 * stylus (`pointerType === "pen"`) is never treated as a finger.
 * Quick two-finger taps (no pinch) are reported via `onTwoFingerTap(count)`.
 */
export function useZoomPan(
  ref: RefObject<HTMLElement | null>,
  fingerPans: boolean,
  onTwoFingerTap?: (count: number) => void,
) {
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const fingerPansRef = useRef(fingerPans);
  fingerPansRef.current = fingerPans;
  const tapRef = useRef(onTwoFingerTap);
  tapRef.current = onTwoFingerTap;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fingers = new Map<number, Pt>();
    let last: { d: number; cx: number; cy: number } | null = null;
    let drag: Pt | null = null;
    // Two-finger tap detection: a candidate until fingers move or linger too long.
    let tap: { at: number; start: Map<number, Pt> } | null = null;
    let taps = 0;
    let tapTimer: ReturnType<typeof setTimeout> | undefined;
    let firstDown: Pt | null = null;

    // Resolve a pending tap sequence now so its action precedes any new input.
    const flushTaps = () => {
      if (!tapTimer) return;
      clearTimeout(tapTimer);
      tapTimer = undefined;
      const n = taps;
      taps = 0;
      tapRef.current?.(n);
    };

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
      if (e.pointerType !== "touch") {
        flushTaps();
        return;
      }
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 2) {
        drag = null;
        last = pinch();
        tap = { at: e.timeStamp, start: new Map(fingers) };
      } else if (fingers.size > 2) {
        tap = null;
      } else if (fingers.size === 1) {
        firstDown = { x: e.clientX, y: e.clientY };
        if (fingerPansRef.current) drag = firstDown;
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!fingers.has(e.pointerId)) return;
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 2 && last) {
        const cur = pinch();
        if (tap) {
          const s = tap.start.get(e.pointerId);
          if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) < TAP_SLOP) return;
          tap = null;
        }
        zoomAt(cur.d / last.d, cur.cx, cur.cy, cur.cx - last.cx, cur.cy - last.cy);
        last = cur;
      } else if (fingers.size === 1) {
        if (firstDown && Math.hypot(e.clientX - firstDown.x, e.clientY - firstDown.y) >= TAP_SLOP) flushTaps();
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag = { x: e.clientX, y: e.clientY };
        setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!fingers.delete(e.pointerId)) return;
      if (tap && fingers.size === 1) {
        if (e.timeStamp - tap.at <= TAP_MS) {
          taps++;
          clearTimeout(tapTimer);
          tapTimer = setTimeout(flushTaps, TAP_GAP_MS);
        }
        tap = null;
      }
      if (fingers.size === 0) firstDown = null;
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
      clearTimeout(tapTimer);
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
